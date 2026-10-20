import { get } from 'svelte/store';
import { languageFavourites } from './stores';
import { LANGUAGE_FAVOURITES_KEY } from './languages';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
	captionDirection,
	captionLanguageError,
	languageRows,
	languageName,
	loadLanguageFavourites,
	nextFavourite,
	supportsLanguage,
	TARGET_LANGUAGES,
	unsupportedCaptionLanguage
} from './languages';
import { en } from './i18n/en';
import { DEFAULT_START_OPTIONS, normalizeStartOptions, loadStartOptions } from './startOptions';

afterEach(() => vi.unstubAllGlobals());

it('keeps generated Rust and TypeScript aligned with the provider catalog', () => {
	execFileSync(process.execPath, ['scripts/generate-languages.mjs', '--check']);
	expect(languageRows('gemini', [], '', 'en')).toHaveLength(78);
	expect(languageRows('openai', [], '', 'en')).toHaveLength(13);
	expect(languageRows('ondevice', [], '', 'en').map((r) => r.code)).toEqual(['en', 'fr']);
	expect(languageRows('whisper-translate', [], '', 'en').map((r) => r.code)).toEqual(['en']);
});

// Whisper's translate task writes English only. Another caption language is refused the way
// any engine refuses one it cannot write, and a second language saved for a cloud engine
// waits, unused, rather than blocking the start.
it('lets Whisper translate into English only, and says so for any other caption language', () => {
	const run = {
		mode: 'translate',
		provider: 'whisper-translate',
		targetLanguage: 'en',
		secondTargetLanguage: null
	} as const;
	expect(captionLanguageError(run, en, 'en')).toBe('');
	expect(captionLanguageError({ ...run, targetLanguage: 'fr' }, en, 'en')).toBe(
		'Whisper does not support French — choose another language.'
	);
	expect(unsupportedCaptionLanguage({ ...run, secondTargetLanguage: 'de' })).toBeUndefined();
	// Nothing to flip to: only one of the two favourites can be written.
	expect(nextFavourite('en', ['en', 'fr'], 'whisper-translate')).toBeUndefined();
});

describe('type-ahead search', () => {
	for (const query of ['fre', 'fr', 'franc', 'français', 'FRANCAIS', 'franç']) {
		it(`finds French first for ${query}`, () => {
			expect(languageRows('gemini', ['en', 'fr'], query, 'en')[0]?.code).toBe('fr');
		});
	}
	it('ranks prefixes above substrings and matches localized names, endonyms and tags', () => {
		expect(languageRows('gemini', ['en', 'fr'], 'it', 'en')[0]?.code).toBe('it');
		expect(languageRows('gemini', [], 'espanol', 'en')[0]?.code).toBe('es');
		expect(languageRows('gemini', [], 'allemand', 'fr')[0]?.code).toBe('de');
		expect(languageRows('gemini', [], '日本語', 'fr')[0]?.code).toBe('ja');
		expect(languageRows('gemini', [], 'pt-BR', 'de')[0]?.code).toBe('pt-BR');
		expect(languageRows('gemini', [], 'nb', 'en')[0]?.code).toBe('no');
		expect(languageRows('gemini', [], 'sw', 'fr')[0]?.code).toBe('sw');
	});
});

it('seeds, restores, deduplicates and validates independent favourites, including an empty preference', () => {
	expect(loadLanguageFavourites({ getItem: () => null })).toEqual(['en', 'fr']);
	expect(loadLanguageFavourites({ getItem: () => '["sw","ja","sw","bogus"]' })).toEqual([
		'sw',
		'ja'
	]);
	expect(loadLanguageFavourites({ getItem: () => '[]' })).toEqual([]);
	expect(loadLanguageFavourites({ getItem: () => '{' })).toEqual(['en', 'fr']);
	expect(languageRows('openai', ['sw', 'ja'], '', 'en').slice(0, 2)).toMatchObject([
		{ code: 'sw', favourite: true, supported: false },
		{ code: 'ja', supported: true }
	]);
});

