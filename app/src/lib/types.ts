// Shared types between the operator window, the caption overlay, and the Rust core.
// These mirror the serde structs in `src-tauri/src/types.rs` — keep them in sync.

import type { AppError } from './errors';
import { isLocalWhisper } from './providers';
import type { Messages } from './i18n/en';
import type { Locale } from './i18n';
import type { CaptionFaceId } from './captionFont';

// Each union below is declared once, as a runtime list, and the type is derived from it.
// Persisted values are untrusted input and are checked against these lists, and
// `contract.test.ts` checks each list against the serde enum it mirrors.

/** Which audio input(s) to translate or transcribe. */
export const AUDIO_SOURCES = ['microphone', 'system', 'both'] as const;
export type AudioSource = (typeof AUDIO_SOURCES)[number];

/** A single capture source — the `origin` on captions, levels, and status updates. */
export const ORIGINS = ['microphone', 'system'] as const;
export type Origin = (typeof ORIGINS)[number];

/** BCP-47 codes we use for the two caption languages. The spoken language is auto-detected. */
import type { TargetLanguage, DemoLanguage } from './languages';
export type { TargetLanguage } from './languages';

/** Caption backend. The commercial providers each have their own API key; `ondevice`
 *  is the bundled product demonstration and local Whisper runs on this PC, and neither needs
 *  a credential. Mirrors `Provider` in types.rs.
 *
 *  `gemini` and `gemini-transcribe` are two different Google models sharing one endpoint and
 *  one key — Live Translate and Transcribe Live. They are separate ids because they serve
 *  different modes at different rates, and `providerCanTranslate` has to stay a plain
 *  function of the provider. `whisper` and `whisper-translate` are one local engine split the
 *  same way: subtitles, and translation into English. */
export const PROVIDERS = [
	'gemini',
	'gemini-transcribe',
	'openai',
	'mistral',
	'ondevice',
	'whisper',
	'whisper-translate'
] as const;
export type Provider = (typeof PROVIDERS)[number];
export const WHISPER_MODELS = ['tiny', 'base', 'small'] as const;
export type WhisperModelId = (typeof WHISPER_MODELS)[number];
export interface WhisperModelInfo {
	id: WhisperModelId;
	bytes: number;
	installed: boolean;
	downloading: boolean;
	downloadedBytes: number;
	inUse: boolean;
}
export interface WhisperProgress {
	origin: Origin;
	pendingMs: number;
	finalizing: boolean;
}
/** Whether this processor can run the Whisper engine the app was built with (`whisper/cpu.rs`).
 *  `missing` names the absent instruction-set extensions, e.g. `AVX2`. */
export interface WhisperCpuSupport {
	supported: boolean;
	missing: string[];
}

export interface OnDeviceReadiness {
	ready: boolean;
	engine: 'built-in-demo' | 'none' | string;
	/** What the core found, as a name for the catalog to word — never a finished sentence.
	 *  `check-failed` is raised here rather than in Rust, when the command itself throws. */
	state: 'ready' | 'check-failed' | string;
	canPrepare: boolean;
	/** Untranslated technical detail from a failed check, appended in parentheses the way
	 *  `describeError` appends an `AppError`'s. The core never sends prose here. */
	detail?: string;
}

/** The demo row's sentence: the catalog words whatever state the core named. A state the
 *  catalog has never heard of falls back to the checking line rather than showing an
 *  identifier — the same bargain `describeError` strikes for an unknown failure id. */
export function describeReadiness(readiness: OnDeviceReadiness | null, m: Messages): string {
	const catalog = m.preflight.demoRow;
	if (!readiness) return catalog.checking;
	const sentence =
		readiness.state === 'ready'
			? catalog.ready
			: readiness.state === 'check-failed'
				? catalog.checkFailed
				: catalog.checking;
	return readiness.detail ? `${sentence} (${readiness.detail})` : sentence;
}

/** Translate speech, or show a same-language transcription as live subtitles. */
export const OUTPUT_MODES = ['translate', 'transcribe'] as const;
export type OutputMode = (typeof OUTPUT_MODES)[number];

