import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
	CAPTION_CONTRAST_TARGET,
	CAPTION_SCRIM_KEY,
	CAPTION_SCRIM_OPACITY_KEY,
	CAPTION_TEXT_KEY,
	captionContrast,
	captionCssVars,
	clampHex,
	clampScrimOpacity,
	composite,
	contrastRatio,
	DEFAULT_CAPTION_PALETTE,
	haloColour,
	loadCaptionPalette,
	luminance,
	parseHex,
	SCRIM_AT_TEXT,
	SCRIM_OPACITY_MAX,
	SCRIM_OPACITY_MIN,
	STEP_ALPHA,
	STEP_ALPHA_CEILING,
	type CaptionPalette,
	type Rgb
} from './captionColour';

// The sibling of `palette.test.ts`, for the one surface that palette test cannot reach: the
// overlay's colours are no longer written in the stylesheet, they are chosen at runtime. So
// the guard moves too — it checks the shipped default, the traps a free colour picker opens,
// and that the stylesheet has not quietly grown a literal that bypasses the check entirely.

describe('colour arithmetic', () => {
	it('reads both hex forms and rejects everything else', () => {
		expect(parseHex('#fff')).toEqual([255, 255, 255]);
		expect(parseHex('#06080A')).toEqual([6, 8, 10]);
		for (const junk of ['', '#', '#ggg', '#12345', 'white', 'rgb(0,0,0)', 42, null, undefined])
			expect(parseHex(junk), String(junk)).toBeNull();
	});

	it('agrees with WCAG at the two ends of the scale', () => {
		expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
		expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
		// The canonical mid grey: #777 on white is the textbook 4.48:1 near-miss.
		expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 2);
	});

	it('composites the way the compositor does', () => {
		const white: Rgb = [255, 255, 255];
		const black: Rgb = [0, 0, 0];
		expect(composite(white, black, 1)).toEqual([255, 255, 255]);
		expect(composite(white, black, 0)).toEqual([0, 0, 0]);
		expect(composite(white, black, 0.5)).toEqual([127.5, 127.5, 127.5]);
	});

	it('never lets an out-of-range alpha off the end of the scale', () => {
		expect(composite([255, 255, 255], [0, 0, 0], 5)).toEqual([255, 255, 255]);
		expect(composite([255, 255, 255], [0, 0, 0], -5)).toEqual([0, 0, 0]);
	});

	it('puts black behind light ink and white behind dark ink', () => {
		expect(haloColour([255, 255, 255])).toEqual([0, 0, 0]);
		expect(haloColour([255, 212, 0])).toEqual([0, 0, 0]);
		expect(haloColour([16, 16, 16])).toEqual([255, 255, 255]);
	});

	it('rates a colour against its own halo, which is what makes the flip worth having', () => {
		// A fixed black ring behind dark ink would be the thing swallowing the glyph.
		const dark: Rgb = [16, 16, 16];
		expect(contrastRatio(dark, haloColour(dark))).toBeGreaterThan(
			contrastRatio(dark, [0, 0, 0] as Rgb)
		);
	});
});

