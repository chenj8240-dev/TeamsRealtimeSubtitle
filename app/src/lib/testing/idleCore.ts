// What a healthy core answers while nothing runs, shared by the two stand-ins for it: the
// Vitest mock (`tauriMock.ts`) and the Playwright one (`e2e/style/fakeCore.ts`).
//
// Dependency-free on purpose: the Playwright suite runs this in Node, outside Vite, so it can
// import nothing at runtime — no Vitest, no Svelte, no `#lib` alias. Type imports are erased.
//
// Test-only. Nothing in the app imports this, so it never reaches the bundle.

import type { HistoryListing } from '../history';
import type { Placement } from '../profiles';
import type {
	ApplicationList,
	AudioDevice,
	OnDeviceReadiness,
	StoredRecovery,
	WhisperCpuSupport,
	WhisperModelInfo
} from '../types';

/** How one command is answered. A thrown error, or a rejected promise, is the command failing. */
export type CommandHandler = (args: Record<string, unknown>) => unknown;

/** The core on a machine with one microphone, one output and one display, no saved key, no
 *  Whisper model and nothing to recover. A command not listed here answers `null`, as the
 *  core's unit-returning ones do. */
export const IDLE_CORE: Readonly<Record<string, CommandHandler>> = {
	whisper_cpu_support: (): WhisperCpuSupport => ({ supported: true, missing: [] }),
	whisper_models: (): WhisperModelInfo[] => [],
	list_microphones: (): AudioDevice[] => [
		{ id: 'mic-1', name: 'Lectern microphone', isDefault: true }
	],
	list_outputs: (): AudioDevice[] => [{ id: 'render-1', name: 'Room speakers', isDefault: true }],
	list_applications: (): ApplicationList => ({ supported: true, applications: [] }),
	has_api_key: () => false,
	ondevice_readiness: (): OnDeviceReadiness => ({
		ready: true,
		engine: 'built-in-demo',
		state: 'ready',
		canPrepare: false
	}),
	text_scale_factor: () => 1,
	// One 1920×1080 display at 100%, with the overlay where `tauri.conf.json` creates it.
	display_layout: () => '0,0 1920x1080 100%',
	get_overlay_placement: (): Placement => ({ x: 320, y: 460, width: 1280, height: 160 }),
	// …which is on that display, so there is nothing to recover.
	recover_overlay_placement: () => false,
	read_recovery: (): StoredRecovery | null => null,
	list_history: (): HistoryListing => ({ sessions: [], removed: [] }),
	save_transcript: ({ filename }) => `C:\\Users\\Operator\\Documents\\${String(filename)}`
};