/** Whether the F2 direction shortcut can act right now.
 *
 *  F2 swaps the first two favourites in pin order (outside that pair, selects the first).
 *  The caller uses nextFavourite: fewer than two pins or either unsupported is a no-op.
 *  Translation is the only mode with a direction to flip, and the target language is handed
 *  to the provider once at session start — so it cannot change while a session is running,
 *  and `locked` is true for the whole of one. Genuine live switching needs provider-aware
 *  reconnection, hysteresis and in-flight-turn handling; that is issue #12, not this. */
export function canFlipDirection(mode: OutputMode, locked: boolean): boolean {
	return mode === 'translate' && !locked;
}

/** The language the audience is actually reading, when the app knows it.
 *
 *  Translation writes captions in the target language, and the built-in demonstration plays a
 *  bundled script in it — both known. The subtitle engines detect the spoken language
 *  themselves and never report what they found, so there the caption language is genuinely
 *  unknown. That is the same condition under which `setTarget` refuses to act: the app can
 *  name the caption language exactly when the operator is allowed to choose it.
 *
 *  `undefined` means unknown and callers must not substitute a guess — marking French
 *  captions up as English is worse for a screen reader than marking them up as nothing. */
export function captionLanguageOf(
	options: Pick<StartOptions, 'mode' | 'provider' | 'targetLanguage'>
): TargetLanguage | undefined {
	if (options.mode === 'translate' || options.provider === 'ondevice')
		return options.targetLanguage;
	return undefined;
}

/** A second language only means something for translation by an engine that can write one,
 *  and only when it differs from the first: this is the one place that decides, so the core,
 *  the overlay, the cost and the labels cannot disagree about whether a run has one. Local
 *  Whisper translates into English only, so a saved second language waits, unused, for the
 *  next cloud engine — as it does through subtitles. */
export function secondCaptionLanguageOf(
	options: Pick<StartOptions, 'mode' | 'provider' | 'targetLanguage' | 'secondTargetLanguage'>
): TargetLanguage | undefined {
	const second = options.secondTargetLanguage;
	return options.mode === 'translate' &&
		!isLocalWhisper(options.provider) &&
		second &&
		second !== options.targetLanguage
		? second
		: undefined;
}

/** How many caption languages a run streams per source: each is its own provider session. */
export function laneCount(
	options: Pick<StartOptions, 'mode' | 'provider' | 'targetLanguage' | 'secondTargetLanguage'>
): 1 | 2 {
	return secondCaptionLanguageOf(options) ? 2 : 1;
}

// ---- Caption lanes and tracks ------------------------------------------------
// A session captions in one language, or two: lane 0 is `targetLanguage`, lane 1
// `secondTargetLanguage`. Each source's lanes are independent turn streams, so everything
// keyed per stream is keyed by track — a source in one language.

export const LANES = [0, 1] as const;
export type Lane = (typeof LANES)[number];

/** Lane 0 keeps the bare origin as its key, so a single-language session is keyed exactly as
 *  it always was. */
export type Track = Origin | `${Origin}:1`;

export function trackOf(origin: Origin, lane: Lane | undefined = 0): Track {
	return lane === 1 ? `${origin}:1` : origin;
}

export function trackOrigin(track: Track): Origin {
	return (track.endsWith(':1') ? track.slice(0, -2) : track) as Origin;
}

export function trackLane(track: Track): Lane {
	return track.endsWith(':1') ? 1 : 0;
}

/** The language a lane's captions are in, when the app knows it. */
export function laneLanguage(
	options: Pick<StartOptions, 'mode' | 'provider' | 'targetLanguage' | 'secondTargetLanguage'>,
	lane: Lane
): TargetLanguage | undefined {
	return lane === 1 ? secondCaptionLanguageOf(options) : captionLanguageOf(options);
}

/** The overlay's order: the remote speaker above the room, and within each source its first
 *  language above its second. */
export const TRACK_ORDER: readonly Track[] = ['system', 'system:1', 'microphone', 'microphone:1'];

interface ProcessIdentity {
	pid: number;
	createdAt: string;
}
export type SystemCapture =
	{ kind: 'output' } | { kind: 'application'; process: ProcessIdentity | null };
export interface CaptureApplication {
	process: ProcessIdentity;
	name: string;
}
export interface ApplicationList {
	supported: boolean;
	applications: CaptureApplication[];
}

