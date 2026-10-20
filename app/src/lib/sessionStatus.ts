// How the run is going: each source's state and the aggregate shown for them, pause, the
// run's clock and the status line. A run starts with `beginSession` and the core's status
// events arrive through `applyStatus`; both also settle the transcript and the meters, so
// this module sits above `transcriptLog.ts` and `sourceActivity.ts`, never below them.

import { derived, get, writable } from 'svelte/store';
import type { AppError } from './errors';
import { options } from './preferences';
import { activityTimes, micLevel, systemLevel } from './sourceActivity';
import {
	beginTranscriptRun,
	currentCaptions,
	endTranscriptSession,
	flushTranscript
} from './transcriptLog';
import { LANES, trackOf, trackOrigin } from './types';
import type { Origin, SessionState, StatusUpdate, Track } from './types';

// ---- Session status --------------------------------------------------------
// Up to four backend tasks (two captures + two clients in "Both" mode) report status
// independently, so state is tracked per origin and aggregated for display: the worst
// state wins, and the session counts as active while any source still is.

// Keyed by track — a source in one caption language — so a session captioning in two languages
// reports each client separately. Lane 0 is the bare origin, so with one language this is the
// per-origin map it always was.
export const originStates = writable<Partial<Record<Track, SessionState>>>({});

/** How one source is doing, across its caption languages: the worst of them. */
export function originState(
	states: Partial<Record<Track, SessionState>>,
	origin: Origin
): SessionState {
	const mine = (Object.keys(states) as Track[])
		.filter((track) => trackOrigin(track) === origin)
		.map((track) => states[track]);
	return DISPLAY_PRIORITY.find((s) => mine.includes(s)) ?? 'idle';
}

const DISPLAY_PRIORITY: SessionState[] = [
	'error',
	'reconnecting',
	'connecting',
	'paused',
	'running'
];

export const sessionState = derived(originStates, (m): SessionState => {
	const states = Object.values(m);
	return DISPLAY_PRIORITY.find((s) => states.includes(s)) ?? 'idle';
});

// A paused session is still a session: Stop stays available and the setup stays locked.
export const isRunning = derived(originStates, (m) =>
	Object.values(m).some(
		(s) => s === 'running' || s === 'reconnecting' || s === 'connecting' || s === 'paused'
	)
);

/** Whether the operator has paused the run: set when the core accepts the request, so the
 *  button answers at once rather than when each source reports it. Cleared with the run. */
export const pauseRequested = writable(false);

/** Time the current run has spent paused, for the running cost estimate: nothing is streamed
 *  while paused, so nothing is billed. `since` is set while a pause is under way. */
export const pausedTime = writable<{ totalMs: number; since: number | null }>({
	totalMs: 0,
	since: null
});

sessionState.subscribe((state) => {
	pausedTime.update((p) => {
		if (state === 'paused') return p.since === null ? { ...p, since: Date.now() } : p;
		if (p.since === null) return p;
		return { totalMs: p.totalMs + Date.now() - p.since, since: null };
	});
});

/** How much of `elapsedMs` was spent streaming, as of `now`. */
export function streamedMs(
	elapsedMs: number,
	paused: { totalMs: number; since: number | null },
	now: number
): number {
	const current = paused.since === null ? 0 : Math.max(0, now - paused.since);
	return Math.max(0, elapsedMs - paused.totalMs - current);
}

// Either plain text or the core's structured error. Structured, because the sentence for an
// id belongs to the interface language and is chosen where it is rendered — see
// `describeError`.
export const statusMessage = writable<string | AppError>('');

/** Wall-clock start of the current run, or null when idle. Drives the elapsed timer and the
 *  running cost estimate. */
export const sessionStartedAt = writable<number | null>(null);

/** Whether a source of the current run has reported an active state since `beginSession`.
 *  When a replacement starts, the drained session's Idle can arrive after `beginSession`;
 *  the core stops the old run before starting the new one, so that stale Idle always comes
 *  before this run's first active status — and must not be taken for this run ending. */
let runHadActiveSource = false;

/** Apply one status event from the Rust core. */
export function applyStatus(u: StatusUpdate) {
	if (u.origin) {
		const origin = u.origin;
		// A status with no lane is about the source itself — a capture failure — and so about
		// every language it was feeding.
		const known = get(originStates);
		const tracks =
			u.lane !== undefined
				? [trackOf(origin, u.lane)]
				: LANES.map((lane) => trackOf(origin, lane)).filter(
						(track, lane) => lane === 0 || track in known
					);
		originStates.update((m) => {
			const next = { ...m };
			for (const track of tracks) next[track] = u.state;
			return next;
		});
		if (u.state === 'error' || u.state === 'idle') {
			const level = { source: origin, rms: 0, peak: 0 };
			(origin === 'microphone' ? micLevel : systemLevel).set(level);
			currentCaptions.update((m) => {
				const next = { ...m };
				for (const track of tracks) delete next[track];
				return next;
			});
			if (!get(isRunning)) {
				sessionStartedAt.set(null);
				// Every source of this run has ended by itself — a provider failure, or a
				// capture that died — with no Stop to close the record. Left open, it would be
				// closed by the next Start or quit and claim all the time in between.
				if (runHadActiveSource) {
					runHadActiveSource = false;
					void endTranscriptSession();
				}
			}
		} else {
			runHadActiveSource = true;
			// Starting a replacement first drains the old backend session, whose Idle
			// can arrive after beginSession. Its first active status starts the new clock.
			if (get(sessionStartedAt) === null) sessionStartedAt.set(Date.now());
		}
	} else if (u.state === 'idle') {
		// Whole-session stop: commit any in-flight caption so it can be saved, and
		// clear per-source state so the meters don't freeze at their last value.
		originStates.set({});
		activityTimes.set({});
		pauseRequested.set(false);
		runHadActiveSource = false;
		flushTranscript();
		micLevel.set({ source: 'microphone', rms: 0, peak: 0 });
		systemLevel.set({ source: 'system', rms: 0, peak: 0 });
		currentCaptions.set({});
		sessionStartedAt.set(null);
	}
	if (u.message) {
		statusMessage.set(u.message);
	} else if (!u.origin && u.state === 'idle') {
		statusMessage.set('');
	}
}

/** Prepare the monitor for a new run without discarding already finalized transcript lines. */
export function beginSession(sessionOptions = get(options)) {
	beginTranscriptRun(sessionOptions);
	runHadActiveSource = false;
	originStates.set({});
	pauseRequested.set(false);
	pausedTime.set({ totalMs: 0, since: null });
	micLevel.set({ source: 'microphone', rms: 0, peak: 0 });
	systemLevel.set({ source: 'system', rms: 0, peak: 0 });
	currentCaptions.set({});
	sessionStartedAt.set(Date.now());
}
