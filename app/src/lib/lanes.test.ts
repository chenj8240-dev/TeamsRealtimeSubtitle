// Two caption languages at once: each source runs a second translation client (lane 1), and
// everything keyed per stream is keyed per track — a source in one language. These pin the
// pieces that have to agree: the options, the stores, the presenter, the document and the
// export.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	applyStatus,
	beginSession,
	clearTranscript,
	currentCaptions,
	isRunning,
	options,
	originState,
	originStates,
	pushCaption,
	transcript
} from './stores';
import { createSetupActions } from './setupActions';
import { createSessionController } from './sessionController';
import { createCaptionPresenter } from './reading';
import { decodeRecovery, encodeRecovery } from './document';
import { DEFAULT_LABELS, formatTranscript, groupTranscript } from './transcript';
import { normalizeStartOptions } from './startOptions';
import {
	laneCount,
	laneLanguage,
	secondCaptionLanguageOf,
	trackLane,
	trackOf,
	trackOrigin,
	type Caption,
	type StartOptions,
	type TranscriptLine
} from './types';

const dual: StartOptions = {
	source: 'microphone',
	mode: 'translate',
	provider: 'gemini',
	targetLanguage: 'fr',
	secondTargetLanguage: 'en'
};

function caption(lane: 0 | 1, turnId: number, text: string, final = true): Caption {
	return {
		origin: 'microphone',
		lane,
		turnId,
		text,
		sourceText: 'Speech as spoken.',
		final,
		startMs: turnId * 1000,
		endMs: turnId * 1000 + 500
	};
}

beforeEach(() => {
	applyStatus({ state: 'idle' });
	clearTranscript();
	options.set({ ...dual });
});

afterEach(() => vi.useRealTimers());

describe('the second caption language as an option', () => {
	it('counts only for translation, and only when it differs from the first', () => {
		expect(secondCaptionLanguageOf(dual)).toBe('en');
		expect(laneCount(dual)).toBe(2);
		expect(secondCaptionLanguageOf({ ...dual, mode: 'transcribe' })).toBeUndefined();
		expect(secondCaptionLanguageOf({ ...dual, secondTargetLanguage: 'fr' })).toBeUndefined();
		expect(laneCount({ ...dual, secondTargetLanguage: null })).toBe(1);
		expect(laneLanguage(dual, 0)).toBe('fr');
		expect(laneLanguage(dual, 1)).toBe('en');
	});

	// Kept in the saved setup for the next cloud engine, as it is through subtitles.
	it('never counts for Whisper, which translates into English only', () => {
		const whisper: StartOptions = {
			...dual,
			provider: 'whisper-translate',
			targetLanguage: 'en',
			secondTargetLanguage: 'fr'
		};
		expect(secondCaptionLanguageOf(whisper)).toBeUndefined();
		expect(laneCount(whisper)).toBe(1);
		expect(laneLanguage(whisper, 0)).toBe('en');
	});

	it('survives a restart, and a stored value that is not a language does not', () => {
		expect(normalizeStartOptions(dual).secondTargetLanguage).toBe('en');
		expect(
			normalizeStartOptions({ ...dual, secondTargetLanguage: 'klingon' }).secondTargetLanguage
		).toBeNull();
	});

	it('keys lane 0 by the bare origin, so one language is keyed as it always was', () => {
		expect(trackOf('system')).toBe('system');
		expect(trackOf('system', 0)).toBe('system');
		expect(trackOf('system', 1)).toBe('system:1');
		expect(trackOrigin('microphone:1')).toBe('microphone');
		expect(trackLane('microphone:1')).toBe(1);
		expect(trackLane('microphone')).toBe(0);
	});
});

