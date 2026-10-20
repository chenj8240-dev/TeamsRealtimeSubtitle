import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { fireEvent, render, waitFor } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	saveTranscript: vi.fn(),
	clearRecovery: vi.fn()
}));

vi.mock('./tauri', () => ({
	isTauri: () => true,
	api: { saveTranscript: mocks.saveTranscript, clearRecovery: mocks.clearRecovery }
}));

const TranscriptMonitor = (await import('./TranscriptMonitor.svelte')).default;
const {
	clearTranscript,
	exportOriginal,
	recoveryEnabled,
	restoreTranscript,
	transcript,
	transcriptDirty
} = await import('./stores');
const { TRANSCRIPT_WARN_LINES } = await import('./document');
const { exportFormat, EXPORT_FORMAT_KEY } = await import('./exportFormat');
import type { TranscriptLine } from './types';

/** Seed the log the way a recovered or already-running session leaves it: lines present,
 *  newest first, none of them on disk. */
function seed(count: number): TranscriptLine[] {
	const lines: TranscriptLine[] = Array.from({ length: count }, (_, i) => ({
		id: count - i,
		text: `utterance ${count - i}`,
		sourceText: `source ${count - i}`,
		origin: 'microphone'
	}));
	restoreTranscript(lines);
	return lines;
}

function mount(lines: TranscriptLine[]) {
	const onError = vi.fn();
	const view = render(TranscriptMonitor, {
		props: { mode: 'transcribe' as const, transcript: lines, onError }
	});
	return { ...view, onError };
}

beforeEach(() => {
	clearTranscript();
	recoveryEnabled.set(false);
	// A remembered preference now, so one test's choice would otherwise carry into the next.
	exportFormat.set('markdown');
	mocks.saveTranscript.mockResolvedValue('C:\\Docs\\Live-translation\\transcript.md');
	mocks.clearRecovery.mockResolvedValue(undefined);
});

