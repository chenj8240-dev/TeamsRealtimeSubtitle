import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	AUDIO_SOURCES,
	EVT,
	ORIGINS,
	OUTPUT_MODES,
	PROVIDERS,
	SESSION_STATES,
	TRAY_COMMANDS
} from './types';
import { DEMO_LANGUAGES } from './languages';

// The interface and the core agree on command names, event names and the string values of
// shared enums only by convention: nothing at runtime connects them, and a mismatch shows up
// as a rejected IPC call, an event nobody hears, or a value that fails to deserialize. These
// tests read the Rust source, as `errors.test.ts` does for error ids, so a rename on either
// side fails here instead.

const rust = (path: string) =>
	readFileSync(new URL(`../../src-tauri/src/${path}`, import.meta.url), 'utf8');
const TAURI_TS = readFileSync(new URL('./tauri.ts', import.meta.url), 'utf8');

const sorted = (values: Iterable<string>) => [...values].sort();

describe('commands', () => {
	const core = [...rust('command_names.rs').matchAll(/^\s+"([a-z_]+)",$/gm)].map((m) => m[1]);
	const wrapped = [...TAURI_TS.matchAll(/invoke<[^>]*>\(\s*'([a-z_]+)'/g)].map((m) => m[1]);

	it('finds both lists', () => {
		expect(core.length).toBeGreaterThan(20);
		expect(core).toContain('start_session');
		expect(wrapped).toContain('start_session');
	});

	it('wraps exactly the commands the core registers', () => {
		expect(sorted(new Set(wrapped))).toEqual(sorted(core));
	});
});

describe('events', () => {
	const source = rust('types.rs');
	const block = source.slice(source.indexOf('pub mod events {'));
	const core = [
		...block.slice(0, block.indexOf('\n}')).matchAll(/pub const [A-Z_]+: &str = "([a-z-]+)";/g)
	].map((m) => m[1]);
	/** Sent between the two webviews; the core never emits or listens for them. */
	const WEBVIEW_ONLY = ['overlay-config', 'overlay-state'];

	it('finds the core event names', () => {
		expect(core).toContain('caption');
		expect(core.length).toBeGreaterThan(5);
	});

	it('listens under the names the core emits, plus the webview-only pair', () => {
		expect(sorted(Object.values(EVT))).toEqual(sorted([...core, ...WEBVIEW_ONLY]));
	});
});

/** The JSON strings a serde enum accepts: an explicit `rename` wins, then `rename_all`. */
function serdeVariants(source: string, name: string): string[] {
	const start = source.indexOf(`pub enum ${name} {`);
	expect(start, `pub enum ${name} not found`).toBeGreaterThan(-1);
	// Everything since the previous item closed; the first item in a file has none.
	const attributes = source.slice(Math.max(0, source.lastIndexOf('\n}', start)), start);
	const renameAll = /#\[serde\(rename_all = "([a-z-]+|camelCase)"\)\]/.exec(attributes)?.[1];
	const body = source.slice(start, source.indexOf('\n}', start)).split('\n').slice(1);

	const variants: string[] = [];
	let rename: string | undefined;
	for (const line of body) {
		const explicit = /#\[serde\(rename = "([^"]+)"\)\]/.exec(line);
		if (explicit) {
			rename = explicit[1];
			continue;
		}
		const variant = /^\s+([A-Z][A-Za-z0-9]*),?\s*$/.exec(line);
		if (!variant) continue;
		variants.push(rename ?? applyRenameAll(variant[1], renameAll));
		rename = undefined;
	}
	return variants;
}

function applyRenameAll(variant: string, rule: string | undefined): string {
	switch (rule) {
		case 'lowercase':
			return variant.toLowerCase();
		case 'kebab-case':
			return variant.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
		case 'camelCase':
			return variant[0].toLowerCase() + variant.slice(1);
		default:
			return variant;
	}
}

describe('shared enums', () => {
	const types = rust('types.rs');

	it('reads serde renames the way serde does', () => {
		expect(serdeVariants(types, 'Provider')).toContain('gemini-transcribe');
		expect(serdeVariants(types, 'Provider')).toContain('openai');
		expect(applyRenameAll('StopSession', 'kebab-case')).toBe('stop-session');
	});

	it.each([
		['AudioSource', types, AUDIO_SOURCES],
		['Origin', types, ORIGINS],
		['Provider', types, PROVIDERS],
		['OutputMode', types, OUTPUT_MODES],
		['SessionState', types, SESSION_STATES],
		['DemoLanguage', types, DEMO_LANGUAGES],
		['TrayCommand', rust('tray.rs'), TRAY_COMMANDS]
	] as const)('%s has the same values on both sides', (name, source, values) => {
		expect(sorted(values)).toEqual(sorted(serdeVariants(source, name)));
	});
});
