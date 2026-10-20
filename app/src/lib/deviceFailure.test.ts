import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeviceFailure, failedSource } from './deviceFailure.svelte';
import { applyStatus, options } from './stores';
import type { StartOptions } from './types';

const selected: StartOptions = {
	source: 'both',
	mode: 'translate',
	provider: 'gemini',
	targetLanguage: 'fr',
	micDeviceName: 'Room mic',
	micDeviceId: 'mic-1',
	systemDeviceId: 'dock-1',
	systemCapture: { kind: 'output' }
};

function setup() {
	const deps = {
		stop: vi.fn(async () => applyStatus({ state: 'idle' })),
		start: vi.fn(async () => true),
		refreshApplications: vi.fn(async () => {})
	};
	return { failure: createDeviceFailure(deps), deps };
}

beforeEach(() => {
	applyStatus({ state: 'idle' });
	options.set({ ...selected });
});

describe('which source lost its device', () => {
	it('takes the origin from the status, or infers it from the error id', () => {
		const status = (id: string, origin?: 'microphone' | 'system') =>
			failedSource({ state: 'error', message: { id }, origin });
		expect(status('error.micStream', 'system')).toBe('system');
		expect(status('error.systemCapture')).toBe('system');
		expect(status('error.micCapture')).toBe('microphone');
	});

	it('ignores other failures and other states', () => {
		expect(failedSource({ state: 'error', message: { id: 'error.providerStopped' } })).toBeNull();
		expect(failedSource({ state: 'error', message: 'plain text' })).toBeNull();
		expect(failedSource({ state: 'running', origin: 'microphone' })).toBeNull();
	});
});

describe('recovering from a failed device', () => {
	it('retries on the same device', async () => {
		const { failure, deps } = setup();
		failure.noteStatus({
			state: 'error',
			message: { id: 'error.micStream' },
			origin: 'microphone'
		});
		expect(failure.failed).toBe('microphone');
		await failure.retry(false);
		expect(deps.start).toHaveBeenCalledWith(selected);
		expect(failure.failed).toBeNull();
		expect(failure.retrying).toBe(false);
	});

	it('falls back to the default device for the source that failed only', async () => {
		const { failure, deps } = setup();
		failure.noteStatus({ state: 'error', message: { id: 'error.systemCapture' } });
		await failure.retry(true);
		expect(deps.start).toHaveBeenCalledWith({ ...selected, systemDeviceId: null });
		expect(get(options).micDeviceId).toBe('mic-1');
	});

	it('does nothing when no device has failed', async () => {
		const { failure, deps } = setup();
		await failure.retry(true);
		expect(deps.stop).not.toHaveBeenCalled();
	});

	it('reselects an application without widening capture to the whole device', async () => {
		options.set({
			...selected,
			systemCapture: { kind: 'application', process: { pid: 1, createdAt: 'x' } }
		});
		const { failure, deps } = setup();
		failure.noteStatus({ state: 'error', message: { id: 'error.systemCapture' } });
		await failure.reselectApplication();
		expect(get(options).systemCapture).toEqual({ kind: 'application', process: null });
		expect(deps.start).not.toHaveBeenCalled();
		expect(deps.refreshApplications).toHaveBeenCalledOnce();
		expect(failure.failed).toBeNull();
	});
});
