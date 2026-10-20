import type { AudioDevice, StartOptions } from './types';

/** Called only while capture is idle. A legacy name migrates only when unambiguous. */
export function validateDevices(
	current: StartOptions,
	microphones: AudioDevice[],
	outputs: AudioDevice[]
): StartOptions {
	const matches = microphones.filter((device) => device.name === current.micDeviceName);
	const micId = current.micDeviceId ?? (matches.length === 1 ? matches[0].id : null);
	return {
		...current,
		micDeviceName: null,
		micDeviceId: microphones.some((device) => device.id === micId) ? micId : null,
		systemDeviceId:
			current.systemCapture?.kind === 'application' ||
			outputs.some((device) => device.id === current.systemDeviceId)
				? current.systemDeviceId
				: null
	};
}
