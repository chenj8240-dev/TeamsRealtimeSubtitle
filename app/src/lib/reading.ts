import { readStored } from './persisted';
import {
	TRACK_ORDER,
	trackLane,
	trackOf,
	trackOrigin,
	type Caption,
	type Lane,
	type Origin,
	type Track
} from './types';

export type CaptionPace = 'immediate' | 'steady';
export const HOLD_KEY = 'overlay.holdSeconds';
export const PACE_KEY = 'overlay.pace';
export const DEFAULT_HOLD_SECONDS = 4;
/** The range the reading pause is kept in, and the range its stepper offers. */
export const HOLD_SECONDS_MIN = 2;
export const HOLD_SECONDS_MAX = 30;
export function holdSeconds(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(HOLD_SECONDS_MIN, Math.min(HOLD_SECONDS_MAX, Math.round(value)))
		: DEFAULT_HOLD_SECONDS;
}
export function loadHoldSeconds(): number {
	const value = readStored(HOLD_KEY);
	return value === null ? DEFAULT_HOLD_SECONDS : holdSeconds(Number(value));
}
export function loadPace(): CaptionPace {
	return readStored(PACE_KEY) === 'steady' ? 'steady' : 'immediate';
}

/** Throttle rather than debounce: continuous speech must still appear every 450ms.
 * Final text and turn transitions flush immediately; tracks never share a timer. */
export function createCaptionPresenter(show: (caption: Caption) => void, pace: () => CaptionPace) {
	const pending: Partial<Record<Track, Caption>> = {};
	const timers: Partial<Record<Track, ReturnType<typeof setTimeout>>> = {};
	function flush(track: Track) {
		clearTimeout(timers[track]);
		delete timers[track];
		const caption = pending[track];
		delete pending[track];
		if (caption) show(caption);
	}
	return {
		push(caption: Caption) {
			const track = trackOf(caption.origin, caption.lane);
			if (pending[track]?.turnId !== caption.turnId) flush(track);
			pending[track] = caption;
			if (pace() === 'immediate' || caption.final) flush(track);
			else if (!timers[track]) timers[track] = setTimeout(() => flush(track), 450);
		},
		flush() {
			for (const track of TRACK_ORDER) flush(track);
		},
		/** Drop what is held for a source — one of its languages, or all of them — or for
		 *  everything. */
		clear(origin?: Origin, lane?: Lane) {
			for (const track of TRACK_ORDER) {
				if (origin && trackOrigin(track) !== origin) continue;
				if (lane !== undefined && trackLane(track) !== lane) continue;
				clearTimeout(timers[track]);
				delete timers[track];
				delete pending[track];
			}
		}
	};
}
