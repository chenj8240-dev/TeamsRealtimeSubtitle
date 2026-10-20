import { isTargetLanguage, type TargetLanguage } from './languages';
import { get, writable } from 'svelte/store';
import { readLine } from './document';
import { asStatus, type AppError } from './errors';
import { persistedFlag } from './persisted';
import { api } from './tauri';
import {
	OUTPUT_MODES,
	secondCaptionLanguageOf,
	type StartOptions,
	type TranscriptLine
} from './types';

export const HISTORY_ENABLED_KEY = 'transcript.historyEnabled';
// Read as this module loads, so it goes through `persisted.ts`: storage that refuses access
// would otherwise throw at import and leave the operator window blank.
export const historyEnabled = persistedFlag(HISTORY_ENABLED_KEY);
/** The last save that failed, kept structured like the status line's so the History tab words
 *  it in whichever language is showing (`describeError`); empty once saving works again. */
export const historyError = writable<string | AppError>('');
export const historyRevision = writable(0);

export interface SavedSession {
	version: 1;
	title?: string;
	id: string;
	startedAt: string;
	savedAt: string;
	endedAt: string | null;
	durationMs: number;
	mode: 'translate' | 'transcribe';
	sourceLanguage: 'auto' | TargetLanguage;
	targetLanguage: TargetLanguage | null;
	/** The second caption language, when the session had one; its lines carry `lane: 1`. */
	secondTargetLanguage?: TargetLanguage | null;
	lines: TranscriptLine[];
}

const SESSION_ID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

const isDate = (value: unknown): value is string =>
	typeof value === 'string' && Number.isFinite(Date.parse(value));

/** The checks every stored session passes, whichever format it was read from. */
function checked(s: SavedSession, id: string): SavedSession | null {
	const ids = s.lines.map((line) => line.id);
	return s.id === id &&
		SESSION_ID.test(id) &&
		(OUTPUT_MODES as readonly string[]).includes(s.mode) &&
		(s.sourceLanguage === 'auto' || isTargetLanguage(s.sourceLanguage)) &&
		(s.targetLanguage === null || isTargetLanguage(s.targetLanguage)) &&
		(s.secondTargetLanguage == null || isTargetLanguage(s.secondTargetLanguage)) &&
		isDate(s.startedAt) &&
		isDate(s.savedAt) &&
		(s.endedAt === null || isDate(s.endedAt)) &&
		Number.isFinite(s.durationMs) &&
		s.durationMs >= 0 &&
		ids.length > 0 &&
		new Set(ids).size === ids.length &&
		ids.every((n) => Number.isSafeInteger(n) && n >= 1)
		? s
		: null;
}

const cleanTitle = (title: unknown) =>
	typeof title === 'string' ? title.trim().slice(0, 120) : undefined;

// ---- Session log ------------------------------------------------------------------------
// A session file is a log, one JSON record per line: a header naming the session, then each
// finalized line as it is saved, with a progress record after every write. The file only
// ever grows at its end, so a long session appends what is new instead of rewriting what is
// already on disk. The latest progress and title records win.

/** The log format's version. Version 1 was one JSON object, rewritten whole on every save;
 *  those files are still read. */
export const HISTORY_LOG_VERSION = 2;

const record = (value: unknown) => `${JSON.stringify(value)}\n`;

const lineRecords = (newestFirst: TranscriptLine[]) =>
	newestFirst
		.toReversed()
		.map((line) => record({ line }))
		.join('');

const progressRecord = (s: SavedSession) =>
	record({ savedAt: s.savedAt, durationMs: s.durationMs, endedAt: s.endedAt });

/** A whole session as a log: its header, every line oldest first, and where it stands. */
export function encodeSessionLog(s: SavedSession): string {
	const header = {
		version: HISTORY_LOG_VERSION,
		id: s.id,
		...(s.title === undefined ? {} : { title: s.title }),
		startedAt: s.startedAt,
		mode: s.mode,
		sourceLanguage: s.sourceLanguage,
		targetLanguage: s.targetLanguage,
		...(s.secondTargetLanguage ? { secondTargetLanguage: s.secondTargetLanguage } : {})
	};
	return record(header) + lineRecords(s.lines) + progressRecord(s);
}