it('keeps valid unsupported selections, restores every target, and rejects corrupt persisted values', () => {
	for (const code of TARGET_LANGUAGES) {
		vi.stubGlobal('localStorage', {
			getItem: () => JSON.stringify({ ...DEFAULT_START_OPTIONS, targetLanguage: code })
		});
		expect(loadStartOptions().targetLanguage).toBe(code);
	}
	vi.stubGlobal('localStorage', { getItem: () => '{"targetLanguage":"not-a-language"}' });
	expect(loadStartOptions().targetLanguage).toBe('en');
	const switched = normalizeStartOptions({
		...DEFAULT_START_OPTIONS,
		mode: 'translate',
		provider: 'openai',
		targetLanguage: 'sw'
	});
	expect(switched.targetLanguage).toBe('sw');
	expect(supportsLanguage(switched.provider, switched.targetLanguage)).toBe(false);
	expect(supportsLanguage('ondevice', 'de')).toBe(false);
	expect(supportsLanguage('mistral', 'sw')).toBe(true);
});

it('finds the caption language an engine cannot write, the second one included', () => {
	const run = {
		mode: 'translate',
		provider: 'openai',
		targetLanguage: 'en',
		secondTargetLanguage: null
	} as const;
	expect(unsupportedCaptionLanguage(run)).toBeUndefined();
	expect(unsupportedCaptionLanguage({ ...run, targetLanguage: 'sw' })).toBe('sw');
	// Kept in the saved setup across an engine change, so it can be the one that fails.
	expect(unsupportedCaptionLanguage({ ...run, secondTargetLanguage: 'sw' })).toBe('sw');
	expect(
		unsupportedCaptionLanguage({ ...run, provider: 'gemini', secondTargetLanguage: 'sw' })
	).toBeUndefined();
	// Subtitles have no second language, so a stale one there is not a reason to refuse.
	expect(
		unsupportedCaptionLanguage({ ...run, mode: 'transcribe', secondTargetLanguage: 'sw' })
	).toBeUndefined();

	expect(captionLanguageError(run, en, 'en')).toBe('');
	expect(captionLanguageError({ ...run, secondTargetLanguage: 'sw' }, en, 'en')).toBe(
		en.language.unsupported(en.engine.openai, 'Swahili')
	);
});

it('swaps only the first two supported pins, including from outside the pair', () => {
	expect(nextFavourite('en', ['en', 'fr', 'de'], 'openai')).toBe('fr');
	expect(nextFavourite('de', ['ja', 'fr', 'de'], 'openai')).toBe('ja');
	expect(nextFavourite('ja', ['ja', 'fr'], 'openai')).toBe('fr');
	expect(nextFavourite('fr', ['sw', 'fr'], 'openai')).toBeUndefined();
	expect(nextFavourite('en', ['fr'], 'gemini')).toBeUndefined();
});

it('falls back to the catalog when Intl is unavailable or returns the code', () => {
	vi.stubGlobal('Intl', {
		DisplayNames: class {
			of(code: string) {
				return code;
			}
		}
	});
	expect(languageName('ja', 'en')).toBe('Japanese');
	vi.stubGlobal('Intl', {});
	expect(languageName('pt-BR', 'fr')).toBe('Portuguese (Brazil)');
});

it('uses RTL for Arabic-script and Hebrew captions, and auto for detected languages', () => {
	for (const code of ['ar', 'he', 'fa', 'ur', 'sd']) expect(captionDirection(code)).toBe('rtl');
	expect(captionDirection('ja')).toBe('ltr');
	expect(captionDirection()).toBe('auto');
});

it('writes favourites separately and restores their pin order after reload', () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		}
	};
	vi.stubGlobal('localStorage', storage);
	const previous = get(languageFavourites);
	try {
		languageFavourites.set(['ja', 'sw', 'fr']);
		expect(values.has(LANGUAGE_FAVOURITES_KEY)).toBe(true);
		expect(loadLanguageFavourites(storage)).toEqual(['ja', 'sw', 'fr']);
		languageFavourites.set(['ja', 'fr']);
		expect(loadLanguageFavourites(storage)).toEqual(['ja', 'fr']);
		expect(values.has('session.options')).toBe(false);
	} finally {
		languageFavourites.set(previous);
	}
});