// This is the regression guard the issue asks for. If someone dims a step or lightens the
// scrim, this is what says so — on CI, before a room finds out.
describe('the shipped default', () => {
	const judged = captionContrast(DEFAULT_CAPTION_PALETTE);

	it(`clears ${CAPTION_CONTRAST_TARGET}:1 at every step, over a bright slide and a dark one`, () => {
		for (const step of judged.steps) {
			expect(step.onBright, `${step.step} over a white slide`).toBeGreaterThanOrEqual(
				CAPTION_CONTRAST_TARGET
			);
			expect(step.onDark, `${step.step} over a black slide`).toBeGreaterThanOrEqual(
				CAPTION_CONTRAST_TARGET
			);
		}
		expect(judged.passes).toBe(true);
	});

	// Not an incidental fact: the lead-in is the dimmest thing on screen, so it is the step
	// that decides whether a palette is usable, and it is the one a change will break first.
	it('is decided by the trailing previous line, the dimmest step there is', () => {
		expect(judged.worstStep).toBe('lead');
	});

	// #55 requires the defaults to reproduce today's appearance exactly. "Exactly" is
	// checkable: these are the literals that were written in the overlay's stylesheet before
	// any of this was configurable.
	it('paints precisely what the stylesheet used to hard-code', () => {
		expect(captionCssVars(DEFAULT_CAPTION_PALETTE)).toEqual({
			'--caption-ink': 'rgba(255, 255, 255, 1)',
			'--caption-ink-final': 'rgba(255, 255, 255, 0.9)',
			'--caption-ink-label': 'rgba(255, 255, 255, 0.62)',
			'--caption-ink-lead': 'rgba(255, 255, 255, 0.52)',
			'--caption-halo-tight': 'rgba(0, 0, 0, 0.9)',
			'--caption-halo-soft': 'rgba(0, 0, 0, 0.8)',
			'--caption-scrim-strong': 'rgba(6, 8, 10, 0.72)',
			'--caption-scrim-mid': 'rgba(6, 8, 10, 0.42)',
			'--caption-scrim-none': 'rgba(6, 8, 10, 0)'
		});
	});
});

describe('the composite the check is computed on', () => {
	// The trap #55 names. The scrim is a gradient and the text sits over the thin part of it,
	// so measuring against the opacity on the control flatters every palette.
	it('uses the scrim as it is under the text, not as it is on the control', () => {
		expect(SCRIM_AT_TEXT).toBeLessThan(1);
		const honest = captionContrast(DEFAULT_CAPTION_PALETTE).worst;
		const flattering = captionContrast({
			...DEFAULT_CAPTION_PALETTE,
			// What the check would see if it believed the control's number.
			scrimOpacity: DEFAULT_CAPTION_PALETTE.scrimOpacity / SCRIM_AT_TEXT
		}).worst;
		expect(flattering).toBeGreaterThan(honest);
	});

	// A scrim swatch alone would say "white on near-black, 20:1" and mean nothing, because the
	// slide behind it is showing through. Both extremes, or the number is decoration.
	it('judges a bright slide differently from a dark one', () => {
		const white = captionContrast(DEFAULT_CAPTION_PALETTE).steps.map((s) => s.onBright);
		const black = captionContrast(DEFAULT_CAPTION_PALETTE).steps.map((s) => s.onDark);
		expect(white).not.toEqual(black);
	});

	it('reports the worse of the two, never an average', () => {
		for (const step of captionContrast(DEFAULT_CAPTION_PALETTE).steps) {
			expect(step.worst).toBe(Math.min(step.onBright, step.onDark));
		}
	});

	// Turning the scrim off is allowed; it does not become unmeasurable. The halo is what
	// still carries the text, and the check says so rather than dividing by nothing.
	it('still has an answer with no scrim at all', () => {
		const bare = captionContrast({ ...DEFAULT_CAPTION_PALETTE, scrimOpacity: 0 });
		expect(bare.worst).toBeGreaterThan(1);
		expect(bare.passes).toBe(true);
	});
});

