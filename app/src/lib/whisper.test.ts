import { expect, it } from 'vitest';
import whisperLanguages from './whisperLanguages.json';
import { DEFAULT_START_OPTIONS, normalizeStartOptions } from './startOptions';
import { providerCanTranslate, providerDetectsLanguage, providerRequiresKey } from './providers';
import { estimateSessionCost } from './providers';

it('restores every supported Whisper language and model without falling back to the demo', () => {
	expect(new Set(whisperLanguages.map((l) => l.code)).size).toBe(99);
	for (const language of whisperLanguages) {
		const options = normalizeStartOptions({
			...DEFAULT_START_OPTIONS,
			provider: 'whisper',
			source: 'both',
			whisperModel: 'small',
			spokenLanguage: language.code
		});
		expect(options.provider).toBe('whisper');
		expect(options.source).toBe('both');
		expect(options.whisperModel).toBe('small');
		expect(options.spokenLanguage).toBe(language.code);
	}
});

it('defaults old/malformed local settings to multilingual Base with automatic detection', () => {
	for (const spokenLanguage of [undefined, null, 'yue', 'invalid', 'fr\0suffix']) {
		const options = normalizeStartOptions({
			...DEFAULT_START_OPTIONS,
			provider: 'whisper',
			whisperModel: '../model',
			spokenLanguage
		});
		expect(options.whisperModel).toBe('base');
		expect(options.spokenLanguage).toBeNull();
	}
});

it('offers same-language local recognition with no credential or per-stream charge', () => {
	expect(providerCanTranslate('whisper')).toBe(false);
	expect(providerDetectsLanguage('whisper')).toBe(true);
	expect(providerRequiresKey('whisper')).toBe(false);
	expect(estimateSessionCost('whisper', 7200000, 2)).toBe(0);
});
