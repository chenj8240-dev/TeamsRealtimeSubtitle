// The session setup a fresh install starts from, and the reading of a stored one back into a
// valid setup: from localStorage at start-up, and from a saved meeting profile.

import whisperLanguages from './whisperLanguages.json';
import { TARGET_LANGUAGES, type TargetLanguage } from './languages';
import { readStored } from './persisted';
import { isLocalWhisper, providerCanTranslate } from './providers';
import { AUDIO_SOURCES, OUTPUT_MODES, PROVIDERS, WHISPER_MODELS, type StartOptions } from './types';

/** Fresh-install setup for local speech recognition. The user downloads a model before
 *  starting; opening the app never starts a download or audio capture. */
export const DEFAULT_START_OPTIONS: StartOptions = {
	source: 'microphone',
	mode: 'transcribe',
	targetLanguage: 'en',
	provider: 'whisper',
	whisperModel: 'base',
	spokenLanguage: null,
	micDeviceName: null
};

/** localStorage key for the operator's last setup, so the keyless default above is a first-run
 *  state rather than a reset on every launch. */
export const SESSION_OPTIONS_KEY = 'session.options';

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
	return typeof value === 'string' && (allowed as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}

/** Read the persisted setup. Absent, unparseable or non-object storage yields the first-run
 *  defaults; otherwise each field falls back to its own default when missing or outside its
 *  union. A stored mode/provider pair that violates `providerCanTranslate` discards the whole
 *  record — the rail offers no such pair, so repairing one field would only guess which of the
 *  two the operator meant. The result is built field by field rather than spread from storage,
 *  so `rehearsal` (never persisted, and meaningless outside the launch that asked for it) can
 *  never come back out of localStorage. */
export function loadStartOptions(): StartOptions {
	const raw = readStored(SESSION_OPTIONS_KEY);
	if (!raw) return { ...DEFAULT_START_OPTIONS };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ...DEFAULT_START_OPTIONS };
	}
	return normalizeStartOptions(parsed);
}

export function normalizeStartOptions(parsed: unknown): StartOptions {
	if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_START_OPTIONS };
	const stored = parsed as Record<string, unknown>;
	const provider = oneOf(PROVIDERS, stored.provider, DEFAULT_START_OPTIONS.provider);
	// Whisper's own choices come back with either Whisper engine, as saved — not with the
	// fallback an unreadable provider gets — or wherever they were saved.
	const whisperChoices =
		(provider === stored.provider && isLocalWhisper(provider)) || stored.whisperModel !== undefined;
	const loaded: StartOptions = {
		source: oneOf(AUDIO_SOURCES, stored.source, DEFAULT_START_OPTIONS.source),
		mode: oneOf(OUTPUT_MODES, stored.mode, DEFAULT_START_OPTIONS.mode),
		targetLanguage: oneOf(
			TARGET_LANGUAGES,
			stored.targetLanguage,
			DEFAULT_START_OPTIONS.targetLanguage
		),
		provider,
		...(whisperChoices
			? {
					whisperModel: oneOf(WHISPER_MODELS, stored.whisperModel, 'base'),
					spokenLanguage:
						typeof stored.spokenLanguage === 'string' &&
						whisperLanguages.some((l) => l.code === stored.spokenLanguage)
							? stored.spokenLanguage
							: null
				}
			: {}),
		micDeviceName: typeof stored.micDeviceName === 'string' ? stored.micDeviceName : null,
		micDeviceId: typeof stored.micDeviceId === 'string' ? stored.micDeviceId : null,
		systemDeviceId: typeof stored.systemDeviceId === 'string' ? stored.systemDeviceId : null,
		secondTargetLanguage:
			typeof stored.secondTargetLanguage === 'string' &&
			(TARGET_LANGUAGES as readonly string[]).includes(stored.secondTargetLanguage)
				? (stored.secondTargetLanguage as TargetLanguage)
				: null,
		// Remember the privacy choice, never restore a PID across app launches.
		...((stored.systemCapture as { kind?: string } | null)?.kind === 'application'
			? { systemCapture: { kind: 'application' as const, process: null } }
			: {})
	};
	// The compatibility id `ondevice` now means the deterministic bundled demonstration.
	// Repair older saved Windows-speech configurations to its single virtual Demo audio source.
	if (loaded.provider === 'ondevice') {
		loaded.source = 'microphone';
		loaded.micDeviceName = null;
	}
	return providerCanTranslate(loaded.provider) === (loaded.mode === 'translate')
		? loaded
		: { ...DEFAULT_START_OPTIONS };
}
