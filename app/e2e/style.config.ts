// `npm run test:style`: the operator window's computed styles and horizontal overflow, in the
// production bundle, in Edge — the engine WebView2 embeds. Edge comes with Windows (and with
// the `windows-latest` runner), so nothing is downloaded: there is no `playwright install`.
//
// `vite preview` serves the last `npm run build`; it does not build. Build first after
// changing anything under `src/`, or this checks the previous bundle.

import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: './style',
	// Text snapshots, one file per state, committed beside the specs.
	snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// A style or overflow result is deterministic: a retry would only hide a flaky harness.
	retries: 0,
	// On CI a missing snapshot is a failure, not something to write and pass.
	updateSnapshots: process.env.CI ? 'none' : 'missing',
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	// Generous: the waits are for the page to answer, and a machine busy with something else
	// (a Rust build, say) makes it answer later, not differently.
	timeout: 60_000,
	expect: { timeout: 15_000 },
	use: {
		baseURL: `http://localhost:${PORT}`,
		channel: 'msedge',
		// The operator window's default size; the overflow spec narrows it to the minimum.
		viewport: { width: 1200, height: 820 },
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		colorScheme: 'dark',
		locale: 'en-GB',
		timezoneId: 'UTC',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: `npm run preview -- --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
