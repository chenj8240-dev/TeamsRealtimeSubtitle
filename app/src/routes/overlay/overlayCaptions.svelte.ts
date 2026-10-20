// What the overlay shows: one current turn per track — a source in one caption language — the
// finished turn before it, and that track's reading context, plus when each of them expires. Kept apart from the window so it
// can be exercised without fonts, a ResizeObserver or a Tauri window.

import {
	appendCaptionHistory,
	CAPTION_TAIL_CHARS,
	tail,
	type CaptionLayout
} from '#lib/captionLayout.js';
import { createFillerFilter } from '#lib/cleanSpeech.js';
import { createCaptionPresenter, holdSeconds, type CaptionPace } from '#lib/reading.js';
import { captionBudget, clampOverlayWidth } from '#lib/appearance.js';
import { TRACK_ORDER, trackLane, trackOf, trackOrigin } from '#lib/types.js';
import type { Caption, Lane, Origin, StatusUpdate, Track } from '#lib/types.js';

/** An in-progress line that stalls (no turn-complete arriving) clears after this. */
const INTERIM_HOLD_MS = 3000;

/** A speaker's previous turn and current turn are usually one continuous sentence, so in
 *  Compact they render as one block: the tail of the finished turn (dimmed) flowing into the
 *  live one, sharing one character budget. Only the room left by the current turn goes to the
 *  lead-in, and only when it is worth reading: a readable fragment of a previous sentence is
 *  the same amount of text in a narrow region as in a wide one. */
const MIN_LEAD_CHARS = 40;

export interface CaptionLine {
	/** The source and caption language this row is. */
	track: Track;
	origin: Origin;
	lane: Lane;
	/** Earlier context, drawn dimmed ahead of the turn. */
	lead: string;
	text: string;
	interim: boolean;
	/** The turn's original speech, shown smaller under a translation. Empty when the option
	 *  is off, in Stable reading, and for subtitles, which have no separate original. */
	original: string;
}

export interface ReadingSettings {
	layout: CaptionLayout;
	hideFillers: boolean;
	/** What Hide filler words removes; see `createFillerFilter`. */
	fillerWords: readonly string[];
	/** Seconds a finished Fit/Compact caption stays up. */
	hold: number;
	pace: CaptionPace;
	/** Compact line measure, in `ch`. */
	width: number;
	/** Show the original speech under each translated caption. */
	showOriginal: boolean;
}

