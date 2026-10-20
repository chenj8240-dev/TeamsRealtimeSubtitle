import { describe, expect, it, vi } from 'vitest';
import {
	createHistoryCache,
	createHistoryCoordinator,
	decodeSession,
	encodeSessionAppend,
	encodeSessionLog,
	HISTORY_LOG_VERSION,
	type SavedSession
} from './history';
import type { StartOptions, TranscriptLine } from './types';

const options: StartOptions = {
	source: 'system',
	mode: 'translate',
	targetLanguage: 'fr',
	provider: 'gemini'
};
const start = new Date('2026-09-19T10:00:00Z');
const id = '12345678-1234-1234-1234-123456789abc';
const id2 = '12345678-1234-1234-1234-123456789abd';
const line: TranscriptLine = {
	id: 1,
	text: 'Um, hello.',
	sourceText: 'Bonjour.',
	origin: 'system',
	startMs: 0,
	endMs: 1000
};

/** The session log's records, parsed. */
const records = (raw: string) =>
	raw
		.split('\n')
		.filter(Boolean)
		.map((text) => JSON.parse(text));

/** The same log with its header changed. */
function withHeader(raw: string, patch: Record<string, unknown>) {
	const [head, ...rest] = raw.split('\n');
	return [JSON.stringify({ ...JSON.parse(head), ...patch }), ...rest].join('\n');
}

function setup(enabled = true) {
	const disk = new Map<string, string>();
	const port = {
		// As `history.rs` does it: a log gains a title record, an older file is rewritten.
		renameHistory: vi.fn(async (id: string, title: string) => {
			const raw = disk.get(id);
			if (!raw) throw new Error('missing');
			if (records(raw)[0].version === HISTORY_LOG_VERSION)
				disk.set(id, `${raw}${JSON.stringify({ title })}\n`);
			else disk.set(id, JSON.stringify({ ...JSON.parse(raw), title }));
		}),
		writeHistory: vi.fn(async (id: string, raw: string) => {
			disk.set(id, raw);
		}),
		appendHistory: vi.fn(async (id: string, raw: string) => {
			const existing = disk.get(id);
			if (existing === undefined) throw new Error('missing');
			disk.set(id, existing + raw);
		}),
		deleteHistory: vi.fn(async (id: string) => {
			disk.delete(id);
		})
	};
	const error = vi.fn();
	const history = createHistoryCoordinator(port, () => enabled, error);
	return {
		history,
		port,
		disk,
		error,
		setEnabled: (value: boolean) => {
			enabled = value;
		}
	};
}