describe('choosing the second language', () => {
	const actions = () =>
		createSetupActions({
			locked: () => false,
			invalidateAudioTest: () => {},
			refreshDevices: () => {}
		});

	it('sets and clears it, and never lets it equal the first', () => {
		const a = actions();
		a.setSecondTarget('de');
		expect(get(options).secondTargetLanguage).toBe('de');
		a.setSecondTarget('fr');
		expect(get(options).secondTargetLanguage).toBeNull();
		a.setSecondTarget(null);
		expect(get(options).secondTargetLanguage).toBeNull();
	});

	it('swaps the two when the second is chosen as the first — which is what F2 does', () => {
		actions().setTarget('en');
		expect(get(options)).toMatchObject({ targetLanguage: 'en', secondTargetLanguage: 'fr' });
	});

	it('is refused outside translation', () => {
		options.set({ ...dual, mode: 'transcribe', provider: 'mistral', secondTargetLanguage: null });
		actions().setSecondTarget('de');
		expect(get(options).secondTargetLanguage).toBeNull();
	});
});

describe('starting a session', () => {
	it('sends the second language only when the run can use it', async () => {
		const startSession = vi.fn().mockResolvedValue(undefined);
		const controller = createSessionController({
			startSession,
			stopSession: vi.fn(),
			pauseSession: vi.fn()
		});
		await controller.start({ ...dual, mode: 'transcribe', provider: 'mistral' });
		expect(startSession.mock.calls[0][0].secondTargetLanguage).toBeNull();
		applyStatus({ state: 'idle' });
		await controller.start(dual);
		expect(startSession.mock.calls[1][0].secondTargetLanguage).toBe('en');
	});

	it('refuses a second language the engine does not offer before reaching the core', async () => {
		const startSession = vi.fn();
		const controller = createSessionController({
			startSession,
			stopSession: vi.fn(),
			pauseSession: vi.fn()
		});
		// OpenAI's thirteen targets do not include Akan.
		expect(
			await controller.start({ ...dual, provider: 'openai', secondTargetLanguage: 'ak' })
		).toBe(false);
		expect(startSession).not.toHaveBeenCalled();
	});
});

describe('two languages in the stores', () => {
	it('keeps each language’s turn apart, and records the language of every line', () => {
		beginSession(dual);
		pushCaption(caption(0, 1, 'Bonjour à tous', false));
		pushCaption(caption(1, 1, 'Hello everyone', false));
		// Turn ids are per track: the same id in the other language is a different turn.
		expect(Object.keys(get(currentCaptions))).toEqual(['microphone', 'microphone:1']);
		pushCaption(caption(0, 1, 'Bonjour à tous.'));
		pushCaption(caption(1, 1, 'Hello everyone.'));
		expect(get(transcript).map((line) => [line.text, line.lane, line.language])).toEqual([
			['Hello everyone.', 1, 'en'],
			['Bonjour à tous.', undefined, 'fr']
		]);
	});

	it('reports each language’s client separately, and a capture failure to both', () => {
		beginSession(dual);
		applyStatus({ state: 'running', origin: 'microphone', lane: 0 });
		applyStatus({ state: 'running', origin: 'microphone', lane: 1 });
		applyStatus({ state: 'error', origin: 'microphone', lane: 1 });
		expect(get(originStates)).toEqual({ microphone: 'running', 'microphone:1': 'error' });
		expect(originState(get(originStates), 'microphone')).toBe('error');
		expect(get(isRunning)).toBe(true);
		// No lane: the source itself failed, so every language it fed has ended.
		applyStatus({ state: 'error', origin: 'microphone' });
		expect(get(isRunning)).toBe(false);
	});

	it('does not invent a second track for a one-language session', () => {
		options.set({ ...dual, secondTargetLanguage: null });
		beginSession();
		applyStatus({ state: 'running', origin: 'system', lane: 0 });
		applyStatus({ state: 'error', origin: 'system' });
		expect(get(originStates)).toEqual({ system: 'error' });
	});
});

