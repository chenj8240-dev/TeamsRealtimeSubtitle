/**
 * Operator-chosen caption colours, and the contrast check that keeps them readable.
 *
 * Issue #55 names the trap this module exists for. The overlay paints over a slide the app
 * does not control, through a scrim that is *semi-transparent* — so a ratio measured against
 * the scrim's own swatch is optimistic, and a colour picker with no guard is a way to make
 * captions unreadable five minutes before a keynote.
 *
 * ## What the audience actually sees
 *
 * Four layers, and the check has to walk all of them:
 *
 * 1. **The slide.** Unknown and uncontrolled. Modelled as both extremes — a white deck and a
 *    black one — because a ratio that holds at both holds everywhere between.
 * 2. **The scrim**, at the opacity it has *under the text*, which is not the opacity the
 *    operator sets. The scrim is a gradient: strongest at the bottom edge and gone at the
 *    top, and the text sits over the thin part of it. See `SCRIM_AT_TEXT`.
 * 3. **The halo** — the tight dark `text-shadow` ringing every glyph. It is not decoration:
 *    it is the layer that makes white captions survive a bright slide, and leaving it out of
 *    the model condemns a design that demonstrably works. It is what abuts the glyph, so it
 *    is the local background contrast is measured against.
 * 4. **The ink**, which for the dimmed steps is the caption colour at an alpha, composited
 *    over the halo like everything else.
 *
 * ## Why the steps stay alphas
 *
 * The finalized line, the lead-in and the origin label are steps *down* from the live
 * caption. Expressing them as alphas of the chosen colour — rather than as fixed greys — is
 * what makes them follow it: they dim toward whatever is behind them, which is the meaning of
 * "a little less contrast". The grey-on-grey failure #55 warns about comes from alphas of
 * *white* surviving a colour change, and that is exactly what this replaces.
 *
 * ## The threshold
 *
 * 4.5:1, not the 3:1 WCAG allows for large text. `docs/accessibility.md` holds 4.5:1
 * everywhere else, and the one surface an audience reads from the back of a room is not the
 * place to hold less.
 */
import { readStored } from './persisted';

/** A caption colour scheme: what the operator can actually change. */
export interface CaptionPalette {
	/** The live caption's ink, `#rrggbb`. */
	text: string;
	/** The scrim's colour, `#rrggbb`. */
	scrim: string;
	/** The scrim's opacity at its strongest edge, 0–1. */
	scrimOpacity: number;
}

export const DEFAULT_CAPTION_PALETTE: CaptionPalette = {
	text: '#ffffff',
	// rgb(6, 8, 10): a near-black with a trace of blue, so the veil reads as shadow rather
	// than as a grey card laid on the slide.
	scrim: '#06080a',
	scrimOpacity: 0.72
};

/** A quick pick beside the free colour inputs. Named, so a screen reader says "Mint" where it
 *  used to read out "#7fdcb6"; the name is a key into `$t.overlayControls.swatch`. */
export interface Swatch {
	name: 'white' | 'paleYellow' | 'mint' | 'paleBlue' | 'charcoal' | 'black' | 'green' | 'navy';
	hex: string;
}

export const TEXT_SWATCHES: readonly Swatch[] = [
	{ name: 'white', hex: '#ffffff' },
	{ name: 'paleYellow', hex: '#fff0b3' },
	{ name: 'mint', hex: '#7fdcb6' },
	{ name: 'paleBlue', hex: '#b9d5ff' },
	{ name: 'charcoal', hex: '#111419' }
];

export const SCRIM_SWATCHES: readonly Swatch[] = [
	{ name: 'black', hex: '#000000' },
	{ name: 'charcoal', hex: '#111419' },
	{ name: 'green', hex: '#172b24' },
	{ name: 'navy', hex: '#18263c' },
	{ name: 'white', hex: '#ffffff' }
];

export const CAPTION_TEXT_KEY = 'overlay.captionColour';
export const CAPTION_SCRIM_KEY = 'overlay.scrimColour';
export const CAPTION_SCRIM_OPACITY_KEY = 'overlay.scrimOpacity';

/** The scrim may be turned off entirely — the halo still carries the text, and a projector
 *  with its own dark background does not need a second one. The ceiling is short of 1 because
 *  a fully opaque band stops being a veil and becomes a card over the slide. */
