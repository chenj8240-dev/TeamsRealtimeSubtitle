// The overlay's appearance as one value: what a meeting profile saves, what Reset restores,
// what a preset sets, and what every push to the overlay carries.
//
// The eight settings are persisted one key each (the overlay window reads them at start-up
// from the same localStorage origin), so the stores stay separate. Everything that treats
// them as a whole goes through this module, so adding a setting is one edit to the type and
// the places the compiler then points at, not a hunt through the components.
//
// The caption size and measure have no module of their own, so their keys and ranges live
// here, beside the two overlay keys outside the appearance that both windows use.

import {
	clampHex,
	clampScrimOpacity,
	DEFAULT_CAPTION_PALETTE,
	loadCaptionPalette,
	SCRIM_OPACITY_MAX,
	type CaptionPalette
} from './captionColour';
import {
	DEFAULT_CAPTION_FACE,
	isCaptionFace,
	loadCaptionFace,
	type CaptionFaceId
} from './captionFont';
import {
	DEFAULT_CAPTION_LAYOUT,
	isCaptionLayout,
	loadCaptionLayout,
	type CaptionLayout
} from './captionLayout';
import { loadCleanSpeech } from './cleanSpeech';
import { readStored } from './persisted';
import {
	DEFAULT_HOLD_SECONDS,
	holdSeconds,
	loadHoldSeconds,
	loadPace,
	type CaptionPace
} from './reading';
import type { OverlayConfig } from './types';

/** localStorage key shared by both windows (same origin) for the overlay font size. */
export const OVERLAY_FONT_KEY = 'overlay.fontSize';
export const DEFAULT_OVERLAY_FONT = 38;
export const OVERLAY_FONT_MIN = 20;
export const OVERLAY_FONT_MAX = 96;

/** Clamp a requested overlay font size to the supported range. */
export function clampOverlayFont(size: number): number {
	return Math.max(OVERLAY_FONT_MIN, Math.min(OVERLAY_FONT_MAX, Math.round(size)));
}

/** Read the persisted overlay font size (shared by both windows via localStorage). */
export function loadOverlayFont(): number {
	const v = Number(readStored(OVERLAY_FONT_KEY));
	return Number.isFinite(v) && v > 0 ? clampOverlayFont(v) : DEFAULT_OVERLAY_FONT;
}

/**
 * How wide a caption line may run, in `ch`.
 *
 * A typographic measure, not a percentage of the window, and deliberately: `ch` is defined
 * against the font, so a width chosen at 38px still means the same reading length at 72px.
 * A percentage would silently become a different number of words per line every time the
 * operator touched the size control.
 *
 * The range is the useful span between two real rooms. 20ch is a caption beside a video
 * tile, about four words a line and near the floor of what is readable at a glance; 60ch is
 * a wide stage under a 16:9 slide. `ch` is the width of a zero, which is wider than the
 * average lowercase glyph, so the 30ch default holds roughly the 40 characters broadcast
 * subtitling settled on.
 */
export const OVERLAY_WIDTH_KEY = 'overlay.captionWidth';
export const DEFAULT_OVERLAY_WIDTH = 30;
export const OVERLAY_WIDTH_MIN = 20;
export const OVERLAY_WIDTH_MAX = 60;

export function clampOverlayWidth(width: number): number {
	return Math.max(OVERLAY_WIDTH_MIN, Math.min(OVERLAY_WIDTH_MAX, Math.round(width)));
}

export function loadOverlayWidth(): number {
	const v = Number(readStored(OVERLAY_WIDTH_KEY));
	return Number.isFinite(v) && v > 0 ? clampOverlayWidth(v) : DEFAULT_OVERLAY_WIDTH;
}

/**
 * The tail budget for a still-streaming turn, in characters, at a given measure.
 *
 * `MAX_CHARS` in the overlay was a vertical limit wearing a horizontal disguise: it exists
 * so a long turn does not fill the screen, and what fills a screen is *lines*, not
 * characters. Holding it at 220 while the measure moved would have made a wide caption cover
 * less of the slide and a narrow one cover more — the setting quietly changing something
 * nobody asked it to change. Scaling it keeps the block the same number of lines at every
 * width, which is what the constant was protecting. 220 characters over the 30ch default is
 * the ratio being preserved.
 */