describe('the palettes an operator can reach', () => {
	const judge = (p: Partial<CaptionPalette>) =>
		captionContrast({ ...DEFAULT_CAPTION_PALETTE, ...p });

	// The failure #55 exists to prevent, five minutes before a keynote.
	it('refuses a caption colour too close to its own backing', () => {
		expect(judge({ text: '#5a5a5a', scrim: '#4a4a4a', scrimOpacity: 0.9 }).passes).toBe(false);
	});

	it('refuses a mid grey, which no backdrop can rescue', () => {
		expect(judge({ text: '#808080' }).passes).toBe(false);
	});

	// A plausible house colour. It is the case that shows why checking the caption colour
	// alone would be useless: the live caption is comfortable at 13:1 and the palette is still
	// decided, all the way down at the bar, by the step nobody looks at directly.
	it('carries a house colour on the strength of its dimmest step', () => {
		const yellow = judge({ text: '#ffd400' });
		expect(yellow.passes).toBe(true);
		expect(yellow.worstStep).toBe('lead');
		expect(yellow.steps.find((s) => s.step === 'live')!.worst).toBeGreaterThan(10);
		// It only clears because the lead-in gave up some dimming to get there.
		expect(yellow.steps.find((s) => s.step === 'lead')!.lifted).toBe(true);
	});

	it('names the step that fails, so there is something to act on', () => {
		const grey = judge({ text: '#808080' });
		expect(grey.passes).toBe(false);
		expect(grey.steps.find((s) => s.step === grey.worstStep)!.worst).toBe(grey.worst);
		expect(grey.worst).toBeLessThan(CAPTION_CONTRAST_TARGET);
	});

	// A whole direction that a fixed alpha table would have condemned: sRGB alpha is not
	// perceptually uniform, so the 0.52 that buys white ink 5.7:1 buys black ink 4.2:1.
	it('accepts dark captions on a light backing', () => {
		for (const p of [
			{ text: '#000000', scrim: '#ffffff', scrimOpacity: 0.95 },
			{ text: '#101010', scrim: '#f2f2f2', scrimOpacity: 0.72 },
			{ text: '#0a1020', scrim: '#fdf6e3', scrimOpacity: 0.95 }
		]) {
			expect(judge(p).passes, JSON.stringify(p)).toBe(true);
		}
	});
});

describe('a step that cannot afford the dimming it asks for', () => {
	// The default is the case that must not move: every step already clears the bar, so
	// nothing is lifted and the overlay paints exactly what it painted before.
	it('leaves the default alone entirely', () => {
		const judged = captionContrast(DEFAULT_CAPTION_PALETTE);
		expect(judged.lifted).toBe(false);
		for (const step of judged.steps) {
			expect(step.alpha, step.step).toBe(STEP_ALPHA[step.step]);
		}
	});

	it('gives up dimming, and only as much as the bar requires', () => {
		const dark = captionContrast({ text: '#000000', scrim: '#ffffff', scrimOpacity: 0.95 });
		const lead = dark.steps.find((s) => s.step === 'lead')!;
		expect(lead.lifted).toBe(true);
		expect(lead.alpha).toBeGreaterThan(STEP_ALPHA.lead);
		// Only just: a step lifted further than it needs to be is dimming thrown away.
		expect(lead.alpha).toBeLessThan(STEP_ALPHA.lead + 0.1);
		expect(dark.passes).toBe(true);
	});

	// Past the ceiling the lift costs more than it buys: the dimmed steps are how an audience
	// tells a finished line from a live one, and flattening that to keep a number up trades
	// something the room uses for a ratio nobody reads.
	it('stops at the ceiling and warns rather than flattening the hierarchy', () => {
		const grey = captionContrast({ ...DEFAULT_CAPTION_PALETTE, text: '#808080' });
		expect(grey.passes).toBe(false);
		for (const step of grey.steps) {
			expect(step.alpha, step.step).toBeLessThanOrEqual(
				Math.max(STEP_ALPHA_CEILING, STEP_ALPHA[step.step])
			);
		}
	});

	// The readout and the projector have to be describing the same picture. They do, because
	// both go through `captionContrast` — this is the test that keeps it that way.
	it('paints the alpha it was judged at', () => {
		const palette = { text: '#000000', scrim: '#ffffff', scrimOpacity: 0.95 };
		const lead = captionContrast(palette).steps.find((s) => s.step === 'lead')!;
		expect(captionCssVars(palette)['--caption-ink-lead']).toBe(`rgba(0, 0, 0, ${lead.alpha})`);
	});
});

