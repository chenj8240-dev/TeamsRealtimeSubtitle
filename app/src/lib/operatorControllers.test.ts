import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { api } from './tauri';
import { createPreflightController } from './preflightController.svelte';
import { createOverlayController } from './overlayController.svelte';
import { options, overlayFontSize, overlayCaptionWidth, statusMessage } from './stores';
import { DEFAULT_START_OPTIONS } from './startOptions';
import type { StartOptions, WhisperModelInfo } from './types';

beforeEach(() => {
	statusMessage.set('');
});
afterEach(() => {
	vi.useRealTimers();
});

it('expires live signal while retaining verification until the input changes', () => {
	vi.useFakeTimers();
	const probe = createPreflightController(false, { locked: () => false });
	probe.noteLevel({ source: 'microphone', rms: 0.2, peak: 0.4 });
	expect(probe.micSignal).toBe(true);
	vi.advanceTimersByTime(3000);
	expect(probe.micSignal).toBe(false);
	expect(probe.micVerified).toBe(true);
	probe.invalidateAudioTest();
	expect(probe.micVerified).toBe(false);
	probe.dispose();
	expect(vi.getTimerCount()).toBe(0);
});

it('prevents overlapping test starts and leaves native events authoritative', async () => {
	let release!: () => void;
	const startAudioTest = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{ ...api, startAudioTest }
	);
	const starting = probe.startAudioTest();
	await probe.startAudioTest();
	expect(startAudioTest).toHaveBeenCalledTimes(1);
	expect(probe.audioTestBusy).toBe(true);
	probe.applyAudioTest({ active: true });
	probe.applyAudioTest({ active: false, message: 'Device disconnected' });
	release();
	await starting;
	expect(probe.audioTesting).toBe(false);
	expect(probe.audioTestBusy).toBe(false);
	expect(get(statusMessage)).toBe('Device disconnected');
});

it('asks the core once whether this processor can run local Whisper', async () => {
	// A browser preview has no engine to protect and never asks.
	const preview = createPreflightController(false, { locked: () => false });
	expect(preview.whisperCpu).toEqual({ supported: true, missing: [] });
	await preview.refreshWhisperCpu();
	expect(preview.whisperRefused).toBe(false);

	const whisperCpuSupport = vi.fn().mockResolvedValue({
		supported: false,
		missing: ['AVX', 'AVX2', 'FMA', 'F16C', 'BMI2']
	});
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{ ...api, whisperCpuSupport }
	);
	// Unknown until answered: not refused, but not known to be supported either.
	expect(probe.whisperCpu).toBeNull();
	expect(probe.whisperRefused).toBe(false);
	await probe.refreshWhisperCpu();
	expect(probe.whisperRefused).toBe(true);
	expect(probe.whisperCpuMissing).toBe('AVX, AVX2, FMA…');

	// A failed question is not a refusal: the core still checks at Start.
	const failing = createPreflightController(
		true,
		{ locked: () => false },
		{
			...api,
			whisperCpuSupport: vi.fn().mockRejectedValue(new Error('ipc'))
		}
	);
	await failing.refreshWhisperCpu();
	expect(failing.whisperCpu).toEqual({ supported: true, missing: [] });
});

it('lets a capture failure hold the saved devices without refusing an audio test', async () => {
	options.update((value) => ({
		...value,
		provider: 'gemini',
		source: 'microphone',
		micDeviceId: 'unplugged'
	}));
	const startAudioTest = vi.fn().mockResolvedValue(undefined);
	const probe = createPreflightController(
		true,
		{ locked: () => false, holdSelection: () => true },
		{
			...api,
			startAudioTest,
			listMicrophones: vi
				.fn()
				.mockResolvedValue([{ id: 'mic-1', name: 'Available', isDefault: true }]),
			listOutputs: vi.fn().mockResolvedValue([])
		}
	);
	await probe.refresh();
	// The failure banner's Retry still needs the endpoint the operator chose.
	expect(get(options).micDeviceId).toBe('unplugged');
	await probe.startAudioTest();
	expect(startAudioTest).toHaveBeenCalledOnce();
});

