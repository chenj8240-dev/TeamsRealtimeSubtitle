import { get } from 'svelte/store';
import { api } from './tauri';
import { asStatus, describeError } from './errors';
import { t } from './i18n';
import { validateDevices } from './audioDevices';
import { micLevel, systemLevel, options, statusMessage } from './stores';
import { isLocalWhisper, providerRequiresKey } from './providers';
import type {
	AudioDevice,
	AudioLevel,
	AudioTestUpdate,
	CaptureApplication,
	OnDeviceReadiness,
	Provider,
	StartOptions,
	WhisperCpuSupport,
	WhisperModelInfo
} from './types';

export interface PreflightGates {
	/** Setup is locked: a session, a start or a profile load is under way. Nothing is tested or
	 *  re-validated then. The Test audio button is disabled on exactly this, so a click the
	 *  button accepts is never silently refused here. */
	locked: () => boolean;
	/** Idle validation must leave the saved devices alone, on top of `locked`: while a capture
	 *  failure is on screen, its Retry still needs the endpoint the operator chose. A test is
	 *  allowed then — checking another microphone is exactly what the banner invites. */
	holdSelection?: () => boolean;
}

// The pre-flight audio check's noise floor, and how long a source still counts as arriving
// after it last rose above it.
const SIGNAL_RMS = 0.02;
const SIGNAL_HOLD_MS = 3000;

/** Capture preflight and signal lifetime, independent of the operator's layout.
 *
 *  Every public method is an arrow-function field, so a call site can hand one on bare
 *  (`onclick={preflight.startAudioTest}`) without losing `this`. */
export class PreflightController {
	readonly #desktop: boolean;
	readonly #locked: () => boolean;
	readonly #holdSelection: () => boolean;
	readonly #api: typeof api;

	constructor(
		desktop: boolean,
		{ locked, holdSelection = () => false }: PreflightGates,
		port = api
	) {
		this.#desktop = desktop;
		this.#locked = locked;
		this.#holdSelection = holdSelection;
		this.#api = port;
		// A browser preview has no engine to protect, so it counts as supported.
		if (!desktop) this.whisperCpu = { supported: true, missing: [] };
	}

