import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { de } from './de';
import { en } from './en';
import { fr } from './fr';
import { get } from 'svelte/store';
import {
	detectLocale,
	locale,
	t,
	localeTag,
	LOCALE_KEY,
	LOCALES,
	formatDateTime,
	setLocale,
	LOCALE_NAMES
} from './index';

/** Every catalog but English, keyed by the code a failure message should name. English is the
 *  shape the others are checked against, so it is the comparison and never a subject. */
const TRANSLATIONS = { fr, de } as const;

type TranslationCode = keyof typeof TRANSLATIONS;
const TRANSLATION_CODES = Object.keys(TRANSLATIONS) as TranslationCode[];

/** Every leaf in a catalog, as `a.b.c` paths, so two catalogs can be compared as sets. */
function paths(value: unknown, prefix = ''): string[] {
	if (typeof value !== 'object' || value === null) return [prefix];
	return Object.entries(value).flatMap(([key, child]) =>
		paths(child, prefix ? `${prefix}.${key}` : key)
	);
}

/** The leaf at `a.b.c`. */
function at(catalog: unknown, path: string): unknown {
	return path.split('.').reduce<unknown>((node, key) => (node as never)[key], catalog);
}

describe('the document language', () => {
	// This project runs in node, so `document` is a stand-in — the same way the persisted-setup
	// tests stand in for `localStorage`.
	afterEach(() => {
		Reflect.deleteProperty(globalThis, 'document');
	});

	function documentStub(): { documentElement: { lang: string } } {
		const stub = { documentElement: { lang: 'en' } };
		Object.defineProperty(globalThis, 'document', { configurable: true, value: stub });
		return stub;
	}

	// `app.html` ships lang="en" and nothing used to move it, so a French interface was handed
	// to Narrator as English — which decides the voice and the pronunciation rules, not just a
	// label in the DOM. WCAG 3.1.1.
	it('follows the interface language, as a real BCP 47 tag', () => {
		// Settle on a known language *before* the stub exists: a svelte writable only notifies
		// on a real change, so setting the language it is already on would write nothing and
		// the assertion would pass or fail on whatever an earlier test happened to leave.
		setLocale('en');
		const doc = documentStub();

		setLocale('fr');
		expect(doc.documentElement.lang).toBe('fr-FR');
		setLocale('de');
		expect(doc.documentElement.lang).toBe('de-DE');
		setLocale('en');
		expect(doc.documentElement.lang).toBe('en-GB');
	});

	// The subscription runs at import time, before any window exists in a packaged build.
	it('does not reach for a document that is not there', () => {
		expect(() => setLocale('fr')).not.toThrow();
		setLocale('en');
	});
});

describe('the message catalogs', () => {
	// TypeScript already fails a catalog with a missing or extra key — `fr` is typed as
	// `typeof en`. This is the pass structural typing cannot make: a key that is present and
	// typed correctly but empty, or a message that is a string where English takes arguments.
	it.each(TRANSLATION_CODES)('agree on every key in %s', (code) => {
		expect(paths(TRANSLATIONS[code]).sort()).toEqual(paths(en).sort());
	});

	it.each(TRANSLATION_CODES)('agree in %s on which messages take parameters', (code) => {
		const catalog = TRANSLATIONS[code];
		for (const path of paths(en)) {
			const source = at(en, path);
			const target = at(catalog, path);
			expect(
				typeof target,
				`${path} is a ${typeof target} in ${code} and a ${typeof source} in en`
			).toBe(typeof source);
			if (typeof source === 'function' && typeof target === 'function') {
				expect(target.length, `${path} takes a different number of arguments in ${code}`).toBe(
					source.length
				);
			}
		}
	});

	it('leave nothing blank', () => {
		for (const catalog of [en, ...Object.values(TRANSLATIONS)]) {
			for (const path of paths(catalog)) {
				const message = at(catalog, path);
				if (typeof message === 'string') {
					expect(message.trim(), `${path} is empty`).not.toBe('');
				}
			}
		}
	});

	// A catalog copied from another one and left half-translated is the failure the type system
	// cannot see: every key present, every type right, and the app rendering English. Whole
	// sentences shared with English are the cheapest signal of it. Proper nouns, commands and
	// single words are legitimately identical, so the bar is a proportion of the sentences
	// rather than zero.
	it.each(TRANSLATION_CODES)('are not %s copies of the English catalog', (code) => {
		const catalog = TRANSLATIONS[code];
		const sentences = paths(en).filter((path) => {
			const message = at(en, path);
			return typeof message === 'string' && message.includes(' ');
		});
		const shared = sentences.filter((path) => at(catalog, path) === at(en, path));
		expect(
			shared.length / sentences.length,
			`${code} shares these English sentences: ${shared.join(', ')}`
		).toBeLessThan(0.1);
	});

	it('name each language in its own language', () => {
		expect(en.locale.name).toBe('English');
		expect(fr.locale.name).toBe('Français');
		expect(de.locale.name).toBe('Deutsch');
	});

	// The selector is built from LOCALE_NAMES, so a language the app ships but cannot name
	// renders an empty button rather than failing anywhere visible.
	it('name every locale the selector offers', () => {
		for (const code of LOCALES) {
			expect(LOCALE_NAMES[code]?.trim(), `${code} has no name`).toBeTruthy();
		}
	});

	it('carry a formatting tag per locale', () => {
		expect(en.locale.tag).toBe('en-GB');
		expect(fr.locale.tag).toBe('fr-FR');
		expect(de.locale.tag).toBe('de-DE');
	});
});

