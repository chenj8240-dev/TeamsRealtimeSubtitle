import { describe, expect, it } from 'vitest';
import { captionLanguageOf, canFlipDirection } from './types';
import { PROVIDER_META } from './providers';

// The operator UI used to offer "Flip mid-session with F2" over a handler that refused for
// the whole of a session (issue #21). Keeping the rule in one tested predicate is what stops
// the shortcut and the copy drifting apart again.
describe('canFlipDirection', () => {
	it('allows a swap while the operator is still setting a translation up', () => {
		expect(canFlipDirection('translate', false)).toBe(true);
	});

	it('refuses once controls are locked, which is the whole of a running session', () => {
		expect(canFlipDirection('translate', true)).toBe(false);
	});

	it('refuses in subtitle mode, which has no direction to flip', () => {
		expect(canFlipDirection('transcribe', false)).toBe(false);
		expect(canFlipDirection('transcribe', true)).toBe(false);
	});
});

// The overlay marks its captions up with this, so a wrong answer is a screen reader reading
// French with English phonemes and a missing answer is only a voice that stays neutral. The
// asymmetry is why "unknown" has to survive as far as the markup instead of being guessed.
describe('captionLanguageOf', () => {
	const base = { mode: 'translate', provider: 'gemini', targetLanguage: 'fr' } as const;

	it('names the target language when the app is translating into it', () => {
		expect(captionLanguageOf(base)).toBe('fr');
		expect(captionLanguageOf({ ...base, targetLanguage: 'en' })).toBe('en');
	});

	it('names it for the built-in demonstration, which plays a script in that language', () => {
		expect(
			captionLanguageOf({ mode: 'transcribe', provider: 'ondevice', targetLanguage: 'en' })
		).toBe('en');
	});

	// The stored target keeps whatever it was last set to, so it is present and plausible and
	// wrong — exactly the shape of value that gets used by accident.
	it('admits it does not know while a subtitle engine detects the spoken language', () => {
		for (const provider of ['mistral', 'gemini-transcribe'] as const) {
			expect(
				captionLanguageOf({ mode: 'transcribe', provider, targetLanguage: 'fr' }),
				provider
			).toBeUndefined();
		}
	});

	// One rule, stated twice, drifts. The app can name the caption language exactly when the
	// operator is allowed to choose it — `setTarget` refuses under the same condition.
	it('knows the language for precisely the settings that let the operator choose it', () => {
		const providers = Object.keys(PROVIDER_META) as Array<keyof typeof PROVIDER_META>;
		for (const provider of providers) {
			for (const mode of ['translate', 'transcribe'] as const) {
				const operatorMayChoose = mode === 'translate' || provider === 'ondevice';
				expect(
					captionLanguageOf({ mode, provider, targetLanguage: 'en' }) !== undefined,
					`${mode}/${provider}`
				).toBe(operatorMayChoose);
			}
		}
	});
});