it('calls an engine ready only on the key, model or check that belongs to it', async () => {
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{
			...api,
			whisperCpuSupport: vi.fn().mockResolvedValue({ supported: true, missing: [] }),
			onDeviceReadiness: vi.fn().mockResolvedValue({
				ready: true,
				engine: 'built-in-demo',
				state: 'ready',
				canPrepare: false
			})
		}
	);

	const gemini: StartOptions = { ...DEFAULT_START_OPTIONS, mode: 'translate', provider: 'gemini' };
	expect(probe.engineReady(gemini, [])).toBe(false);
	probe.noteKey('gemini', true);
	expect(probe.engineReady(gemini, [])).toBe(true);
	// Switching engines never borrows the previous one's answer while the panel asks again.
	expect(probe.engineReady({ ...gemini, provider: 'openai' }, [])).toBe(false);
	probe.noteKey('gemini', false);
	expect(probe.engineReady(gemini, [])).toBe(false);

	const whisper: StartOptions = { ...DEFAULT_START_OPTIONS, provider: 'whisper' };
	const base: WhisperModelInfo = {
		id: 'base',
		bytes: 1,
		installed: true,
		downloading: false,
		downloadedBytes: 0,
		inUse: false
	};
	// Not until the core has said this processor can run it.
	expect(probe.engineReady(whisper, [base])).toBe(false);
	await probe.refreshWhisperCpu();
	expect(probe.engineReady(whisper, [base])).toBe(true);
	expect(probe.engineReady(whisper, [{ ...base, downloading: true }])).toBe(false);
	expect(probe.engineReady({ ...whisper, whisperModel: 'small' }, [base])).toBe(false);

	const demo: StartOptions = { ...DEFAULT_START_OPTIONS, provider: 'ondevice' };
	expect(probe.engineReady(demo, [])).toBe(false);
	await probe.refreshLocalReadiness();
	expect(probe.engineReady(demo, [])).toBe(true);
});

it('falls back to the default microphone when a saved device disappears', async () => {
	options.update((value) => ({ ...value, provider: 'gemini', micDeviceName: 'Unplugged' }));
	const probe = createPreflightController(
		true,
		{ locked: () => false },
		{
			...api,
			listMicrophones: vi
				.fn()
				.mockResolvedValue([{ id: 'mic-1', name: 'Available', isDefault: true }]),
			listOutputs: vi.fn().mockResolvedValue([])
		}
	);
	await probe.refresh();
	expect(get(options).micDeviceName).toBeNull();
	expect(probe.microphones).toHaveLength(1);
});

it('keeps confirmed move mode when the native click-through command fails', async () => {
	const controller = createOverlayController({
		...api,
		showOverlay: vi.fn().mockResolvedValue(undefined),
		setOverlayClickThrough: vi.fn().mockRejectedValue(new Error('Window unavailable'))
	});
	await controller.toggleMoveOverlay();
	expect(controller.moveOverlay).toBe(false);
	expect(get(statusMessage)).not.toBe('');
});

it('sends the full appearance after edits and handles failed config writes', async () => {
	const setOverlayConfig = vi.fn().mockResolvedValue(undefined);
	const controller = createOverlayController({ ...api, setOverlayConfig });
	controller.setFont(42);
	controller.setCaptionWidth(70);
	expect(setOverlayConfig).toHaveBeenLastCalledWith(
		expect.objectContaining({
			fontSize: get(overlayFontSize),
			captionWidth: get(overlayCaptionWidth),
			captionFace: expect.any(String),
			captionColour: expect.any(String),
			scrimColour: expect.any(String),
			scrimOpacity: expect.any(Number),
			interactive: false
		})
	);
	setOverlayConfig.mockRejectedValue(new Error('Window unavailable'));
	controller.setFont(44);
	await Promise.resolve();
	expect(get(statusMessage)).not.toBe('');
});