/** What to add to a log that already holds the session's oldest `written` lines. */
export function encodeSessionAppend(s: SavedSession, written: number): string {
	return lineRecords(s.lines.slice(0, s.lines.length - written)) + progressRecord(s);
}

function decodeSessionLog(raw: string, id: string): SavedSession | null {
	const records = raw.split('\n').flatMap((text) => {
		if (!text.trim()) return [];
		try {
			const value: unknown = JSON.parse(text);
			return typeof value === 'object' && value !== null ? [value as Record<string, unknown>] : [];
		} catch {
			// A record torn by a write that failed part-way. It held nothing the others lack.
			return [];
		}
	});
	const [head, ...rest] = records;
	if (head?.version !== HISTORY_LOG_VERSION) return null;
	const session = {
		version: 1,
		id: head.id,
		title: cleanTitle(head.title),
		startedAt: head.startedAt,
		savedAt: head.startedAt,
		endedAt: null,
		durationMs: 0,
		mode: head.mode,
		sourceLanguage: head.sourceLanguage,
		targetLanguage: head.targetLanguage,
		secondTargetLanguage: head.secondTargetLanguage ?? null,
		lines: []
	} as unknown as SavedSession;
	const oldestFirst: TranscriptLine[] = [];
	for (const r of rest) {
		if ('line' in r) {
			const line = readLine(r.line);
			if (!line) return null;
			oldestFirst.push(line);
		} else if ('title' in r) {
			session.title = cleanTitle(r.title);
		} else if ('savedAt' in r) {
			Object.assign(session, {
				savedAt: r.savedAt,
				durationMs: r.durationMs,
				endedAt: r.endedAt ?? null
			});
		}
	}
	session.lines = oldestFirst.reverse();
	return checked(session, id);
}

/** A session file written before the log format: one JSON object holding everything, with
 *  its lines in the same shape as a log's and read the same way. A damaged line makes the
 *  file unreadable rather than quietly shorter, as it does in a log. */
function decodeWholeSession(raw: string, id: string): SavedSession | null {
	let s;
	try {
		s = JSON.parse(raw);
	} catch {
		return null;
	}
	if (s?.version !== 1 || !Array.isArray(s.lines)) return null;
	const lines: TranscriptLine[] = [];
	for (const value of s.lines) {
		const line = readLine(value);
		if (!line) return null;
		lines.push(line);
	}
	return checked(
		{
			version: 1,
			id: s.id,
			title: cleanTitle(s.title),
			startedAt: s.startedAt,
			savedAt: s.savedAt,
			endedAt: s.endedAt,
			durationMs: s.durationMs,
			mode: s.mode,
			sourceLanguage: s.sourceLanguage,
			targetLanguage: s.targetLanguage,
			lines
		},
		id
	);
}

export function decodeSession(raw: string, id: string): SavedSession | null {
	return decodeSessionLog(raw, id) ?? decodeWholeSession(raw, id);
}

// ---- Listing ----------------------------------------------------------------------------

/** One session file as `list_history` reports it. `contents` is absent when the renderer
 *  already holds the file at this length. */
export interface ListedSession {
	id: string;
	/** The file's length in bytes: a log only grows, so an unchanged length is an unchanged
	 *  session. */
	length: number;
	contents?: string | null;
}

/** The history folder, measured against what the renderer said it holds. */
export interface HistoryListing {
	sessions: ListedSession[];
	/** Sessions the renderer holds that are no longer listed. */
	removed: string[];
}

/** A listed session, decoded; `session` is null for a file that could not be. */
export interface HistoryEntry {
	id: string;
	length: number;
	session: SavedSession | null;
}

