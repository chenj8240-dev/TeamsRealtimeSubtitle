import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSetupActions } from './setupActions';
import { languageFavourites, options } from './stores';
import type { StartOptions } from './types';

const base: StartOptions = {
	source: 'both',
	mode: 'translate',
	provider: 'gemini',
	targetLanguage: 'fr',
	micDeviceName: 'Room mic',
	micDeviceId: null
};

function setup(locked = false, whisperRefused = false) {
	const deps = {
		locked: vi.fn(() => locked),
		invalidateAudioTest: vi.fn(),
		refreshDevices: vi.fn(),
		whisperRefused: () => whisperRefused
	};
	return { actions: createSetupActions(deps), deps };
}

beforeEach(() => {
	options.set({ ...base });
	languageFavourites.set(['en', 'fr']);
});

describe('setup actions', () => {
	it('refuses every change while setup is locked', () => {
		const { actions, deps } = setup(true);
		actions.setMode('transcribe');
		actions.setSource('microphone');
		actions.setProvider('openai');
		actions.setTarget('de');
		actions.flipDirection();
		expect(get(options)).toEqual(base);
		expect(deps.invalidateAudioTest).not.toHaveBeenCalled();
	});

	it('switching to subtitles chooses Whisper and keeps the selected audio source', () => {
		const { actions, deps } = setup();
		actions.setMode('transcribe');
		expect(get(options)).toMatchObject({
			mode: 'transcribe',
			provider: 'whisper',
			source: 'both',
			micDeviceName: 'Room mic'
		});
		actions.setMode('translate');
		expect(get(options)).toMatchObject({ mode: 'translate', provider: 'gemini' });
		expect(deps.invalidateAudioTest).toHaveBeenCalledTimes(2);
		expect(deps.refreshDevices).toHaveBeenCalledTimes(2);
	});

	it('only accepts engines that serve the current mode, and re-lists devices for them', () => {
		const { actions, deps } = setup();
		actions.setProvider('mistral');
		expect(get(options).provider).toBe('gemini');
		actions.setProvider('openai');
		expect(get(options).provider).toBe('openai');
		expect(deps.refreshDevices).toHaveBeenCalledOnce();
	});

	it('forgets an audio check only when the source actually changes', () => {
		const { actions, deps } = setup();
		actions.setSource('both');
		expect(deps.invalidateAudioTest).not.toHaveBeenCalled();
		actions.setSource('system');
		expect(get(options).source).toBe('system');
		expect(deps.invalidateAudioTest).toHaveBeenCalledOnce();
	});

	it('keeps the built-in demo on its bundled sample', () => {
		options.set({ ...base, mode: 'transcribe', provider: 'ondevice', source: 'microphone' });
		const { actions } = setup();
		actions.setSource('system');
		expect(get(options).source).toBe('microphone');
		actions.setTarget('fr');
		expect(get(options).targetLanguage).toBe('fr');
	});

	it('leaves the language alone for engines that detect it', () => {
		options.set({ ...base, mode: 'transcribe', provider: 'mistral', targetLanguage: 'en' });
		const { actions } = setup();
		actions.setTarget('fr');
		expect(get(options).targetLanguage).toBe('en');
	});

	// The Store lesson: the first-launch, keyless path must not depend on the reviewer's PC.
	it('never lands on Whisper on a processor that cannot run it', () => {
		const { actions } = setup(false, true);
		actions.setMode('transcribe');
		expect(get(options)).toMatchObject({
			mode: 'transcribe',
			provider: 'ondevice',
			source: 'microphone',
			micDeviceName: null
		});
		actions.setProvider('whisper');
		expect(get(options).provider).toBe('ondevice');
		actions.setProvider('mistral');
		expect(get(options).provider).toBe('mistral');
	});

	it('moves a saved Whisper setup to the demo only when the processor refuses it', () => {
		const whisper: StartOptions = { ...base, mode: 'transcribe', provider: 'whisper' };
		options.set({ ...whisper });
		expect(setup(false, false).actions.avoidUnsupportedWhisper()).toBe(false);
		expect(setup(true, true).actions.avoidUnsupportedWhisper()).toBe(false);
		expect(get(options)).toEqual(whisper);

		const { actions, deps } = setup(false, true);
		expect(actions.avoidUnsupportedWhisper()).toBe(true);
		expect(get(options)).toMatchObject({ provider: 'ondevice', source: 'microphone' });
		expect(deps.invalidateAudioTest).toHaveBeenCalledOnce();
		expect(actions.avoidUnsupportedWhisper()).toBe(false);
	});

	it('offers Whisper translation in translation only, and not on a processor that refuses it', () => {
		const { actions } = setup();
		actions.setProvider('whisper-translate');
		// The French target stays, for the language error to explain rather than to guess.
		expect(get(options)).toMatchObject({ provider: 'whisper-translate', targetLanguage: 'fr' });
		actions.setMode('transcribe');
		actions.setProvider('whisper-translate');
		expect(get(options).provider).toBe('whisper');

		options.set({ ...base });
		setup(false, true).actions.setProvider('whisper-translate');
		expect(get(options).provider).toBe('gemini');
	});

	// The demo cannot translate, so it is no stand-in: the refused engine stays selected, its
	// card says why, and Start waits for the operator to choose a cloud engine.
	it('leaves a refused Whisper translation in place rather than switch mode', () => {
		const translating: StartOptions = {
			...base,
			provider: 'whisper-translate',
			targetLanguage: 'en'
		};
		options.set({ ...translating });
		expect(setup(false, true).actions.avoidUnsupportedWhisper()).toBe(false);
		expect(get(options)).toEqual(translating);
	});

	it('flips between the first two favourites the engine supports', () => {
		const { actions } = setup();
		actions.flipDirection();
		expect(get(options).targetLanguage).toBe('en');
		actions.flipDirection();
		expect(get(options).targetLanguage).toBe('fr');
	});
});
