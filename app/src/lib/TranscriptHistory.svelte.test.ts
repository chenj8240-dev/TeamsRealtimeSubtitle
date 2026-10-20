import { matchesSession } from './historySearch';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import TranscriptHistory from './TranscriptHistory.svelte';
import { locale } from './i18n';
import { api } from './tauri';
import {
	historyEnabled,
	historyError,
	encodeSessionLog,
	historyRevision,
	sessionHistory,
	type HistoryListing,
	type SavedSession
} from './history';
import { transcript, clearTranscript } from './stores';

vi.mock('./tauri', () => ({
	isTauri: () => true,
	api: {
		listHistory: vi.fn(),
		deleteHistory: vi.fn(),
		writeHistory: vi.fn(),
		saveTranscript: vi.fn()
	}
}));
const saved: SavedSession = {
	version: 1,
	id: '12345678-1234-1234-1234-123456789abc',
	startedAt: '2026-09-19T10:00:00Z',
	savedAt: '2026-09-19T10:01:00Z',
	endedAt: '2026-09-19T10:01:00Z',
	durationMs: 60000,
	mode: 'translate',
	sourceLanguage: 'auto',
	targetLanguage: 'fr',
	lines: [
		{
			id: 1,
			text: 'Um, hello.',
			sourceText: 'Euh, bonjour.',
			origin: 'system',
			startMs: 0,
			endMs: 1000
		}
	]
};
/** What `list_history` answers for files the view does not hold yet. */
function listing(...files: { id: string; contents: string }[]): HistoryListing {
	return {
		sessions: files.map(({ id, contents }) => ({ id, length: contents.length, contents })),
		removed: []
	};
}
beforeEach(() => {
	locale.set('en');
	historyEnabled.set(false);
	historyError.set('');
	clearTranscript();
	vi.mocked(api.listHistory).mockResolvedValue(
		listing({ id: saved.id, contents: JSON.stringify(saved) })
	);
	vi.mocked(api.saveTranscript).mockResolvedValue('saved.txt');
});

it('filters history with both German date fields and resets them', async () => {
	locale.set('de');
	const view = render(TranscriptHistory);
	try {
		await waitFor(() => expect(view.container.querySelector('.session')).not.toBeNull());
		const from = view.getByRole('textbox', { name: 'Ab Datum' });
		const to = view.getByRole('textbox', { name: 'Bis Datum' });
		expect(from).toHaveAttribute('placeholder', 'JJJJ-MM-TT');
		expect(to).toHaveAttribute('placeholder', 'JJJJ-MM-TT');
		await fireEvent.input(from, { target: { value: '2026-09-20' } });
		expect(view.container.querySelector('.session')).toBeNull();
		await fireEvent.input(from, { target: { value: '2026-09-19' } });
		await fireEvent.input(to, { target: { value: '2026-09-19' } });
		expect(view.container.querySelector('.session')).not.toBeNull();
		await fireEvent.input(to, { target: { value: '2026-09-18' } });
		expect(view.container.querySelector('.session')).toBeNull();
		await fireEvent.click(view.getByText('Filter zurücksetzen'));
		expect(from).toHaveValue('');
		expect(to).toHaveValue('');
		expect(view.container.querySelector('.session')).not.toBeNull();
	} finally {
		view.unmount();
		locale.set('en');
	}
});

it('reopens raw history without replacing the live transcript and exports every format', async () => {
	transcript.set([{ ...saved.lines[0], id: 99, text: 'Live session' }]);
	const view = render(TranscriptHistory);
	await waitFor(() => expect(view.container.querySelector('.session')).not.toBeNull());
	await fireEvent.click(view.container.querySelector('.session')!);
	expect(view.getByText('Um, hello.')).toBeTruthy();
	expect(view.getByText('Euh, bonjour.')).toBeTruthy();
	expect(get(transcript)[0].text).toBe('Live session');
	for (const format of ['text', 'markdown', 'srt', 'vtt']) {
		await fireEvent.change(view.getByRole('combobox', { name: 'Export format' }), {
			target: { value: format }
		});
		await fireEvent.click(view.getByText('Save as…'));
		await waitFor(() =>
			expect(api.saveTranscript).toHaveBeenCalledWith(
				expect.stringContaining('Um, hello.'),
				expect.any(String)
			)
		);
	}
	expect(api.saveTranscript).toHaveBeenCalledTimes(4);
	view.unmount();
});

it('copies and deletes a selected session only after confirmation', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
	const deletion = vi.spyOn(sessionHistory, 'delete').mockResolvedValue(undefined);
	const view = render(TranscriptHistory);
	await waitFor(() => expect(view.container.querySelector('.session')).not.toBeNull());
	await fireEvent.click(view.container.querySelector('.session')!);
	await fireEvent.click(view.getByText('Copy transcript'));
	await waitFor(() =>
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Um, hello.'))
	);
	await fireEvent.click(view.getByText('Delete'));
	expect(deletion).not.toHaveBeenCalled();
	vi.mocked(api.listHistory).mockResolvedValue({ sessions: [], removed: [saved.id] });
	await fireEvent.click(view.getByText('Delete permanently'));
	await waitFor(() => expect(view.getByText('No saved sessions yet.')).toBeTruthy());
	expect(deletion).toHaveBeenCalledWith(saved.id);
	deletion.mockRestore();
	view.unmount();
});