export function captionBudget(width: number): number {
	return Math.round((220 / DEFAULT_OVERLAY_WIDTH) * clampOverlayWidth(width));
}

/** Whether the caption region has ever been placed, so the pre-flight check survives a
 *  restart instead of asking the operator to position the overlay again. */
export const OVERLAY_PLACED_KEY = 'overlay.placed';

/** Shared with the overlay, which reads it on load before the operator's first push. */
export const SHOW_ORIGINAL_KEY = 'overlay.showOriginal';

export interface Appearance {
	fontSize: number;
	/** Compact line measure, in `ch`. */
	width: number;
	layout: CaptionLayout;
	face: CaptionFaceId;
	palette: CaptionPalette;
	/** Hide filler words in the overlay only. */
	cleanSpeech: boolean;
	/** Seconds a finished Fit/Compact caption stays on screen. */
	hold: number;
	pace: CaptionPace;
}

/** What the app ships with, and what Reset appearance restores. */
export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
	fontSize: DEFAULT_OVERLAY_FONT,
	width: DEFAULT_OVERLAY_WIDTH,
	layout: DEFAULT_CAPTION_LAYOUT,
	face: DEFAULT_CAPTION_FACE,
	palette: Object.freeze({ ...DEFAULT_CAPTION_PALETTE }),
	cleanSpeech: false,
	hold: DEFAULT_HOLD_SECONDS,
	pace: 'immediate'
});

/** A complete, valid appearance from anything: a stored profile, a patch, or garbage. Each
 *  setting falls back to its own default, so one bad field does not discard the rest. */
export function normalizeAppearance(value: unknown): Appearance {
	const a = (value && typeof value === 'object' ? value : {}) as Partial<Appearance>;
	const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
	return {
		fontSize: finite(a.fontSize) ? clampOverlayFont(a.fontSize) : DEFAULT_APPEARANCE.fontSize,
		width: finite(a.width) ? clampOverlayWidth(a.width) : DEFAULT_APPEARANCE.width,
		layout: isCaptionLayout(a.layout) ? a.layout : DEFAULT_APPEARANCE.layout,
		face: isCaptionFace(a.face) ? a.face : DEFAULT_APPEARANCE.face,
		palette: {
			text: clampHex(a.palette?.text, DEFAULT_CAPTION_PALETTE.text),
			scrim: clampHex(a.palette?.scrim, DEFAULT_CAPTION_PALETTE.scrim),
			scrimOpacity: clampScrimOpacity(
				a.palette?.scrimOpacity ?? DEFAULT_CAPTION_PALETTE.scrimOpacity
			)
		},
		cleanSpeech: a.cleanSpeech === true,
		hold: holdSeconds(a.hold),
		pace: a.pace === 'steady' ? 'steady' : 'immediate'
	};
}

/** The appearance persisted by the operator window, as the overlay reads it at start-up. */
export function loadAppearance(): Appearance {
	return {
		fontSize: loadOverlayFont(),
		width: loadOverlayWidth(),
		layout: loadCaptionLayout(),
		face: loadCaptionFace(),
		palette: loadCaptionPalette(),
		cleanSpeech: loadCleanSpeech(),
		hold: loadHoldSeconds(),
		pace: loadPace()
	};
}

export function sameAppearance(a: Readonly<Appearance>, b: Readonly<Appearance>): boolean {
	return (
		a.fontSize === b.fontSize &&
		a.width === b.width &&
		a.layout === b.layout &&
		a.face === b.face &&
		samePalette(a.palette, b.palette) &&
		a.cleanSpeech === b.cleanSpeech &&
		a.hold === b.hold &&
		a.pace === b.pace
	);
}

function samePalette(a: CaptionPalette, b: CaptionPalette): boolean {
	return a.text === b.text && a.scrim === b.scrim && a.scrimOpacity === b.scrimOpacity;
}

/** The appearance fields of an overlay push. The event keeps its own names, because a
 *  reloaded overlay from an older build still has to understand it. */
