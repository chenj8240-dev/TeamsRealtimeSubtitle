import { expect, it } from 'vitest';
import { activity } from './liveActivity';
it('distinguishes silence, audio, recent text and missing captions without calling silence a failure', () => {
	expect(activity('running', 20000, 1000, 0, 0)).toBe('listening');
	expect(activity('running', 5000, 1000, 4900, 0)).toBe('audio');
	expect(activity('running', 20000, 1000, 19000, 0)).toBe('stale');
	expect(activity('running', 20000, 1000, 19000, 19500)).toBe('captions');
	expect(activity('reconnecting', 20000, 1000, 19000, 19500)).toBe('reconnecting');
	expect(activity('error', 20000, 1000, 19000, 19500)).toBe('error');
});