// Every finalized line of a recording session lands as a history write. The open tab used to
// re-list the whole folder for each one; it now catches up at most every five seconds.
it('re-lists history at most every few seconds while writes keep landing', async () => {
	const view = render(TranscriptHistory);
	await waitFor(() => expect(api.listHistory).toHaveBeenCalledTimes(1));
	vi.useFakeTimers();
	try {
		for (let write = 0; write < 5; write++) {
			historyRevision.update((n) => n + 1);
			await tick();
		}
		expect(api.listHistory).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5000);
		expect(api.listHistory).toHaveBeenCalledTimes(2);
	} finally {
		vi.useRealTimers();
		view.unmount();
	}
});

it('shows unreadable records and read errors instead of silently losing history', async () => {
	vi.mocked(api.listHistory).mockResolvedValue(listing({ id: saved.id, contents: '{' }));
	const view = render(TranscriptHistory);
	await waitFor(() => expect(view.getByText('Unreadable session', { exact: false })).toBeTruthy());
	vi.mocked(api.listHistory).mockRejectedValue(new Error('Access denied'));
	await fireEvent.click(view.getByText('Refresh'));
	await waitFor(() => expect(view.getByRole('alert').textContent).toContain('Access denied'));
	view.unmount();
});

// The core rejects with an id and a detail, which `String()` turned into "[object Object]".
it('words what the core reports in the interface language, whichever way it arrives', async () => {
	const failure = { id: 'error.historyStorage', detail: 'C:\\History — Access is denied.' };
	vi.mocked(api.listHistory).mockRejectedValue(failure);
	const view = render(TranscriptHistory);
	try {
		// A failed listing, caught by the view itself.
		await waitFor(() =>
			expect(view.getByRole('alert').textContent).toBe(
				'Transcript history could not be updated. The history folder could not be read or changed (C:\\History — Access is denied.)'
			)
		);
		// A failed save, from the store the history writer reports to.
		historyError.set(failure);
		await waitFor(() => expect(view.getAllByRole('alert')).toHaveLength(2));
		// Kept structured, so both follow a change of interface language.
		locale.set('fr');
		await waitFor(() => {
			for (const alert of view.getAllByRole('alert'))
				expect(alert.textContent).toContain(
					'Le dossier de l’historique n’a pu être ni lu ni modifié (C:\\History — Access is denied.)'
				);
		});
		expect(view.container.textContent).not.toContain('[object Object]');
	} finally {
		view.unmount();
		locale.set('en');
	}
});

it('words a failed export from a saved session', async () => {
	vi.mocked(api.saveTranscript).mockRejectedValue({
		id: 'error.transcriptWrite',
		detail: 'D:\\Docs — Access is denied.'
	});
	const view = render(TranscriptHistory);
	await waitFor(() => expect(view.container.querySelector('.session')).not.toBeNull());
	await fireEvent.click(view.container.querySelector('.session')!);
	await fireEvent.click(view.getByText('Save as…'));
	await waitFor(() =>
		expect(view.getByRole('alert').textContent).toContain(
			'The transcript could not be written (D:\\Docs — Access is denied.)'
		)
	);
	view.unmount();
});

it('searches titles, original source and translated text with inclusive local dates', () => {
	const filter = { query: 'BONJOUR', from: '', to: '', language: 'fr' };
	expect(matchesSession(saved, filter)).toBe(true);
	expect(matchesSession({ ...saved, title: 'Workshop' }, { ...filter, query: 'workshop' })).toBe(
		true
	);
	expect(matchesSession(saved, { ...filter, language: 'en' })).toBe(false);
	expect(matchesSession(saved, { ...filter, from: '2099-01-01' })).toBe(false);
	const localDate = new Date(saved.startedAt);
	const day = [
		localDate.getFullYear(),
		String(localDate.getMonth() + 1).padStart(2, '0'),
		String(localDate.getDate()).padStart(2, '0')
	].join('-');
	expect(matchesSession(saved, { ...filter, from: day, to: day })).toBe(true);
});
it('filters the session list and saves a title without changing raw text', async () => {
	const rename = vi.spyOn(sessionHistory, 'rename').mockResolvedValue();
	const view = render(TranscriptHistory);
	await waitFor(() => expect(view.container.querySelector('.session')).not.toBeNull());
	await fireEvent.input(view.getByLabelText('Search titles and transcript text'), {
		target: { value: 'missing' }
	});
	expect(view.getByText('No matching sessions.')).toBeTruthy();
	await fireEvent.click(view.getByText('Clear filters'));
	expect(view.getByLabelText('Search titles and transcript text')).toHaveValue('');
	expect(view.container.querySelector('.session')).not.toBeNull();
	await fireEvent.input(view.getByLabelText('Search titles and transcript text'), {
		target: { value: 'bonjour' }
	});
	await fireEvent.click(view.container.querySelector('.session')!);
	await fireEvent.input(view.getByLabelText('Session title'), { target: { value: 'Workshop' } });
	await fireEvent.click(view.getByText('Save title'));
	await waitFor(() =>
		expect(rename).toHaveBeenCalledWith(expect.objectContaining({ lines: saved.lines }), 'Workshop')
	);
	// Renaming a file from before the log format rewrites it, possibly at the same length, so
	// the renamed session is read again rather than claimed as held.
	await waitFor(() => expect(view.getByText('Session title saved.')).toBeTruthy());
	expect(vi.mocked(api.listHistory).mock.lastCall![0]).toEqual([]);
	rename.mockRestore();
	view.unmount();
});