describe('values that come back from disk', () => {
	afterEach(() => {
		Reflect.deleteProperty(globalThis, 'localStorage');
	});

	function stored(record: Record<string, string | null>): void {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: { getItem: (k: string) => record[k] ?? null }
		});
	}

	it('keeps a hex it can parse and normalises how it is written', () => {
		expect(clampHex('#FFF', '#000000')).toBe('#ffffff');
		expect(clampHex('#06080a', '#000000')).toBe('#06080a');
	});

	// A caption painted in an unparsed colour is a caption painted in nothing, which on a
	// projector is a blank region where the words were.
	it('falls back rather than passing an unpaintable value through', () => {
		for (const junk of ['', 'red', '#12345', 'javascript:x', null, undefined, {}])
			expect(clampHex(junk, '#123456'), String(junk)).toBe('#123456');
	});

	it('holds the scrim inside its range', () => {
		expect(clampScrimOpacity(5)).toBe(SCRIM_OPACITY_MAX);
		expect(clampScrimOpacity(-1)).toBe(SCRIM_OPACITY_MIN);
		expect(clampScrimOpacity('0.5')).toBe(0.5);
		expect(clampScrimOpacity(NaN)).toBe(DEFAULT_CAPTION_PALETTE.scrimOpacity);
		expect(clampScrimOpacity('a colour, somehow')).toBe(DEFAULT_CAPTION_PALETTE.scrimOpacity);
	});

	it('restores a palette the operator chose', () => {
		stored({
			[CAPTION_TEXT_KEY]: '#ffd400',
			[CAPTION_SCRIM_KEY]: '#101820',
			[CAPTION_SCRIM_OPACITY_KEY]: '0.55'
		});
		expect(loadCaptionPalette()).toEqual({
			text: '#ffd400',
			scrim: '#101820',
			scrimOpacity: 0.55
		});
	});

	// One corrupt field is not a reason to throw away the other two.
	it('repairs each part on its own', () => {
		stored({
			[CAPTION_TEXT_KEY]: 'not a colour',
			[CAPTION_SCRIM_KEY]: '#101820',
			[CAPTION_SCRIM_OPACITY_KEY]: 'nonsense'
		});
		expect(loadCaptionPalette()).toEqual({
			text: DEFAULT_CAPTION_PALETTE.text,
			scrim: '#101820',
			scrimOpacity: DEFAULT_CAPTION_PALETTE.scrimOpacity
		});
	});

	it('has a palette before anything has ever been stored', () => {
		expect(loadCaptionPalette()).toEqual(DEFAULT_CAPTION_PALETTE);
	});
});

// The other half of the guard. The check above only means something while the overlay is
// actually painting from these values — a colour written back into the stylesheet would be
// invisible to every test here, which is precisely how the failures in #24 arrived.
describe('the overlay stylesheet', () => {
	// Every file that paints part of the overlay window.
	const style = ['+page.svelte', 'OverlayCaptionLine.svelte', 'OverlayMoveChrome.svelte']
		.map((file) => readFileSync(new URL(`../routes/overlay/${file}`, import.meta.url), 'utf8'))
		.map((source) => source.slice(source.indexOf('<style>')))
		.join('\n');

	it('paints every caption step from the palette', () => {
		for (const name of [
			'--caption-ink',
			'--caption-ink-final',
			'--caption-ink-label',
			'--caption-ink-lead',
			'--caption-halo-tight',
			'--caption-halo-soft',
			'--caption-scrim-strong',
			'--caption-scrim-mid',
			'--caption-scrim-none'
		]) {
			expect(style, `${name} is not used in the overlay`).toContain(`var(${name})`);
		}
	});

	it('has none of the literals it used to hard-code', () => {
		for (const literal of [
			'rgba(255, 255, 255, 0.9)',
			'rgba(255, 255, 255, 0.62)',
			'rgba(255, 255, 255, 0.52)',
			'rgba(6, 8, 10',
			'color: #ffffff'
		]) {
			expect(style, `${literal} is back in the overlay stylesheet`).not.toContain(literal);
		}
	});

	// The audience view opts out of contrast themes on purpose — it is projected, not read on
	// this machine — and #55 must not cost that.
	it('keeps its contrast-theme opt-out', () => {
		expect(style).toContain('forced-colors: active');
		expect(style).toContain('forced-color-adjust: none');
	});
});

describe('luminance', () => {
	it('is monotonic, which is what lets two slide extremes bound everything between', () => {
		let previous = -1;
		for (let v = 0; v <= 255; v += 5) {
			const l = luminance([v, v, v]);
			expect(l).toBeGreaterThan(previous);
			previous = l;
		}
	});
});
