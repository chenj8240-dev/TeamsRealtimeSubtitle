// @ts-check
// Not a style linter: Prettier owns formatting and svelte-check owns types. This config holds
// only the checks those two cannot make — promises nobody handles and Svelte reactivity
// mistakes — so every rule below is an error and none is here for taste. Rule sets are not
// enabled wholesale for the same reason; each rule is chosen on its own.
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import { loadConfig } from '@sveltejs/load-config';

const svelteConfig = (await loadConfig('./', { traverse: false }))?.config;

export default defineConfig(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'src-tauri/',
			'docs/',
			'coverage/',
			'test-results/',
			'playwright-report/',
			// Agent worktrees: whole checkouts of this repo, linted in their own right. ESLint does
			// not read git's excludes, so without this it would lint them against this tsconfig.
			'.claude/'
		]
	},

	// Plain scripts and modules. Listed before the Svelte setup so that `.svelte.ts` files, which
	// also match `*.ts`, end up with the Svelte parser below rather than this one.
	{
		files: ['**/*.{js,mjs,ts}'],
		languageOptions: { parser: ts.parser }
	},

	// The Svelte parser for `.svelte` and `.svelte.ts`, with TypeScript for their script bodies.
	svelte.configs.base,
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: ts.parser, svelteConfig }
		}
	},

	// Typed linting everywhere. Files outside tsconfig.json's `include` (the root configs, the
	// component-test setup and the Node scripts) get a project of their own built from the same
	// compiler options, so they are checked with the same types rather than linted untyped.
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.js', 'vitest-setup-client.ts', 'scripts/*.mjs'],
					defaultProject: 'tsconfig.json'
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.svelte']
			}
		},
		plugins: { '@typescript-eslint': ts.plugin },
		rules: {
			// `void` stays the way to mark a call as deliberately fire-and-forget (`ignoreVoid` is on
			// by default): it shows a reader that dropping the result was a decision.
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/await-thenable': 'error'
		}
	},

	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		rules: {
			'svelte/require-each-key': 'error',
			'svelte/prefer-writable-derived': 'error',
			'svelte/infinite-reactive-loop': 'error'
		}
	}
);
