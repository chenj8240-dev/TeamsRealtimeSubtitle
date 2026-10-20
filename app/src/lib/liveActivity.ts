import type { SessionState } from './types';
export type Activity =
	| 'idle'
	| 'error'
	| 'connecting'
	| 'reconnecting'
	| 'paused'
	| 'captions'
	| 'audio'
	| 'listening'
	| 'stale';
export function activity(
	state: SessionState,
	now: number,
	started: number,
	lastAudio: number,
	lastCaption: number
): Activity {
	if (state !== 'running') return state;
	if (now - lastCaption < 3000 && lastCaption > 0) return 'captions';
	if (lastAudio > 0 && now - lastAudio < 3000)
		return now - Math.max(started, lastCaption) >= 15000 ? 'stale' : 'audio';
	return 'listening';
}
