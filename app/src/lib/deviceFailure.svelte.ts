// A capture device that failed mid-session, and the operator's ways back: start again on the
// same device, fall back to the Windows default, or pick the captured application again once
// its process has gone.

import { get } from 'svelte/store';
import { isAppError } from './errors';
import { isRunning, options } from './stores';
import type { Origin, StartOptions, StatusUpdate } from './types';

const CAPTURE_FAILURES = ['error.micCapture', 'error.micStream', 'error.systemCapture'];

/** The source a status reports as having lost its capture device, or null. A status without
 *  an origin is attributed by its error id. */
export function failedSource(status: StatusUpdate): Origin | null {
	if (status.state !== 'error' || !isAppError(status.message)) return null;
	if (!CAPTURE_FAILURES.includes(status.message.id)) return null;
	return status.origin ?? (status.message.id === 'error.systemCapture' ? 'system' : 'microphone');
}

export interface DeviceFailureDeps {
	stop: () => Promise<unknown>;
	start: (options: StartOptions) => Promise<unknown>;
	/** Re-list capturable applications after the chosen one has gone. */
	refreshApplications: () => Promise<unknown>;
}

export function createDeviceFailure({ stop, start, refreshApplications }: DeviceFailureDeps) {
	let failed = $state<Origin | null>(null);
	let retrying = $state(false);

	function noteStatus(status: StatusUpdate) {
		const origin = failedSource(status);
		if (origin) failed = origin;
	}

	/** Start again, on the same device or (`fallback`) on the Windows default. */
	async function retry(fallback: boolean) {
		if (!failed || retrying) return;
		retrying = true;
		const affected = failed;
		// Snapshot before stopping: idle validation must not change an explicit Retry into an
		// implicit fallback if the chosen endpoint is still absent.
		const selected = { ...get(options) };
		try {
			await stop();
			if (get(isRunning)) return;
			if (fallback) {
				if (affected === 'microphone') {
					selected.micDeviceId = null;
					selected.micDeviceName = null;
				} else selected.systemDeviceId = null;
			}
			options.set(selected);
			failed = null;
			await start(selected);
		} finally {
			retrying = false;
		}
	}

	/** The captured application has exited: stop, keep capture scoped to an application, and
	 *  ask for it again rather than widening to the whole output device. */
	async function reselectApplication() {
		await stop();
		if (get(isRunning)) return;
		failed = null;
		options.update((current) => ({
			...current,
			systemCapture: { kind: 'application', process: null }
		}));
		await refreshApplications();
	}

	return {
		get failed() {
			return failed;
		},
		get retrying() {
			return retrying;
		},
		noteStatus,
		clear() {
			failed = null;
		},
		retry,
		reselectApplication
	};
}
