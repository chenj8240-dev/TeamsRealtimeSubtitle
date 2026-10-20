import { expect, it } from 'vitest';
import { formatElapsed } from './sessionClock.svelte';

it('shows minutes and seconds, adding hours only once a session passes one', () => {
	expect(formatElapsed(0)).toBe('00:00');
	expect(formatElapsed(59_999)).toBe('00:59');
	expect(formatElapsed(61_000)).toBe('01:01');
	expect(formatElapsed(3_599_000)).toBe('59:59');
	expect(formatElapsed(3_600_000)).toBe('1:00:00');
	expect(formatElapsed(36_125_000)).toBe('10:02:05');
});
