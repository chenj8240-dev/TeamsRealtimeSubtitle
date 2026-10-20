// What each capture source is producing right now: its meter level, and when it last produced
// audio and a caption. Both the session status and the transcript pipeline write here, so it
// depends on neither of them.

import { get, writable } from 'svelte/store';
import type { AudioLevel, Origin } from './types';

export const micLevel = writable<AudioLevel>({ source: 'microphone', rms: 0, peak: 0 });
export const systemLevel = writable<AudioLevel>({ source: 'system', rms: 0, peak: 0 });

export const activityTimes = writable<Partial<Record<Origin, { audio: number; caption: number }>>>(
	{}
);
// Notes arrive with every meter reading (20 Hz per source) and every caption, but they feed
// labels with a three-second threshold. One note per half-second is indistinguishable there,
// and keeps the store and the component reading it from updating dozens of times a second.
const ACTIVITY_RESOLUTION_MS = 500;

export function noteActivity(origin: Origin, kind: 'audio' | 'caption', now = Date.now()) {
	const last = get(activityTimes)[origin]?.[kind] ?? 0;
	if (last > 0 && now >= last && now - last < ACTIVITY_RESOLUTION_MS) return;
	activityTimes.update((value) => ({
		...value,
		[origin]: { audio: 0, caption: 0, ...value[origin], [kind]: now }
	}));
}