describe('the reading presenter', () => {
	it('paces each language on its own timer', () => {
		vi.useFakeTimers();
		const shown: Caption[] = [];
		const presenter = createCaptionPresenter(
			(c) => shown.push(c),
			() => 'steady'
		);
		presenter.push(caption(0, 1, 'Bon', false));
		presenter.push(caption(1, 1, 'Hel', false));
		// The second language's caption must not flush the first language's held one.
		expect(shown).toEqual([]);
		vi.advanceTimersByTime(450);
		expect(shown.map((c) => c.lane)).toEqual([0, 1]);
		presenter.push(caption(1, 2, 'Next', false));
		presenter.clear('microphone', 1);
		vi.advanceTimersByTime(450);
		expect(shown).toHaveLength(2);
	});
});

describe('a transcript in two languages', () => {
	// Newest first, as the store holds it: the two languages finish their turns interleaved.
	const lines: TranscriptLine[] = [
		{
			id: 4,
			origin: 'microphone',
			lane: 1,
			language: 'en',
			text: 'the archive.',
			sourceText: 'l’archive.',
			startMs: 1600,
			endMs: 2600
		},
		{
			id: 3,
			origin: 'microphone',
			language: 'fr',
			text: 'l’archive.',
			sourceText: 'l’archive.',
			startMs: 1500,
			endMs: 2500
		},
		{
			id: 2,
			origin: 'microphone',
			lane: 1,
			language: 'en',
			text: 'We begin with',
			sourceText: 'Nous commençons par',
			startMs: 100,
			endMs: 1100
		},
		{
			id: 1,
			origin: 'microphone',
			language: 'fr',
			text: 'Nous commençons par',
			sourceText: 'Nous commençons par',
			startMs: 0,
			endMs: 1000
		}
	];
	const labels = {
		...DEFAULT_LABELS,
		language: (code: string) => ({ fr: 'French', en: 'English' })[code] ?? code
	};

	it('groups each language into its own paragraphs rather than alternating line by line', () => {
		expect(groupTranscript(lines).map((p) => [p.language, p.text])).toEqual([
			['fr', 'Nous commençons par l’archive.'],
			['en', 'We begin with the archive.']
		]);
	});

	it('writes one section per language in Markdown and text, with the original once', () => {
		const md = formatTranscript(lines, 'markdown', new Date(0), labels, { original: true });
		expect(md).toContain('\n## French\n\n**Microphone**\n\nNous commençons par l’archive.\n');
		expect(md).toContain('\n## English\n\n**Microphone**\n\nWe begin with the archive.\n');
		expect(md.match(/Original:/g)).toHaveLength(1);
		const text = formatTranscript(lines, 'text', new Date(0), labels);
		expect(text.indexOf('FRENCH')).toBeLessThan(text.indexOf('ENGLISH'));
	});

	it('labels each timed cue with its language, and sets the original under the first', () => {
		const srt = formatTranscript(lines, 'srt', new Date(0), labels, { original: true });
		expect(srt).toContain(
			'[Microphone · French] Nous commençons par\n<i>Nous commençons par</i>\n'
		);
		expect(srt).toContain('[Microphone · English] We begin with\n\n');
		const vtt = formatTranscript(lines, 'vtt', new Date(0), labels);
		expect(vtt).toContain('<v Microphone · English>the archive.</v>');
	});

	it('leaves a one-language transcript exactly as it was', () => {
		const single = lines
			.filter((line) => line.lane !== 1)
			.map(({ language: _language, ...line }) => line);
		const md = formatTranscript(single, 'markdown', new Date(0), labels);
		expect(md).not.toContain('##');
		expect(md).not.toContain('·');
	});

	it('keeps the lane and the language through the recovery file', () => {
		const back = decodeRecovery(encodeRecovery(lines, new Date(0)))!.lines;
		expect(back.map((line) => [line.id, line.lane, line.language])).toEqual([
			[4, 1, 'en'],
			[3, undefined, 'fr'],
			[2, 1, 'en'],
			[1, undefined, 'fr']
		]);
	});
});
