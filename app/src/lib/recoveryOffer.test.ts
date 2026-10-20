import { get } from 'svelte/store';
import { beforeEach, expect, it, vi } from 'vitest';
import { encodeRecovery } from './document';
import { createRecoveryOffer } from './recoveryOffer.svelte';
import { clearTranscript, statusMessage, transcript } from './stores';
import type { StoredRecovery, TranscriptLine } from './types';

const lines: TranscriptLine[] = [
	{ id: 2, text: 'Second', sourceText: '', origin: 'microphone' },
	{ id: 1, text: 'First', sourceText: '', origin: 'system' }
];

function port(stored: StoredRecovery | null | Error) {
	return {
		read: vi.fn(async () => {
			if (stored instanceof Error) throw stored;
			return stored;
		}),
		clear: vi.fn(async () => {})
	};
}

beforeEach(() => {
	clearTranscript();
	statusMessage.set('');
});

it('offers a readable spool and restores it on request, retiring the file', async () => {
	const fake = port({ contents: encodeRecovery(lines, new Date()), path: 'C:\\spool.json' });
	const offer = createRecoveryOffer(fake);
	await offer.load();
	expect(offer.offer?.snapshot.lines).toHaveLength(2);
	expect(offer.offer?.path).toBe('C:\\spool.json');
	await offer.answer(true);
	expect(get(transcript).map((line) => line.text)).toEqual(['Second', 'First']);
	expect(offer.offer).toBeNull();
	expect(fake.clear).toHaveBeenCalledOnce();
});

it('retires the spool without restoring when the operator declines', async () => {
	const fake = port({ contents: encodeRecovery(lines, new Date()), path: 'spool' });
	const offer = createRecoveryOffer(fake);
	await offer.load();
	await offer.answer(false);
	expect(get(transcript)).toEqual([]);
	expect(fake.clear).toHaveBeenCalledOnce();
});

it('clears an unreadable spool instead of offering it', async () => {
	const fake = port({ contents: '{"truncated', path: 'spool' });
	const offer = createRecoveryOffer(fake);
	await offer.load();
	expect(offer.offer).toBeNull();
	expect(fake.clear).toHaveBeenCalledOnce();
});

it('offers nothing when there is no spool, and reports a read failure', async () => {
	const empty = createRecoveryOffer(port(null));
	await empty.load();
	expect(empty.offer).toBeNull();
	const failing = createRecoveryOffer(port(new Error('disk gone')));
	await failing.load();
	expect(get(statusMessage)).toBe('disk gone');
});

// What the core rejects with: kept whole for the status line to word, never flattened.
it('keeps a failure the core reports structured, reading and retiring alike', async () => {
	const unreadable = { id: 'error.recoveryRead', detail: 'C:\\spool.json — Access is denied.' };
	const reading = createRecoveryOffer({
		read: vi.fn().mockRejectedValue(unreadable),
		clear: vi.fn()
	});
	await reading.load();
	expect(get(statusMessage)).toEqual(unreadable);

	const locked = { id: 'error.recoveryDelete', detail: 'C:\\spool.json — file is locked' };
	const fake = port({ contents: encodeRecovery(lines, new Date()), path: 'C:\\spool.json' });
	fake.clear.mockRejectedValue(locked);
	const answering = createRecoveryOffer(fake);
	await answering.load();
	await answering.answer(false);
	expect(get(statusMessage)).toEqual(locked);
});
