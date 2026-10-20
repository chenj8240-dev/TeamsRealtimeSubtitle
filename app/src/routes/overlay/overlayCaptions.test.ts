import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlayCaptions, type ReadingSettings } from './overlayCaptions.svelte';
import { DEFAULT_FILLER_WORDS } from '#lib/cleanSpeech.js';
import { CAPTION_TAIL_CHARS } from '#lib/captionLayout.js';
import { captionBudget } from '#lib/appearance.js';
import type { Caption, Origin } from '#lib/types.js';

const fit: ReadingSettings = {
	layout: 'fit',
	hideFillers: false,
	fillerWords: DEFAULT_FILLER_WORDS,
	hold: 4,
	pace: 'immediate',
	width: 30,
	showOriginal: false
};

function caption(origin: Origin, turnId: number, text: string, final = true): Caption {
	return { origin, turnId, text, sourceText: '', final, startMs: 0, endMs: 0 };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('overlay captions', () => {
	it('shows the remote speaker above the room, each with its own turn', () => {
		const c = createOverlayCaptions(fit);
		c.push(caption('microphone', 1, 'Room.'));
		c.push(caption('system', 1, 'Remote.'));
		expect(c.lines.map((line) => [line.origin, line.text])).toEqual([
			['system', 'Remote.'],
			['microphone', 'Room.']
		]);
		c.dispose();
	});

	it('keeps a finished turn as the lead-in to the next one in Fit window', () => {
		const c = createOverlayCaptions(fit);
		c.push(caption('system', 1, 'First sentence.'));
		c.push(caption('system', 2, 'Second', false));
		expect(c.lines).toEqual([
			{
				track: 'system',
				origin: 'system',
				lane: 0,
				lead: 'First sentence.',
				text: 'Second',
				interim: true,
				original: ''
			}
		]);
		c.dispose();
	});

	it('clears a finished caption after the hold, and a stalled interim sooner', () => {
		const c = createOverlayCaptions({ ...fit, hold: 8 });
		c.push(caption('system', 1, 'Final.'));
		c.push(caption('microphone', 1, 'Stalled', false));
		vi.advanceTimersByTime(3000);
		expect(c.lines.map((line) => line.origin)).toEqual(['system']);
		vi.advanceTimersByTime(5000);
		expect(c.lines).toEqual([]);
		c.dispose();
	});

	it('rearms every expiry when the hold changes', () => {
		const c = createOverlayCaptions(fit);
		c.push(caption('system', 1, 'Final.'));
		vi.advanceTimersByTime(3000);
		c.setHold(10);
		vi.advanceTimersByTime(9000);
		expect(c.lines).toHaveLength(1);
		vi.advanceTimersByTime(1000);
		expect(c.lines).toEqual([]);
		c.dispose();
	});

	it('trims a streaming turn to the Compact budget and spends only real leftover room on a lead', () => {
		const c = createOverlayCaptions({ ...fit, layout: 'compact', width: 20 });
		const long = 'word '.repeat(200).trim();
		c.push(caption('system', 1, 'A short earlier sentence that is long enough to show.'));
		c.push(caption('system', 2, 'Short', false));
		expect(c.lines[0].lead.length).toBeGreaterThan(0);
		c.push(caption('system', 2, long, false));
		expect(c.lines[0].text.startsWith('… ')).toBe(true);
		expect(c.lines[0].lead).toBe('');
		c.dispose();
	});

	it('retains Stable reading across pauses and clears it when the session stops', () => {
		const c = createOverlayCaptions({ ...fit, layout: 'stable' });
		c.push(caption('system', 1, 'One.'));
		c.push(caption('system', 2, 'Two.'));
		vi.advanceTimersByTime(60_000);
		expect(c.lines[0]).toMatchObject({ lead: ' One.', text: 'Two.' });
		c.status({ state: 'idle', origin: 'system' });
		expect(c.lines).toHaveLength(1);
		c.status({ state: 'idle' });
		expect(c.lines).toEqual([]);
		c.dispose();
	});

	it('trims Stable context at the offset the caption line measured', () => {
		const c = createOverlayCaptions({ ...fit, layout: 'stable' });
		c.push(caption('system', 1, 'Old line.'));
		c.push(caption('system', 2, 'Now.'));
		c.trimStable('system', ' Old line.'.length);
		expect(c.lines[0].lead).toBe('');
		c.dispose();
	});

	it('cleans Stable context once as turns join it, so a later toggle only affects new turns', () => {
		const c = createOverlayCaptions({ ...fit, layout: 'stable', hideFillers: true });
		c.push(caption('system', 1, 'Um, first.'));
		c.push(caption('system', 2, 'Second.'));
		c.setHideFillers(false);
		c.push(caption('system', 3, 'Third.'));
		expect(c.lines[0].lead).toBe(' First. Second.');
		c.dispose();
	});

	it('applies an edited word list to the captions on screen, in Fit window and Compact', () => {
		for (const layout of ['fit', 'compact'] as const) {
			const c = createOverlayCaptions({ ...fit, layout, hideFillers: true, width: 60 });
			c.push(caption('system', 1, 'Bon, on commence, euh, maintenant.'));
			c.push(caption('system', 2, 'Bah, la suite.', false));
			expect(c.lines[0]).toMatchObject({
				lead: 'Bon, on commence maintenant.',
				text: 'Bah, la suite.'
			});
			c.setFillerWords(['bah', 'bon']);
			expect(c.lines[0]).toMatchObject({
				lead: 'On commence, euh, maintenant.',
				text: 'La suite.'
			});
			c.setFillerWords([]);
			expect(c.lines[0]).toMatchObject({
				lead: 'Bon, on commence, euh, maintenant.',
				text: 'Bah, la suite.'
			});
			c.dispose();
		}
	});

	it('keeps an edited list for when Hide filler words is switched back on', () => {
		const c = createOverlayCaptions(fit);
		c.setFillerWords(['bah']);
		c.push(caption('system', 1, 'Bah, um, yes.'));
		expect(c.lines[0].text).toBe('Bah, um, yes.');
		c.setHideFillers(true);
		expect(c.lines[0].text).toBe('Um, yes.');
		c.dispose();
	});

	it('applies an edited list to the live Stable turn without re-wrapping what was read', () => {
		const c = createOverlayCaptions({ ...fit, layout: 'stable', hideFillers: true });
		c.push(caption('system', 1, 'Bah, first.'));
		c.push(caption('system', 2, 'Um, second.'));
		expect(c.lines[0]).toMatchObject({ lead: ' Bah, first.', text: 'Second.' });
		c.setFillerWords(['bah']);
		expect(c.lines[0]).toMatchObject({ lead: ' Bah, first.', text: 'Um, second.' });
		c.push(caption('system', 3, 'Bah, third.'));
		expect(c.lines[0]).toMatchObject({ lead: ' Bah, first. Um, second.', text: 'Third.' });
		c.dispose();
	});

	it('cleans a streaming word only once it is complete', () => {
		const c = createOverlayCaptions({ ...fit, hideFillers: true, fillerWords: ['bah'] });
		c.push(caption('system', 1, 'On verra, bah', false));
		expect(c.lines[0].text).toBe('On verra, bah');
		c.push(caption('system', 1, 'On verra, bahut', false));
		expect(c.lines[0].text).toBe('On verra, bahut');
		c.push(caption('system', 1, 'On verra, bah, demain', false));
		expect(c.lines[0].text).toBe('On verra demain');
		c.push(caption('system', 1, 'On verra, bah.'));
		expect(c.lines[0].text).toBe('On verra.');
		c.dispose();
	});

	it('cleans only the audience text of translations and subtitles, never the caption itself', () => {
		const c = createOverlayCaptions({ ...fit, hideFillers: true });
		const translation: Caption = {
			...caption('system', 1, 'Um, we agree.'),
			sourceText: 'Euh, nous sommes d’accord.'
		};
		const subtitle = caption('microphone', 1, 'Euh, bonjour.');
		c.push(translation);
		c.push(subtitle);
		expect(c.lines.map((line) => line.text)).toEqual(['We agree.', 'Bonjour.']);
		expect(translation).toMatchObject({
			text: 'Um, we agree.',
			sourceText: 'Euh, nous sommes d’accord.'
		});
		expect(subtitle.text).toBe('Euh, bonjour.');
		c.dispose();
	});

	it('restores expiry when leaving Stable reading', () => {
		const c = createOverlayCaptions({ ...fit, layout: 'stable' });
		c.push(caption('system', 1, 'Kept.'));
		vi.advanceTimersByTime(10_000);
		c.setLayout('fit');
		expect(c.lines).toHaveLength(1);
		vi.advanceTimersByTime(4000);
		expect(c.lines).toEqual([]);
		c.dispose();
	});

	it('shows the original speech under a translation only when asked, and never in Stable', () => {
		const c = createOverlayCaptions(fit);
		const translated = { ...caption('system', 1, 'We begin.'), sourceText: 'Nous commençons.' };
		c.push(translated);
		expect(c.lines[0].original).toBe('');
		c.setShowOriginal(true);
		expect(c.lines[0]).toMatchObject({ text: 'We begin.', original: 'Nous commençons.' });
		c.setLayout('stable');
		expect(c.lines[0].original).toBe('');
		c.setLayout('compact');
		c.push({ ...translated, turnId: 2, sourceText: 'mot '.repeat(200) });
		expect(c.lines[0].original.startsWith('… ')).toBe(true);
		// Compact's character budget, as the caption gets — not the whole 800 characters.
		expect(c.lines[0].original.length).toBeLessThanOrEqual(captionBudget(fit.width) + 2);
		c.dispose();
	});

	it('shows nothing extra for subtitles, which have no separate original', () => {
		const c = createOverlayCaptions({ ...fit, showOriginal: true });
		c.push(caption('microphone', 1, 'Same language.'));
		expect(c.lines[0].original).toBe('');
		c.dispose();
	});

	it('shows each caption language as its own row, the first above the second', () => {
		const c = createOverlayCaptions({ ...fit, showOriginal: true });
		const inEnglish = { ...caption('system', 1, 'Hello.'), lane: 1 as const, sourceText: 'Hallo.' };
		const inFrench = { ...caption('system', 1, 'Bonjour.'), sourceText: 'Hallo.' };
		c.push(inEnglish);
		c.push(inFrench);
		c.push(caption('microphone', 1, 'Room.'));
		expect(c.lines.map((line) => [line.track, line.text])).toEqual([
			['system', 'Bonjour.'],
			['system:1', 'Hello.'],
			['microphone', 'Room.']
		]);
		// The same speech under both would say it twice.
		expect(c.lines.map((line) => line.original)).toEqual(['Hallo.', '', '']);
		// One language's client ending clears only its own row.
		c.status({ state: 'error', origin: 'system', lane: 1 });
		c.push({ ...inEnglish, turnId: 2 });
		c.dispose();
	});

	// Review E7: the caption was cut to its tail in Fit, but the original under it streamed
	// whole into the filler filter and the fitting search for as long as the turn ran.
	it('bounds the original speech in Fit window as the caption is', () => {
		const c = createOverlayCaptions({ ...fit, showOriginal: true });
		const speech = Array.from({ length: 4000 }, (_, i) => `mot${i}`).join(' ');
		c.push({ ...caption('system', 1, 'Short.', false), sourceText: speech });
		const [line] = c.lines;
		expect(line.original.length).toBeLessThanOrEqual(CAPTION_TAIL_CHARS + 2);
		expect(line.original.startsWith('… ')).toBe(true);
		expect(line.original.endsWith('mot3999')).toBe(true);
		c.dispose();
	});

	it('keeps each language’s lead-in to itself', () => {
		const c = createOverlayCaptions(fit);
		c.push(caption('system', 1, 'Premier.'));
		c.push({ ...caption('system', 1, 'First.'), lane: 1 });
		c.push(caption('system', 2, 'Suite', false));
		c.push({ ...caption('system', 2, 'Next', false), lane: 1 });
		expect(c.lines.map((line) => line.lead)).toEqual(['Premier.', 'First.']);
		c.dispose();
	});

	it('holds interim text under the steady pace until it is flushed', () => {
		const c = createOverlayCaptions({ ...fit, pace: 'steady' });
		c.push(caption('system', 1, 'Streaming', false));
		expect(c.lines).toEqual([]);
		vi.advanceTimersByTime(450);
		expect(c.lines.map((line) => line.text)).toEqual(['Streaming']);
		c.dispose();
	});
});
