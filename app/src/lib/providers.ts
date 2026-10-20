// What each caption backend can do, its display metadata and its cost model. Provider
// integration notes and their dated verification sources live in docs/*-realtime-api.md and
// gemini-live-api.md.

import type { Messages } from './i18n/en';
import type { Provider } from './types';

/** Backends that produce translated captions. The built-in demo is same-language only, and
 *  Whisper translates into English only. */
export function providerCanTranslate(provider: Provider): boolean {
	return provider === 'gemini' || provider === 'openai' || provider === 'whisper-translate';
}

/** Whether the engine is local Whisper, for subtitles or for translation into English: one
 *  pipeline, so one model choice, download, processor check, pending-audio backlog and quit
 *  prompt. Mirrors `Provider::is_local_whisper`. */
export function isLocalWhisper(provider: Provider): provider is 'whisper' | 'whisper-translate' {
	return provider === 'whisper' || provider === 'whisper-translate';
}

/** Whether an API key must be saved before a session can start. Local Whisper and the
 *  scripted demo need no credential — see `docs/microsoft-store.md`. */
export function providerRequiresKey(provider: Provider): boolean {
	return provider !== 'ondevice' && !isLocalWhisper(provider);
}

/** Which credential a backend reads. Both Gemini models share one AI Studio key, so saving
 *  it once covers translation and subtitles. Mirrors `account()` in `src-tauri/src/secrets.rs`. */
export function providerKeyName(provider: Provider): string {
	if (provider === 'openai') return 'OpenAI';
	if (provider === 'mistral') return 'Mistral';
	return 'Gemini';
}

/** Whether the backend identifies the spoken language itself, so there is no language for
 *  the operator to choose. True for the subtitle engines; the built-in demo instead picks
 *  which bundled script to play. Whisper's translate task detects the spoken language too, but
 *  the room reads English, which the operator chooses, so it is false there. */
export function providerDetectsLanguage(provider: Provider): boolean {
	return provider === 'mistral' || provider === 'gemini-transcribe' || provider === 'whisper';
}

export interface ProviderMeta {
	id: Provider;
	/** Exact model id, rendered in the mono face. Not translated — it is an identifier.
	 *  The built-in demonstration has no model, so it describes itself from the catalog. */
	modelId: string;
	/** Rate as published, including the range where billing is not flat. Null where there is
	 *  nothing to bill; the word for that belongs to the interface language, not here. */
	hourlyRate: string | null;
	/** Single figure used for the running meter; the midpoint where the rate is a range. */
	hourlyEstimate: number;
	/** True when the rate is billed per open stream, so "Both" sources doubles it. */
	perStream: boolean;
	/** Where to get an API key; null for backends that need none. */
	keyUrl: string | null;
}

export const PROVIDER_META: Record<Provider, ProviderMeta> = {
	whisper: {
		id: 'whisper',
		modelId: '',
		hourlyRate: null,
		hourlyEstimate: 0,
		perStream: false,
		keyUrl: null
	},
	'whisper-translate': {
		id: 'whisper-translate',
		modelId: '',
		hourlyRate: null,
		hourlyEstimate: 0,
		perStream: false,
		keyUrl: null
	},
	gemini: {
		id: 'gemini',
		modelId: 'gemini-3.5-live-translate-preview',
		hourlyRate: '$1.25–2.21',
		hourlyEstimate: 1.73,
		perStream: true,
		keyUrl: 'https://aistudio.google.com/apikey'
	},
	'gemini-transcribe': {
		id: 'gemini-transcribe',
		modelId: 'gemini-3.5-transcribe-live',
		hourlyRate: '$0.30–0.54',
		hourlyEstimate: 0.42,
		perStream: true,
		keyUrl: 'https://aistudio.google.com/apikey'
	},
	openai: {
		id: 'openai',
		modelId: 'gpt-realtime-translate',
		hourlyRate: '$3.06',
		hourlyEstimate: 3.06,
		perStream: true,
		keyUrl: 'https://platform.openai.com/api-keys'
	},
	mistral: {
		id: 'mistral',
		modelId: 'voxtral-mini-transcribe-realtime-2602',
		hourlyRate: '$0.36',
		hourlyEstimate: 0.36,
		perStream: true,
		keyUrl: 'https://console.mistral.ai/api-keys'
	},
	ondevice: {
		id: 'ondevice',
		modelId: '',
		hourlyRate: null,
		hourlyEstimate: 0,
		perStream: false,
		keyUrl: null
	}
};

/** Cost accrued so far, in USD. Per-stream providers bill once per open source, so "Both"
 *  doubles the rate; the built-in demonstration bills nothing. */
/** `streams` counts provider sessions: one per source, per caption language. */
export function estimateSessionCost(
	provider: Provider,
	elapsedMs: number,
	streams: number
): number {
	const meta = PROVIDER_META[provider];
	const hours = elapsedMs / 3_600_000;
	return meta.hourlyEstimate * hours * (meta.perStream ? streams : 1);
}

export function formatUsd(n: number): string {
	return '$' + n.toFixed(2);
}

/** The published rate, split so the unit can be dimmed: `['$3.06', '/hr']`, or the word for
 *  free and nothing to dim. */
export function rateParts(meta: ProviderMeta, m: Messages): [string, string] {
	return meta.hourlyRate === null ? [m.cost.free, ''] : [meta.hourlyRate, m.cost.perHour];
}

/** The rate as one string, for the pre-flight row. */
export function rateText(meta: ProviderMeta, m: Messages): string {
	return rateParts(meta, m).join('');
}

/** What to print under the vendor name. Real backends have a model id; local Whisper (whose
 *  model is chosen below it) and the demonstration have a description instead, and that is
 *  prose. */
export function modelLabel(meta: ProviderMeta, m: Messages): string {
	return isLocalWhisper(meta.id)
		? m.provider.model[meta.id]
		: meta.modelId || m.provider.model.ondevice;
}