export interface StartOptions {
	source: AudioSource;
	mode: OutputMode;
	/** Caption language (translation target). */
	targetLanguage: TargetLanguage;
	/** Realtime translation/transcription backend. */
	provider: Provider;
	whisperModel?: WhisperModelId;
	spokenLanguage?: string | null;
	/** Input device name for the microphone; null = system default. */
	micDeviceName?: string | null;
	micDeviceId?: string | null;
	systemDeviceId?: string | null;
	systemCapture?: SystemCapture;
	/** Rehearse instead of capturing: a cloud backend plays a bundled ~20 s speech fixture spoken in
	 *  this language through the real pipeline — one System-origin stream, looping until Stop —
	 *  so captions, levels, transcript and overlay behave exactly as in a live session. `source`
	 *  and `micDeviceName` are ignored while it is set; absent means a normal live session.
	 *  Cloud engines still stream to the provider and bill normally. The built-in demo already
	 *  has its own deterministic timeline and disables this separate rehearsal control. Per-launch only: it is never written to the options store, so it can never reach
	 *  the persisted record. Keep in sync with `StartOptions` in `src-tauri/src/types.rs`. */
	rehearsal?: DemoLanguage;
	/** Caption in this language as well, from a second translation session per source (lane
	 *  1). Translation only; null or absent for one language. See `secondCaptionLanguageOf`. */
	secondTargetLanguage?: TargetLanguage | null;
}

/** A caption update streamed from the active translation or subtitle session. */
export interface Caption {
	/** Monotonic id for the current utterance of this origin; a new turn increments it.
	 *  Only unique per origin — always key captions by (origin, turnId). */
	turnId: number;
	/** Text shown to the audience: translated text or same-language subtitles. */
	text: string;
	/** The recognised source-language text, for the operator monitor only. */
	sourceText: string;
	/** True once the turn is complete; until then it's an interim caption. */
	final: boolean;
	/** Which source produced it, when running both streams. */
	origin: Origin;
	/** Which caption language: 0 for the target, 1 for the second one. Turn ids are per
	 *  track, so key captions by (origin, lane, turnId). Absent means 0. */
	lane?: Lane;
	/** Milliseconds from the start of the session to this turn's first caption — the same
	 *  value on every caption of the turn, so an interim and its final agree on where the
	 *  cue begins. Stamped by the core; see `src-tauri/src/timing.rs`. */
	startMs: number;
	/** Milliseconds from the start of the session to *this* caption. On a final caption,
	 *  the end of the cue. */
	endMs: number;
}

/** RMS level for the meter, 0.0–1.0, per source. */
export interface AudioLevel {
	source: Origin;
	rms: number;
	peak: number;
}