export const SCRIM_OPACITY_MIN = 0;
export const SCRIM_OPACITY_MAX = 0.95;

/**
 * How much of the scrim is left where the text sits.
 *
 * The scrim is a gradient — full strength at the bottom edge of the caption block, gone at
 * the top — and the text sits well above the bottom edge, over the thin part. The gradient's
 * middle stop is the value under the top line of text, which is the worst case, so the check
 * uses that rather than the number on the control. Expressed as a ratio so the whole gradient
 * scales when the operator moves the opacity, keeping its shape.
 *
 * `0.42 / 0.72` is exactly today's two stops, so the default reproduces today's scrim to the
 * digit rather than to a rounding.
 */
export const SCRIM_AT_TEXT = 0.42 / 0.72;

/** The tight `text-shadow` ring, `0 1px 3px`. This is the layer the check credits, because
 *  it is the one that actually abuts the glyph. */
const HALO_ALPHA = 0.9;

/** The second, softer 14px layer. Painted, but deliberately left out of the model: it only
 *  ever adds contrast, and crediting a wide blurred shadow for legibility it cannot be
 *  relied on to provide is how a check starts flattering the design it is meant to police. */
const HALO_SOFT_ALPHA = 0.8;

/** The alpha each text step *asks* for, dimmest last. These are the values the overlay has
 *  always used. What changes is that they are alphas of the chosen colour, and that they are
 *  floors rather than fixed — see `STEP_ALPHA_CEILING`. */
export const STEP_ALPHA = {
	/** The live caption. */
	live: 1,
	/** A finished line: a little less colour, never less size or slant — both cost legibility
	 *  at the back of a room. */
	final: 0.9,
	/** The origin label ("Room" / "Remote"). */
	label: 0.62,
	/** The previous turn trailing into the current one — the dimmest thing on screen, and so
	 *  the step that decides whether a palette is readable at all. */
	lead: 0.52
} as const;

type CaptionStep = keyof typeof STEP_ALPHA;

/**
 * How far a step may be lifted above the alpha it asks for.
 *
 * The alphas above were tuned for white ink on a dark scrim, and they do not mirror: sRGB
 * alpha is not perceptually uniform, so the same 0.52 that buys the lead-in 5.7:1 as white
 * ink buys it 4.2:1 as black ink on a light scrim. Holding the number fixed would mean every
 * dark palette warns — and a control that warns at every choice in a whole direction is one
 * an operator learns to ignore.
 *
 * So a step dims as far as the design asks, or as far as the contrast bar allows, whichever
 * is less dim. Past this ceiling the lift stops being worth it: the dimmed steps are how the
 * audience tells a finished line from a live one, and flattening that to keep a number up
 * would trade information the room uses for a ratio nobody reads. Beyond it, warn instead.
 */
export const STEP_ALPHA_CEILING = 0.85;

/** The two slides every palette is judged against. Anything between them is bounded by them:
 *  luminance is monotonic in the backdrop, so a ratio holding at both extremes holds
 *  throughout. */
const SLIDES = ['#ffffff', '#000000'] as const;

// ---- Colour arithmetic --------------------------------------------------------------
// Deliberately not shared with `palette.test.ts`, which carries its own copy: that test
// guards the stylesheet, and a guard that imports the code it is guarding can be defeated by
// a change to either side.

export type Rgb = readonly [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parse `#rgb` or `#rrggbb`. Null for anything else — the callers turn that into the
 *  default, because a caption painted in an unparsed colour is a caption painted in nothing. */
export function parseHex(value: unknown): Rgb | null {
	if (typeof value !== 'string' || !HEX.test(value)) return null;
	const hex = value.slice(1);
	const full =
		hex.length === 3
			? hex
					.split('')
					.map((c) => c + c)
					.join('')
			: hex;
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16)
	];
}

/** A validated `#rrggbb`, or the fallback. `input type="color"` only ever emits this form;
 *  what this defends against is a stored value from an older build or a hand edit. */
