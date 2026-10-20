import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
// vitest's re-export, not vite's: only this one accepts the `test` block below.
import { defineConfig } from 'vitest/config';

// Tauri expects a fixed dev port and looks for VITE_/TAURI_ env vars.
const host = process.env.TAURI_DEV_HOST;

// Fontsource lists a `.woff` fallback after every `.woff2`. WebView2 always takes the `.woff2`,
// so the fallbacks were never loaded, yet each one was still bundled into the app — about
// 350 KB. Dropping them from the CSS before Vite resolves its URLs keeps them out of the build.
/** @returns {import('vite').Plugin} */
function woff2Only() {
	return {
		name: 'woff2-only',
		enforce: 'pre',
		transform(code, id) {
			if (!/[\\/]@fontsource[\\/].+\.css$/.test(id)) return;
			return code.replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, '');
		}
	};
}

export default defineConfig({
	plugins: [
		woff2Only(),
		sveltekit({
			preprocess: vitePreprocess(),
			// Tauri serves a static bundle; no Node server at runtime.
			adapter: adapter({ fallback: 'index.html' }),
			// A desktop app is updated by its installer, not redeployed under a running window, so
			// there is nothing for SvelteKit 3's hourly `version.json` poll to find. Focus checks stay:
			// they read the same bundled file over the app's own origin.
			version: { pollInterval: 0 }
		})
	],

	// Vite options tailored for Tauri development.
	clearScreen: false,
	server: {
		port: 5173,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: 'ws', host, port: 5183 } : undefined,
		watch: {
			// Don't watch the Rust side from Vite.
			ignored: ['**/src-tauri/**']
		}
	},
	// Surface Tauri's target so we can tune the build if needed. (Vite prefixes are
	// literal `startsWith` matches — no globs.)
	envPrefix: ['VITE_', 'TAURI_ENV_'],

	// Two projects rather than one jsdom environment for everything. Pure logic stays in node,
	// which is faster and means a test cannot start depending on the DOM by accident; anything
	// that renders a component opts in by being named `*.svelte.test.ts`.
	test: {
		// `npm run test:coverage`; CI prints the summary with `scripts/coverage-summary.mjs`.
		coverage: {
			provider: 'v8',
			// Every source file, so a module no test imports shows as uncovered, not absent.
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/lib/testing/**'],
			reporter: ['text-summary', 'json-summary', 'html'],
			// Report-only, except for the pure modules: no Tauri, no DOM, every line reachable from
			// a plain test, and each fully covered today. A floor there catches a deleted test or a
			// new untested branch; elsewhere a number would only invite tests written for it.
			thresholds: {
				'src/lib/{appearance,captionColour,captionLayout,cleanSpeech,document,errors,historySearch,languages,reading,shortcuts,transcript}.ts':
					{ perFile: true, lines: 95, statements: 95, functions: 95, branches: 85 }
			}
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'logic',
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.svelte.test.ts']
				}
			},
			{
				extends: true,
				// Without the browser condition Svelte resolves to its server build and
				// `mount()` throws — components can only be rendered against the client entry.
				resolve: { conditions: ['browser'] },
				test: {
					name: 'component',
					environment: 'jsdom',
					// One jsdom per worker instead of one per file, with each file still in its own
					// VM context. It halves this project's time. The logic project stays isolated the
					// ordinary way: sharing a context there lets `vi.mock` leak between files.
					pool: 'vmThreads',
					clearMocks: true,
					include: ['src/**/*.svelte.test.ts'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			}
		]
	}
});
