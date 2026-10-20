import { afterEach, describe, expect, it } from 'vitest';
import {
	captionBudget,
	clampOverlayFont,
	clampOverlayWidth,
	DEFAULT_APPEARANCE,
	DEFAULT_OVERLAY_FONT,
	DEFAULT_OVERLAY_WIDTH,
	fromOverlayConfig,
	loadAppearance,
	loadOverlayFont,
	loadOverlayWidth,
	matchesPreset,
	normalizeAppearance,
	OVERLAY_FONT_MAX,
	OVERLAY_FONT_MIN,
	OVERLAY_WIDTH_MAX,
	OVERLAY_WIDTH_MIN,
	PRESET_IDS,
	PRESETS,
	sameAppearance,
	toOverlayConfig,
	type Appearance
} from './appearance';
import { SCRIM_OPACITY_MAX, SCRIM_OPACITY_MIN } from './captionColour';
import { HOLD_SECONDS_MAX, HOLD_SECONDS_MIN } from './reading';
import type { OverlayConfig } from './types';

describe('overlay caption size and measure', () => {
	afterEach(() => {
		Reflect.deleteProperty(globalThis, 'localStorage');
	});

	function stored(value: unknown): void {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: { getItem: () => value }
		});
	}

	it('holds a requested measure inside the range, on a whole number of ch', () => {
		expect(clampOverlayWidth(30)).toBe(30);
		expect(clampOverlayWidth(2)).toBe(OVERLAY_WIDTH_MIN);
		expect(clampOverlayWidth(500)).toBe(OVERLAY_WIDTH_MAX);
		expect(clampOverlayWidth(31.6)).toBe(32);
	});

	// The stored value is a string from localStorage that the operator can edit and a crash
	// can truncate. Anything that is not a usable measure falls back rather than throwing —
	// the same contract the font size already had.
	it('falls back to the default for anything that is not a usable stored value', () => {
		for (const junk of [null, '', 'wide', 'NaN', '0', '-12', undefined]) {
			stored(junk);
			expect(loadOverlayWidth(), String(junk)).toBe(DEFAULT_OVERLAY_WIDTH);
		}
		stored('44');
		expect(loadOverlayWidth()).toBe(44);
		// Out of range on the way in, not just on the way out.
		stored('900');
		expect(loadOverlayWidth()).toBe(OVERLAY_WIDTH_MAX);
	});

	it('reports the default when there is no storage at all', () => {
		expect(loadOverlayWidth()).toBe(DEFAULT_OVERLAY_WIDTH);
		expect(loadOverlayFont()).toBe(DEFAULT_OVERLAY_FONT);
	});

	it('keeps the font size contract it was modelled on', () => {
		expect(clampOverlayFont(38)).toBe(38);
		expect(clampOverlayFont(4)).toBe(20);
		expect(clampOverlayFont(400)).toBe(96);
	});

	// The point of the whole exercise: an install that never touches the control must render
	// exactly what it rendered before the control existed.
	it('leaves the default output identical to the fixed measure it replaced', () => {
		expect(DEFAULT_OVERLAY_WIDTH).toBe(30);
		expect(captionBudget(DEFAULT_OVERLAY_WIDTH)).toBe(220);
	});

	// The budget is a vertical limit: it caps how much of the slide a streaming turn covers.
	// Holding it fixed while the measure moved would have made a wide caption cover less and
	// a narrow one cover more, which is the setting changing something nobody asked it to.
	it('spends the budget on the same number of lines at every measure', () => {
		// Exact to within the rounding, and no further: a budget is a whole number of
		// characters, so the proportion cannot survive to more decimal places than that.
		const perCh = captionBudget(DEFAULT_OVERLAY_WIDTH) / DEFAULT_OVERLAY_WIDTH;
		for (let width = OVERLAY_WIDTH_MIN; width <= OVERLAY_WIDTH_MAX; width += 1) {
			expect(Math.abs(captionBudget(width) - perCh * width), `at ${width}ch`).toBeLessThanOrEqual(
				0.5
			);
		}
	});

	it('never returns a budget from an out-of-range measure', () => {
		expect(captionBudget(1000)).toBe(captionBudget(OVERLAY_WIDTH_MAX));
		expect(captionBudget(0)).toBe(captionBudget(OVERLAY_WIDTH_MIN));
	});
});

