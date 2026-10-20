// Svelte stores shared across the operator window, gathered from the modules that own them so
// a component imports them from one place. The overlay window keeps its own minimal state (see
// routes/overlay/+page.svelte) so it stays lightweight.
//
// - sessionStatus: each source's state and their aggregate, pause, the run's clock and the
//   status line, with `applyStatus` and `beginSession`.
// - transcriptLog: the turns on screen, the finalized log and whether it has been saved.
// - sourceActivity: each source's meter level and when it last produced audio or a caption.
// - preferences: everything persisted, from the session setup to the appearance as a whole.

import { writable } from 'svelte/store';
import type { WhisperModelInfo } from './types';

export * from './sessionStatus';
export * from './transcriptLog';
export * from './sourceActivity';
export * from './preferences';

/** The Whisper models as the core last listed them, for the model picker and the start gate.
 *  Neither status nor a preference, and too small for a module of its own. */
export const whisperModels = writable<WhisperModelInfo[]>([]);
