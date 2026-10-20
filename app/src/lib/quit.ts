// Leaving the app, in the order the guarantees have to happen (issues #25 and #22): confirm
// that a live session may end, stop capture, let the providers hand over their last turn,
// finalize the document, and only then decide whether anything still has to be asked.
//
// The same sequence serves all three ways out — the window's X, Quit in the tray, and the
// core's watchdog when neither is answered — so none of them can be the cheap path that
// skips a step.
//
// It lives here rather than in the page so it can be tested directly: a graceful quit is
// exactly the path nobody exercises by hand until the one event where it matters.

import { get } from 'svelte/store';

import type { CloseChoice } from './document';
import { exportFormat, savableFormat } from './exportFormat';
import { sessionHistory } from './history';
import { endTranscriptSession, isRunning, transcript, transcriptDirty } from './stores';
import { saveTranscriptDocument } from './saveDocument';
import { api } from './tauri';
import { recovery } from './recovery';

/** A provider that never finishes flushing must not hold the window hostage. `stop_session`
 *  bounds its own drain at five seconds; this bounds the wait on the whole call. */
const QUIT_DRAIN_TIMEOUT_MS = 8000;

/** Claim an intercepted close so the core stops counting down on it.
 *
 *  Every `close-requested` needs one, including a repeat that lands while the prompt is
 *  already on screen: the core counts attempts, and an unclaimed one releases the window a
 *  few seconds later — which, with the prompt still open, would take the transcript with it. */

export interface CloseOutcome {
	/** A session was running and has been stopped and drained, so the prompt can explain
	 *  where the last few lines came from. */
	endedSession: boolean;
	/** Unsaved lines remain: the operator has to answer before the app can quit. When false,
	 *  the quit has already been confirmed and the window is on its way out. */
	prompt: boolean;
}

function withTimeout(work: Promise<unknown>, ms: number): Promise<unknown> {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		// The caller reports its own failures; here a rejected stop must not turn into an
		// unhandled rejection once the race has already been settled by the timeout.
		work.catch(() => {}),
		new Promise((resolve) => {
			timer = setTimeout(resolve, ms);
		})
	]).finally(() => clearTimeout(timer));
}

/**
 * Whether leaving now would cut a live session short.
 *
 * Asked *before* anything is stopped, because ending an event's captions is the operator's
 * decision and not a consequence of a mis-aimed click on the window's X — which is the
 * accident the tray exists to prevent in the first place (issue #22).
 */
export function endsLiveSession(): boolean {
	return get(isRunning);
}

/**
 * Everything that must happen before a close can be allowed or questioned.
 *
 * `stopSession` is injected because the page owns the busy flag and the status line that a
 * stop touches; this only needs to know when it has finished.
 */
export async function acknowledgeClose(): Promise<void> {
	await api.ackClose().catch(() => {});
}

export async function prepareClose(
	stopSession: () => Promise<void>,
	timeoutMs = QUIT_DRAIN_TIMEOUT_MS
): Promise<CloseOutcome> {
	// First, before the drain: the core releases the window if nothing claims the close within
	// a few seconds, and stopping a session takes longer than that.
	await acknowledgeClose();

	let endedSession = false;
	if (get(isRunning)) {
		endedSession = true;
		await withTimeout(stopSession(), timeoutMs);
	}
	// A turn that never got an explicit turn-complete is still the operator's text.
	await endTranscriptSession();

	if (get(transcriptDirty)) return { endedSession, prompt: true };

	await api.confirmClose();
	return { endedSession, prompt: false };
}

/**
 * Act on the operator's answer and quit. `cancel` is handled by the caller — it is the one
 * answer that changes nothing.
 *
 * Save writes the format chosen in the transcript toolbar, as its own Save as… would. A
 * failed save throws and the app stays open: quitting on a write that did not land would
 * lose precisely what the operator just asked to keep.
 */
export async function resolveClose(choice: Exclude<CloseChoice, 'cancel'>): Promise<boolean> {
	if (choice === 'save') {
		const format = savableFormat(get(exportFormat), get(transcript));
		if (!(await saveTranscriptDocument(format))) return false;
	} else {
		// The spool only ever held the text now being thrown away.
		await recovery.clear().catch(() => {});
	}
	await sessionHistory.flush();
	await api.confirmClose();
	return true;
}