describe('session history', () => {
	it('saves and reopens non-Latin translation targets without discarding the session', async () => {
		const s = setup();
		s.history.begin({ ...options, targetLanguage: 'ja' }, start, id);
		s.history.append({ ...line, text: '皆さん、こんにちは。' });
		await s.history.finish();
		expect(decodeSession(s.disk.get(id)!, id)).toMatchObject({
			targetLanguage: 'ja',
			lines: [{ text: '皆さん、こんにちは。' }]
		});
		expect(
			decodeSession(withHeader(s.disk.get(id)!, { targetLanguage: 'unknown' }), id)
		).toBeNull();
	});
	it('renames an older session from its latest disk record after another session starts', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.flush();
		const stale = decodeSession(s.disk.get(id)!, id)!;
		s.history.append({ ...line, id: 2, text: 'Latest line' });
		await s.history.finish();
		s.history.begin(options, start, id2);
		await s.history.rename(stale, 'Earlier meeting');
		expect(decodeSession(s.disk.get(id)!, id)).toMatchObject({
			title: 'Earlier meeting',
			lines: [{ id: 2 }, { id: 1 }]
		});
	});
	it('renames active sessions without overwriting captions queued after the history view loaded', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.flush();
		const old = decodeSession(s.disk.get(id)!, id)!;
		s.history.append({ ...line, id: 2, text: 'New text' });
		await s.history.rename(old, 'Workshop');
		s.history.append({ ...line, id: 3 });
		await s.history.finish();
		const saved = decodeSession(s.disk.get(id)!, id)!;
		expect(saved.title).toBe('Workshop');
		expect(saved.lines).toHaveLength(3);
	});
	it('retains a renamed title through a failed write retry and never resurrects deleted sessions', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.finish();
		const saved = decodeSession(s.disk.get(id)!, id)!;
		s.port.renameHistory.mockRejectedValueOnce(new Error('disk full'));
		await expect(s.history.rename(saved, 'Meeting')).rejects.toThrow('disk full');
		await s.history.retry();
		expect(decodeSession(s.disk.get(id)!, id)?.title).toBe('Meeting');
		await s.history.delete(id);
		await expect(s.history.rename(saved, 'Gone')).rejects.toThrow();
		expect(s.disk.size).toBe(0);
	});
	it('writes nothing by default or for an empty session', async () => {
		const s = setup(false);
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.finish();
		expect(s.disk.size).toBe(0);
		s.setEnabled(true);
		s.history.begin(options, start, id2);
		await s.history.finish();
		expect(s.disk.size).toBe(0);
	});
	it('persists raw finalized lines progressively and records duration and language honestly', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line, new Date(+start + 1500));
		await s.history.flush();
		const running = decodeSession(s.disk.get(id)!, id)!;
		expect(running).toMatchObject({
			sourceLanguage: 'auto',
			targetLanguage: 'fr',
			durationMs: 1500,
			endedAt: null,
			lines: [line]
		});
		await s.history.finish(new Date(+start + 60000));
		expect(decodeSession(s.disk.get(id)!, id)).toMatchObject({
			durationMs: 60000,
			endedAt: '2026-09-19T10:01:00.000Z'
		});
	});
	it('keeps consecutive sessions separate, including queued writes', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		void s.history.finish();
		s.history.begin({ ...options, mode: 'transcribe', provider: 'ondevice' }, start, id2);
		s.history.append({ ...line, id: 2, text: 'Second' });
		await s.history.finish();
		expect(decodeSession(s.disk.get(id)!, id)?.lines).toEqual([line]);
		expect(decodeSession(s.disk.get(id2)!, id2)).toMatchObject({
			sourceLanguage: 'fr',
			targetLanguage: null,
			lines: [{ text: 'Second' }]
		});
	});
	it('serializes deletion after in-flight writes and prevents resurrection', async () => {
		const s = setup();
		let release!: () => void;
		s.port.writeHistory.mockImplementationOnce(async (i, raw) => {
			await new Promise<void>((r) => (release = r));
			s.disk.set(i, raw);
		});
		s.history.begin(options, start, id);
		s.history.append(line);
		await Promise.resolve();
		s.history.append({ ...line, id: 2 });
		const deletion = s.history.delete(id);
		release();
		await deletion;
		s.history.append({ ...line, id: 3 });
		await s.history.finish();
		expect(s.disk.size).toBe(0);
	});
	it('reports a failed save, retries, and preserves earlier sessions when disabled', async () => {
		const s = setup();
		s.port.writeHistory.mockRejectedValueOnce(new Error('disk full'));
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.flush();
		expect(s.error).toHaveBeenCalledOnce();
		expect(s.disk.size).toBe(0);
		await s.history.retry();
		s.setEnabled(false);
		s.history.append({ ...line, id: 2 });
		await s.history.finish();
		expect(decodeSession(s.disk.get(id)!, id)?.lines).toEqual([line]);
	});
	it('rejects corrupt or mismatched sessions while retaining other readable records', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.flush();
		const raw = s.disk.get(id)!;
		expect(decodeSession(raw, id)).not.toBeNull();
		expect(decodeSession(raw, id2)).toBeNull();
		for (const bad of [
			'{',
			withHeader(raw, { version: 9 }),
			withHeader(raw, { mode: 'shouting' }),
			`${raw}${JSON.stringify({ savedAt: '2026-09-19T10:00:00Z', durationMs: -1, endedAt: null })}\n`,
			`${raw}${JSON.stringify({ line: null })}\n`,
			`${raw}${JSON.stringify({ line })}\n`
		])
			expect(decodeSession(bad, id)).toBeNull();
	});
	it('does not extend a completed session when a later start or quit finishes it again', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line, start);
		await s.history.finish(new Date(+start + 60000));
		await s.history.finish(new Date(+start + 3600000));
		expect(decodeSession(s.disk.get(id)!, id)?.durationMs).toBe(60000);
	});
	it('can retry an earlier failed session after a new session has begun', async () => {
		const s = setup();
		s.port.writeHistory.mockRejectedValueOnce(new Error('disk full'));
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.finish();
		s.history.begin(options, start, id2);
		s.history.append({ ...line, id: 2 });
		await s.history.finish();
		await s.history.retry();
		expect(s.disk.size).toBe(2);
	});
	// Every finalized line used to rewrite the whole session file. A session's first line is
	// still written at once; the rest coalesce into one write per interval.
	it('coalesces appended lines into one write per interval', async () => {
		vi.useFakeTimers();
		try {
			const s = setup();
			const writes = () =>
				s.port.writeHistory.mock.calls.length + s.port.appendHistory.mock.calls.length;
			s.history.begin(options, start, id);
			s.history.append(line);
			await vi.advanceTimersByTimeAsync(0);
			expect(writes()).toBe(1);
			for (let n = 2; n <= 6; n++) s.history.append({ ...line, id: n });
			await vi.advanceTimersByTimeAsync(4999);
			expect(writes()).toBe(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(writes()).toBe(2);
			expect(decodeSession(s.disk.get(id)!, id)?.lines).toHaveLength(6);
		} finally {
			vi.useRealTimers();
		}
	});
	it('writes lines waiting for the interval at once on flush, finish and a new session', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		s.history.append({ ...line, id: 2 });
		await s.history.flush();
		expect(decodeSession(s.disk.get(id)!, id)?.lines).toHaveLength(2);
		s.history.append({ ...line, id: 3 });
		await s.history.finish();
		expect(decodeSession(s.disk.get(id)!, id)?.lines).toHaveLength(3);
		s.history.append({ ...line, id: 4 });
		s.history.begin(options, start, id2);
		await s.history.flush();
		expect(decodeSession(s.disk.get(id)!, id)?.lines).toHaveLength(4);
	});
	// The file used to be rewritten whole on every save: about half a gigabyte over a
	// three-hour session. Now only the first write carries what is already on disk.
	it('appends only the lines that are new after the first write', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.flush();
		s.history.append({ ...line, id: 2, text: 'Second' });
		s.history.append({ ...line, id: 3, text: 'Third' });
		await s.history.flush();
		s.history.append({ ...line, id: 4, text: 'Fourth' });
		await s.history.finish(new Date(+start + 60000));
		expect(s.port.writeHistory).toHaveBeenCalledOnce();
		const appended = s.port.appendHistory.mock.calls.map(([, raw]) =>
			records(raw)
				.filter((r) => 'line' in r)
				.map((r) => r.line.id)
		);
		expect(appended).toEqual([[2, 3], [4]]);
		expect(decodeSession(s.disk.get(id)!, id)).toMatchObject({
			endedAt: '2026-09-19T10:01:00.000Z',
			durationMs: 60000,
			lines: [{ id: 4 }, { id: 3 }, { id: 2 }, { id: 1 }]
		});
	});
	it('rewrites the whole log after an append fails', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.flush();
		s.port.appendHistory.mockRejectedValueOnce(new Error('disk full'));
		s.history.append({ ...line, id: 2 });
		await s.history.flush();
		expect(s.error).toHaveBeenCalledOnce();
		s.history.append({ ...line, id: 3 });
		await s.history.finish();
		expect(s.port.writeHistory).toHaveBeenCalledTimes(2);
		expect(decodeSession(s.disk.get(id)!, id)?.lines.map((l) => l.id)).toEqual([3, 2, 1]);
	});
	it('reads a log whose last record was torn by a failed write', async () => {
		const s = setup();
		s.history.begin(options, start, id);
		s.history.append(line);
		await s.history.flush();
		const torn = `${s.disk.get(id)!}{"line":{"id":2,"te`;
		expect(decodeSession(torn, id)?.lines).toEqual([line]);
	});
	it('still reads a session saved as one JSON object before the log format', () => {
		const legacy = JSON.stringify({
			version: 1,
			id,
			title: 'Old meeting',
			startedAt: start.toISOString(),
			savedAt: start.toISOString(),
			endedAt: null,
			durationMs: 1000,
			mode: 'translate',
			sourceLanguage: 'auto',
			targetLanguage: 'fr',
			lines: [line]
		});
		expect(decodeSession(legacy, id)).toMatchObject({ title: 'Old meeting', lines: [line] });
		expect(decodeSession(legacy, id2)).toBeNull();
	});
	// It used to be read as a recovery snapshot, parsed a second time for its other fields.
	// Its lines are now read as a log's are, and only its own version, 1, is accepted.
	it('reads the lines of a session from before the log format as a log reads them', () => {
		const whole = (patch: Record<string, unknown>) =>
			JSON.stringify({
				version: 1,
				id,
				startedAt: start.toISOString(),
				savedAt: start.toISOString(),
				endedAt: null,
				durationMs: 1000,
				mode: 'translate',
				sourceLanguage: 'auto',
				targetLanguage: 'fr',
				lines: [line],
				...patch
			});
		const second = { ...line, id: 2, lane: 1, language: 'de' };
		expect(decodeSession(whole({ lines: [second, line] }), id)?.lines).toEqual([second, line]);
		// A line it cannot read makes the file unreadable, not quietly shorter.
		expect(
			decodeSession(whole({ lines: [{ ...line, id: 2, origin: 'stage' }, line] }), id)
		).toBeNull();
		for (const bad of [{ version: 2 }, { version: undefined }, { lines: [] }, { lines: 'x' }])
			expect(decodeSession(whole(bad), id)).toBeNull();
		for (const raw of ['null', '1', '"text"', '[]']) expect(decodeSession(raw, id)).toBeNull();
	});
});