describe('the appearance schema', () => {
	it('falls back to the shipped appearance for anything unusable', () => {
		for (const value of [undefined, null, 'x', 42, {}]) {
			expect(sameAppearance(normalizeAppearance(value), DEFAULT_APPEARANCE)).toBe(true);
		}
	});

	it('keeps each valid setting and replaces only the broken ones', () => {
		const a = normalizeAppearance({
			fontSize: 60,
			width: 'wide',
			layout: 'stable',
			face: 'comic-sans',
			palette: { text: '#ffe066', scrim: 'black', scrimOpacity: 4 },
			cleanSpeech: true,
			hold: 999,
			pace: 'steady'
		});
		expect(a.fontSize).toBe(60);
		expect(a.width).toBe(DEFAULT_APPEARANCE.width);
		expect(a.layout).toBe('stable');
		expect(a.face).toBe(DEFAULT_APPEARANCE.face);
		expect(a.palette.text).toBe('#ffe066');
		expect(a.palette.scrim).toBe(DEFAULT_APPEARANCE.palette.scrim);
		expect(a.palette.scrimOpacity).toBeLessThanOrEqual(1);
		expect(a.cleanSpeech).toBe(true);
		expect(a.hold).toBe(30);
		expect(a.pace).toBe('steady');
	});

	it('returns fresh objects, so a saved profile never shares the live palette', () => {
		const a = normalizeAppearance(DEFAULT_APPEARANCE);
		expect(a.palette).not.toBe(DEFAULT_APPEARANCE.palette);
		a.palette.text = '#000000';
		expect(DEFAULT_APPEARANCE.palette.text).not.toBe('#000000');
	});

	it('loads the shipped appearance when nothing is stored', () => {
		expect(sameAppearance(loadAppearance(), DEFAULT_APPEARANCE)).toBe(true);
	});

	it('sends every setting to the overlay', () => {
		const config = toOverlayConfig(DEFAULT_APPEARANCE);
		// Eight settings, with the palette sent as its three parts.
		expect(Object.keys(config)).toHaveLength(Object.keys(DEFAULT_APPEARANCE).length - 1 + 3);
		expect(Object.values(config)).not.toContain(undefined);
		expect(config).toMatchObject({
			fontSize: DEFAULT_APPEARANCE.fontSize,
			captionWidth: DEFAULT_APPEARANCE.width,
			holdSeconds: DEFAULT_APPEARANCE.hold,
			scrimOpacity: DEFAULT_APPEARANCE.palette.scrimOpacity
		});
	});

	it('compares every setting, including each part of the palette', () => {
		const base = normalizeAppearance(DEFAULT_APPEARANCE);
		expect(sameAppearance(base, DEFAULT_APPEARANCE)).toBe(true);
		expect(sameAppearance({ ...base, hold: 5 }, DEFAULT_APPEARANCE)).toBe(false);
		expect(
			sameAppearance(
				{ ...base, palette: { ...base.palette, scrimOpacity: 0.5 } },
				DEFAULT_APPEARANCE
			)
		).toBe(false);
	});
});

