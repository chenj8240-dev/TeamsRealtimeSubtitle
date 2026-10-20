// Thin wrapper around the Tauri command/event API so the Svelte components stay clean,
// and so `npm run dev` in a plain browser (no Tauri runtime) degrades gracefully instead
// of throwing. When `window.__TAURI_INTERNALS__` is absent we are running in a browser.

import type {
	WhisperCpuSupport,
	WhisperModelId,
	WhisperModelInfo,
	WhisperProgress,
	ApplicationList,
	AudioDevice,
	AudioSource,
	AudioTestUpdate,
	Caption,
	AudioLevel,
	OverlayConfig,
	OverlayStateMsg,
	OnDeviceReadiness,
	Provider,
	StartOptions,
	StatusUpdate,
	StoredRecovery,
	SystemCapture,
	TrayCommand
} from './types';
import type { HistoryListing } from './history';
import type { Placement } from './profiles';
import { EVT } from './types';

export const isTauri = (): boolean =>
	typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type UnlistenFn = () => void;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	if (!isTauri()) {
		throw new Error(`Tauri command "${cmd}" called outside the desktop app`);
	}
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke<T>(cmd, args);
}

async function listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
	if (!isTauri()) return () => {};
	const { listen } = await import('@tauri-apps/api/event');
	return listen<T>(event, (e) => handler(e.payload));
}

async function emit<T>(event: string, payload: T): Promise<void> {
	if (!isTauri()) return;
	const { emit } = await import('@tauri-apps/api/event');
	await emit(event, payload);
}

// ---- Commands -------------------------------------------------------------

export const api = {
	/** Whether this processor can run local Whisper at all; asked before Start is offered. */
	whisperCpuSupport: () => invoke<WhisperCpuSupport>('whisper_cpu_support'),
	whisperModels: () => invoke<WhisperModelInfo[]>('whisper_models'),
	downloadWhisperModel: (model: WhisperModelId) =>
		invoke<void>('download_whisper_model', { model }),
	cancelWhisperDownload: () => invoke<void>('cancel_whisper_download'),
	removeWhisperModel: (model: WhisperModelId) => invoke<void>('remove_whisper_model', { model }),
	discardWhisperPending: () => invoke<void>('discard_whisper_pending'),
	renameHistory: (id: string, title: string) => invoke<void>('rename_history', { id, title }),
	getOverlayPlacement: () => invoke<Placement>('get_overlay_placement'),
	setOverlayPlacement: (placement: Placement) =>
		invoke<void>('set_overlay_placement', { placement }),
	/** A signature of the connected displays, which the remembered overlay placement is kept
	 *  under. See `overlayGeometry.ts`. */
	displayLayout: () => invoke<string>('display_layout'),
	/** Bring the overlay back onto a display that is there when it is not: its centre on no
	 *  connected display, or larger than the one it is on. True when the core moved it. Leaves
	 *  a usable placement, visibility and click-through alone. */
	recoverOverlayPlacement: () => invoke<boolean>('recover_overlay_placement'),
	writeHistory: (id: string, contents: string) => invoke<void>('write_history', { id, contents }),
	pauseSession: (paused: boolean) => invoke<void>('pause_session', { paused }),
	appendHistory: (id: string, contents: string) => invoke<void>('append_history', { id, contents }),
	/** The saved sessions, with contents only for those not in `known` at the same length.
	 *  See `createHistoryCache`. */
	listHistory: (known: [id: string, length: number][]) =>
		invoke<HistoryListing>('list_history', { known }),
	deleteHistory: (id: string) => invoke<void>('delete_history', { id }),
	listMicrophones: () => invoke<AudioDevice[]>('list_microphones'),
	listOutputs: () => invoke<AudioDevice[]>('list_outputs'),
	listApplications: () => invoke<ApplicationList>('list_applications'),

	hasApiKey: (provider: Provider) => invoke<boolean>('has_api_key', { provider }),
	setApiKey: (provider: Provider, key: string) => invoke<void>('set_api_key', { provider, key }),
	clearApiKey: (provider: Provider) => invoke<void>('clear_api_key', { provider }),
	onDeviceReadiness: () => invoke<OnDeviceReadiness>('ondevice_readiness'),

	startSession: (options: StartOptions) => invoke<void>('start_session', { options }),
	stopSession: () => invoke<void>('stop_session'),

	/** Level-only capture for the preflight: no provider connection, no captions, no stored
	 *  audio. See `SessionManager::start_test`. */
	startAudioTest: (
		source: AudioSource,
		micDeviceName: string | null,
		systemDeviceId: string | null = null,
		systemCapture?: SystemCapture
	) => invoke<void>('start_audio_test', { source, micDeviceName, systemDeviceId, systemCapture }),
	stopAudioTest: () => invoke<void>('stop_audio_test'),

	setOverlayClickThrough: (enabled: boolean) =>
		invoke<void>('set_overlay_click_through', { enabled }),
	showOverlay: (visible: boolean) => invoke<void>('show_overlay', { visible }),

	/** Push live overlay appearance (font size) to the overlay window. */
	setOverlayConfig: (config: OverlayConfig) => emit(EVT.overlayConfig, config),

	/** Report a change made on the overlay itself back to the operator window. */
	emitOverlayState: (msg: OverlayStateMsg) => emit(EVT.overlayState, msg),

	/** Write the transcript to disk; returns the saved file path. */
	saveTranscript: (content: string, filename: string) =>
		invoke<string | null>('save_transcript', { content, filename }),

	/** Windows' accessibility text-size factor, asked for as the operator window boots.
	 *  Later changes arrive on `on.textScale`. See `textScale.ts`. */
	textScaleFactor: () => invoke<number>('text_scale_factor'),

	/** Overwrite the crash-recovery spool; returns its path. Opt-in — see `recoveryEnabled`. */
	writeRecovery: (contents: string) => invoke<string>('write_recovery', { contents }),

	/** Read the spool left by a previous run, or null when there is nothing to recover. */
	readRecovery: () => invoke<StoredRecovery | null>('read_recovery'),

	/** Delete the spool. Called on save, clear, discard, and when recovery is switched off. */
	clearRecovery: () => invoke<void>('clear_recovery'),

	/** Tell the core whether closing the window would lose something, so it knows when to
	 *  intercept a close and when to leave it alone. See `shouldGuardClose`. */
	setCloseGuard: (guard: boolean) => invoke<void>('set_close_guard', { guard }),

	/** Say that an intercepted close is being handled. Sent immediately, before the session is
	 *  stopped: without it the core releases the window after `ACK_TIMEOUT` rather than let a
	 *  wedged renderer hold it shut. */
	ackClose: () => invoke<void>('ack_close'),

	/** Answer an intercepted close: quit for real. */
	confirmClose: () => invoke<void>('confirm_close'),

	/** Mirror the "keep running in the tray" preference into the core, so the close event
	 *  knows to hold the window open for a hide rather than let it be destroyed. */
	setCloseToTray: (enabled: boolean) => invoke<void>('set_close_to_tray', { enabled }),

	/** Put the window away without ending anything — session, overlay and transcript all
	 *  carry on, and the tray is how they come back. */
	hideToTray: () => invoke<void>('hide_to_tray'),

	/** Bring the window back and focus it. Used before asking a question that the operator
	 *  cannot answer from the tray. */
	showOperator: () => invoke<void>('show_operator'),

	/** Push session and overlay state onto the tray menu, so it cannot describe a state the
	 *  app has already left. */
	setTrayState: (
		sessionActive: boolean,
		overlayVisible: boolean,
		labels?: {
			open: string;
			quit: string;
			stop: string;
			show: string;
			hide: string;
			status: string;
		}
	) => invoke<void>('set_tray_state', { sessionActive, overlayVisible, labels })
};