describe('saved / unsaved state', () => {
	it('explains why old untimed recovery cannot be exported as subtitles', async () => {
		const { getByRole, getByText } = mount(seed(2));
		await fireEvent.change(getByRole('combobox', { name: 'Export format' }), {
			target: { value: 'srt' }
		});
		expect(getByRole('button', { name: 'Save as…' })).toBeDisabled();
		expect(getByText(/recovered transcript has no timing/)).toBeInTheDocument();
		await fireEvent.change(getByRole('combobox'), { target: { value: 'text' } });
		expect(getByRole('button', { name: 'Save as…' })).toBeEnabled();
	});
	it('exports the selected timed format through Save As', async () => {
		const lines = seed(1).map((line) => ({ ...line, startMs: 0, endMs: 1000 }));
		restoreTranscript(lines);
		const { getByRole } = mount(lines);
		await fireEvent.change(getByRole('combobox'), { target: { value: 'vtt' } });
		await fireEvent.click(getByRole('button', { name: 'Save as…' }));
		await waitFor(() => expect(mocks.saveTranscript).toHaveBeenCalled());
		const [content, filename] = mocks.saveTranscript.mock.lastCall!;
		expect(content).toMatch(/^WEBVTT/);
		expect(filename).toMatch(/\.vtt$/);
	});
	// The page mounts the monitor once while a session runs and again after it, and each
	// mount used to start from Markdown.
	it('remembers the chosen format when it is mounted again', async () => {
		const lines = seed(1).map((line) => ({ ...line, startMs: 0, endMs: 1000 }));
		restoreTranscript(lines);
		const first = mount(lines);
		await fireEvent.change(first.getByRole('combobox', { name: 'Export format' }), {
			target: { value: 'srt' }
		});
		expect(localStorage.getItem(EXPORT_FORMAT_KEY)).toBe('srt');
		first.unmount();
		const second = mount(lines);
		expect(second.getByRole('combobox', { name: 'Export format' })).toHaveValue('srt');
		await fireEvent.click(second.getByRole('button', { name: 'Save as…' }));
		await waitFor(() => expect(mocks.saveTranscript).toHaveBeenCalled());
		expect(mocks.saveTranscript.mock.lastCall![1]).toMatch(/\.srt$/);
	});
	it('withdraws the clear confirmation when new lines arrive', async () => {
		const { getByRole, rerender } = mount(seed(2));
		await fireEvent.click(getByRole('button', { name: 'Clear' }));
		expect(getByRole('button', { name: 'Discard unsaved lines?' })).toBeInTheDocument();
		await rerender({ mode: 'transcribe', transcript: seed(3), onError: vi.fn() });
		expect(getByRole('button', { name: 'Clear' })).toBeInTheDocument();
		expect(get(transcript)).toHaveLength(3);
	});
	// Issue #25: on screen a transcript that exists only in memory looked exactly like one
	// that was already on disk.
	it('marks a fresh log as unsaved', () => {
		const { getByTestId } = mount(seed(3));
		expect(getByTestId('save-state')).toHaveTextContent('Unsaved');
	});

	it('says nothing about save state when there is no transcript', () => {
		const { queryByTestId } = mount([]);
		expect(queryByTestId('save-state')).toBeNull();
	});

	it('flips to saved and names the file once the write lands', async () => {
		const { getByTestId, getByText } = mount(seed(3));

		await fireEvent.click(getByText('Save as…'));

		await waitFor(() => expect(getByTestId('save-state')).toHaveTextContent('Saved'));
		expect(getByText('C:\\Docs\\Live-translation\\transcript.md')).toBeInTheDocument();
	});

	it('stays saved when the operator saves the same document again', async () => {
		const { getByTestId, getByText } = mount(seed(3));

		await fireEvent.click(getByText('Save as…'));
		await waitFor(() => expect(getByTestId('save-state')).toHaveTextContent('Saved'));
		await fireEvent.click(getByText('Save as…'));

		await waitFor(() => expect(mocks.saveTranscript).toHaveBeenCalledTimes(2));
		expect(getByTestId('save-state')).toHaveTextContent('Saved');
		expect(get(transcriptDirty)).toBe(false);
	});

	it('reports a failed write and stays unsaved', async () => {
		mocks.saveTranscript.mockRejectedValue(new Error('could not create "D:\\Docs"'));
		const { getByTestId, getByText, onError } = mount(seed(2));

		await fireEvent.click(getByText('Save as…'));

		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(expect.stringContaining('could not create'))
		);
		expect(getByTestId('save-state')).toHaveTextContent('Unsaved');
	});
});

describe('discarding', () => {
	// Clear is a data-loss button. With unsaved text behind it, one stray click must not be
	// the whole interaction.
	it('asks once before discarding unsaved lines', async () => {
		const { getByText } = mount(seed(2));

		await fireEvent.click(getByText('Clear'));

		expect(getByText('Discard unsaved lines?')).toBeInTheDocument();
		expect(get(transcript)).toHaveLength(2);

		await fireEvent.click(getByText('Discard unsaved lines?'));
		expect(get(transcript)).toHaveLength(0);
	});

	it('retires the recovery spool along with the text it covered', async () => {
		const { getByText } = mount(seed(2));

		await fireEvent.click(getByText('Clear'));
		await fireEvent.click(getByText('Discard unsaved lines?'));

		await waitFor(() => expect(mocks.clearRecovery).toHaveBeenCalled());
	});

	it('clears a saved log without asking', async () => {
		const { getByText } = mount(seed(2));

		await fireEvent.click(getByText('Save as…'));
		await waitFor(() => expect(get(transcriptDirty)).toBe(false));
		await fireEvent.click(getByText('Clear'));

		expect(get(transcript)).toHaveLength(0);
	});
});

