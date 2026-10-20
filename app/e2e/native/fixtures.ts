// The `app` fixture: the e2e build of the real app, on a first-launch profile, with both of its
// windows attached over the Chrome DevTools Protocol. A test can quit it and start it again on
// the same profile, to check what outlives a launch.
//
// The e2e build's WebView2 serves DevTools on `DEVTOOLS_PORT`, an argument compiled into its
// window config (`BROWSER_ARGS` in identity.ts). Both windows share one WebView2 environment,
// so one port serves both: `http://tauri.localhost/` is the operator and
// `http://tauri.localhost/overlay` the caption overlay.

import {
	test as base,
	expect,
	type Browser,
	type BrowserContext,
	type Page,
	type PlaywrightWorkerArgs,
	type TestInfo
} from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	appExe,
	assertE2ePath,
	DEVTOOLS_PORT,
	modelsDir,
	OPERATOR_TITLE,
	profileDirs,
	ROOT
} from './identity';
import { describeApp, killTree, requestWindowClose, stopStrayInstances } from './windows';

export { expect };

interface App {
	/** The windows of the current launch; `relaunch` replaces them. */
	operator: Page;
	overlay: Page;
	/** Whisper Tiny was copied in from the CI cache before launch, so it needs no download. */
	seededModel: boolean;
	/** The exit code once the process has ended, `undefined` while it runs. */
	exitCode(): number | null | undefined;
	/** Close the operator window the way its X button does. */
	requestClose(): Promise<void>;
	/** Close the app that way, wait for it to exit, and start it again on the same profile, as
	 *  an operator does between one day's event and the next. Nothing must be holding the
	 *  close: an unsaved transcript would ask first. */
	relaunch(): Promise<void>;
}

/** One start of the exe, with both windows attached. */
interface Launch {
	operator: Page;
	overlay: Page;
	exitCode(): number | null | undefined;
	requestClose(): Promise<void>;
	/** Detach and make sure the process has gone, keeping the trace and the log when `failed`.
	 *  Only the first call does anything. */
	end(failed: boolean): Promise<void>;
}

interface Options {
	/** Put Whisper Tiny in the models folder before launch when `WHISPER_SMOKE_MODEL_CACHE`
	 *  holds a copy that matches the pin — the same cache the Rust smoke test uses. */
	seedWhisperModel: boolean;
}

/** The pinned Tiny model, read from `whisper/models.rs` so the pin has one home. */
async function tinyPin(): Promise<{ file: string; bytes: number; sha256: string }> {
	const source = await readFile(path.join(ROOT, 'src-tauri/src/whisper/models.rs'), 'utf8');
	const file = /Self::Tiny => "(ggml-[^"]+\.bin)"/.exec(source)?.[1];
	const bytes = /Self::Tiny => ([\d_]+),/.exec(source)?.[1];
	const sha256 = /Self::Tiny => "([0-9a-f]{64})"/.exec(source)?.[1];
	if (!file || !bytes || !sha256) throw new Error('Could not read the Tiny pin from models.rs');
	return { file, bytes: Number(bytes.replaceAll('_', '')), sha256 };
}

async function matchesPin(file: string): Promise<boolean> {
	const pin = await tinyPin();
	const bytes = await readFile(file).catch(() => null);
	return (
		bytes?.length === pin.bytes && createHash('sha256').update(bytes).digest('hex') === pin.sha256
	);
}

/** The cached model, when there is a cache and its copy is the pinned file. */
async function cachedModel(): Promise<string | undefined> {
	const cache = process.env.WHISPER_SMOKE_MODEL_CACHE;
	if (!cache) return undefined;
	const file = path.join(cache, (await tinyPin()).file);
	return (await matchesPin(file)) ? file : undefined;
}

/** After a download through the UI, leave a copy where the next run (and the smoke test)
 *  will look, as the smoke test does after its own download. */
async function refillCache(): Promise<void> {
	const cache = process.env.WHISPER_SMOKE_MODEL_CACHE;
	if (!cache || (await cachedModel())) return;
	const installed = path.join(modelsDir(), (await tinyPin()).file);
	if (!(await matchesPin(installed))) return;
	await mkdir(cache, { recursive: true });
	await copyFile(installed, path.join(cache, path.basename(installed)));
}

function portFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once('error', () => resolve(false));
		server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
	});
}

/** Wait for `port` to be released: by the last test's WebView2, which outlives its host for
 *  a few seconds, or by anything else, which fails here rather than as a timeout later. */
async function portReleased(port: number): Promise<void> {
	const deadline = Date.now() + 30_000;
	while (!(await portFree(port))) {
		if (Date.now() > deadline) {
			throw new Error(`Port ${port} is still in use: the e2e app's DevTools port must be free`);
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

function appEnvironment(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };
	// Would move the WebView2 profile out of the e2e app's folder, or (in a process that is not
	// elevated) add a second DevTools port to the one compiled in.
	delete env.WEBVIEW2_USER_DATA_FOLDER;
	delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
	// The app's own default, plus Tauri's debug lines: they show each window asking for its
	// page, so the log of a failed launch says how far the windows got.
	env.RUST_LOG ??= 'live_translation_lib=info,tauri=debug,warn';
	// Keyless means keyless: blank, not absent, so a debug build's `.env` lookup cannot fill
	// them back in (dotenvy never overrides a variable that is set). Saved keys are another
	// matter: `secrets.rs` names its keychain service itself, not after the identifier.
	for (const key of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'MISTRAL_API_KEY']) env[key] = '';
	return env;
}

/** WebView2's DevTools endpoint, once it answers. A process that exits first fails this at
 *  once rather than at the timeout: the usual cause is another e2e instance holding the
 *  single-instance lock, to which a second launch hands over before exiting with 0. A
 *  timeout says what the app's processes and windows were doing instead. */
async function devTools(
	port: number,
	pid: number,
	exitCode: () => number | null | undefined
): Promise<string> {
	const endpoint = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 60_000;
	for (;;) {
		const code = exitCode();
		if (code !== undefined) {
			throw new Error(`The app exited with ${code} before WebView2 opened its DevTools port`);
		}
		const up = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(2_000) }).then(
			(response) => response.ok,
			() => false
		);
		if (up) return endpoint;
		if (Date.now() > deadline) {
			throw new Error(`WebView2 opened no DevTools port within 60 s.\n${await describeApp(pid)}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/** The window whose page is at `url`, once it has navigated there from `about:blank`. Only the
 *  custom protocol matches: a page on the Vite dev server would mean a build without the
 *  embedded frontend, and the failure lists the URLs that were there instead. */
async function windowAt(context: BrowserContext, url: RegExp): Promise<Page> {
	await expect
		.poll(() => context.pages().map((page) => page.url()), {
			message: `a window at ${url}`,
			timeout: 30_000,
			intervals: [100]
		})
		.toContainEqual(expect.stringMatching(url));
	const page = context.pages().find((candidate) => url.test(candidate.url()))!;
	await page.waitForLoadState('domcontentloaded');
	return page;
}

/** Start the exe on whatever profile is there and attach to both windows. `start` numbers the
 *  launches within a test, so a relaunch keeps its own log and trace beside the first one's. */
async function launch(
	playwright: PlaywrightWorkerArgs['playwright'],
	testInfo: TestInfo,
	start: number
): Promise<Launch> {
	const suffix = start === 1 ? '' : `-${start}`;
	await portReleased(DEVTOOLS_PORT);
	// A debug build reads `.env` from its working directory and every parent; the
	// repository's must not reach the app under test.
	const cwd = await mkdtemp(path.join(tmpdir(), 'lt-e2e-'));
	const logPath = testInfo.outputPath(`app${suffix}.log`);
	const log = createWriteStream(logPath);
	const child = spawn(appExe(), [], {
		cwd,
		env: appEnvironment(),
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true
	});
	child.stdout.pipe(log, { end: false });
	child.stderr.pipe(log, { end: false });
	let exitCode: number | null | undefined;
	const exited = new Promise<void>((resolve) => {
		child.once('exit', (code) => {
			exitCode = code;
			resolve();
		});
		child.once('error', (error) => {
			log.write(`spawn failed: ${error.message}\n`);
			exitCode = null;
			resolve();
		});
	});

	let browser: Browser | undefined;
	let context: BrowserContext | undefined;
	let ended = false;
	async function end(failed: boolean) {
		if (ended) return;
		ended = true;
		// Stopped while the app can still answer. Once it has quit on its own, as the demo
		// spec makes it, the context and its trace are gone and the app log is what is left.
		const trace = testInfo.outputPath(`windows-trace${suffix}.zip`);
		const traced = await context?.tracing.stop(failed ? { path: trace } : {}).then(
			() => failed,
			() => false
		);
		if (traced) {
			await testInfo.attach(`trace${suffix}`, { path: trace, contentType: 'application/zip' });
		}
		await browser?.close().catch(() => {});
		// Whatever happened in the test, the app does not outlive it.
		if (exitCode === undefined && child.pid) await killTree(child.pid);
		await exited;
		child.stdout.unpipe(log);
		child.stderr.unpipe(log);
		log.end();
		await rm(cwd, { recursive: true, force: true }).catch(() => {});
		if (failed) {
			await testInfo.attach(`app${suffix}.log`, { path: logPath, contentType: 'text/plain' });
		}
	}

	try {
		const step =
			start === 1 ? 'Attach to both windows' : `Attach to both windows (launch ${start})`;
		const windows = await base.step(step, async () => {
			browser = await playwright.chromium.connectOverCDP(
				await devTools(DEVTOOLS_PORT, child.pid!, () => exitCode)
			);
			[context] = browser.contexts();
			// The runner's `trace` option records its own steps and screenshots but not a
			// context it did not create, so this one is traced here: DOM snapshots of both
			// windows and every action, kept only for a failure, as `retain-on-failure` would.
			await context.tracing.start({ title: testInfo.title, screenshots: true, snapshots: true });
			return {
				operator: await windowAt(context, /^http:\/\/tauri\.localhost\/$/),
				overlay: await windowAt(context, /^http:\/\/tauri\.localhost\/overlay\/?$/)
			};
		});
		return {
			...windows,
			exitCode: () => exitCode,
			requestClose: () => requestWindowClose(child.pid!, OPERATOR_TITLE),
			end
		};
	} catch (error) {
		// A launch that never got as far as the test is a failure too, and its log is the clue.
		await end(true);
		throw error;
	}
}

export const test = base.extend<Options & { app: App }>({
	seedWhisperModel: [false, { option: true }],

	app: async ({ playwright, seedWhisperModel }, use, testInfo) => {
		const exe = appExe();
		// Steps, so a slow launch on a runner shows where its time went in the report.
		const seededModel = await base.step('Reset the e2e profile', async () => {
			const [localProfile] = profileDirs();
			await stopStrayInstances(localProfile, exe);
			// Every test starts from a first launch: no stored options, no history, no recovery
			// spool, no models, an empty WebView2 profile.
			for (const dir of profileDirs()) {
				assertE2ePath(dir);
				// WebView2's browser process outlives a killed host by a few seconds, longer on a
				// busy machine, and holds the profile until it goes. The retries back off
				// linearly, so twenty of them wait up to about 50 s in all.
				await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
			}
			const cached = seedWhisperModel ? await cachedModel() : undefined;
			if (!cached) return false;
			await mkdir(modelsDir(), { recursive: true });
			await copyFile(cached, path.join(modelsDir(), path.basename(cached)));
			return true;
		});

		let starts = 1;
		let current = await launch(playwright, testInfo, starts);
		try {
			await use({
				get operator() {
					return current.operator;
				},
				get overlay() {
					return current.overlay;
				},
				seededModel,
				exitCode: () => current.exitCode(),
				requestClose: () => current.requestClose(),
				async relaunch() {
					await current.requestClose();
					await expect
						.poll(() => current.exitCode(), { message: 'the app exits before it starts again' })
						.toBe(0);
					await current.end(false);
					// The next launch waits for the DevTools port, which WebView2 holds until its
					// browser process has gone — and with it any storage still to be written.
					current = await launch(playwright, testInfo, ++starts);
				}
			});
		} finally {
			await current.end(testInfo.status !== testInfo.expectedStatus);
			if (seedWhisperModel && !seededModel) await refillCache();
		}
	}
});
