// Who the e2e app is and where it keeps things. Read from the override and the app's own
// config rather than repeated here, so the guard below and the build can never disagree.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const OVERRIDE = fileURLToPath(new URL('./tauri.e2e.json', import.meta.url));

interface WindowConfig {
	label: string;
	title: string;
}

const override = JSON.parse(readFileSync(OVERRIDE, 'utf8')) as { identifier: string };
const app = JSON.parse(readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')) as {
	identifier: string;
	app: { windows: (WindowConfig & { additionalBrowserArgs?: string })[] };
};

// The e2e windows replace the app's own browser arguments, so the app must not have any yet.
if (app.app.windows.some((w) => w.additionalBrowserArgs)) {
	throw new Error('tauri.conf.json sets additionalBrowserArgs: add them to BROWSER_ARGS too');
}

export const IDENTIFIER = override.identifier;

// The fixture deletes the folders named after this identifier before every test, so it must be
// the e2e one and never the shipped one, of which it is an extension.
if (!IDENTIFIER.endsWith('.e2e') || IDENTIFIER === app.identifier) {
	throw new Error(`${OVERRIDE} must give the e2e app an identifier ending in .e2e`);
}

/** The title Windows shows on the operator window's frame, which is how a close is aimed. */
export const OPERATOR_TITLE = app.app.windows.find((w) => w.label === 'operator')!.title;

/** Where the e2e build's WebView2 serves the DevTools protocol. Fixed, because it is compiled
 *  in; one e2e app runs at a time, so one port is enough. */
export const DEVTOOLS_PORT = 9347;

/**
 * The e2e build's WebView2 arguments. They reach WebView2 through Tauri's
 * `additionalBrowserArgs`, which is its API, and not through the
 * `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` variable: WebView2 ignores `WEBVIEW2_*` variables
 * in an elevated process, and GitHub's Windows runners run everything elevated.
 *
 * Setting them replaces wry's own (`webview2/mod.rs` in wry 0.57), so those come first:
 * the mini menu, PDF menu and SmartScreen switched off, and autoplay, which Tauri turns on.
 * `--lang` makes the first launch English on any machine: the interface follows Windows'
 * language until the operator picks one.
 */
export const BROWSER_ARGS = [
	'--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection',
	'--autoplay-policy=no-user-gesture-required',
	`--remote-debugging-port=${DEVTOOLS_PORT}`,
	'--lang=en-GB'
].join(' ');

/** The app's windows as the e2e build declares them: the app's own, with `BROWSER_ARGS`.
 *  Every webview in a process shares one WebView2 environment, so all of them get the same
 *  arguments. A config override replaces an array whole, hence every window, copied. */
export function e2eWindows(): Record<string, unknown>[] {
	return app.app.windows.map((window) => ({ ...window, additionalBrowserArgs: BROWSER_ARGS }));
}

/** Tauri's `app_local_data_dir` (models, history, the recovery spool, the export folder
 *  preference and WebView2's `EBWebView` profile) and `app_data_dir`, unused today, so that a
 *  later change cannot carry state from one test into the next. */
export function profileDirs(): string[] {
	return [process.env.LOCALAPPDATA, process.env.APPDATA]
		.filter((base): base is string => !!base)
		.map((base) => path.join(base, IDENTIFIER));
}

/** Where `whisper::models::directory` keeps downloaded models. */
export function modelsDir(): string {
	if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA is not set');
	return path.join(process.env.LOCALAPPDATA, IDENTIFIER, 'whisper-models');
}

/** Refuse anything but a folder named exactly after the e2e identifier. */
export function assertE2ePath(dir: string): void {
	const resolved = path.resolve(dir);
	if (path.basename(resolved) !== IDENTIFIER || !resolved.includes('.e2e')) {
		throw new Error(`Refusing to delete ${resolved}: it is not the e2e app's own folder`);
	}
}

/** The exe the global setup built, handed to the workers through the environment. */
export function appExe(): string {
	const exe = process.env.E2E_APP_EXE;
	if (!exe) throw new Error('E2E_APP_EXE is not set: run through `npm run test:e2e`');
	return exe;
}