export function createOverlayCaptions(initial: ReadingSettings) {
	// All keyed by track: a source in one caption language. With one language that is the
	// origin itself, so the fixtures and a single-language session read exactly as before.
	let current = $state<Partial<Record<Track, Caption>>>({});
	let previous = $state<Partial<Record<Track, string>>>({});
	let history = $state<Partial<Record<Track, string>>>({});
	let layout = $state(initial.layout);
	let hideFillers = $state(initial.hideFillers);
	let fillerWords = $state.raw(initial.fillerWords);
	let hold = $state(initial.hold);
	let pace = $state(initial.pace);
	let width = $state(initial.width);
	let showOriginal = $state(initial.showOriginal);
	const timers: Partial<Record<Track, ReturnType<typeof setTimeout>>> = {};

	// Compact keeps captions subtitle-sized. A turn streams until it completes, which during
	// continuous speech can run for many sentences, so only the most recent slice of it is
	// shown. The budget follows the measure, so the block stays the same number of lines
	// however wide the operator sets it; see `captionBudget`.
	const maxChars = $derived(captionBudget(width));

	/** Display cleanup as it stands: the operator's words while Hide filler words is on, nothing
	 *  otherwise. Compiled again only when either changes, not per caption. */
	const clean = $derived(createFillerFilter(hideFillers ? fillerWords : []));

	/** Add a finished turn to an origin's reading context. Stable reading cleans the turn once,
	 *  here, so its history is exactly the text on screen: the overlay trims it at rendered
	 *  line starts (`trimStable`), and a later change to the toggle or the word list then
	 *  applies to new turns rather than re-wrapping every line already read. */
	function joinHistory(track: Track, turn: string): string {
		if (layout !== 'stable') return appendCaptionHistory(history[track] ?? '', turn);
		return `${history[track] ?? ''} ${clean(turn)}`;
	}

	/** Auto-hide an origin's caption so the overlay never sits on a stale line over the
	 *  slides. Always re-armed: even when a turn ends on an interim update and no
	 *  turn-complete ever arrives, the line has to disappear on its own. */
	function scheduleExpiry(c: Caption) {
		const track = trackOf(c.origin, c.lane);
		clearTimeout(timers[track]);
		timers[track] = setTimeout(
			() => {
				if (layout === 'stable') return;
				delete current[track];
				delete previous[track];
				delete history[track];
			},
			c.final ? hold * 1000 : INTERIM_HOLD_MS
		);
	}

	function rescheduleAll() {
		for (const c of Object.values(current)) if (c) scheduleExpiry(c);
	}

	const presenter = createCaptionPresenter(
		(c) => {
			const track = trackOf(c.origin, c.lane);
			const cur = current[track];
			// A caption for a new turn of this track: keep the finished text as the dimmed
			// lead-in to the fresh one. A turn can end without ever being flagged final, so this
			// keys off the turn id changing rather than on `cur.final`.
			if (cur && cur.turnId !== c.turnId && cur.text.trim()) {
				previous[track] = cur.text;
				history[track] = joinHistory(track, cur.text);
			}
			current[track] = c;
			scheduleExpiry(c);
		},
		() => pace
	);

	// The context before each origin's current turn, derived apart from `lines` so it is cleaned
	// when a turn joins it rather than on every caption. Stable reading's history is stored
	// already cleaned — see `joinHistory` — and is shown as it is.
	const contextLeads = $derived(
		Object.fromEntries(
			TRACK_ORDER.map((track) => {
				const context = history[track] ?? '';
				return [track, layout === 'fit' ? clean(context) : context];
			})
		) as Record<Track, string>
	);

	const lines = $derived<CaptionLine[]>(
		TRACK_ORDER.flatMap((track) => {
			const caption = current[track];
			if (!caption) return [];
			const lane = trackLane(track);
			const text =
				layout !== 'compact'
					? layout === 'stable'
						? caption.text
						: caption.text.slice(-CAPTION_TAIL_CHARS)
					: tail(caption.text, maxChars);
			const room = maxChars - text.length;
			const lead =
				layout !== 'compact'
					? contextLeads[track]
					: room >= MIN_LEAD_CHARS
						? tail(previous[track] ?? '', room)
						: '';
			// Stable reading is one flowing paragraph of context; a second, separately
			// scrolling language under it would be two things to read at once. A second caption
			// language heard the same speech, so the original goes under the first only. It
			// streams as long as the caption does, so it is bounded as the caption is: to the
			// Compact budget, or in Fit to the tail the fitting search is handed.
			const source =
				showOriginal && layout !== 'stable' && lane === 0
					? tail(caption.sourceText, layout === 'compact' ? maxChars : CAPTION_TAIL_CHARS)
					: '';
			return [
				{
					track,
					origin: trackOrigin(track),
					lane,
					lead: layout === 'compact' ? clean(lead) : lead,
					text: clean(text, caption.final),
					interim: !caption.final,
					original: clean(source, caption.final)
				}
			];
		})
	);

	function clearAll() {
		current = {};
		previous = {};
		history = {};
		for (const timer of Object.values(timers)) clearTimeout(timer);
	}

	return {
		get lines() {
			return lines;
		},
		get layout() {
			return layout;
		},
		get width() {
			return width;
		},
		/** A caption event from the core, paced by the reading preference. */
		push(caption: Caption) {
			presenter.push(caption);
		},
		/** A session or source ending: commit or drop what is buffered, and in Stable reading
		 *  clear the retained context when the whole session stops. */
		status(status: StatusUpdate) {
			if (status.state === 'idle' || status.state === 'error') {
				if (!status.origin && layout !== 'stable') presenter.flush();
				presenter.clear(status.origin, status.lane);
			}
			if (layout === 'stable' && status.state === 'idle' && !status.origin) clearAll();
		},
		setHold(seconds: number) {
			hold = holdSeconds(seconds);
			rescheduleAll();
		},
		setPace(next: CaptionPace) {
			pace = next;
			presenter.flush();
		},
		setHideFillers(hide: boolean) {
			hideFillers = hide;
		},
		setFillerWords(words: readonly string[]) {
			fillerWords = words;
		},
		setShowOriginal(show: boolean) {
			showOriginal = show;
		},
		setLayout(next: CaptionLayout) {
			if (next === layout) return;
			layout = next;
			if (layout !== 'stable') {
				rescheduleAll();
				for (const track of TRACK_ORDER)
					if (history[track]) history[track] = appendCaptionHistory('', history[track]);
			} else {
				// Stable reading keeps its history cleaned; context carried over from another
				// layout is cleaned once, on the way in.
				for (const track of TRACK_ORDER) if (history[track]) history[track] = clean(history[track]);
			}
		},
		setWidth(ch: number) {
			width = clampOverlayWidth(ch);
		},
		/** Drop the first `chars` characters of Stable reading's context, as measured at a
		 *  rendered line start by the caption line. */
		trimStable(track: Track, chars: number) {
			history[track] = (history[track] ?? '').slice(chars);
		},
		/** Show fixed content, for a browser preview with no core behind it. */
		show(content: {
			current: Partial<Record<Origin, Caption>>;
			previous?: Partial<Record<Origin, string>>;
			history?: Partial<Record<Origin, string>>;
		}) {
			current = content.current;
			previous = content.previous ?? {};
			history = content.history ?? {};
		},
		dispose() {
			presenter.clear();
			for (const timer of Object.values(timers)) clearTimeout(timer);
		}
	};
}