// ---- Events ---------------------------------------------------------------

export const on = {
	whisperProgress: (h: (p: WhisperProgress) => void) =>
		listen<WhisperProgress>(EVT.whisperProgress, h),
	devicesChanged: (h: () => void) => listen<null>(EVT.devicesChanged, h),
	caption: (h: (c: Caption) => void) => listen<Caption>(EVT.caption, h),
	level: (h: (l: AudioLevel) => void) => listen<AudioLevel>(EVT.level, h),
	status: (h: (s: StatusUpdate) => void) => listen<StatusUpdate>(EVT.status, h),
	audioTest: (h: (t: AudioTestUpdate) => void) => listen<AudioTestUpdate>(EVT.audioTest, h),
	/** The operator tried to close the window and the core held it open for an answer. */
	closeRequested: (h: () => void) => listen<null>(EVT.closeRequested, () => h()),
	/** A tray menu entry that needs session or transcript state to carry out. */
	trayCommand: (h: (c: TrayCommand) => void) => listen<TrayCommand>(EVT.trayCommand, h),
	overlayConfig: (h: (c: OverlayConfig) => void) => listen<OverlayConfig>(EVT.overlayConfig, h),
	overlayState: (h: (m: OverlayStateMsg) => void) => listen<OverlayStateMsg>(EVT.overlayState, h),
	/** The operator moved Windows' text-size slider while the app was running. */
	textScale: (h: (factor: number) => void) => listen<number>(EVT.textScale, h),
	/** A display was connected, disconnected, moved or rescaled while the app ran. Carries the
	 *  new `display_layout` signature, and arrives after the core has already rescued an
	 *  overlay left on a display that has gone. */
	displaysChanged: (h: (layout: string) => void) => listen<string>(EVT.displaysChanged, h)
};
