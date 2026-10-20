import { describe, expect, it } from 'vitest';
import {
	PROVIDER_META,
	estimateSessionCost,
	isLocalWhisper,
	modelLabel,
	providerCanTranslate,
	providerDetectsLanguage,
	providerKeyName,
	providerRequiresKey,
	rateText
} from './providers';
import { en } from './i18n/en';
import { PROVIDERS } from './types';

// Gemini appears twice under two different model ids — Live Translate for captions,
// Transcribe Live for subtitles. These predicates are what keep the two apart everywhere:
// the rail that offers a backend, the guard that starts a session, and the credential row.
describe('the two Gemini backends', () => {
	it('routes each to exactly one mode', () => {
		expect(providerCanTranslate('gemini')).toBe(true);
		expect(providerCanTranslate('gemini-transcribe')).toBe(false);
	});

	it('shares one AI Studio credential, so switching mode never re-prompts', () => {
		expect(providerKeyName('gemini-transcribe')).toBe(providerKeyName('gemini'));
		expect(PROVIDER_META['gemini-transcribe'].keyUrl).toBe(PROVIDER_META.gemini.keyUrl);
		expect(providerRequiresKey('gemini-transcribe')).toBe(true);
	});

	it('bills the subtitle model separately from the translation model', () => {
		expect(PROVIDER_META['gemini-transcribe'].modelId).toBe('gemini-3.5-transcribe-live');
		expect(PROVIDER_META['gemini-transcribe'].hourlyEstimate).toBeLessThan(
			PROVIDER_META.gemini.hourlyEstimate
		);
	});
});

// Step 03 asks for a language only when the operator has one to give. Both subtitle engines
// identify the spoken language themselves; the built-in demo instead picks which script to play.
describe('providerDetectsLanguage', () => {
	it('is true for the backends that identify the spoken language themselves', () => {
		expect(providerDetectsLanguage('mistral')).toBe(true);
		expect(providerDetectsLanguage('gemini-transcribe')).toBe(true);
	});

	it('is false where the operator still chooses one', () => {
		expect(providerDetectsLanguage('gemini')).toBe(false);
		expect(providerDetectsLanguage('openai')).toBe(false);
		expect(providerDetectsLanguage('ondevice')).toBe(false);
		// Whisper detects what is spoken, but translating, the room reads English, and that is
		// the operator's choice like any other caption language.
		expect(providerDetectsLanguage('whisper-translate')).toBe(false);
	});
});

// Whisper serves both modes the way Gemini does, as two ids — but one local engine. What the
// id decides is the mode; everything about running the engine follows `isLocalWhisper`.
describe('the two Whisper tasks', () => {
	it('route each to exactly one mode', () => {
		expect(providerCanTranslate('whisper')).toBe(false);
		expect(providerCanTranslate('whisper-translate')).toBe(true);
	});

	it('run the same keyless local engine, and only they do', () => {
		expect(PROVIDERS.filter(isLocalWhisper)).toEqual(['whisper', 'whisper-translate']);
		for (const provider of ['whisper', 'whisper-translate'] as const) {
			expect(providerRequiresKey(provider)).toBe(false);
			expect(rateText(PROVIDER_META[provider], en)).toBe(en.cost.free);
			// Free whatever runs: two sources and an hour cost nothing.
			expect(estimateSessionCost(provider, 3_600_000, 2)).toBe(0);
		}
	});

	it('describes the translating one by what it writes', () => {
		expect(modelLabel(PROVIDER_META['whisper-translate'], en)).toBe(
			en.provider.model['whisper-translate']
		);
		expect(modelLabel(PROVIDER_META.whisper, en)).toBe(en.provider.model.whisper);
	});
});
