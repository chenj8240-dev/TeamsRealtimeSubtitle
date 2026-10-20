import { fromStore } from 'svelte/store';
import { isRunning, pausedTime, sessionStartedAt, streamedMs } from './stores';

/** `mm:ss`, or `h:mm:ss` once a session passes an hour. */
export function formatElapsed(ms: number): string {
	const total = Math.floor(ms / 1000);
	const pad = (n: number) => String(n).padStart(2, '0');
	const seconds = total % 60;
	const minutes = Math.floor(total / 60) % 60;
	const hours = Math.floor(total / 3600);
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** A clock that ticks once a second while a session is open, and the session's elapsed time
 *  on it. Create it while a component initialises: the tick is an effect, and stops with the
 *  session or when the component goes away. */
export function createSessionClock() {
	const running = fromStore(isRunning);
	const startedAt = fromStore(sessionStartedAt);
	const paused = fromStore(pausedTime);
	let now = $state(Date.now());
	$effect(() => {
		if (!running.current) return;
		now = Date.now();
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});
	const elapsedMs = $derived(startedAt.current === null ? 0 : Math.max(0, now - startedAt.current));
	return {
		/** The tick itself, for labels that age with it. */
		get now() {
			return now;
		},
		get elapsedMs() {
			return elapsedMs;
		},
		/** The part of the session that was not paused: what a provider bills. */
		get streamedMs() {
			return streamedMs(elapsedMs, paused.current, now);
		},
		get elapsed() {
			return formatElapsed(elapsedMs);
		}
	};
}
export type SessionClock = ReturnType<typeof createSessionClock>;