// E6: an open History tab re-read, re-sent and re-decoded every session after each write.
describe('the history view cache', () => {
	const session: SavedSession = {
		version: 1,
		id,
		startedAt: start.toISOString(),
		savedAt: start.toISOString(),
		endedAt: null,
		durationMs: 1000,
		mode: 'translate',
		sourceLanguage: 'auto',
		targetLanguage: 'fr',
		lines: [line]
	};
	const older = { ...session, id: id2, startedAt: '2026-09-18T10:00:00.000Z' };
	const file = (s: SavedSession) => encodeSessionLog(s);
	const fresh = (...sessions: SavedSession[]) => ({
		sessions: sessions.map((s) => ({ id: s.id, length: file(s).length, contents: file(s) })),
		removed: []
	});

	it('decodes a session once and keeps the same object while its file is unchanged', () => {
		const decode = vi.fn(decodeSession);
		const cache = createHistoryCache(decode);
		expect(cache.known()).toEqual([]);
		const first = cache.apply(fresh(older, session));
		expect(first.map((e) => e.id)).toEqual([id, id2]);
		expect(decode).toHaveBeenCalledTimes(2);
		expect(cache.known()).toEqual(
			expect.arrayContaining([
				[id, file(session).length],
				[id2, file(older).length]
			])
		);

		const again = cache.apply({
			sessions: cache.known().map(([id, length]) => ({ id, length })),
			removed: []
		});
		expect(decode).toHaveBeenCalledTimes(2);
		// The very same objects, so the search's WeakMap keeps their folded text.
		expect(again[0].session).toBe(first[0].session);
		expect(again[1].session).toBe(first[1].session);
	});

	it('decodes only a session whose file has grown, and drops one that has gone', () => {
		const decode = vi.fn(decodeSession);
		const cache = createHistoryCache(decode);
		const [kept] = cache.apply(fresh(older)).map((e) => e.session);
		const grown =
			file(session) + encodeSessionAppend({ ...session, lines: [{ ...line, id: 2 }, line] }, 1);
		decode.mockClear();
		const entries = cache.apply({
			sessions: [
				{ id, length: grown.length, contents: grown },
				{ id: id2, length: file(older).length }
			],
			removed: []
		});
		expect(decode).toHaveBeenCalledOnce();
		expect(decode).toHaveBeenCalledWith(grown, id);
		expect(entries.find((e) => e.id === id)?.session?.lines).toHaveLength(2);
		expect(entries.find((e) => e.id === id2)?.session).toBe(kept);

		expect(cache.apply({ sessions: [{ id, length: grown.length }], removed: [id2] })).toHaveLength(
			1
		);
		expect(cache.known()).toEqual([[id, grown.length]]);
	});

	it('reads a forgotten session again rather than claiming to hold it', () => {
		const cache = createHistoryCache();
		cache.apply(fresh(session));
		cache.forget(id);
		expect(cache.known()).toEqual([]);
		// A listing that crossed the forget still names it as unchanged: left out, not kept stale.
		expect(cache.apply({ sessions: [{ id, length: 1 }], removed: [] })).toEqual([]);
	});

	it('keeps an unreadable file listed, so it can still be deleted', () => {
		const cache = createHistoryCache();
		const [entry] = cache.apply({ sessions: [{ id, length: 1, contents: '{' }], removed: [] });
		expect(entry).toEqual({ id, length: 1, session: null });
	});
});
