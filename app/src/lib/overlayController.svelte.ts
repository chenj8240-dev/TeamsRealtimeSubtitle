import type { CaptionPace } from './reading';
import type { CaptionLayout } from './captionLayout';
import { get } from 'svelte/store';
import { api } from './tauri';
import { asStatus } from './errors';
import {
	appearance,
	applyAppearance,
	options,
	overlayFontSize,
	overlayCaptionFace,
	overlayFillerWords,
	overlayPalette,
	overlayPlaced,
	overlayShowOriginal,
	statusMessage
} from './stores';
import { captionLanguageOf, secondCaptionLanguageOf } from './types';
import type { OverlayConfig, OverlayStateMsg } from './types';
import {
	clampOverlayFont,
	DEFAULT_APPEARANCE,
	toOverlayConfig,
	type Appearance
} from './appearance';
import type { CaptionPalette } from './captionColour';
import { normalizeFillerWords } from './cleanSpeech';
import {
	availableCaptionFaces,
	CAPTION_FACES,
	DEFAULT_CAPTION_FACE,
	measureWithCanvas
} from './captionFont';
import type { CaptionFace, CaptionFaceId } from './captionFont';
import { decodePlacement, type Placement } from './profiles';
import { isLayout, loadGeometry, recall, remember, saveGeometry } from './overlayGeometry';

