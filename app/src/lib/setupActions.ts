// The setup sheet's choices: mode, audio source, caption language and engine, plus the F2
// language flip. Each one is refused while setup is locked, and each keeps the options a
// combination the core accepts, so the sheet never has to know those rules itself.

import { get } from 'svelte/store';
import { nextFavourite } from './languages';
import { languageFavourites, options } from './stores';
import { DEFAULT_START_OPTIONS } from './startOptions';
import { isLocalWhisper, providerCanTranslate } from './providers';
import { canFlipDirection } from './types';
import type { AudioSource, OutputMode, Provider, TargetLanguage } from './types';

export interface SetupDeps {
	/** A session, a start or a profile load is under way. */
	locked: () => boolean;
	/** Forget a passed audio check, because what it tested has changed. */
	invalidateAudioTest: () => void;
	/** Re-list devices after switching to an engine that captures them. */
	refreshDevices: () => void;
	/** This processor cannot run local Whisper (`whisper/cpu.rs`), so it is never chosen. */
	whisperRefused?: () => boolean;
}

/** The built-in demo's single virtual source, applied whenever it becomes the engine. */
const DEMO_SOURCE = { source: 'microphone', micDeviceName: null } as const;

export function createSetupActions({
	locked,
	invalidateAudioTest,
	refreshDevices,
	whisperRefused = () => false
}: SetupDeps) {
	function setSource(source: AudioSource) {
		const current = get(options);
		if (locked()) return;
		if (current.provider === 'ondevice' && source !== 'microphone') return;
		if (source !== current.source) invalidateAudioTest();
		options.set({ ...current, source });
	}

	function setTarget(targetLanguage: TargetLanguage) {
		const current = get(options);
		if (locked()) return;
		// Translation picks the language the room reads; the built-in demo picks its script.
		// The subtitle engines auto-detect, so they have nothing to set.
		if (current.mode !== 'translate' && current.provider !== 'ondevice') return;
		// Choosing the second language as the first swaps the two, which is also what F2 does
		// to a room captioned in both of its favourites.
		const swap =
			targetLanguage === current.secondTargetLanguage
				? { secondTargetLanguage: current.targetLanguage }
				: {};
		options.set({ ...current, targetLanguage, ...swap });
	}

	/** Caption in a second language as well, or not (`null`). Translation only. */
	function setSecondTarget(secondTargetLanguage: TargetLanguage | null) {
		const current = get(options);
		if (locked() || current.mode !== 'translate') return;
		options.set({
			...current,
			secondTargetLanguage:
				secondTargetLanguage === current.targetLanguage ? null : secondTargetLanguage
		});
	}

	function setProvider(provider: Provider) {
		const current = get(options);
		if (locked() || provider === current.provider) return;
		// Each mode accepts only the backends that can serve it.
		if (providerCanTranslate(provider) !== (current.mode === 'translate')) return;
		if (isLocalWhisper(provider) && whisperRefused()) return;
		invalidateAudioTest();
		options.set({
			...current,
			provider,
			...(provider === 'ondevice' ? DEMO_SOURCE : {})
		});
		if (provider !== 'ondevice') refreshDevices();
	}

	function setMode(mode: OutputMode) {
		const current = get(options);
		if (locked() || mode === current.mode) return;
		invalidateAudioTest();
		// Subtitles open on Whisper, or on the keyless demo where this processor cannot run it.
		const provider =
			mode === 'translate'
				? 'gemini'
				: DEFAULT_START_OPTIONS.provider === 'whisper' && whisperRefused()
					? 'ondevice'
					: DEFAULT_START_OPTIONS.provider;
		options.set({
			...current,
			mode,
			provider,
			...(provider === 'ondevice' ? DEMO_SOURCE : {})
		});
		refreshDevices();
	}

	/** Leave Whisper for the built-in demo on a processor that cannot run it: the first-launch,
	 *  keyless path must work on whatever PC the app is opened on. True when it switched. Only
	 *  Whisper's subtitles: the demo cannot stand in for its translation, which stays selected
	 *  and refused until the operator picks a cloud engine. */
	function avoidUnsupportedWhisper(): boolean {
		const current = get(options);
		if (locked() || current.provider !== 'whisper' || !whisperRefused()) return false;
		invalidateAudioTest();
		options.set({ ...current, provider: 'ondevice', ...DEMO_SOURCE });
		return true;
	}

	/** Quick flip of the caption language — handy when speakers alternate. */
	function flipDirection() {
		const current = get(options);
		if (!canFlipDirection(current.mode, locked())) return;
		const next = nextFavourite(current.targetLanguage, get(languageFavourites), current.provider);
		if (next) setTarget(next);
	}

	return {
		setSource,
		setTarget,
		setSecondTarget,
		setProvider,
		setMode,
		flipDirection,
		avoidUnsupportedWhisper
	};
}
export type SetupActions = ReturnType<typeof createSetupActions>;
