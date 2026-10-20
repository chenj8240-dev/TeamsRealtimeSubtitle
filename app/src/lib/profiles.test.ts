import { expect, it } from 'vitest';
import { decodeProfiles } from './profiles';
import { validateDevices } from './audioDevices';
it('round-trips setup while stripping credentials, rehearsal and stale process identities', () => {
	const [profile] = decodeProfiles(
		JSON.stringify([
			{
				id: 'one',
				name: ' Room ',
				options: {
					source: 'system',
					mode: 'translate',
					provider: 'gemini',
					targetLanguage: 'fr',
					apiKey: 'secret',
					rehearsal: 'en',
					systemCapture: { kind: 'application', process: { pid: 42, createdAt: 'old' } }
				},
				appearance: { pace: 'steady', hold: 8 },
				placement: { x: -1920, y: 30, width: 1000, height: 300 }
			}
		])
	);
	expect(profile.options).toMatchObject({
		source: 'system',
		provider: 'gemini',
		systemCapture: { kind: 'application', process: null }
	});
	expect(profile.options).not.toHaveProperty('apiKey');
	expect(profile.options).not.toHaveProperty('rehearsal');
	expect(profile.name).toBe('Room');
	expect(profile.appearance).toMatchObject({ pace: 'steady', hold: 8 });
	expect(profile.placement?.x).toBe(-1920);
});
it('rejects malformed records and repairs invalid appearance and geometry', () => {
	expect(decodeProfiles('bad')).toEqual([]);
	const records = decodeProfiles(
		JSON.stringify([
			null,
			{
				id: 'one',
				name: 'Test',
				appearance: { fontSize: -999, hold: -4, layout: 'bad', face: 'bad' },
				placement: { x: 1e20, y: 0, width: 0, height: 0 }
			},
			{ id: 'one', name: 'Duplicate' }
		])
	);
	expect(records).toHaveLength(1);
	expect(records[0].placement).toBeNull();
	expect(records[0].appearance.layout).toBe('fit');
	expect(records[0].appearance.hold).toBe(2);
});
it('validates remembered device ids against the current hardware', () => {
	const [p] = decodeProfiles(
		JSON.stringify([
			{
				id: 'one',
				name: 'Test',
				options: {
					source: 'both',
					mode: 'translate',
					provider: 'gemini',
					targetLanguage: 'en',
					micDeviceId: 'gone',
					systemDeviceId: 'present'
				}
			}
		])
	);
	expect(
		validateDevices(p.options, [], [{ id: 'present', name: 'Speakers', isDefault: true }])
	).toMatchObject({ micDeviceId: null, systemDeviceId: 'present' });
});
