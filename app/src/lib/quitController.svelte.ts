import { get } from 'svelte/store';
import { api } from './tauri';
import { asStatus, describeError } from './errors';
import { t } from './i18n';
import { closeToTray, trayHideExplained, statusMessage } from './stores';
import { closeAction, type CloseChoice } from './document';
import { acknowledgeClose, endsLiveSession, prepareClose, resolveClose } from './quit';
import type { TrayCommand } from './types';

interface QuitActions {
	stop: () => Promise<void>;
	toggleOverlayVisible: () => Promise<void>;
}

/** Prompts and tray actions share one shutdown sequence; rendering only observes it.
 *
 *  Every public method is an arrow-function field, so a call site can hand one on bare
 *  (`onHideWindow={quit.hideWindow}`) without losing `this`. */
class QuitController {
	readonly #actions: QuitActions;

	constructor(actions: QuitActions) {
		this.#actions = actions;
	}

	closePrompt = $state(false);
	closeEndedSession = $state(false);
	closeSaving = $state(false);
	closeError = $state('');
	#answeringClose = false;

	// Leaving is asked about in stages, and each stage is one question: may this session end,
	// then what about the unsaved text. Never more than one is on screen.
	sessionPrompt = $state(false);
	sessionPromptFromTray = $state(false);
	hidePrompt = $state(false);

	onCloseRequested = async () => {
		// Claimed first, unconditionally. A second click on the window's X while a prompt is
		// already up is still an interception the core is counting down on, and letting that
		// one lapse would release the window with the transcript still unsaved.
		await acknowledgeClose();
		switch (closeAction(get(closeToTray), get(trayHideExplained))) {
			case 'hide':
				await this.hideWindow();
				return;
			case 'explain-then-hide':
				// Said in the window they are looking at, not as a toast: an app that vanishes
				// from the taskbar while holding a microphone has to be sure the message landed.
				this.hidePrompt = true;
				return;
			case 'quit':
				await this.#beginQuit(false);
		}
	};

	hideWindow = async () => {
		try {
			await api.hideToTray();
		} catch (e) {
			statusMessage.set(asStatus(e));
		}
	};

	onHideChoice = async (choice: 'hide' | 'quit') => {
		this.hidePrompt = false;
		if (choice === 'quit') {
			// They meant to leave. The explanation is deliberately *not* marked as given: the
			// app never actually hid, so the first hide still deserves it.
			await this.#beginQuit(false);
			return;
		}
		trayHideExplained.set(true);
		await this.hideWindow();
	};

	/** One shutdown, whichever way it was asked for. */
	async #beginQuit(fromTray: boolean) {
		if (this.closePrompt || this.sessionPrompt || this.#answeringClose) return;
		this.#answeringClose = true;
		try {
			// Ending an event's captions is the operator's decision, never a consequence of a
			// mis-aimed click — so this is asked before anything is stopped.
			if (endsLiveSession()) {
				this.sessionPromptFromTray = fromTray;
				await this.#showWindowForQuestion();
				this.sessionPrompt = true;
				return;
			}
			await this.#finishQuit();
		} catch (e) {
			statusMessage.set(asStatus(e));
		} finally {
			this.#answeringClose = false;
		}
	}

	/** Stop, drain, finalize — then either ask about unsaved text or leave. */
	async #finishQuit() {
		const outcome = await prepareClose(this.#actions.stop);
		this.closeEndedSession = outcome.endedSession;
		this.closeError = '';
		if (outcome.prompt) {
			await this.#showWindowForQuestion();
			this.closePrompt = true;
		}
	}

	/** A question the operator cannot answer from the tray, so the window comes back first.
	 *  Failure is not fatal: the prompt still renders if the window was already visible. */
	async #showWindowForQuestion() {
		try {
			await api.showOperator();
		} catch {
			// Ignored deliberately; see above.
		}
	}

	onSessionChoice = async (stopIt: boolean) => {
		this.sessionPrompt = false;
		if (!stopIt) return;
		// Held across the stop and drain as well: with both prompts down, nothing else would
		// stop a second close request from starting the whole sequence again underneath it.
		this.#answeringClose = true;
		try {
			await this.#finishQuit();
		} catch (e) {
			statusMessage.set(asStatus(e));
		} finally {
			this.#answeringClose = false;
		}
	};

	onTrayCommand = async (command: TrayCommand) => {
		switch (command) {
			case 'toggle-overlay':
				await this.#actions.toggleOverlayVisible();
				return;
			case 'stop-session':
				await this.#actions.stop();
				return;
			case 'quit':
				// Quit from the tray is counted down on just like a window close.
				await acknowledgeClose();
				await this.#beginQuit(true);
		}
	};

	onCloseChoice = async (choice: CloseChoice) => {
		if (choice === 'cancel') {
			this.closePrompt = false;
			this.closeEndedSession = false;
			this.closeError = '';
			return;
		}
		this.closeSaving = choice === 'save';
		this.closeError = '';
		try {
			if (await resolveClose(choice)) this.closePrompt = false;
		} catch (e) {
			// Stay open on a failed write: quitting here would lose exactly what the operator
			// just asked to keep.
			this.closeError = describeError(e, get(t));
		} finally {
			this.closeSaving = false;
		}
	};
}

/** Built through a factory like the page's other controllers. */
export function createQuitController(actions: QuitActions) {
	return new QuitController(actions);
}
