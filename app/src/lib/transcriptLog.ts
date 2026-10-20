// The caption-to-transcript pipeline: the turn on screen for each track, the finalized log
// those turns are committed to, its history record, and whether the log has reached disk.

import { derived, get, writable } from 'svelte/store';
import { isDirty, newestLineId, NOTHING_SAVED } from './document';
import { sessionHistory } from './history';
import { options } from './preferences';
import { noteActivity } from './sourceActivity';
import { laneCount, laneLanguage, trackOf } from './types';
import type { Caption, StartOptions, Track, TranscriptLine } from './types';

// ---- Captions & transcript --------------------------------------------------

// The turn currently on screen for each track, so the operator can show both speakers — and
// both languages — at once. Key insertion order is kept in least-recently-updated order,
// which is the order the stage renders the blocks in — newest at the bottom.
export const currentCaptions = writable<Partial<Record<Track, Caption>>>({});

// The transcript log, most recent finalized line first.
//
// Deliberately unbounded. It used to be capped at 1,000 lines, which silently dropped the
// beginning of any long event — exactly the sessions worth keeping (issue #25). A finalized
// line is a sentence or two of text, so even a day-long session is a few megabytes; the
// operator is warned to save well before then (`TRANSCRIPT_WARN_LINES`) rather than losing
// anything behind their back.
export const transcript = writable<TranscriptLine[]>([]);

// ---- Saved / unsaved document state -----------------------------------------

/** Highest line id written to disk, so a second save with nothing new stays saved. */
const savedLineId = writable<number>(NOTHING_SAVED);

/** Path of the last successful save, shown next to the saved badge. */
export const savedPath = writable<string>('');

/** True while the log holds finalized text that has not reached disk. */
export const transcriptDirty = derived([transcript, savedLineId], ([lines, saved]) =>
	isDirty(lines, saved)
);

/** Record a successful write: everything logged up to now is on disk at `path`. */
export function markTranscriptSaved(lines: TranscriptLine[], path: string) {
	savedLineId.set(newestLineId(lines));
	savedPath.set(path);
}

// Track the in-flight turn *per track* so a transcript line is logged even when a stream
// never emits an explicit turn-complete, and so mic and system turns — and a source's two
// languages — whose ids are independent counters never clobber each other.
const pending: Partial<Record<Track, Caption>> = {};

let nextLineId = 1;
let transcriptTimeOffset = 0;

function commit(c: Caption) {
	if (!c.text.trim()) return;
	const line: TranscriptLine = {
		id: nextLineId++,
		text: c.text.trim(),
		sourceText: c.sourceText.trim(),
		origin: c.origin,
		...(c.lane ? { lane: c.lane } : {}),
		// With two caption languages, each line says which it is in; see `TranscriptLine`.
		...(laneCount(get(options)) === 2 ? { language: laneLanguage(get(options), c.lane ?? 0) } : {}),
		// The committed caption's own interval: the turn's start, and the moment this text
		// was the last thing the provider had to say about it.
		startMs: c.startMs === undefined ? undefined : c.startMs + transcriptTimeOffset,
		endMs: c.endMs === undefined ? undefined : c.endMs + transcriptTimeOffset
	};
	transcript.update((list) => [line, ...list]);
	sessionHistory.append({ ...line, startMs: c.startMs, endMs: c.endMs });
}

export function pushCaption(c: Caption) {
	noteActivity(c.origin, 'caption');
	const track = trackOf(c.origin, c.lane);
	// Re-insert this track last so the object's key order tracks recency.
	currentCaptions.update((m) => {
		const next: Partial<Record<Track, Caption>> = {};
		for (const t of Object.keys(m) as Track[]) if (t !== track) next[t] = m[t];
		next[track] = c;
		return next;
	});
	const prev = pending[track];
	// A new turn id means this track's previous turn is done, even without an explicit
	// turn-complete.
	if (prev && prev.turnId !== c.turnId) {
		commit(prev);
		delete pending[track];
	}
	if (c.final) {
		commit(c);
		delete pending[track];
	} else {
		pending[track] = c;
	}
}

/** Commit all in-flight lines (call when the session ends) so they aren't lost. */
export function flushTranscript() {
	for (const track of Object.keys(pending) as Track[]) {
		const c = pending[track];
		if (c) commit(c);
		delete pending[track];
	}
}

/** End the run's document: commit in-flight lines, then close its history record. Safe to
 *  call more than once — a finished record keeps its first end time. */
export function endTranscriptSession(): Promise<void> {
	flushTranscript();
	return sessionHistory.finish();
}

/** The transcript's part of `beginSession`: close the previous run's record and open this
 *  one's, without discarding already finalized lines. */
export function beginTranscriptRun(sessionOptions: StartOptions) {
	void endTranscriptSession();
	sessionHistory.begin(sessionOptions);
	// Retried/new sessions append to one document without resetting its cue timeline.
	transcriptTimeOffset = get(transcript).reduce((end, line) => Math.max(end, line.endMs ?? 0), 0);
}

/** Clear both finalized and in-flight transcript state, and the saved marker with them —
 *  an empty document is neither saved nor unsaved, and the next run's line ids continue
 *  upward, so a stale marker could otherwise make fresh text look already written. */
export function clearTranscript() {
	transcriptTimeOffset = 0;
	transcript.set([]);
	currentCaptions.set({});
	savedLineId.set(NOTHING_SAVED);
	savedPath.set('');
	for (const track of Object.keys(pending) as Track[]) delete pending[track];
}

/** Replace the log with a recovered snapshot. The restored lines are unsaved by definition —
 *  the file they came from is a crash spool, not the operator's transcript — and ids continue
 *  above the snapshot so a later run cannot collide with them. */
export function restoreTranscript(lines: TranscriptLine[]) {
	transcript.set(lines);
	savedLineId.set(NOTHING_SAVED);
	savedPath.set('');
	nextLineId = Math.max(nextLineId, newestLineId(lines) + 1);
}
