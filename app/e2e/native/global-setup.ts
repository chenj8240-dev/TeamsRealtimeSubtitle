// Build the app the e2e suite drives: `tauri build --debug --no-bundle` with two overrides.
//
// `tauri build`, not `cargo build`: only the CLI turns on `custom-protocol`, which embeds
// `build/` in the exe. A plain cargo build points the windows at the Vite dev server instead.
// Debug, because the suite needs no optimiser and a debug build is a console app whose log
// the fixture can capture. The first override (`tauri.e2e.json`) changes the identifier (see
// identity.ts) and drops `beforeBuildCommand`, so the frontend bundle is whatever
// `npm run build` last produced. The second, written here from the app's own config, gives
// every window the DevTools port (`BROWSER_ARGS`).
//
// Cargo is incremental, so a run with nothing changed spends seconds here. `E2E_SKIP_BUILD=1`
// skips it, for CI when an earlier step has built, or a machine without the Rust toolchain.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BROWSER_ARGS, e2eWindows, IDENTIFIER, OVERRIDE, ROOT } from './identity';

const TAURI_CLI = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

/** Where cargo puts a debug build when nothing says otherwise. */
function defaultExe(): string {
	const target = process.env.CARGO_TARGET_DIR
		? path.resolve(ROOT, 'src-tauri', process.env.CARGO_TARGET_DIR)
		: path.join(ROOT, 'src-tauri', 'target');
	return path.join(target, 'debug', 'live-translation.exe');
}

async function build(): Promise<string> {
	for (const page of ['index.html', 'overlay/index.html']) {
		if (!existsSync(path.join(ROOT, 'build', page))) {
			throw new Error(`build/${page} is missing: run \`npm run build\` before the e2e suite`);
		}
	}
	const dir = await mkdtemp(path.join(tmpdir(), 'lt-e2e-config-'));
	const windows = path.join(dir, 'windows.json');
	await writeFile(windows, JSON.stringify({ app: { windows: e2eWindows() } }));

	const started = Date.now();
	let output = '';
	const code = await new Promise<number | null>((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				TAURI_CLI,
				...['build', '--debug', '--no-bundle', '--ci'],
				...['--config', OVERRIDE, '--config', windows]
			],
			{ cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
		);
		for (const stream of [child.stdout, child.stderr]) {
			stream.on('data', (chunk: Buffer) => {
				output += chunk.toString();
				process.stderr.write(chunk);
			});
		}
		child.once('error', reject);
		child.once('exit', resolve);
	}).finally(() => rm(dir, { recursive: true, force: true }));
	if (code !== 0) throw new Error(`tauri build exited with ${code}`);
	console.log(`e2e app built in ${((Date.now() - started) / 1000).toFixed(0)} s`);
	// The CLI names the exe it wrote, which also covers a CARGO_TARGET_DIR set elsewhere.
	return /Built application at: (.+\.exe)/.exec(output)?.[1].trim() ?? defaultExe();
}

export default async function globalSetup(): Promise<void> {
	if (process.platform !== 'win32') throw new Error('The native e2e suite drives the Windows app');
	const exe = process.env.E2E_SKIP_BUILD ? defaultExe() : await build();
	if (!existsSync(exe)) throw new Error(`${exe} does not exist: build it or unset E2E_SKIP_BUILD`);
	// Both overrides are compiled in. An exe without the identifier is an ordinary build, which
	// would run the suite against the developer's own settings, history and models; one
	// without the arguments never opens the port the fixture attaches to.
	const binary = readFileSync(exe);
	if (!binary.includes(IDENTIFIER) || !binary.includes(BROWSER_ARGS)) {
		throw new Error(`${exe} was not built for the e2e suite; unset E2E_SKIP_BUILD to rebuild`);
	}
	process.env.E2E_APP_EXE = exe;
}