export const SESSION_STATES = [
	'idle',
	'connecting',
	'running',
	'reconnecting',
	'paused',
	'error'
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export interface StatusUpdate {
	state: SessionState;
	/** Why the state changed. The core sends a structured error the interface words (see
	 *  `describeError`); plain text is accepted for messages made in the interface. */
	message?: AppError | string;
	/** Which source this update is about; absent means the whole session (e.g. stop). */
	origin?: Origin;
	/** Which caption language of that source; absent means all of them (a capture failure
	 *  ends every language it fed). */
	lane?: Lane;
}

/** Preflight level test. Deliberately not a `StatusUpdate`: a test is not a session and must
 *  never move the session state machine. `message` is set only when a device failed.
 *  Mirrors `AudioTestUpdate` in types.rs. */
export interface AudioTestUpdate {
	active: boolean;
	message?: string | null;
}

export interface AudioDevice {
	id: string;
	name: string;
	isDefault: boolean;
}

/** Live overlay appearance/behaviour, pushed from the operator window to the overlay. */
export interface OverlayConfig {
	holdSeconds?: number;
	pace?: import('./reading').CaptionPace;
	fontSize: number;
	/** How wide a caption line may run, as a typographic measure in `ch`. */
	captionWidth?: number;
	cleanSpeech?: boolean;
	/** The words Hide filler words removes. Not part of the appearance — a profile or a reset
	 *  leaves it alone — but pushed with it, so a reloaded overlay is never left on a stale
	 *  list. Validated again on arrival; see `normalizeFillerWords`. */
	fillerWords?: string[];
	captionLayout?: import('./captionLayout').CaptionLayout;
	/** The caption ink and the scrim behind it. Sent as three plain values rather than as a
	 *  computed stylesheet: the overlay derives its own steps and its own gradient from them,
	 *  so the contrast readout in the operator window and the pixels on the projector are
	 *  always describing the same arithmetic. See `captionColour.ts`. */
	captionColour?: string;
	scrimColour?: string;
	scrimOpacity?: number;
	/** The typeface the captions are set in. An id rather than a CSS stack: the overlay owns
	 *  the mapping, so a stored value from an older build can never push an arbitrary
	 *  `font-family` into the window an audience is looking at. See `captionFont.ts`. */
	captionFace?: CaptionFaceId;
	/** Move mode: click-through is off and the overlay shows a drag region. */
	interactive?: boolean;
	/** Interface language — the overlay's own chrome, which is the move-mode toolbar and the
	 *  origin labels. Pushed rather than read from storage: the two windows are separate
	 *  webviews, and a `storage` event does not reliably cross them. Not the caption
	 *  language: that is `captionLanguage`, and the two are deliberately independent. */
	locale?: Locale;
	/** The language of the caption text itself, so the overlay can mark it up and a screen
	 *  reader on the projected view pronounces it rather than reading French with English
	 *  phonemes. Absent while a subtitle engine is auto-detecting and nobody knows — see
	 *  `captionLanguageOf`, which is where the answer is worked out. */
	captionLanguage?: TargetLanguage;
	/** The language of lane 1's captions, when the session has a second one. Unconditional
	 *  on arrival like `captionLanguage`: absent clears it. */
	secondCaptionLanguage?: TargetLanguage;
	/** Show the original speech as a smaller line under each translated caption. */
	showOriginal?: boolean;
}

/** A finalized transcript line, kept for the on-screen log and disk export. */
export interface TranscriptLine {
	/** Monotonic id, unique for the app lifetime (stable list key) and the log's ordering. */
	id: number;
	text: string;
	sourceText: string;
	origin: Origin;
	/** Which caption language, when the session had two; absent means the first. */
	lane?: Lane;
	/** The caption language itself, recorded for a session in two languages so a document that
	 *  spans several runs still names each line's language correctly. */
	language?: TargetLanguage;
	/** The caption's interval, in ms since its session started. Optional because a recovery
	 *  file written before timing existed has none, and a line restored from one is still a
	 *  perfectly good caption — it just cannot be exported as a timed cue. Present or absent
	 *  together; never one without the other. */
	startMs?: number;
	endMs?: number;
}

/** A recovery file as the Rust core hands it over: the raw JSON it read, plus where it sits
 *  so the operator can be told exactly which file to delete. Mirrors `StoredRecovery` in
 *  `src-tauri/src/recovery.rs`. Parsing is the front-end's job (`decodeRecovery`) — the core
 *  never interprets caption text. */
export interface StoredRecovery {
	path: string;
	contents: string;
}

/** State the overlay reports back to the operator window, so the two stay in sync when the
 *  operator acts on the overlay itself rather than on the control panel. */
export interface OverlayStateMsg {
	/** False when the overlay leaves move mode ("Lock into place"). */
	interactive?: boolean;
	/** True once the caption region has been positioned on the presentation display. */
	placed?: boolean;
	/** Font size chosen from the overlay's own toolbar. */
	fontSize?: number;
}

/** A tray menu entry the front-end has to carry out, because it needs session or transcript
 *  state that only the renderer holds. *Open* is absent on purpose: showing a window needs
 *  nothing from here, so the core does it itself and the menu keeps working even if this
 *  window is wedged. Mirrors `TrayCommand` in `src-tauri/src/tray.rs`. */
export const TRAY_COMMANDS = ['toggle-overlay', 'stop-session', 'quit'] as const;
export type TrayCommand = (typeof TRAY_COMMANDS)[number];

/** Event names. Rust→front-end: caption/level/status/closeRequested/trayCommand.
 *  Operator→overlay: overlayConfig. Overlay→operator: overlayState. */
export const EVT = {
	whisperProgress: 'whisper-progress',
	caption: 'caption',
	level: 'audio-level',
	status: 'status',
	audioTest: 'audio-test',
	devicesChanged: 'audio-devices-changed',
	closeRequested: 'close-requested',
	trayCommand: 'tray-command',
	overlayConfig: 'overlay-config',
	overlayState: 'overlay-state',
	textScale: 'text-scale',
	displaysChanged: 'displays-changed'
} as const;