it('allows explicit deletion of an unreadable record from the detail pane', async () => {
	vi.mocked(api.listHistory).mockResolvedValue(listing({ id: saved.id, contents: '{' }));
	const deletion = vi.spyOn(sessionHistory, 'delete').mockResolvedValue();
	const view = render(TranscriptHistory);
	await waitFor(() => expect(view.container.querySelector('.session')).not.toBeNull());
	await fireEvent.click(view.container.querySelector('.session')!);
	await fireEvent.click(view.getByText('Delete'));
	expect(deletion).not.toHaveBeenCalled();
	vi.mocked(api.listHistory).mockResolvedValue({ sessions: [], removed: [saved.id] });
	await fireEvent.click(view.getByText('Delete permanently'));
	await waitFor(() => expect(deletion).toHaveBeenCalledWith(saved.id));
	deletion.mockRestore();
	view.unmount();
});

// E6: every history write used to make an open tab read, send and decode every session again.
it('lists by what it already holds and keeps sessions the core says are unchanged', async () => {
	const contents = JSON.stringify(saved);
	const view = render(TranscriptHistory);
	await waitFor(() => expect(view.container.querySelector('.session')).not.toBeNull());
	expect(vi.mocked(api.listHistory).mock.lastCall![0]).toEqual([]);

	vi.mocked(api.listHistory).mockResolvedValue({
		sessions: [{ id: saved.id, length: contents.length }],
		removed: []
	});
	await fireEvent.click(view.getByText('Refresh'));
	await waitFor(() => expect(api.listHistory).toHaveBeenCalledTimes(2));
	expect(vi.mocked(api.listHistory).mock.lastCall![0]).toEqual([[saved.id, contents.length]]);
	await fireEvent.click(view.container.querySelector('.session')!);
	expect(view.getByText('Um, hello.')).toBeTruthy();

	vi.mocked(api.listHistory).mockResolvedValue({ sessions: [], removed: [saved.id] });
	await fireEvent.click(view.getByText('Refresh'));
	await waitFor(() => expect(view.getByText('No saved sessions yet.')).toBeTruthy());
	view.unmount();
});

// D18: a session captioned in two languages was listed, and filtered, by its first alone.
it('lists and filters a two-language session by both of its caption languages', async () => {
	// Written as a log: the second language arrived after the log format, so only logs have one.
	const both: SavedSession = { ...saved, secondTargetLanguage: 'de' };
	vi.mocked(api.listHistory).mockResolvedValue(
		listing({ id: both.id, contents: encodeSessionLog(both) })
	);
	const view = render(TranscriptHistory);
	await waitFor(() => expect(view.container.querySelector('.session')).not.toBeNull());
	expect(view.container.querySelector('.session')).toHaveTextContent(
		'Auto-detected speech → FR + DE'
	);
	const language = view.getByRole('combobox', { name: 'Caption language' });
	for (const [code, shown] of [
		['de', true],
		['fr', true],
		['en', false]
	] as const) {
		await fireEvent.change(language, { target: { value: code } });
		expect(view.container.querySelector('.session') !== null).toBe(shown);
	}
	view.unmount();
});

it('matches either caption language, and sessions saved before the second existed', () => {
	const filter = { query: '', from: '', to: '', language: 'de' };
	expect(matchesSession({ ...saved, secondTargetLanguage: 'de' }, filter)).toBe(true);
	expect(matchesSession({ ...saved, secondTargetLanguage: null }, filter)).toBe(false);
	// Older files carry no second language at all.
	expect(matchesSession(saved, { ...filter, language: 'fr' })).toBe(true);
	expect(matchesSession(saved, filter)).toBe(false);
	// Subtitles are filed under the language spoken.
	const subtitles: SavedSession = { ...saved, mode: 'transcribe', targetLanguage: null };
	expect(
		matchesSession({ ...subtitles, sourceLanguage: 'en' }, { ...filter, language: 'en' })
	).toBe(true);
	expect(matchesSession(subtitles, { ...filter, language: 'auto' })).toBe(true);
});
