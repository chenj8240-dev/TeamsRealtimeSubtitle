import { beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
const mocks = vi.hoisted(() => ({ save: vi.fn(), clear: vi.fn() }));
vi.mock('./tauri', () => ({ api: { saveTranscript: mocks.save }, isTauri: () => true }));
vi.mock('./recovery', () => ({ recovery: { clear: mocks.clear } }));
import { saveTranscriptDocument } from './saveDocument';
import { clearTranscript, transcript, transcriptDirty, savedPath } from './stores';
const line = {
	id: 1,
	text: 'Bonjour',
	sourceText: '',
	origin: 'microphone' as const,
	startMs: 0,
	endMs: 500
};
beforeEach(() => {
	vi.clearAllMocks();
	clearTranscript();
	transcript.set([line]);
});
it('cancel preserves dirty state, saved path and recovery', async () => {
	mocks.save.mockResolvedValue(null);
	expect(await saveTranscriptDocument('text')).toBe('');
	expect(get(transcriptDirty)).toBe(true);
	expect(get(savedPath)).toBe('');
	expect(mocks.clear).not.toHaveBeenCalled();
});
it('captions arriving while the dialog is open remain dirty and recoverable', async () => {
	mocks.save.mockImplementation(async () => {
		transcript.set([{ ...line, id: 2, text: 'New' }, line]);
		return 'D:\\Chosen\\transcript.txt';
	});
	await saveTranscriptDocument('text');
	expect(get(transcriptDirty)).toBe(true);
	expect(mocks.clear).not.toHaveBeenCalled();
	expect(mocks.save.mock.calls[0][0]).not.toContain('New');
});
it('a successful save records the chosen destination and retires recovery', async () => {
	mocks.save.mockResolvedValue('D:\\Chosen\\captions.srt');
	await saveTranscriptDocument('srt');
	expect(get(savedPath)).toBe('D:\\Chosen\\captions.srt');
	expect(get(transcriptDirty)).toBe(false);
	expect(mocks.clear).toHaveBeenCalledOnce();
});
