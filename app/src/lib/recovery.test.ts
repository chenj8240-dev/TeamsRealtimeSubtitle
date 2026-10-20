import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError } from './errors';
import { en } from './i18n/en';
import {
	createRecoveryCoordinator,
	RECOVERY_INTERVAL_MS,
	spoolFailure,
	startRecoverySpool
} from './recovery';
import type { TranscriptLine } from './types';

const lines: TranscriptLine[] = [{ id: 1, text: 'caption', sourceText: '', origin: 'microphone' }];
const port = () => ({
	writeRecovery: vi.fn().mockResolvedValue('snapshot.json'),
	clearRecovery: vi.fn().mockResolvedValue(undefined),
	readRecovery: vi.fn().mockResolvedValue(null)
});

afterEach(() => vi.useRealTimers());

describe('recovery coordination', () => {
	it('waits for an active write, skips queued obsolete text, then deletes', async () => {
		const io = port();
		let finish!: (path: string) => void;
		io.writeRecovery.mockReturnValueOnce(
			new Promise<string>((resolve) => {
				finish = resolve;
			})
		);
		const recovery = createRecoveryCoordinator(io);
		const active = recovery.write(lines);
		await Promise.resolve();
		const obsolete = recovery.write([{ ...lines[0], id: 2 }]);
		const clear = recovery.clear();
		expect(io.clearRecovery).not.toHaveBeenCalled();
		finish('snapshot.json');
		await Promise.all([active, obsolete, clear]);
		expect(io.writeRecovery).toHaveBeenCalledTimes(1);
		expect(io.clearRecovery).toHaveBeenCalledTimes(1);
	});

	it('can protect the same unsaved revision again after deletion', async () => {
		const io = port();
		const recovery = createRecoveryCoordinator(io);
		await recovery.write(lines);
		await recovery.write(lines);
		expect(io.writeRecovery).toHaveBeenCalledTimes(1);
		await recovery.clear();
		await recovery.write(lines);
		expect(io.writeRecovery).toHaveBeenCalledTimes(2);
	});

	it('a failed write does not prevent deletion or a later retry', async () => {
		const io = port();
		io.writeRecovery.mockRejectedValueOnce(new Error('disk full'));
		const recovery = createRecoveryCoordinator(io);
		await expect(recovery.write(lines)).rejects.toThrow('disk full');
		await recovery.clear();
		await recovery.write(lines);
		expect(io.clearRecovery).toHaveBeenCalledTimes(1);
		expect(io.writeRecovery).toHaveBeenCalledTimes(2);
	});

	it('disabling the timer and clearing cannot leave its active write behind', async () => {
		vi.useFakeTimers();
		const io = port();
		let finish!: (path: string) => void;
		io.writeRecovery.mockReturnValueOnce(
			new Promise<string>((resolve) => {
				finish = resolve;
			})
		);
		const recovery = createRecoveryCoordinator(io);
		const onError = vi.fn();
		const stop = startRecoverySpool(() => lines, onError, recovery);
		await vi.advanceTimersByTimeAsync(RECOVERY_INTERVAL_MS);
		stop();
		const clear = recovery.clear();
		finish('snapshot.json');
		await clear;
		await vi.advanceTimersByTimeAsync(RECOVERY_INTERVAL_MS * 3);
		expect(io.writeRecovery).toHaveBeenCalledTimes(1);
		expect(io.clearRecovery).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
	});
});

describe('a failed spool write', () => {
	// The structure survives, so the status line words it in whichever language is showing.
	it('passes on what the core reported', async () => {
		vi.useFakeTimers();
		const io = port();
		const failure = { id: 'error.recoveryWrite', detail: 'C:\\recovery — disk full' };
		io.writeRecovery.mockRejectedValueOnce(failure);
		const onError = vi.fn();
		const stop = startRecoverySpool(() => lines, onError, createRecoveryCoordinator(io));
		await vi.advanceTimersByTimeAsync(RECOVERY_INTERVAL_MS);
		stop();
		expect(onError).toHaveBeenCalledWith(failure);
		expect(spoolFailure(failure)).toBe(failure);
	});

	it('is still reported as the spool’s when something else stopped it', () => {
		expect(spoolFailure(new Error('IPC closed'))).toEqual({
			id: 'error.recoveryWrite',
			detail: 'IPC closed'
		});
		expect(describeError(spoolFailure('IPC closed'), en)).toBe(
			'The recovery copy could not be written (IPC closed)'
		);
	});
});