// The operator builds every push with `toOverlayConfig` and the overlay reads it back with
// `fromOverlayConfig`, so whatever the operator holds has to arrive as itself, and anything
// else has to fall back exactly as the overlay always has.
describe('reading an overlay push back', () => {
	// Unlike every appearance below in every field, so a field taken from what the overlay
	// showed before rather than from the push cannot pass for a round trip.
	const before: Appearance = {
		fontSize: 77,
		width: 51,
		layout: 'compact',
		face: 'georgia',
		palette: { text: '#123456', scrim: '#654321', scrimOpacity: 0.33 },
		cleanSpeech: true,
		hold: 17,
		pace: 'steady'
	};
	const appearances: Appearance[] = [
		normalizeAppearance(DEFAULT_APPEARANCE),
		...PRESET_IDS.map((id) => normalizeAppearance({ ...DEFAULT_APPEARANCE, ...PRESETS[id] })),
		{
			fontSize: 60,
			width: 44,
			layout: 'stable',
			face: 'verdana',
			palette: { text: '#ffe066', scrim: '#000000', scrimOpacity: 0.5 },
			cleanSpeech: false,
			hold: 12,
			pace: 'immediate'
		},
		// The ends of every range.
		{
			fontSize: OVERLAY_FONT_MIN,
			width: OVERLAY_WIDTH_MIN,
			layout: 'fit',
			face: 'arial',
			palette: { text: '#000000', scrim: '#ffffff', scrimOpacity: SCRIM_OPACITY_MIN },
			cleanSpeech: false,
			hold: HOLD_SECONDS_MIN,
			pace: 'immediate'
		},
		{
			fontSize: OVERLAY_FONT_MAX,
			width: OVERLAY_WIDTH_MAX,
			layout: 'stable',
			face: 'tahoma',
			palette: { text: '#ffffff', scrim: '#000000', scrimOpacity: SCRIM_OPACITY_MAX },
			cleanSpeech: true,
			hold: HOLD_SECONDS_MAX,
			pace: 'immediate'
		}
	];

	it('reads back every appearance the operator can hold, whatever was on screen before', () => {
		for (const a of appearances) {
			// Only appearances the operator could actually send.
			expect(normalizeAppearance(a)).toEqual(a);
			expect(fromOverlayConfig(toOverlayConfig(a), before)).toEqual(a);
		}
	});

	it('keeps what is on screen for a field that is missing or of the wrong type', () => {
		expect(fromOverlayConfig({}, before)).toEqual(before);
		const wrong = {
			fontSize: '40',
			captionWidth: null,
			captionLayout: 'grid',
			captionFace: 'comic-sans',
			captionColour: null,
			scrimColour: undefined,
			scrimOpacity: null,
			cleanSpeech: 'yes',
			holdSeconds: '8',
			pace: 'fast'
		} as unknown as OverlayConfig;
		expect(fromOverlayConfig(wrong, before)).toEqual(before);
	});

	// `normalizeAppearance` would clamp these up to the smallest size; a push keeps the one
	// already showing.
	it('keeps the size and measure on screen for a zero, negative or non-finite one', () => {
		for (const bad of [0, -12, Number.NaN, Number.POSITIVE_INFINITY]) {
			const a = fromOverlayConfig({ fontSize: bad, captionWidth: bad }, before);
			expect([a.fontSize, a.width], String(bad)).toEqual([before.fontSize, before.width]);
		}
	});

	it('clamps a positive size and measure into their ranges, on whole numbers', () => {
		expect(fromOverlayConfig({ fontSize: 400, captionWidth: 500 }, before)).toMatchObject({
			fontSize: OVERLAY_FONT_MAX,
			width: OVERLAY_WIDTH_MAX
		});
		expect(fromOverlayConfig({ fontSize: 4, captionWidth: 2 }, before)).toMatchObject({
			fontSize: OVERLAY_FONT_MIN,
			width: OVERLAY_WIDTH_MIN
		});
		expect(fromOverlayConfig({ fontSize: 41.6, captionWidth: 31.4 }, before)).toMatchObject({
			fontSize: 42,
			width: 31
		});
	});

	it('clamps any numeric hold, and gives a non-finite one the shipped hold', () => {
		expect(fromOverlayConfig({ holdSeconds: 999 }, before).hold).toBe(HOLD_SECONDS_MAX);
		expect(fromOverlayConfig({ holdSeconds: 0 }, before).hold).toBe(HOLD_SECONDS_MIN);
		expect(fromOverlayConfig({ holdSeconds: Number.NaN }, before).hold).toBe(
			DEFAULT_APPEARANCE.hold
		);
	});

	// A colour that arrives broken is replaced by the shipped one rather than kept from before,
	// each part of the palette on its own.
	it('paints the shipped colour for one that arrives unparseable', () => {
		expect(fromOverlayConfig({ captionColour: 'black' }, before).palette).toEqual({
			...before.palette,
			text: DEFAULT_APPEARANCE.palette.text
		});
		const broken = { scrimColour: '#zzzzzz', scrimOpacity: 'thick' } as unknown as OverlayConfig;
		expect(fromOverlayConfig(broken, before).palette).toEqual({
			...before.palette,
			scrim: DEFAULT_APPEARANCE.palette.scrim,
			scrimOpacity: DEFAULT_APPEARANCE.palette.scrimOpacity
		});
		expect(fromOverlayConfig({ scrimOpacity: 4 }, before).palette.scrimOpacity).toBe(
			SCRIM_OPACITY_MAX
		);
	});

	it('takes the good fields of a push that has a bad one', () => {
		const sent = appearances[appearances.length - 1];
		expect(fromOverlayConfig({ ...toOverlayConfig(sent), fontSize: -1 }, before)).toEqual({
			...sent,
			fontSize: before.fontSize
		});
	});
});

describe('reading presets', () => {
	it.each(PRESET_IDS)('%s holds values the overlay accepts unchanged', (id) => {
		const applied = normalizeAppearance({ ...DEFAULT_APPEARANCE, ...PRESETS[id] });
		expect(matchesPreset(applied, id)).toBe(true);
	});

	it('marks exactly one preset as current after applying it', () => {
		for (const id of PRESET_IDS) {
			const applied = normalizeAppearance({ ...DEFAULT_APPEARANCE, ...PRESETS[id] });
			expect(PRESET_IDS.filter((other) => matchesPreset(applied, other))).toEqual([id]);
		}
	});

	it('shows a fresh install as Standard', () => {
		expect(matchesPreset(DEFAULT_APPEARANCE, 'standard')).toBe(true);
	});

	it('leaves reading pace, hold and filler cleanup alone', () => {
		const tuned = { ...DEFAULT_APPEARANCE, hold: 12, pace: 'steady' as const, cleanSpeech: true };
		const applied = normalizeAppearance({ ...tuned, ...PRESETS.projector });
		expect(applied).toMatchObject({ hold: 12, pace: 'steady', cleanSpeech: true });
	});
});