describe('long sessions', () => {
	it('preserves reading position on new text and follows again after Jump to latest', async () => {
		const { getByRole, rerender } = mount(seed(10));
		const log = getByRole('region', { name: 'Transcript' });
		Object.defineProperties(log, {
			scrollHeight: { configurable: true, value: 1000 },
			clientHeight: { configurable: true, value: 180 }
		});
		log.scrollTop = 120;
		await fireEvent.scroll(log);
		await rerender({ mode: 'transcribe', transcript: seed(11), onError: vi.fn() });
		expect(log.scrollTop).toBe(120);
		await fireEvent.click(getByRole('button', { name: 'Jump to latest' }));
		expect(log.scrollTop).toBe(1000);
		expect(log).toHaveFocus();
		Object.defineProperty(log, 'scrollHeight', { value: 1200 });
		await rerender({ mode: 'transcribe', transcript: seed(12), onError: vi.fn() });
		expect(log.scrollTop).toBe(1200);
	});

	// The warning is one of several `role="status"` regions in the component now, so these
	// address it by its text and assert separately that it is a region at all.
	const WARNING = /Nothing is being dropped/;

	it('keeps a log well past the old 1,000-line cap and says it should be saved', () => {
		const lines = seed(TRANSCRIPT_WARN_LINES);
		const { getByText } = mount(lines);

		expect(get(transcript)).toHaveLength(TRANSCRIPT_WARN_LINES);
		expect(getByText(WARNING)).toHaveAttribute('role', 'status');
	});

	it('does not nag about a long session that is already on disk', async () => {
		const { getByText, queryByText } = mount(seed(TRANSCRIPT_WARN_LINES));

		await fireEvent.click(getByText('Save as…'));

		await waitFor(() => expect(queryByText(WARNING)).toBeNull());
	});

	it('stays quiet below the threshold', () => {
		const { queryByText } = mount(seed(TRANSCRIPT_WARN_LINES - 1));
		expect(queryByText(WARNING)).toBeNull();
	});
});

// Issue #24: a save that only turns a badge from "Unsaved" to "Saved" is invisible to a
// screen reader, and the operator saving a transcript is exactly the moment that needs a
// confirmation they can hear.
describe('announcing a save', () => {
	it('reports the path a screen reader would otherwise never hear', async () => {
		const { getByText, container } = mount(seed(3));

		await fireEvent.click(getByText('Save as…'));

		await waitFor(() => {
			const region = container.querySelector('p.sr-only[role="status"]');
			expect(region).toHaveTextContent(/Transcript saved to .*transcript\.md/);
		});
	});

	it('is silent until something has been saved', () => {
		const { container } = mount(seed(3));
		expect(container.querySelector('p.sr-only[role="status"]')).toHaveTextContent('');
	});
});

describe('the recovery opt-in', () => {
	it('is off unless the operator asks for it', () => {
		const { getByRole } = mount(seed(1));
		expect(getByRole('checkbox', { name: /recovery copy/ })).not.toBeChecked();
	});

	it('turns the spool on without touching disk itself', async () => {
		const { getByRole } = mount(seed(1));

		await fireEvent.click(getByRole('checkbox', { name: /recovery copy/ }));

		expect(get(recoveryEnabled)).toBe(true);
		expect(mocks.clearRecovery).not.toHaveBeenCalled();
	});

	// "Disabled" has to mean there is nothing left on disk, not just that nothing more is
	// being written.
	it('deletes what it already wrote when switched back off', async () => {
		recoveryEnabled.set(true);
		const { getByRole } = mount(seed(1));

		await fireEvent.click(getByRole('checkbox', { name: /recovery copy/ }));

		expect(get(recoveryEnabled)).toBe(false);
		await waitFor(() => expect(mocks.clearRecovery).toHaveBeenCalledTimes(1));
	});
});

describe('the bilingual export option', () => {
	it('is offered only when the lines carry original speech, and remembers the choice', async () => {
		exportOriginal.set(false);
		const { getByRole } = mount(seed(2));
		const option = getByRole('checkbox', { name: 'Include original speech' });
		expect(option).not.toBeChecked();
		await fireEvent.click(option);
		expect(get(exportOriginal)).toBe(true);
		exportOriginal.set(false);
	});

	it('is not offered for subtitles, which have no separate original', () => {
		const lines = seed(2).map((line) => ({ ...line, sourceText: '' }));
		const { queryByRole } = mount(lines);
		expect(queryByRole('checkbox', { name: 'Include original speech' })).toBeNull();
	});
});