export function toOverlayConfig(a: Readonly<Appearance>): OverlayConfig {
	return {
		fontSize: a.fontSize,
		captionWidth: a.width,
		captionLayout: a.layout,
		captionFace: a.face,
		captionColour: a.palette.text,
		scrimColour: a.palette.scrim,
		scrimOpacity: a.palette.scrimOpacity,
		cleanSpeech: a.cleanSpeech,
		holdSeconds: a.hold,
		pace: a.pace
	};
}

/** The appearance an overlay push describes, as the overlay reads it on arrival: the inverse
 *  of `toOverlayConfig`. Validated here as well as at the source, each field on its own, so
 *  one bad value cannot take the rest down.
 *
 *  Not `normalizeAppearance`, which falls back to the shipped appearance: a push is a change
 *  to what is on screen, so a field that is absent or unusable keeps `current`, and a size
 *  must be positive before it is clamped. The exceptions come from the shared clamps: a
 *  colour that is present but unparseable, an opacity that is not a number and a hold that
 *  is a number but not a finite one fall back to the shipped value. */
export function fromOverlayConfig(
	config: Readonly<Partial<OverlayConfig>>,
	current: Readonly<Appearance>
): Appearance {
	const positive = (n: unknown): n is number => Number.isFinite(n) && (n as number) > 0;
	return {
		fontSize: positive(config.fontSize) ? clampOverlayFont(config.fontSize) : current.fontSize,
		width: positive(config.captionWidth) ? clampOverlayWidth(config.captionWidth) : current.width,
		layout: isCaptionLayout(config.captionLayout) ? config.captionLayout : current.layout,
		// An id, not a stack: what arrives over the event is checked against the faces this
		// build knows, so nothing here can put an arbitrary `font-family` on the screen an
		// audience is reading.
		face: isCaptionFace(config.captionFace) ? config.captionFace : current.face,
		// Every value is clamped to something paintable: a caption in an unparsed colour is a
		// caption in no colour at all.
		palette: {
			text: clampHex(config.captionColour ?? current.palette.text, DEFAULT_CAPTION_PALETTE.text),
			scrim: clampHex(config.scrimColour ?? current.palette.scrim, DEFAULT_CAPTION_PALETTE.scrim),
			scrimOpacity: clampScrimOpacity(config.scrimOpacity ?? current.palette.scrimOpacity)
		},
		cleanSpeech: typeof config.cleanSpeech === 'boolean' ? config.cleanSpeech : current.cleanSpeech,
		hold: typeof config.holdSeconds === 'number' ? holdSeconds(config.holdSeconds) : current.hold,
		pace: config.pace === 'steady' || config.pace === 'immediate' ? config.pace : current.pace
	};
}

export type PresetId = 'standard' | 'projector' | 'contrast';
export const PRESET_IDS: readonly PresetId[] = ['standard', 'projector', 'contrast'];

/** Reading presets. Each sets size, face, layout and colours; timing and filler cleanup are
 *  left as the operator had them. Values must already be in range: a preset that normalized
 *  to something else could never show as the current one. High contrast once asked for an
 *  opaque scrim, was stored at the 0.95 cap, and so never read as pressed. */
export const PRESETS: Readonly<
	Record<PresetId, Readonly<Pick<Appearance, 'fontSize' | 'face' | 'layout' | 'palette'>>>
> = {
	standard: {
		fontSize: DEFAULT_OVERLAY_FONT,
		face: DEFAULT_CAPTION_FACE,
		layout: 'fit',
		palette: { ...DEFAULT_CAPTION_PALETTE }
	},
	projector: {
		fontSize: 52,
		face: DEFAULT_CAPTION_FACE,
		layout: 'stable',
		palette: { text: '#ffffff', scrim: '#000000', scrimOpacity: 0.85 }
	},
	contrast: {
		fontSize: DEFAULT_OVERLAY_FONT,
		face: DEFAULT_CAPTION_FACE,
		layout: 'fit',
		palette: { text: '#ffffff', scrim: '#000000', scrimOpacity: SCRIM_OPACITY_MAX }
	}
};

export function matchesPreset(a: Readonly<Appearance>, id: PresetId): boolean {
	const preset = PRESETS[id];
	return (
		a.fontSize === preset.fontSize &&
		a.face === preset.face &&
		a.layout === preset.layout &&
		samePalette(a.palette, preset.palette)
	);
}
