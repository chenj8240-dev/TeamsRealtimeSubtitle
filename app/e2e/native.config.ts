// `npm run test:e2e`: the real desktop app, end to end. The global setup builds a debug exe
// with the frontend embedded and its own identifier (`native/tauri.e2e.json`), so its app data,
// WebView2 profile and single-instance lock never touch a developer's copy or the Store app.
// Each test then starts that exe on a first-launch profile and drives both windows over CDP.
//
// The build embeds whatever `build/` holds: run `npm run build` first after changing `src/`.
// It also needs what the app's own Rust build needs (on Windows: LLVM's clang-cl, CMake and
// Ninja, as the CI workflow sets up). Set `E2E_SKIP_BUILD=1` to reuse the last e2e build.

import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './native',
	globalSetup: './native/global-setup.ts',
	outputDir: '../test-results/native',
	forbidOnly: !!process.env.CI,
	// One app at a time: the single-instance lock and the shared e2e profile allow nothing else.
	fullyParallel: false,
	workers: 1,
	// A native run fails for reasons a retry would mostly hide; the trace is the better answer.
	retries: 0,
	// A cold runner: WebView2's first start, Whisper's first model load and, without the CI
	// cache, a 31 MiB model download all land inside one test.
	timeout: 5 * 60_000,
	expect: { timeout: 15_000 },
	reporter: process.env.CI
		? [
				['list'],
				['github'],
				['html', { open: 'never', outputFolder: '../playwright-report/native' }]
			]
		: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report/native' }]],
	use: {
		// The fixture traces the windows itself, kept on failure: the runner's own trace would
		// be saved only after the fixture has disconnected, by which time the context is gone.
		trace: 'off',
		// Both windows, taken while the app is still running.
		screenshot: 'only-on-failure',
		actionTimeout: 15_000
	}
});