/** One appearance and window-command owner for the rail, settings and overlay events. */
export function createOverlayController(port = api) {
	const api = port;
	/** The faces this machine can actually render. Starts as the whole list and narrows on
	 *  mount, once there is a canvas to measure with — offering a face and finding out later
	 *  that it silently fell back is the failure this avoids. */
	let captionFaces = $state<readonly CaptionFace[]>(CAPTION_FACES);

	/** Read the current audience language when building a complete configuration. */
	const captionLanguage = () => captionLanguageOf(get(options));

	// Every push carries the whole appearance, not the field that changed: the overlay is a
	// separate webview that can be reloaded independently, and a partial config would leave
	// it showing whatever it had before. One helper so no call site can forget a field. The
	// filler word list rides along for the same reason.
	function pushOverlayConfig(extra: Partial<OverlayConfig> = {}) {
		void api
			.setOverlayConfig({
				...toOverlayConfig(get(appearance)),
				captionLanguage: captionLanguage(),
				secondCaptionLanguage: secondCaptionLanguageOf(get(options)),
				fillerWords: [...get(overlayFillerWords)],
				showOriginal: get(overlayShowOriginal),
				...extra
			})
			.catch((e) => statusMessage.set(asStatus(e)));
	}

	/** Change part of the appearance: update the stores (which persist) and push the whole of
	 *  it live to the overlay. Normalized here as well as on the way in to the overlay: the
	 *  operator window is where the contrast readout is computed, and a readout describing a
	 *  colour the overlay would refuse to paint would be worse than no readout.
	 *
	 *  Move mode is carried through: the operator is usually looking at the overlay while
	 *  choosing, and a push that dropped it would snap the window back to click-through
	 *  mid-adjustment. */
	function setAppearance(patch: Partial<Appearance>) {
		applyAppearance({ ...get(appearance), ...patch });
		pushOverlayConfig({ interactive: moveOverlay });
	}

	const setFont = (fontSize: number) => setAppearance({ fontSize });
	const setCaptionLayout = (layout: CaptionLayout) => setAppearance({ layout });
	/** Caption measure: how long a Compact line is allowed to run before it wraps. */
	const setCaptionWidth = (width: number) => setAppearance({ width });
	const setCaptionFace = (face: CaptionFaceId) => setAppearance({ face });
	const setPalette = (patch: Partial<CaptionPalette>) =>
		setAppearance({ palette: { ...get(overlayPalette), ...patch } });

	/** Replace the words Hide filler words removes, and show the change live. Apart from
	 *  `setAppearance` because the list is apart from the appearance: see `overlayFillerWords`. */
	function setFillerWords(words: readonly string[]) {
		overlayFillerWords.set(normalizeFillerWords(words));
		pushOverlayConfig({ interactive: moveOverlay });
	}

	/** Show or hide the original speech under translations. Outside the appearance, like the
	 *  word list: it is about what the room reads, not how it looks. */
	function setShowOriginal(show: boolean) {
		overlayShowOriginal.set(show);
		pushOverlayConfig({ interactive: moveOverlay });
	}

	/** Put the overlay's whole appearance back to what it ships with.
	 *
	 *  Everything in this section, not just the colours: a palette that has gone wrong has
	 *  usually gone wrong alongside a size and a measure that were moved trying to fix it, and
	 *  a reset that left those behind would not be the way out it is reached for. Placement is
	 *  deliberately untouched — that is where the window sits on the projector, it took a walk
	 *  across the room to get right, and nothing here is a reason to lose it. */
	function resetOverlayAppearance() {
		setAppearance(DEFAULT_APPEARANCE);
	}

	// Move mode: the overlay is click-through while captioning; this flips it into an
	// interactive drag region so it can be dragged/resized into place, then flipped back.
	// The overlay can also leave move mode on its own (its Enter/Escape keys), which arrives
	// as an overlayState event — so this flag is the single source of truth, never cached.
	let moveOverlay = $state(false);

	// The overlay window is created visible (tauri.conf.json), so the toggle starts on "Hide".
	// Blanking it covers a coffee break or a video clip without ending the session.
	let overlayVisible = $state(true);

	// Where the overlay was last placed, kept per display layout (`overlayGeometry.ts`). Saved
	// when the operator finishes placing it and when a profile places it: not on every move,
	// and not when Escape puts the window back where move mode found it. Restored once, as the
	// operator window mounts, and again when the displays change under a running app and the
	// new layout has a placement of its own. What places the window waits for those restores,
	// so one still on its way can never land on top of a placement the operator has just made.
	let restoring: Promise<void> = Promise.resolve();

	/** Store where the overlay is now, under the current layout. Best effort: a placement that
	 *  could not be remembered costs a move at the next launch, which is nothing to interrupt
	 *  an event with. */
	async function rememberPlacement() {
		try {
			const [layout, placement] = await Promise.all([
				api.displayLayout(),
				api.getOverlayPlacement()
			]);
			const rect = decodePlacement(placement);
			if (isLayout(layout) && rect) saveGeometry(remember(loadGeometry(), layout, rect));
		} catch (e) {
			console.error('Could not remember the overlay placement', e);
		}
	}

	/** Put the overlay back where it was last placed on this display layout, or else where it
	 *  was last placed at all — always through the core, which clamps it to a display that is
	 *  there. With nothing remembered it stays where it was created, centred. */
	function restorePlacement(): Promise<void> {
		restoring = (async () => {
			const stored = loadGeometry();
			if (stored.length === 0) return;
			const layout = await api.displayLayout().then(
				(signature) => (isLayout(signature) ? signature : null),
				() => null
			);
			const found = recall(stored, layout);
			if (!found) return;
			await api.setOverlayPlacement(found.placement);
			saveGeometry(found.list);
		})().catch((e: unknown) => console.error('Could not restore the overlay placement', e));
		return restoring;
	}

	/** Make sure the overlay is on a display that is there before the operator is shown it. A
	 *  projector unplugged under a running app leaves the window on coordinates no screen has
	 *  any more, and showing it there — or entering move mode there — is a region the operator
	 *  cannot see, let alone drag. The core moves it into a work area only when it has to: a
	 *  placement that is still usable stays exactly where it is.
	 *
	 *  Best effort, like `rememberPlacement`: the core also rescues the overlay itself when the
	 *  displays change, so a check that fails here is a missed second chance, not a reason to
	 *  refuse the operator the overlay. */
	async function ensureReachable() {
		await restoring;
		try {
			await api.recoverOverlayPlacement();
		} catch (e) {
			console.error('Could not check the overlay is on a connected display', e);
		}
	}

	/** The displays changed while the app was running: a projector plugged in or pulled out, a
	 *  dock, Windows' projection mode. By now the core has already brought a stranded overlay
	 *  back onto a display that is there; what is left is the room's own placement. When this
	 *  layout has one — the projector is back — the overlay goes back to it. When it has none,
	 *  the overlay stays where the core's rescue put it: the most recent placement on another
	 *  layout, which a launch would fall back to, was made for displays that are not these.
	 *
	 *  Nothing is remembered here. A rescue lands wherever there is room, not where the operator
	 *  chose: remembering it would teach a layout a placement nobody made, or, read while the
	 *  displays are still settling, write the laptop's screen over the projector's own. A later
	 *  Done saves under the layout it is made on. Nothing is applied in move mode either: the
	 *  operator is placing the window by hand, and Done or Escape decides where it ends up.
	 *
	 *  Chained behind any restore under way, so two changes in quick succession, or one during
	 *  the launch restore, are applied in the order they came. */
	function handleDisplaysChanged(layout: string): Promise<void> {
		restoring = restoring
			.then(async () => {
				if (!isLayout(layout) || moveOverlay) return;
				const stored = loadGeometry();
				const own = stored.find((entry) => entry.layout === layout);
				if (!own) return;
				await api.setOverlayPlacement(own.placement);
				// Coming back to a layout is a use of it, as at launch.
				saveGeometry(remember(stored, layout, own.placement));
			})
			.catch((e: unknown) => console.error('Could not restore the overlay for these displays', e));
		return restoring;
	}

	/** Place the overlay where a meeting profile says, and remember it there: loading a profile
	 *  is as explicit a placement as finishing move mode. A refused placement is the caller's
	 *  to report. */
	async function applyPlacement(placement: Placement) {
		await restoring;
		await api.setOverlayPlacement(placement);
		await rememberPlacement();
	}

	async function toggleMoveOverlay() {
		const next = !moveOverlay;
		await restoring;
		// Entering move mode is the operator asking to see the region: it must be somewhere they
		// can. Leaving it is not — the window is where they just dragged it.
		if (next) await ensureReachable();
		try {
			await api.showOverlay(true);
			overlayVisible = true;
			await api.setOverlayClickThrough(!next);
			moveOverlay = next;
			pushOverlayConfig({ interactive: moveOverlay });
		} catch (e) {
			statusMessage.set(asStatus(e));
			return;
		}
		// Done: the region is where the operator wants it, as surely as when it is locked from
		// the overlay itself, so the preflight stops asking for it to be placed.
		if (!next) {
			overlayPlaced.set(true);
			await rememberPlacement();
		}
	}

	async function toggleOverlayVisible() {
		const next = !overlayVisible;
		// A hidden overlay is still placed, and the display it was placed on may have gone while
		// it was hidden; hiding needs no such check.
		if (next) await ensureReachable();
		try {
			await api.showOverlay(next);
			overlayVisible = next;
		} catch (e) {
			statusMessage.set(asStatus(e));
		}
	}

	function initialize() {
		// Which faces this machine has. Measured here rather than at module load so the
		// bundled webfont has had a chance to arrive first — see `availableCaptionFaces`.
		captionFaces = availableCaptionFaces(measureWithCanvas());
		// The choice persists, the font does not: a face uninstalled since it was chosen would
		// leave the control showing one thing and the overlay painting its fallback. Settle it
		// back to the bundled default instead of letting the two disagree.
		if (!captionFaces.some((f) => f.id === get(overlayCaptionFace)))
			setCaptionFace(DEFAULT_CAPTION_FACE);
	}

	function applyState(msg: OverlayStateMsg) {
		if (msg.interactive === false) {
			moveOverlay = false;
			// Left from the overlay itself. Escape puts the window back where move mode found it
			// only if that display is still there, but one going between its check and its move
			// would slip past; check once more.
			void ensureReachable();
		}
		// Locked from the overlay's own toolbar or Enter key. Escape sends no `placed`: the
		// window went back where it was, so there is nothing new to remember.
		if (msg.placed === true) {
			overlayPlaced.set(true);
			void rememberPlacement();
		}
		if (typeof msg.fontSize === 'number' && Number.isFinite(msg.fontSize))
			overlayFontSize.set(clampOverlayFont(msg.fontSize));
	}

	return {
		get captionFaces() {
			return captionFaces;
		},
		get moveOverlay() {
			return moveOverlay;
		},
		get overlayVisible() {
			return overlayVisible;
		},
		initialize,
		restorePlacement,
		handleDisplaysChanged,
		applyPlacement,
		applyState,
		pushOverlayConfig,
		setAppearance,
		setHoldSeconds: (hold: number) => setAppearance({ hold }),
		setPace: (pace: CaptionPace) => setAppearance({ pace }),
		setFont,
		setCaptionWidth,
		setCaptionLayout,
		setCleanSpeech: (cleanSpeech: boolean) => setAppearance({ cleanSpeech }),
		setFillerWords,
		setShowOriginal,
		setPalette,
		resetOverlayAppearance,
		setCaptionFace,
		toggleMoveOverlay,
		toggleOverlayVisible
	};
}
export type OverlayController = ReturnType<typeof createOverlayController>;
