import { get, writable } from 'svelte/store';
import { asStatus } from './errors';
import {
	applyStatus,
	beginSession,
	endTranscriptSession,
	isRunning,
	pauseRequested,
	statusMessage
} from './stores';
import { api } from './tauri';
import { secondCaptionLanguageOf, type StartOptions } from './types';
import { captionLanguageError } from './languages';
import { locale, t } from './i18n';

/** Own start/stop serialization separately from page rendering. A stop requested during
 * startup waits for that startup; it must not silently return while capture comes alive. */
export function createSessionController(
	port = {
		startSession: api.startSession,
		stopSession: api.stopSession,
		pauseSession: api.pauseSession
	}
) {
	const busy = writable(false);
	let operation: Promise<unknown> | null = null;
	let stopping: Promise<void> | null = null;

	return {
		busy,
		async start(options: StartOptions): Promise<boolean> {
			if (operation || stopping || get(isRunning)) return false;
			const languageError = captionLanguageError(options, get(t), get(locale));
			if (languageError) {
				statusMessage.set(languageError);
				return false;
			}
			const second = secondCaptionLanguageOf(options);
			busy.set(true);
			statusMessage.set('');
			// A second language chosen for translation stays in the saved setup when the mode
			// changes, so switching back restores it; only a run that can use it sends it.
			const run: StartOptions = { ...options, secondTargetLanguage: second ?? null };
			beginSession(run);
			const work = Promise.resolve().then(() => port.startSession(run));
			operation = work;
			try {
				await work;
				return true;
			} catch (error) {
				applyStatus({ state: 'idle' });
				statusMessage.set(asStatus(error));
				return false;
			} finally {
				operation = null;
				if (!stopping) busy.set(false);
			}
		},
		/** Pause or resume the running session. Ignored while a start or stop is under way:
		 *  the session it would address is the one being replaced. */
		async pause(paused: boolean): Promise<void> {
			if (operation || stopping || !get(isRunning)) return;
			try {
				await port.pauseSession(paused);
				pauseRequested.set(paused);
			} catch (error) {
				statusMessage.set(asStatus(error));
			}
		},
		stop(): Promise<void> {
			if (stopping) return stopping;
			const startup = operation;
			busy.set(true);
			stopping = (async () => {
				await startup?.catch(() => {});
				try {
					await port.stopSession();
					await endTranscriptSession();
				} catch (error) {
					statusMessage.set(asStatus(error));
				} finally {
					stopping = null;
					busy.set(false);
				}
			})();
			return stopping;
		}
	};
}