/**
 * The sessions a History view holds, kept in step with the folder.
 *
 * A recording session saves every few seconds, and each save had an open History tab read,
 * send and decode every stored session again. The view now says what it holds; the core
 * sends only what is new or has grown, and only that is decoded. An unchanged session keeps
 * the same object, which also keeps the search's per-session cache (`historySearch.ts`)
 * warm.
 */
export function createHistoryCache(decode = decodeSession) {
	const held = new Map<string, HistoryEntry>();
	return {
		/** What to tell `list_history` this view already holds. */
		known(): [string, number][] {
			return [...held.values()].map((entry) => [entry.id, entry.length]);
		},
		/** Take a listing in, and return the sessions it describes, newest first. */
		apply(listing: HistoryListing): HistoryEntry[] {
			for (const id of listing.removed) held.delete(id);
			const entries = listing.sessions.flatMap(({ id, length, contents }) => {
				if (contents == null) {
					// Unchanged. One this view stopped holding meanwhile is left out, and read
					// on the next listing, which no longer names it as held.
					const kept = held.get(id);
					return kept ? [kept] : [];
				}
				const entry = { id, length, session: decode(contents, id) };
				held.set(id, entry);
				return [entry];
			});
			return entries.sort((a, b) =>
				(b.session?.startedAt ?? '').localeCompare(a.session?.startedAt ?? '')
			);
		},
		/** Read this session again on the next listing, whatever its length. Renaming a file
		 *  from before the log format rewrites it whole, and a title of the same length would
		 *  leave the file the same length as well. */
		forget(id: string) {
			held.delete(id);
		}
	};
}

/** Appended lines reach disk at most this often. The lines a few seconds of delay holds back
 *  are written at once by finish, flush, retry and quit. */
export const HISTORY_WRITE_INTERVAL_MS = 5000;

/** Serialize writes and deletions. Pending snapshots coalesce. A session's first write, and
 * any write after a failure, replaces its file whole and atomically; later writes append only
 * the lines that are new. A deleted active session stays deleted; the next Start gets a
 * fresh UUID. */