export function clampHex(value: unknown, fallback: string): string {
	const rgb = parseHex(value);
	if (!rgb) return fallback;
	return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function clampScrimOpacity(value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return DEFAULT_CAPTION_PALETTE.scrimOpacity;
	return Math.min(SCRIM_OPACITY_MAX, Math.max(SCRIM_OPACITY_MIN, Math.round(n * 100) / 100));
}

/** `over` laid on `under` at `alpha`. Straight source-over on unpremultiplied channels, which
 *  is what the compositor does for an `rgba()` fill. */
export function composite(over: Rgb, under: Rgb, alpha: number): Rgb {
	const a = Math.min(1, Math.max(0, alpha));
	return [
		over[0] * a + under[0] * (1 - a),
		over[1] * a + under[1] * (1 - a),
		over[2] * a + under[2] * (1 - a)
	];
}

/** WCAG 2.x relative luminance. */
export function luminance(rgb: Rgb): number {
	const channel = (v: number) => {
		const c = Math.min(255, Math.max(0, v)) / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
	const [x, y] = [luminance(a), luminance(b)];
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ---- The model ----------------------------------------------------------------------

/**
 * The halo colour for a given ink: whichever of black or white it stands out against.
 *
 * The halo is fixed black today because the captions are white. Once the colour is the
 * operator's, a fixed black halo would be exactly wrong for a dark caption on a light scrim —
 * the ring meant to rescue the glyph would be the thing swallowing it. So the halo follows
 * the ink. White text keeps the black halo, which is what makes the default identical.
 */
export function haloColour(text: Rgb): Rgb {
	const black: Rgb = [0, 0, 0];
	const white: Rgb = [255, 255, 255];
	return contrastRatio(text, black) >= contrastRatio(text, white) ? black : white;
}

/** What sits immediately behind a glyph, for one slide: the scrim as it is under the text,
 *  then the halo over that. */
function localBackdrop(palette: CaptionPalette, slide: Rgb, halo: Rgb): Rgb {
	const scrim = parseHex(palette.scrim) ?? [0, 0, 0];
	const veiled = composite(scrim, slide, palette.scrimOpacity * SCRIM_AT_TEXT);
	return composite(halo, veiled, HALO_ALPHA);
}

interface ResolvedStep {
	step: CaptionStep;
	/** The alpha actually painted: what the design asked for, or as far up as the bar forced
	 *  it. Equal to `STEP_ALPHA[step]` for any palette that did not need help. */
	alpha: number;
	/** True when the design's dimming had to be given up to stay readable. */
	lifted: boolean;
	/** Over a white slide. */
	onBright: number;
	/** Over a black slide. */
	onDark: number;
	/** The one that decides: a palette is only as readable as its worse case. */
	worst: number;
}

export interface CaptionContrast {
	/** Every step, in the order they are declared — dimmest last. */
	steps: ResolvedStep[];
	/** The worst ratio across every step and both slides. */
	worst: number;
	/** The step that produced it, which is what an operator has to act on. */
	worstStep: CaptionStep;
	/** Whether the palette clears the bar this app holds everywhere. */
	passes: boolean;
	/** Whether any step gave up some of its dimming to get there. */
	lifted: boolean;
}

/** The bar. 4.5:1 — see the module note on why not 3:1. */
export const CAPTION_CONTRAST_TARGET = 4.5;

/**
 * The lowest alpha at or above `from` that clears `target` against this backdrop, capped.
 *
 * Contrast is monotonic in alpha — the ink moves along a straight line from the backdrop
 * toward the text, and luminance is monotonic in each channel — so a bisection converges on
 * the real answer rather than approximating one. Rounded up to two decimals, which can only
 * help and keeps the emitted CSS readable.
 */
function requiredAlpha(text: Rgb, backdrop: Rgb, from: number, target: number): number {
	const ratioAt = (a: number) => contrastRatio(composite(text, backdrop, a), backdrop);
	if (from >= STEP_ALPHA_CEILING || ratioAt(from) >= target) return from;
	// Even at the ceiling this palette cannot clear the bar. Stop there and let the caller
	// report the failure rather than flattening the step to no purpose.
	if (ratioAt(STEP_ALPHA_CEILING) < target) return STEP_ALPHA_CEILING;

	let lo = from;
	let hi = STEP_ALPHA_CEILING;
	for (let i = 0; i < 24; i += 1) {
		const mid = (lo + hi) / 2;
		if (ratioAt(mid) >= target) hi = mid;
		else lo = mid;
	}
	return Math.min(STEP_ALPHA_CEILING, Math.ceil(hi * 100) / 100);
}

/**
 * Judge a palette, and settle what each step is actually painted at.
 *
 * Every step, against both slide extremes, through the scrim as it is where the text sits and
 * the halo that rings the glyph. One alpha per step for both slides — the stylesheet cannot
 * know which slide is up — so each is resolved against whichever slide demands more.
 */
export function captionContrast(palette: CaptionPalette): CaptionContrast {
	const text = parseHex(palette.text) ?? [255, 255, 255];
	const halo = haloColour(text);
	const backdrops = SLIDES.map((hex) => localBackdrop(palette, parseHex(hex) as Rgb, halo));

	const steps = (Object.keys(STEP_ALPHA) as CaptionStep[]).map((step) => {
		const design = STEP_ALPHA[step];
		const alpha = Math.max(
			...backdrops.map((b) => requiredAlpha(text, b, design, CAPTION_CONTRAST_TARGET))
		);
		const [onBright, onDark] = backdrops.map((b) => contrastRatio(composite(text, b, alpha), b));
		return {
			step,
			alpha,
			lifted: alpha > design,
			onBright,
			onDark,
			worst: Math.min(onBright, onDark)
		};
	});

	const worstStep = steps.reduce((a, b) => (b.worst < a.worst ? b : a));
	return {
		steps,
		worst: worstStep.worst,
		worstStep: worstStep.step,
		passes: worstStep.worst >= CAPTION_CONTRAST_TARGET,
		lifted: steps.some((s) => s.lifted)
	};
}

// ---- What the overlay paints with ---------------------------------------------------

/** The custom properties the overlay sets from a palette. Computed here rather than with
 *  `color-mix()` in the stylesheet: the same numbers feed the contrast readout, and one
 *  source for them means the check can never describe a palette the overlay is not painting. */
export interface CaptionCssVars {
	'--caption-ink': string;
	'--caption-ink-final': string;
	'--caption-ink-label': string;
	'--caption-ink-lead': string;
	'--caption-halo-tight': string;
	'--caption-halo-soft': string;
	'--caption-scrim-strong': string;
	'--caption-scrim-mid': string;
	'--caption-scrim-none': string;
}

const rgba = (rgb: Rgb, alpha: number) =>
	`rgba(${rgb.map((c) => Math.round(c)).join(', ')}, ${Number(alpha.toFixed(4))})`;

export function captionCssVars(palette: CaptionPalette): CaptionCssVars {
	const text = parseHex(palette.text) ?? [255, 255, 255];
	const scrim = parseHex(palette.scrim) ?? [0, 0, 0];
	const halo = haloColour(text);
	const alpha = clampScrimOpacity(palette.scrimOpacity);
	// The alphas the check settled on, not the ones the design asked for. Going through
	// `captionContrast` is what guarantees the readout and the pixels cannot disagree: there
	// is one place that decides how dim a step gets, and both callers read it.
	const step = Object.fromEntries(
		captionContrast(palette).steps.map((s) => [s.step, s.alpha])
	) as Record<CaptionStep, number>;
	return {
		'--caption-ink': rgba(text, step.live),
		'--caption-ink-final': rgba(text, step.final),
		'--caption-ink-label': rgba(text, step.label),
		'--caption-ink-lead': rgba(text, step.lead),
		'--caption-halo-tight': rgba(halo, HALO_ALPHA),
		'--caption-halo-soft': rgba(halo, HALO_SOFT_ALPHA),
		// The gradient keeps its shape as the opacity moves: strongest at the bottom edge,
		// SCRIM_AT_TEXT of that where the text sits, gone at the top.
		'--caption-scrim-strong': rgba(scrim, alpha),
		'--caption-scrim-mid': rgba(scrim, alpha * SCRIM_AT_TEXT),
		'--caption-scrim-none': rgba(scrim, 0)
	};
}

/** Read the persisted palette, validating every part. A corrupt value falls back to its own
 *  default rather than taking the whole palette down with it. */
export function loadCaptionPalette(): CaptionPalette {
	const opacity = readStored(CAPTION_SCRIM_OPACITY_KEY);
	return {
		text: clampHex(readStored(CAPTION_TEXT_KEY), DEFAULT_CAPTION_PALETTE.text),
		scrim: clampHex(readStored(CAPTION_SCRIM_KEY), DEFAULT_CAPTION_PALETTE.scrim),
		scrimOpacity: opacity ? clampScrimOpacity(opacity) : DEFAULT_CAPTION_PALETTE.scrimOpacity
	};
}
