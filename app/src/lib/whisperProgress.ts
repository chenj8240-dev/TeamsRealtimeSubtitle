// Local Whisper's backlog, per source, as the core reports it on `whisper-progress`. Shared
// rather than kept in the activity strip, because the quit prompt has to say how much audio
// leaving now would discard.

import { derived, writable } from 'svelte/store';
import type { Origin, WhisperProgress } from './types';

export const whisperProgress = writable<Partial<Record<Origin, WhisperProgress>>>({});

/** The larger source backlog, in whole seconds rounded up: the sources run side by side, so
 *  the longer one is how long finishing takes. */
export const whisperPendingSeconds = derived(whisperProgress, (progress) =>
	Math.ceil(Math.max(0, ...Object.values(progress).map((p) => p.pendingMs)) / 1000)
);

/** Some source has stopped taking audio and is working through what is left. */
export const whisperFinalizing = derived(whisperProgress, (progress) =>
	Object.values(progress).some((p) => p.finalizing)
);

export function noteWhisperProgress(update: WhisperProgress) {
	whisperProgress.update((progress) => ({ ...progress, [update.origin]: update }));
}
