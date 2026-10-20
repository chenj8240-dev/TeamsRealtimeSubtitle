// The transcript as an explicit document with a saved/unsaved state, plus the on-disk
// recovery snapshot format. Pure logic — no Svelte, no Tauri — so a long session, a
// duplicate save, a discard and a malformed recovery file can all be tested directly.
//
// Issue #25: the log used to be capped at 1,000 lines and silently truncated, and nothing
// on screen distinguished a saved transcript from one that only existed in memory.

import { ORIGINS, type Origin, type TranscriptLine } from './types';
import { isTargetLanguage } from './languages';

/** Id meaning "nothing has been saved yet". Line ids start at 1. */
export const NOTHING_SAVED = 0;

/**
 * When the in-memory log gets this long, the operator is told to save.
 *
 * It is a warning, not a cap: nothing is ever dropped. At roughly ten finalized lines per
 * minute of speech this is around six hours of continuous captioning, so reaching it means
 * an unusually long session rather than a runaway.
 */
export const TRANSCRIPT_WARN_LINES = 4000;

/** Highest line id in a newest-first log; `NOTHING_SAVED` when the log is empty. */
export function newestLineId(newestFirst: TranscriptLine[]): number {
	return newestFirst.length ? newestFirst[0].id : NOTHING_SAVED;
}

/**
 * Whether the document holds finalized text that has not reached disk.
 *
 * Compared by line id rather than by a boolean flag so that saving twice with nothing new
 * in between stays saved, while one new line after a save makes the document unsaved again.
 * Ids are monotonic for the lifetime of the app, so a `Clear` followed by a fresh run cannot
 * make stale text look saved.
 */
export function isDirty(newestFirst: TranscriptLine[], savedLineId: number): boolean {
	return newestLineId(newestFirst) > savedLineId;
}

// ---- Recovery snapshot ------------------------------------------------------
// Written to the app's own local data directory when the operator opts in, so a crash or a
// power cut does not take the session with it. It holds finalized caption lines and nothing
// else: no API key, no audio, no device name, no provider identity.

export const RECOVERY_VERSION = 1;

export interface RecoverySnapshot {
	version: number;
	/** ISO-8601 UTC, for the "recovered from …" line in the restore offer. */
	savedAt: string;
	/** Same order as the store: newest first. */
	lines: TranscriptLine[];
}

/** Serialize the log for the recovery file. Only the caption's own fields are written. */
export function encodeRecovery(newestFirst: TranscriptLine[], savedAt: Date): string {
	const snapshot: RecoverySnapshot = {
		version: RECOVERY_VERSION,
		savedAt: savedAt.toISOString(),
		lines: newestFirst.map((line) => ({
			id: line.id,
			text: line.text,
			sourceText: line.sourceText,
			origin: line.origin,
			...(line.lane ? { lane: line.lane } : {}),
			...(line.language ? { language: line.language } : {}),
			// Spread rather than assign: a line with no timing must not gain two `undefined`
			// keys, which `JSON.stringify` drops anyway but which would make a round-trip
			// comparison in a test misleadingly pass.
			...timingOf(line)
		}))
	};
	return JSON.stringify(snapshot);
}

/**
 * A line's interval, or nothing — the shape `encodeRecovery` spreads and `readLine` returns.
 *
 * A usable cue has both ends present, real, non-negative and in order. A cue that ends
 * before it starts is not a rounding error, it is a corrupt file, and it would produce a
 * subtitle track that no two players agree on how to show.
 */
function timingOf(line: {
	startMs?: unknown;
	endMs?: unknown;
}): { startMs: number; endMs: number } | Record<string, never> {
	const { startMs, endMs } = line;
	if (
		typeof startMs !== 'number' ||
		typeof endMs !== 'number' ||
		!Number.isFinite(startMs) ||
		!Number.isFinite(endMs) ||
		startMs < 0 ||
		endMs < startMs
	) {
		return {};
	}
	return { startMs, endMs };
}

/**
 * Read one line out of a snapshot, or null if it is not a caption at all.
 *
 * Timing is treated more leniently than the caption itself, and deliberately: a spool
 * written before timing existed has none, and one that was truncated mid-write may have
 * half an interval. Neither is a reason to throw away words the operator cannot get back —
 * the line returns without timing, and only the timed export is poorer for it.
 */
export function readLine(value: unknown): TranscriptLine | null {
	if (typeof value !== 'object' || value === null) return null;
	const line = value as Record<string, unknown>;
	if (
		typeof line.id !== 'number' ||
		!Number.isFinite(line.id) ||
		typeof line.text !== 'string' ||
		typeof line.sourceText !== 'string' ||
		typeof line.origin !== 'string' ||
		!(ORIGINS as readonly string[]).includes(line.origin)
	) {
		return null;
	}
	return {
		id: line.id,
		text: line.text,
		sourceText: line.sourceText,
		origin: line.origin as Origin,
		// Only the second language is marked; anything else reads as the first.
		...(line.lane === 1 ? { lane: 1 as const } : {}),
		...(isTargetLanguage(line.language) ? { language: line.language } : {}),
		...timingOf(line)
	};
}

/**
 * Read a recovery file back. It is untrusted input — it survived a crash, it may have been
 * truncated mid-write, and it sits in a directory the user can edit — so anything that is
 * not a complete, current-version snapshot with at least one usable line yields null and the
 * app carries on as if there were nothing to recover.
 */
export function decodeRecovery(raw: string): RecoverySnapshot | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const snapshot = parsed as Record<string, unknown>;
	if (snapshot.version !== RECOVERY_VERSION) return null;
	if (typeof snapshot.savedAt !== 'string' || Number.isNaN(Date.parse(snapshot.savedAt))) {
		return null;
	}
	if (!Array.isArray(snapshot.lines)) return null;
	const lines = snapshot.lines.map(readLine).filter((line) => line !== null);
	if (!lines.length) return null;
	return { version: RECOVERY_VERSION, savedAt: snapshot.savedAt, lines };
}

// ---- Quit ------------------------------------------------------------------

/** What the operator chose in the unsaved-transcript prompt. */
export type CloseChoice = 'save' | 'discard' | 'cancel';

/**
 * Whether the Rust core should intercept a window close.
 *
 * A running session counts even with an empty transcript: closing mid-session has to stop
 * capture and let the provider flush its last turn before the document can be finalized,
 * which cannot happen if the window has already gone. When neither holds, close is left
 * alone entirely, so an unresponsive front-end can never make the window unclosable.
 *
 * The tray preference is guarded separately (`lifecycle::CloseGuard::set_close_to_tray`),
 * because it is a standing setting rather than something the session state decides.
 */
export function shouldGuardClose(dirty: boolean, running: boolean): boolean {
	return dirty || running;
}

// ---- What clicking the X means ----------------------------------------------

/** The three things a close can turn into. `explain-then-hide` is the first hide only: an
 *  app that vanishes from the taskbar and keeps running has to say so once, or it reads as
 *  a crash. */
export type CloseAction = 'quit' | 'hide' | 'explain-then-hide';

export function closeAction(closeToTray: boolean, explained: boolean): CloseAction {
	if (!closeToTray) return 'quit';
	return explained ? 'hide' : 'explain-then-hide';
}
