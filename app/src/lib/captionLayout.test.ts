import { describe, expect, it } from 'vitest';
import {
	appendCaptionHistory,
	CAPTION_TAIL_CHARS,
	captionReach,
	firstOffsetOnLine,
	fitCaptionTail,
	isCaptionLayout,
	bottomCaptionHeight,
	tail
} from './captionLayout';

it('makes room for one line of original speech per row when it is shown', () => {
	for (const sources of [1, 2]) {
		const plain = bottomCaptionHeight(60, sources, 'fit');
		const bilingual = bottomCaptionHeight(60, sources, 'fit', true);
		expect(bilingual - plain).toBe(sources * (Math.ceil(0.6 * 60 * 1.34) + 4));
	}
});

it('bottom-aligns to two lines per visible source instead of retaining a tall window', () => {
	expect(bottomCaptionHeight(38, 0, 'fit')).toBe(160);
	expect(bottomCaptionHeight(38, 1, 'fit')).toBe(160);
	for (const layout of ['fit', 'compact'] as const) {
		for (const font of [20, 38, 96]) {
			for (const sources of [1, 2]) {
				const height = bottomCaptionHeight(font, sources, layout);
				const available = (layout === 'fit' ? height - 32 : height * 0.85) - 18 * (sources - 1);
				expect(available / sources).toBeGreaterThanOrEqual(2 * font * 1.34);
				if (font >= 38) expect(available / sources).toBeLessThan(3 * font * 1.34);
			}
		}
	}
});

describe('caption fitting', () => {
	const text = 'First sentence provides context. The newest words must remain visible.';
	it('reveals more context as the available region grows', () => {
		const small = fitCaptionTail(text, (s) => s.length <= 30);
		const large = fitCaptionTail(text, (s) => s.length <= 55);
		expect(small).toBe('… words must remain visible.');
		expect(large.length).toBeGreaterThan(small.length);
		expect(text.endsWith(large.slice(2))).toBe(true);
		expect(fitCaptionTail(text, () => true)).toBe(text);
	});
	it('handles unbroken tokens and regions too short for a line', () => {
		expect(fitCaptionTail('abcdefghijklmnop', (s) => s.length <= 8)).toBe('… klmnop');
		expect(fitCaptionTail(text, () => false)).toBe('');
		expect(fitCaptionTail('  ', () => false)).toBe('');
	});
	it('normalizes streaming whitespace and preserves Unicode when shortening a token', () => {
		expect(fitCaptionTail(' bonjour\n le   monde ', () => true)).toBe('bonjour le monde');
		expect(fitCaptionTail('😀😀😀😀😀😀', (s) => Array.from(s).length <= 4)).toBe('… 😀😀');
	});
	it('finds the same tail from a bounded search while laying out far less', () => {
		const context = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(' ');
		const probes: number[] = [];
		const fits = (s: string) => (probes.push(s.length), s.length <= 120);
		const unbounded = fitCaptionTail(context, fits);
		const widest = Math.max(...probes);
		probes.length = 0;
		expect(fitCaptionTail(context, fits, 400)).toBe(unbounded);
		expect(Math.max(...probes)).toBeLessThanOrEqual(402);
		expect(widest).toBeGreaterThan(10000);
	});
	it('falls back to the whole text when the bound was too tight', () => {
		expect(fitCaptionTail(text, (s) => s.length <= 55, 10)).toBe(
			fitCaptionTail(text, (s) => s.length <= 55)
		);
		expect(fitCaptionTail(text, () => true, 10)).toBe(text);
		// No space to cut at (Japanese has none): the bound cannot apply.
		expect(fitCaptionTail('あいうえおかきくけこ', (s) => Array.from(s).length <= 5, 3)).toBe(
			'… くけこ'
		);
	});
	it('bounds reach by the region, never below what it could show', () => {
		expect(captionReach(0, 100, 50)).toBe(Infinity);
		expect(captionReach(800, 100, 1)).toBe(Infinity);
		// Two rows of 50px text, 800px wide: even 0.3em glyphs would give 107 a row.
		const reach = captionReach(800, 100, 50);
		expect(reach).toBeGreaterThan(2 * 107);
		expect(reach).toBeLessThan(1000);
	});
	it('retains multiple recent turns with a bounded history', () => {
		expect(appendCaptionHistory(appendCaptionHistory('', 'One.'), 'Two.')).toBe('One. Two.');
		const history = appendCaptionHistory('old '.repeat(5000), 'Newest turn.');
		expect(history.length).toBeLessThanOrEqual(CAPTION_TAIL_CHARS);
		expect(history.endsWith('Newest turn.')).toBe(true);
	});
	it('rejects unsupported persisted layout values', () => {
		expect(isCaptionLayout('fit')).toBe(true);
		expect(isCaptionLayout('compact')).toBe(true);
		expect(isCaptionLayout('wide')).toBe(false);
	});
});

describe('tail', () => {
	it('keeps short text whole and cuts long text at a nearby word boundary', () => {
		expect(tail('  a   short   line ', 40)).toBe('a short line');
		expect(tail('alpha beta gamma delta', 10)).toBe('… delta');
		expect(tail('', 10)).toBe('');
	});

	it('cuts inside a word only when no space is near, and never keeps more than asked', () => {
		const token = 'x'.repeat(60);
		expect(tail(`start ${token}`, 30)).toBe('… ' + 'x'.repeat(30));
		const speech = Array.from({ length: 5000 }, (_, i) => `word${i}`).join(' ');
		const kept = tail(speech, CAPTION_TAIL_CHARS);
		expect(kept.length).toBeLessThanOrEqual(CAPTION_TAIL_CHARS + 2);
		expect(kept.startsWith('… word')).toBe(true);
		expect(kept.endsWith('word4999')).toBe(true);
	});
});

describe('stable reading trim point', () => {
	// Ten characters to a line: offsets 0–9 on line 0, 10–19 on line 1, and so on.
	const lineOf = (offset: number) => Math.floor(offset / 10);

	it('finds the first character laid out on the requested line', () => {
		expect(firstOffsetOnLine(95, lineOf, 3)).toBe(30);
		expect(firstOffsetOnLine(95, lineOf, 9)).toBe(90);
	});

	it('cuts nothing when no text reaches that line, or line zero is asked for', () => {
		expect(firstOffsetOnLine(95, lineOf, 10)).toBe(0);
		expect(firstOffsetOnLine(95, lineOf, 0)).toBe(0);
		expect(firstOffsetOnLine(0, lineOf, 1)).toBe(0);
	});

	it('handles lines of uneven length', () => {
		const starts = [0, 4, 31, 32, 60];
		const uneven = (offset: number) => starts.findLastIndex((start) => offset >= start);
		expect(firstOffsetOnLine(80, uneven, 2)).toBe(31);
		expect(firstOffsetOnLine(80, uneven, 3)).toBe(32);
	});
});
