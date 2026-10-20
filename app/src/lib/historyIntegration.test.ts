import { afterEach, expect, it, vi } from 'vitest';
import { beginSession, pushCaption, clearTranscript, applyStatus } from './stores';
import { historyEnabled, sessionHistory, decodeSession } from './history';
import { api } from './tauri';
import type { Caption } from './types';

afterEach(async () => {
	await sessionHistory.flush();
	historyEnabled.set(false);
	clearTranscript();
	vi.restoreAllMocks();
});

it('archives each run independently of clear and the combined document timeline, including trailing partials', async () => {
	const files = new Map<string, string>();
	vi.spyOn(api, 'writeHistory').mockImplementation(async (id, raw) => {
		files.set(id, raw);
	});
	historyEnabled.set(true);
	const caption: Caption = {
		turnId: 1,
		text: 'Um, first',
		sourceText: 'Euh, premier',
		origin: 'system',
		final: true,
		startMs: 0,
		endMs: 1000
	};
	beginSession();
	pushCaption(caption);
	await sessionHistory.finish();
	beginSession();
	pushCaption({ ...caption, text: 'Second', final: false });
	applyStatus({ state: 'idle' });
	await sessionHistory.finish();
	clearTranscript();
	const saved = [...files].map(([id, raw]) => decodeSession(raw, id)!);
	expect(saved).toHaveLength(2);
	expect(saved.map((s) => s.lines.map((l) => l.text))).toEqual([['Um, first'], ['Second']]);
	expect(saved.map((s) => s.lines[0].startMs)).toEqual([0, 0]);
	expect(saved[0].lines[0].sourceText).toBe('Euh, premier');
});

// A run whose every source ends by itself — a provider failure — has no Stop to close its
// record. It used to stay open until the next Start or quit, which stamped that moment as
// its end and claimed the whole gap as recorded time.
it('closes the record when every source of a run ends by itself', async () => {
	const files = new Map<string, string>();
	vi.spyOn(api, 'writeHistory').mockImplementation(async (id, raw) => {
		files.set(id, raw);
	});
	historyEnabled.set(true);
	beginSession();
	applyStatus({ state: 'running', origin: 'system' });
	pushCaption({
		turnId: 1,
		text: 'Before the failure',
		sourceText: '',
		origin: 'system',
		final: true,
		startMs: 0,
		endMs: 1000
	});
	applyStatus({ state: 'error', origin: 'system' });
	await sessionHistory.flush();
	const [[id, raw]] = [...files];
	expect(decodeSession(raw, id)?.endedAt).not.toBeNull();
});

// Starting a replacement drains the old session, and its Idle can arrive after the new run
// has begun. That stale Idle must not close the new run's record.
it('does not close a new run on the drained session’s late idle', async () => {
	const files = new Map<string, string>();
	vi.spyOn(api, 'writeHistory').mockImplementation(async (id, raw) => {
		files.set(id, raw);
	});
	historyEnabled.set(true);
	beginSession();
	applyStatus({ state: 'idle', origin: 'system' });
	applyStatus({ state: 'running', origin: 'system' });
	pushCaption({
		turnId: 1,
		text: 'Still running',
		sourceText: '',
		origin: 'system',
		final: true,
		startMs: 0,
		endMs: 1000
	});
	await sessionHistory.flush();
	const running = [...files]
		.map(([id, raw]) => decodeSession(raw, id))
		.find((session) => session?.lines.some((line) => line.text === 'Still running'));
	expect(running?.endedAt).toBeNull();
	applyStatus({ state: 'idle' });
});