export function createHistoryCoordinator(
	port: Pick<typeof api, 'writeHistory' | 'appendHistory' | 'deleteHistory' | 'renameHistory'>,
	enabled: () => boolean,
	onError: (error: unknown) => void = () => {},
	onSaved: (failed: boolean) => void = () => {},
	writeInterval = HISTORY_WRITE_INTERVAL_MS
) {
	let active: SavedSession | null = null;
	let queue = Promise.resolve();
	let revision = 0;
	// Appends write at once when the last append-triggered write is old enough — so a new
	// session's first line appears promptly — and otherwise once, when the interval is up.
	let lastAppendWrite = -Infinity;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deleted = new Set<string>();
	const failed = new Map<string, SavedSession>();
	const titles = new Map<string, string>();
	/** How many of each session's lines its file is known to hold. */
	const written = new Map<string, number>();
	async function write(snapshot: SavedSession) {
		if (deleted.has(snapshot.id)) return;
		const onDisk = written.get(snapshot.id);
		try {
			if (onDisk === undefined || onDisk > snapshot.lines.length) {
				const title = titles.get(snapshot.id) ?? snapshot.title;
				await port.writeHistory(snapshot.id, encodeSessionLog({ ...snapshot, title }));
			} else {
				await port.appendHistory(snapshot.id, encodeSessionAppend(snapshot, onDisk));
			}
			written.set(snapshot.id, snapshot.lines.length);
			failed.delete(snapshot.id);
			onSaved(failed.size > 0);
		} catch (error) {
			// What reached the file is uncertain now, so the next write replaces it whole.
			written.delete(snapshot.id);
			failed.set(snapshot.id, snapshot);
			onError(error);
		}
	}
	function persist() {
		if (!enabled() || !active?.lines.length || deleted.has(active.id)) return;
		const session = active;
		const version = ++revision;
		// The snapshot is taken when the job runs, not when it is queued: a newer append for
		// the same session supersedes this job, and a superseded job should cost nothing.
		// Shallow is enough, because `append` replaces `lines` rather than mutating it.
		queue = queue
			.then(async () => {
				if (deleted.has(session.id) || (active?.id === session.id && version !== revision)) return;
				await write({ ...session });
			})
			.catch(onError);
	}
	function writeAppends() {
		timer = undefined;
		lastAppendWrite = Date.now();
		persist();
	}
	function scheduleAppends() {
		if (timer !== undefined) return;
		const wait = lastAppendWrite + writeInterval - Date.now();
		if (wait <= 0) writeAppends();
		else timer = setTimeout(writeAppends, wait);
	}
	/** Cancel a scheduled append write, reporting whether one was waiting. */
	function cancelScheduled() {
		if (timer === undefined) return false;
		clearTimeout(timer);
		timer = undefined;
		return true;
	}
	return {
		begin(options: StartOptions, now = new Date(), id = crypto.randomUUID()) {
			// Lines still waiting belong to the session that is ending.
			if (cancelScheduled()) persist();
			lastAppendWrite = -Infinity;
			active = {
				version: 1,
				id,
				startedAt: now.toISOString(),
				savedAt: now.toISOString(),
				endedAt: null,
				durationMs: 0,
				mode: options.mode,
				sourceLanguage:
					options.rehearsal ?? (options.provider === 'ondevice' ? options.targetLanguage : 'auto'),
				targetLanguage: options.mode === 'translate' ? options.targetLanguage : null,
				secondTargetLanguage: secondCaptionLanguageOf(options) ?? null,
				lines: []
			};
		},
		append(line: TranscriptLine, now = new Date()) {
			if (!active || !enabled() || deleted.has(active.id)) return;
			active.lines = [line, ...active.lines];
			active.savedAt = now.toISOString();
			active.durationMs = Math.max(0, now.getTime() - Date.parse(active.startedAt));
			scheduleAppends();
		},
		finish(now = new Date()) {
			const waiting = cancelScheduled();
			if (active && active.endedAt === null) {
				active.endedAt = now.toISOString();
				active.savedAt = now.toISOString();
				active.durationMs = Math.max(0, now.getTime() - Date.parse(active.startedAt));
				persist();
			} else if (waiting) {
				persist();
			}
			return queue;
		},
		retry() {
			cancelScheduled();
			if (!enabled()) return queue;
			queue = queue.then(async () => {
				for (const snapshot of [...failed.values()]) await write(snapshot);
			});
			persist();
			return queue;
		},
		flush() {
			if (cancelScheduled()) persist();
			return queue;
		},
		rename(session: SavedSession, value: string) {
			const title = value.trim().slice(0, 120);
			titles.set(session.id, title);
			if (active?.id === session.id) active.title = title;
			const result = queue.then(async () => {
				if (deleted.has(session.id)) throw new Error('Session deleted');
				// Rename the newest disk record, never the history view's possibly stale copy.
				try {
					await port.renameHistory(session.id, title);
				} catch (error) {
					// An append carries no title, so the next write has to be a whole one.
					written.delete(session.id);
					throw error;
				}
				onSaved(failed.size > 0);
			});
			queue = result.catch(onError);
			return result;
		},
		delete(id: string) {
			deleted.add(id);
			written.delete(id);
			if (active?.id === id) cancelScheduled();
			const result = queue.then(async () => {
				await port.deleteHistory(id);
				failed.delete(id);
				onSaved(failed.size > 0);
			});
			queue = result.catch(onError);
			return result;
		}
	};
}

export const sessionHistory = createHistoryCoordinator(
	api,
	() => get(historyEnabled),
	(error) => historyError.set(asStatus(error)),
	(failed) => {
		if (!failed) historyError.set('');
		historyRevision.update((n) => n + 1);
	}
);
