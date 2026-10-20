import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asStatus, describeError, isAppError } from './errors';
import { de } from './i18n/de';
import { en } from './i18n/en';
import { fr } from './i18n/fr';

describe('describing a failure', () => {
	it('puts the sentence in front of the technical detail', () => {
		const text = describeError({ id: 'error.micCapture', detail: 'Access is denied.' }, en);
		expect(text).toContain('Microphone capture failed');
		expect(text).toContain('(Access is denied.)');
	});

	it('says only the sentence when the core sent no detail', () => {
		expect(describeError({ id: 'error.keychain' }, en)).toBe(en.error.keychain);
	});

	// A core that has learned a new failure must still say something an operator can act on.
	// `error.somethingNew` on screen would help nobody; the Windows message might.
	it('falls back to the detail for an id the catalog has never heard of', () => {
		expect(describeError({ id: 'error.somethingNew', detail: 'device busy' }, en)).toBe(
			'device busy'
		);
	});

	it('falls back to the id when there is nothing else', () => {
		expect(describeError({ id: 'error.somethingNew' }, en)).toBe('error.somethingNew');
	});

	it('handles what the webview throws, not just what Rust returns', () => {
		expect(describeError(new Error('window is gone'), en)).toBe('window is gone');
		expect(describeError('plain text', en)).toBe('plain text');
	});

	it('recognises the core error shape and nothing else', () => {
		expect(isAppError({ id: 'error.keychain' })).toBe(true);
		expect(isAppError({ id: 'error.keychain', detail: 'x' })).toBe(true);
		expect(isAppError({ detail: 'x' })).toBe(false);
		expect(isAppError({ id: 7 })).toBe(false);
		expect(isAppError('error.keychain')).toBe(false);
		expect(isAppError(null)).toBe(false);
	});

	// The store keeps structure so the sentence can be chosen at render time; flattening on
	// the way in would freeze the message in whichever language was active when it happened.
	it('keeps a core error structured on its way into the status store', () => {
		const error = { id: 'error.transcriptWrite', detail: 'D:\\Docs — access denied' };
		expect(asStatus(error)).toBe(error);
		expect(asStatus(new Error('boom'))).toBe('boom');
		expect(asStatus(42)).toBe('42');
	});
});

// The core names failures the interface has to word. Nothing at runtime connects the two, so
// this reads the ids out of the Rust source: a failure the core can report and the catalog
// cannot word would otherwise reach an operator as a bare Windows error, or as nothing.
describe('the catalog and the core', () => {
	const RUST = readFileSync(new URL('../../src-tauri/src/errors.rs', import.meta.url), 'utf8');

	const ids = [...RUST.matchAll(/pub const [A-Z_]+: &str = "(error\.[A-Za-z]+)";/g)].map((match) =>
		match[1].slice('error.'.length)
	);

	it('finds the ids the core can emit', () => {
		// A guard on the guard: a rename that broke the pattern would otherwise pass silently.
		expect(ids.length).toBeGreaterThan(10);
		expect(ids).toContain('micCapture');
	});

	it.each(['en', 'fr', 'de'])('has a sentence in %s for every one of them', (code) => {
		const catalog = { en, fr, de }[code] ?? en;
		for (const id of ids) {
			expect(
				(catalog.error as Record<string, unknown>)[id],
				`error.${id} is reported by the core but has no sentence in ${code}`
			).toBeTypeOf('string');
		}
	});
});
