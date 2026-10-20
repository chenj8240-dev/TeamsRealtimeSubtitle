// The operator's choices that outlive a run, each persisted to localStorage: the session setup,
// the overlay's appearance and reading, and how the app itself behaves. The overlay window
// reads the keys it needs at start-up rather than importing these stores, so it stays
// lightweight.

import { derived } from 'svelte/store';
import {
	loadOverlayFont,
	loadOverlayWidth,
	normalizeAppearance,
	OVERLAY_FONT_KEY,
	OVERLAY_PLACED_KEY,
	OVERLAY_WIDTH_KEY,
	SHOW_ORIGINAL_KEY,
	type Appearance
} from './appearance';
import {
	CAPTION_SCRIM_KEY,
	CAPTION_SCRIM_OPACITY_KEY,
	CAPTION_TEXT_KEY,
	captionContrast,
	loadCaptionPalette,
	type CaptionPalette
} from './captionColour';
import { CAPTION_FACE_KEY, loadCaptionFace, type CaptionFaceId } from './captionFont';
import { CAPTION_LAYOUT_KEY, loadCaptionLayout, type CaptionLayout } from './captionLayout';
import { CLEAN_SPEECH_KEY, loadCleanSpeech, loadFillerWords, saveFillerWords } from './cleanSpeech';
import { LANGUAGE_FAVOURITES_KEY, loadLanguageFavourites } from './languages';
import { persisted, persistedFlag, persistedWith, writeStored } from './persisted';
import { HOLD_KEY, loadHoldSeconds, loadPace, PACE_KEY, type CaptionPace } from './reading';
import { loadStartOptions, SESSION_OPTIONS_KEY } from './startOptions';
import type { StartOptions } from './types';

// ---- Session setup -------------------------------------------------------------
// Persisted to localStorage: the keyless built-in demo applies to a first run only, and a
// configured operator's setup survives a restart. A chosen application is stored without its
// process: a process id means nothing after a restart.

export const options = persistedWith<StartOptions>(loadStartOptions, (v) =>
	writeStored(
		SESSION_OPTIONS_KEY,
		JSON.stringify({
			...v,
			...(v.systemCapture?.kind === 'application'
				? { systemCapture: { kind: 'application', process: null } }
				: {})
		})
	)
);

// ---- Overlay appearance -------------------------------------------------------
// Persisted to localStorage so both windows share the same default.

export const overlayFontSize = persisted<number>(OVERLAY_FONT_KEY, loadOverlayFont);

/** Fit window, Compact or Stable reading. Shared with the overlay window through the same
 *  localStorage origin. */
export const overlayCaptionLayout = persisted<CaptionLayout>(CAPTION_LAYOUT_KEY, loadCaptionLayout);

/** How wide a caption line may run, in `ch`. Persisted like the font size. */
export const overlayCaptionWidth = persisted<number>(OVERLAY_WIDTH_KEY, loadOverlayWidth);

/** The caption typeface. Persisted and shared the same way; the id is validated on read, so
 *  a hand-edited or stale value falls back to the bundled default rather than to nothing. */
export const overlayCaptionFace = persisted<CaptionFaceId>(CAPTION_FACE_KEY, loadCaptionFace);

/** The caption ink and the scrim behind it, as one store: they are chosen together and judged
 *  together, and a contrast reading of half a palette would mean nothing. */
export const overlayPalette = persistedWith<CaptionPalette>(loadCaptionPalette, (p) => {
	writeStored(CAPTION_TEXT_KEY, p.text);
	writeStored(CAPTION_SCRIM_KEY, p.scrim);
	writeStored(CAPTION_SCRIM_OPACITY_KEY, String(p.scrimOpacity));
});

/** What the palette actually achieves on a projector, recomputed as it changes. Derived
 *  rather than stored: it is a fact about the palette, and a cached one could disagree. */
export const overlayContrast = derived(overlayPalette, ($p) => captionContrast($p));

// Whether the caption region has been positioned on the presentation display; persisted so
// the pre-flight check survives a restart.
export const overlayPlaced = persistedFlag(OVERLAY_PLACED_KEY);

// ---- Reading -------------------------------------------------------------------

export const overlayCleanSpeech = persisted(CLEAN_SPEECH_KEY, loadCleanSpeech);
/** The words Hide filler words removes. Outside `appearance` on purpose: a curated list is
 *  not something a profile or Reset appearance should overwrite. It has its own reset. */
export const overlayFillerWords = persistedWith<readonly string[]>(
	loadFillerWords,
	saveFillerWords
);
export const overlayHoldSeconds = persisted(HOLD_KEY, loadHoldSeconds);
export const overlayPace = persisted<CaptionPace>(PACE_KEY, loadPace);

// ---- Crash recovery ----------------------------------------------------------
// Off until the operator asks for it: writing captions to disk on a timer is exactly what
// the privacy policy promises the app does not do by default. Persisted so a room that
// wants the safety net does not have to re-enable it before every event.

export const recoveryEnabled = persistedFlag('recovery.enabled');

// ---- Bilingual output ----------------------------------------------------------
// Translation keeps what was said before it was translated. Off by default, both of them:
// a bilingual document or overlay is a choice, not something an existing room should find
// changed after an update.

/** Write the original speech under each translation in a saved transcript. */
export const exportOriginal = persistedFlag('transcript.includeOriginal');

/** Show the original speech as a smaller line under each translated caption. */
export const overlayShowOriginal = persistedFlag(SHOW_ORIGINAL_KEY);

// ---- Window and tray ----------------------------------------------------------
// Off by default, so a fresh install keeps ordinary Windows semantics: minimize goes to the
// taskbar and the X closes the app. Staying alive after being closed is a thing an operator
// opts into, usually once, for a room where the window is in the way but the session must
// not stop.

export const closeToTray = persistedFlag('window.closeToTray');

/** Whether the operator has already been told that closing no longer quits. Persisted so it
 *  is said the first time and never again. */
export const trayHideExplained = persistedFlag('window.trayHideExplained');

// ---- Languages ------------------------------------------------------------------

/** Operator preference, deliberately outside StartOptions and IPC. */
export const languageFavourites = persistedWith(
	() => loadLanguageFavourites(),
	(codes) => writeStored(LANGUAGE_FAVOURITES_KEY, JSON.stringify(codes))
);

// ---- Appearance as a whole ---------------------------------------------------------

/** The eight appearance stores as one value, for saving, comparing and pushing. */
export const appearance = derived(
	[
		overlayFontSize,
		overlayCaptionWidth,
		overlayCaptionLayout,
		overlayCaptionFace,
		overlayPalette,
		overlayCleanSpeech,
		overlayHoldSeconds,
		overlayPace
	],
	([fontSize, width, layout, face, palette, cleanSpeech, hold, pace]): Appearance => ({
		fontSize,
		width,
		layout,
		face,
		palette,
		cleanSpeech,
		hold,
		pace
	})
);

/** Set every appearance store from one value, normalized first so nothing out of range is
 *  stored or shown in the operator window's readouts. */
export function applyAppearance(value: Appearance) {
	const a = normalizeAppearance(value);
	overlayFontSize.set(a.fontSize);
	overlayCaptionWidth.set(a.width);
	overlayCaptionLayout.set(a.layout);
	overlayCaptionFace.set(a.face);
	overlayPalette.set(a.palette);
	overlayCleanSpeech.set(a.cleanSpeech);
	overlayHoldSeconds.set(a.hold);
	overlayPace.set(a.pace);
}