	microphones = $state<AudioDevice[]>([]);
	outputs = $state<AudioDevice[]>([]);
	applications = $state<CaptureApplication[]>([]);
	applicationCaptureSupported = $state<boolean | null>(null);
	refreshingApplications = $state(false);
	applicationReady = (selected: StartOptions): boolean => {
		if (
			selected.source === 'microphone' ||
			selected.provider === 'ondevice' ||
			selected.systemCapture?.kind !== 'application'
		)
			return true;
		const process = selected.systemCapture.process;
		return (
			this.applicationCaptureSupported === true &&
			!!process &&
			this.applications.some(
				(app) => app.process.pid === process.pid && app.process.createdAt === process.createdAt
			)
		);
	};
	refreshApplications = async () => {
		if (!this.#desktop || this.#disposed || this.refreshingApplications) return;
		this.refreshingApplications = true;
		try {
			const result = await this.#api.listApplications();
			if (this.#disposed) return;
			this.applications = result.applications;
			this.applicationCaptureSupported = result.supported;
		} catch (error) {
			if (!this.#disposed) statusMessage.set(asStatus(error));
		} finally {
			this.refreshingApplications = false;
		}
	};
	refreshing = $state(false);
	#loaded = false;
	#disposed = false;
	#refreshAgain = false;
	localReadiness = $state<OnDeviceReadiness | null>(null);
	// Null until the core has answered, which blocks a Whisper start in the meantime. The
	// constructor fills it in at once for a browser preview.
	whisperCpu = $state<WhisperCpuSupport | null>(null);
	/** The processor is known to lack what local Whisper needs. */
	whisperRefused = $derived(this.whisperCpu?.supported === false);
	/** The first few absent instruction sets, for the one-line reason. A pre-AVX processor
	 *  lacks most of the list, and all of it would wrap across a card. */
	whisperCpuMissing = $derived.by(() => {
		const missing = this.whisperCpu?.missing ?? [];
		return missing.slice(0, 3).join(', ') + (missing.length > 3 ? '…' : '');
	});
	// The engine whose stored key the key panel last confirmed. Tied to that engine rather than
	// kept as a bare flag, so switching engines can never borrow the previous one's answer while
	// the panel is still asking the keychain about the new one.
	#keyFor = $state<Provider | null>(null);

	/** The key panel's answer for the engine it is showing. */
	noteKey = (provider: Provider, available: boolean) => {
		this.#keyFor = available ? provider : null;
	};

	/** Whether `selected`'s engine could start now: its key is stored, its Whisper model is
	 *  installed on a processor that can run it, or the built-in demonstration is ready. Read
	 *  through a `$derived` on the page, so it follows every input as it changes. */
	engineReady = (selected: StartOptions, models: readonly WhisperModelInfo[]): boolean => {
		if (providerRequiresKey(selected.provider)) return this.#keyFor === selected.provider;
		if (isLocalWhisper(selected.provider)) {
			// Until the core has said this processor can run it, Whisper cannot start.
			const model = selected.whisperModel ?? 'base';
			return (
				this.whisperCpu?.supported === true &&
				models.some((m) => m.id === model && m.installed && !m.downloading)
			);
		}
		return this.localReadiness?.ready ?? false;
	};
	// ---- Pre-flight audio check -------------------------------------------------
	// A source counts as arriving while it has been above the noise floor recently. Driven by
	// the level events themselves, so nothing polls while the window sits idle.
	micSignal = $state(false);
	systemSignal = $state(false);
	#micSignalTimer: ReturnType<typeof setTimeout> | undefined;
	#systemSignalTimer: ReturnType<typeof setTimeout> | undefined;

	noteLevel = (level: AudioLevel) => {
		if (level.source === 'microphone') {
			micLevel.set(level);
			if (level.rms <= SIGNAL_RMS) return;
			this.micSignal = true;
			this.micVerified = true;
			clearTimeout(this.#micSignalTimer);
			this.#micSignalTimer = setTimeout(() => (this.micSignal = false), SIGNAL_HOLD_MS);
		} else {
			systemLevel.set(level);
			if (level.rms <= SIGNAL_RMS) return;
			this.systemSignal = true;
			this.systemVerified = true;
			clearTimeout(this.#systemSignalTimer);
			this.#systemSignalTimer = setTimeout(() => (this.systemSignal = false), SIGNAL_HOLD_MS);
		}
	};

	// ---- Preflight audio test ---------------------------------------------------
	// Levels only exist while something is capturing, so the idle sheet cannot observe the
	// room on its own. Rather than implying that it is listening, it offers a deliberate
	// level-only test: the same devices a session would open, every sample discarded, no
	// provider contacted and nothing billed or stored. See `SessionManager::start_test`.
	audioTesting = $state(false);
	audioTestBusy = $state(false);
	// Latched once a source has genuinely been heard, so the tick survives the test ending.
	// Dropped whenever the operator changes what is under test.
	micVerified = $state(false);
	systemVerified = $state(false);

	startAudioTest = async () => {
		if (!this.#desktop || this.audioTestBusy || this.audioTesting || this.#locked()) return;
		if (!this.applicationReady(get(options))) {
			statusMessage.set(get(t).applications.missing);
			return;
		}
		this.audioTestBusy = true;
		statusMessage.set('');
		try {
			const selected = get(options);
			await this.#api.startAudioTest(
				selected.source,
				selected.micDeviceId ?? selected.micDeviceName ?? null,
				selected.systemDeviceId ?? null,
				selected.systemCapture
			);
		} catch (e) {
			statusMessage.set(asStatus(e));
		} finally {
			this.audioTestBusy = false;
		}
	};

	stopAudioTest = async () => {
		if (!this.#desktop) return;
		this.audioTestBusy = true;
		try {
			await this.#api.stopAudioTest();
		} catch (e) {
			statusMessage.set(asStatus(e));
		} finally {
			this.audioTestBusy = false;
		}
	};

	/** A running test holds one specific device. Once the operator changes the source, the
	 *  device or the provider, that probe is measuring something they are no longer asking
	 *  about — so release it, and drop the verdict along with it. */
	invalidateAudioTest = () => {
		this.micVerified = false;
		this.systemVerified = false;
		this.micSignal = false;
		this.systemSignal = false;
		clearTimeout(this.#micSignalTimer);
		clearTimeout(this.#systemSignalTimer);
		if (this.audioTesting) void this.stopAudioTest();
	};

	validateSelection = () => {
		if (
			!this.#loaded ||
			this.#locked() ||
			this.#holdSelection() ||
			this.audioTesting ||
			this.audioTestBusy
		)
			return;
		const current = get(options);
		const next = validateDevices(current, this.microphones, this.outputs);
		if (
			current.micDeviceId !== next.micDeviceId ||
			current.systemDeviceId !== next.systemDeviceId ||
			current.micDeviceName !== next.micDeviceName
		) {
			if (
				!get(statusMessage) &&
				(((current.micDeviceId || current.micDeviceName) && !next.micDeviceId) ||
					(current.systemDeviceId && !next.systemDeviceId))
			) {
				statusMessage.set(get(t).devices.idleFallback);
			}
			this.invalidateAudioTest();
			options.set(next);
		}
	};

	refresh = async () => {
		if (!this.#desktop || this.#disposed) return;
		if (this.refreshing) {
			this.#refreshAgain = true;
			return;
		}
		this.refreshing = true;
		try {
			do {
				this.#refreshAgain = false;
				const [mics, render] = await Promise.all([
					this.#api.listMicrophones(),
					this.#api.listOutputs()
				]);
				if (this.#disposed) return;
				if (
					this.#loaded &&
					JSON.stringify([mics, render]) !== JSON.stringify([this.microphones, this.outputs])
				) {
					this.micVerified = false;
					this.systemVerified = false;
				}
				this.microphones = mics;
				this.outputs = render;
				this.#loaded = true;
				this.validateSelection();
			} while (this.#refreshAgain && !this.#disposed);
		} catch (e) {
			if (!this.#disposed) statusMessage.set(asStatus(e));
		} finally {
			this.refreshing = false;
		}
	};

	refreshLocalReadiness = async () => {
		if (!this.#desktop) return;
		try {
			this.localReadiness = await this.#api.onDeviceReadiness();
		} catch (e) {
			this.localReadiness = {
				ready: false,
				engine: 'none',
				state: 'check-failed',
				canPrepare: false,
				detail: describeError(e, get(t))
			};
		}
	};

	/** Ask once whether this processor can run local Whisper. The answer cannot change while the
	 *  app runs. A failed question is treated as supported: the core checks again at Start and
	 *  refuses with its own sentence, so guessing "no" would only hide a working engine. */
	refreshWhisperCpu = async () => {
		if (!this.#desktop) return;
		try {
			this.whisperCpu = await this.#api.whisperCpuSupport();
		} catch {
			this.whisperCpu = { supported: true, missing: [] };
		}
	};

	applyAudioTest = (update: AudioTestUpdate) => {
		this.audioTesting = update.active;
		if (!update.active) {
			this.micSignal = false;
			this.systemSignal = false;
			clearTimeout(this.#micSignalTimer);
			clearTimeout(this.#systemSignalTimer);
			if (update.message) statusMessage.set(update.message);
		}
	};

	dispose = () => {
		this.#disposed = true;
		clearTimeout(this.#micSignalTimer);
		clearTimeout(this.#systemSignalTimer);
		if (this.#desktop && this.audioTesting) void this.stopAudioTest();
	};
}

/** Built through a factory like the page's other controllers. */
export function createPreflightController(
	...args: ConstructorParameters<typeof PreflightController>
) {
	return new PreflightController(...args);
}
