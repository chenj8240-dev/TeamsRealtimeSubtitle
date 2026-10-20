import { beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { validateDevices } from './audioDevices';
import { createPreflightController } from './preflightController.svelte';
import { api } from './tauri';
import { options, statusMessage } from './stores';
import { DEFAULT_START_OPTIONS } from './startOptions';

const mic = { id: 'mic-1', name: 'USB mic', isDefault: true };
const output = { id: 'render-1', name: 'Dock speakers', isDefault: true };

it('output endpoint changes do not alter application capture settings', () => {
	const current = {
		...DEFAULT_START_OPTIONS,
		systemDeviceId: 'unused-output',
		systemCapture: { kind: 'application' as const, process: { pid: 100, createdAt: '1000' } }
	};
	const validated = validateDevices(current, [], []);
	expect(validated.systemCapture).toEqual(current.systemCapture);
	expect(validated.systemDeviceId).toBe('unused-output');
});

it('application capture passes a stable process identity and never falls back when missing', async () => {
	const process = { pid: 100, createdAt: '987654321' };
	const startAudioTest = vi.fn();
	const listApplications = vi
		.fn()
		.mockResolvedValue({ supported: true, applications: [{ process, name: 'Meeting' }] });
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{
			...api,
			startAudioTest,
			listApplications
		}
	);
	options.set({ ...get(options), source: 'both', systemCapture: { kind: 'application', process } });
	await probe.refreshApplications();
	expect(probe.applicationReady(get(options))).toBe(true);
	await probe.startAudioTest();
	expect(startAudioTest).toHaveBeenCalledWith('both', mic.id, output.id, {
		kind: 'application',
		process
	});
	listApplications.mockResolvedValue({
		supported: true,
		applications: [{ process: { ...process, createdAt: 'different' }, name: 'Unrelated app' }]
	});
	await probe.refreshApplications();
	expect(probe.applicationReady(get(options))).toBe(false);
	await probe.startAudioTest();
	expect(startAudioTest).toHaveBeenCalledTimes(1);
	expect(get(options).systemCapture).toEqual({ kind: 'application', process });
	probe.dispose();
});

it('unsupported Windows leaves the application mode selected and blocks capture', async () => {
	const startAudioTest = vi.fn();
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{
			...api,
			startAudioTest,
			listApplications: vi.fn().mockResolvedValue({ supported: false, applications: [] })
		}
	);
	options.set({
		...get(options),
		source: 'system',
		systemCapture: { kind: 'application', process: null }
	});
	await probe.refreshApplications();
	await probe.startAudioTest();
	expect(startAudioTest).not.toHaveBeenCalled();
	expect(get(options).systemCapture?.kind).toBe('application');
	probe.dispose();
});
beforeEach(() => {
	options.set({
		...DEFAULT_START_OPTIONS,
		provider: 'gemini',
		micDeviceId: mic.id,
		systemDeviceId: output.id
	});
	statusMessage.set('');
});

it('migrates unique legacy names and resolves duplicate names by stable id', () => {
	const legacy = { ...DEFAULT_START_OPTIONS, micDeviceName: mic.name };
	expect(validateDevices(legacy, [mic], []).micDeviceId).toBe(mic.id);
	expect(validateDevices(legacy, [mic, { ...mic, id: 'mic-2' }], []).micDeviceId).toBeNull();
	expect(
		validateDevices({ ...legacy, micDeviceId: 'mic-2' }, [mic, { ...mic, id: 'mic-2' }], [])
			.micDeviceId
	).toBe('mic-2');
});

it('repairs missing remembered endpoints only when idle', async () => {
	let locked = true;
	const probe = createPreflightController(
		true,
		{ locked: () => locked },
		{
			...api,
			listMicrophones: vi.fn().mockResolvedValue([]),
			listOutputs: vi.fn().mockResolvedValue([])
		}
	);
	await probe.refresh();
	expect(get(options).micDeviceId).toBe(mic.id);
	expect(get(options).systemDeviceId).toBe(output.id);
	locked = false;
	probe.validateSelection();
	expect(get(options).micDeviceId).toBeNull();
	expect(get(options).systemDeviceId).toBeNull();
	expect(get(statusMessage)).not.toBe('');
});

it('updates a default-change notification without rewriting an explicit selection', async () => {
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{
			...api,
			listMicrophones: vi.fn().mockResolvedValue([mic]),
			listOutputs: vi.fn().mockResolvedValue([
				{ ...output, isDefault: false },
				{ ...output, id: 'render-2', isDefault: true }
			])
		}
	);
	await probe.refresh();
	expect(probe.outputs.find((device) => device.isDefault)?.id).toBe('render-2');
	expect(get(options).systemDeviceId).toBe('render-1');
});

it('coalesces overlapping refreshes and processes a change received during enumeration', async () => {
	let resolve!: (value: (typeof mic)[]) => void;
	const listMicrophones = vi
		.fn()
		.mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		)
		.mockResolvedValue([]);
	const probe = createPreflightController(
		true,
		{ locked: () => true },
		{
			...api,
			listMicrophones,
			listOutputs: vi.fn().mockResolvedValue([output])
		}
	);
	const first = probe.refresh();
	await probe.refresh();
	await probe.refresh();
	expect(listMicrophones).toHaveBeenCalledTimes(1);
	resolve([mic]);
	await first;
	expect(listMicrophones).toHaveBeenCalledTimes(2);
	expect(probe.microphones).toEqual([]);
	expect(probe.refreshing).toBe(false);
});

it('does not apply delayed enumeration after teardown or erase choices on an enumeration error', async () => {
	const listOutputs = vi.fn().mockRejectedValue(new Error('Unavailable'));
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{
			...api,
			listMicrophones: vi.fn().mockResolvedValue([]),
			listOutputs
		}
	);
	await probe.refresh();
	expect(get(options).systemDeviceId).toBe(output.id);
	let resolve!: (value: (typeof output)[]) => void;
	listOutputs.mockImplementation(
		() =>
			new Promise((done) => {
				resolve = done;
			})
	);
	const pending = probe.refresh();
	probe.dispose();
	resolve([output]);
	await pending;
	expect(probe.outputs).toEqual([]);
});

it('passes the chosen endpoints to level-only capture', async () => {
	const startAudioTest = vi.fn().mockResolvedValue(undefined);
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{ ...api, startAudioTest }
	);
	await probe.startAudioTest();
	expect(startAudioTest).toHaveBeenCalledWith(get(options).source, mic.id, output.id, undefined);
});
