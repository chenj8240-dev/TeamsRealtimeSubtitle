// Keeps the core and the overlay window in step with the operator window. Every effect here
// pushes state out and none reads anything back, so each one is a plain mirror of a store.

import { fromStore, get } from 'svelte/store';
import { shouldGuardClose } from './document';
import { locale, t } from './i18n';
import { spoolFailure, startRecoverySpool } from './recovery';
import {
	closeToTray,
	isRunning,
	options,
	recoveryEnabled,
	sessionState,
	statusMessage,
	transcript,
	transcriptDirty
} from './stores';
import { api } from './tauri';
import { captionLanguageOf, secondCaptionLanguageOf } from './types';
import type { OverlayController } from './overlayController.svelte';
import type { SessionClock } from './sessionClock.svelte';

/** Start mirroring. Call while the operator page initialises: each mirror is an effect and
 *  stops with the page. A browser preview has no core and no second window, so nothing runs. */
export function syncNative({
	desktop,
	overlay,
	clock
}: {
	desktop: boolean;
	overlay: OverlayController;
	clock: SessionClock;
}) {
	if (!desktop) return;
	const running = fromStore(isRunning);
	const dirty = fromStore(transcriptDirty);
	const trayOnClose = fromStore(closeToTray);
	const state = fromStore(sessionState);
	const spooling = fromStore(recoveryEnabled);
	const messages = fromStore(t);
	const interfaceLocale = fromStore(locale);
	const setup = fromStore(options);

	// The core's close guard. While it and the tray preference are both false a close is not
	// intercepted at all, so a wedged renderer cannot produce an unclosable window.
	$effect(() => {
		void api.setCloseGuard(shouldGuardClose(dirty.current, running.current)).catch(() => {});
	});

	// The tray preference is a standing setting rather than something session state decides,
	// so the core tracks it separately.
	$effect(() => {
		void api.setCloseToTray(trayOnClose.current).catch(() => {});
	});

	// The tray menu must never describe a state the app has left: pushed on every change, and
	// once on mount.
	$effect(() => {
		const m = messages.current;
		void api
			.setTrayState(running.current, overlay.overlayVisible, {
				open: m.design.trayOpen,
				quit: m.design.trayQuit,
				stop: m.design.trayStop,
				show: m.design.trayShow,
				hide: m.design.trayHide,
				status: `${m.state[state.current]}${running.current ? ' · ' + clock.elapsed : ''}`
			})
			.catch(() => {});
	});

	// The opt-in crash spool (issue #25): only the unsaved part of the transcript, and only
	// while the operator has asked for it.
	$effect(() => {
		if (!spooling.current) return;
		return startRecoverySpool(
			() => (get(transcriptDirty) ? get(transcript) : null),
			(error) => statusMessage.set(spoolFailure(error))
		);
	});

	// The overlay is a separate webview, so the operator's interface language and the
	// audience's caption language are pushed to it the same way the caption size is — on load,
	// which also syncs the rest of the appearance, and on every change. One effect, so load
	// sends one config rather than one per language. Derived, so a change to some other
	// option (the audio source, say) does not push the whole appearance again.
	const captionLanguage = $derived(captionLanguageOf(setup.current));
	const secondCaptionLanguage = $derived(secondCaptionLanguageOf(setup.current));
	$effect(() => {
		overlay.pushOverlayConfig({
			locale: interfaceLocale.current,
			captionLanguage,
			secondCaptionLanguage
		});
	});
}