// French punctuation takes a non-breaking space before `: ? ; !`, and this UI is dense enough
// that the alternative — a line breaking between a word and its question mark — is not
// hypothetical. Invisible in a diff, so checked here.
describe('French typography', () => {
	const strings = (value: unknown): string[] =>
		typeof value === 'string'
			? [value]
			: typeof value === 'object' && value !== null
				? Object.values(value).flatMap(strings)
				: [];

	it('uses a non-breaking space before its double punctuation', () => {
		for (const message of strings(fr)) {
			expect(message, `"${message}" has an ordinary space before its punctuation`).not.toMatch(
				/ [:;?!]/
			);
		}
	});

	it('uses the typographic apostrophe', () => {
		for (const message of strings(fr)) {
			expect(message, `"${message}" uses a straight apostrophe`).not.toMatch(/\w'\w/);
		}
	});
});

describe('choosing a locale', () => {
	const storage = new Map<string, string>();

	// These run in the `logic` project, which has no DOM, so the two globals `detectLocale`
	// reads are stubbed rather than mocked away.
	beforeEach(() => {
		storage.clear();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => void storage.set(key, value)
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('follows an explicit choice over the machine', () => {
		storage.set(LOCALE_KEY, 'en');
		vi.stubGlobal('navigator', { languages: ['fr-FR'], language: 'fr-FR' });
		expect(detectLocale()).toBe('en');
	});

	// An operator whose Windows is in French should be spoken to in French on first run,
	// without having to find a selector to say so.
	it('follows the machine on first run', () => {
		vi.stubGlobal('navigator', { languages: ['fr-CA', 'en-US'], language: 'fr-CA' });
		expect(detectLocale()).toBe('fr');
	});

	// Austrian and Swiss Windows are German here, the same way fr-CA is French.
	it('matches a German machine on its primary subtag', () => {
		vi.stubGlobal('navigator', { languages: ['de-AT'], language: 'de-AT' });
		expect(detectLocale()).toBe('de');
	});

	it('falls back to English for a language it does not have', () => {
		vi.stubGlobal('navigator', { languages: ['es-ES'], language: 'es-ES' });
		expect(detectLocale()).toBe('en');
	});

	it('ignores a stored value that is not a locale it ships', () => {
		storage.set(LOCALE_KEY, 'es');
		vi.stubGlobal('navigator', { languages: ['en-GB'], language: 'en-GB' });
		expect(detectLocale()).toBe('en');
	});

	it('offers exactly the catalogs it has', () => {
		expect(LOCALES).toEqual(['en', 'fr', 'de']);
	});
});

describe('the active catalog', () => {
	// The whole point of the store: components read `$t`, so changing the language has to
	// re-render them rather than requiring a restart.
	it('follows the locale store', () => {
		locale.set('fr');
		expect(get(t)).toBe(fr);
		expect(get(localeTag)).toBe('fr-FR');

		locale.set('de');
		expect(get(t)).toBe(de);
		expect(get(localeTag)).toBe('de-DE');

		locale.set('en');
		expect(get(t)).toBe(en);
		expect(get(localeTag)).toBe('en-GB');
	});
});

describe('formatting a timestamp', () => {
	// The recovery prompt says when the spool was written; in a French session that has to be
	// a French date, which is the whole reason `locale.tag` exists.
	it('follows the interface language', () => {
		const stamp = Date.UTC(2026, 7, 27, 9, 30);
		const english = formatDateTime(stamp, 'en-GB');
		const french = formatDateTime(stamp, 'fr-FR');
		const german = formatDateTime(stamp, 'de-DE');
		expect(english).not.toBe(french);
		expect(french).toMatch(/août/);
		// German's medium date style is numeric and dotted — 27.08.2026 — where English and
		// French both name the month. Asserting the shape rather than a word is the point:
		// it is what proves the tag reached `Intl` rather than a month name happening to be
		// spelled the same in two languages.
		expect(german).toMatch(/^\d{2}\.\d{2}\.\d{4}/);
		expect(german).not.toBe(english);
	});
});

it('preserves accented design labels without replacement characters', () => {
	expect(fr.design.manageProfiles).toBe('Gérer les profils');
	expect(de.design.applies).toBe('Änderungen werden sofort angewendet.');
	for (const catalog of [en, fr, de]) {
		for (const path of paths(catalog)) {
			const value = at(catalog, path);
			if (typeof value === 'string') expect(value, path).not.toContain('\uFFFD');
		}
	}
});
