import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCaptionPresenter, loadHoldSeconds, loadPace } from './reading';
import type { Caption } from './types';
const c: Caption = {
	startMs: 0,
	endMs: 1000,
	origin: 'microphone',
	turnId: 1,
	text: 'Um, a sentence',
	sourceText: 'source',
	final: false
};
beforeEach(() => {
	const data = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => data.set(k, v),
		clear: () => data.clear()
	});
});
afterEach(() => {
	vi.useRealTimers();
	localStorage.clear();
});
it('batches continuous partials without indefinitely postponing text, with independent sources', () => {
	vi.useFakeTimers();
	const show = vi.fn();
	const presenter = createCaptionPresenter(show, () => 'steady');
	presenter.push(c);
	vi.advanceTimersByTime(300);
	presenter.push({ ...c, text: 'Revised text' });
	presenter.push({ ...c, origin: 'system' });
	vi.advanceTimersByTime(150);
	expect(show).toHaveBeenCalledTimes(1);
	expect(show.mock.calls[0][0].text).toBe('Revised text');
	vi.advanceTimersByTime(300);
	expect(show.mock.calls[1][0].origin).toBe('system');
	expect(c.text).toBe('Um, a sentence');
});
it('flushes final text immediately, preserves turn transitions and cancels on stop', () => {
	vi.useFakeTimers();
	const show = vi.fn();
	const presenter = createCaptionPresenter(show, () => 'steady');
	presenter.push(c);
	presenter.push({ ...c, turnId: 2, text: 'Next' });
	expect(show.mock.calls[0][0]).toEqual(c);
	presenter.push({ ...c, turnId: 2, final: true, text: 'Next final' });
	expect(show.mock.calls[1][0].text).toBe('Next final');
	presenter.push({ ...c, turnId: 3 });
	presenter.clear();
	vi.runAllTimers();
	expect(show).toHaveBeenCalledTimes(2);
});
it('keeps defaults and validates persisted reading preferences', () => {
	expect(loadHoldSeconds()).toBe(4);
	expect(loadPace()).toBe('immediate');
	localStorage.setItem('overlay.holdSeconds', 'NaN');
	expect(loadHoldSeconds()).toBe(4);
	localStorage.setItem('overlay.holdSeconds', '999');
	expect(loadHoldSeconds()).toBe(30);
	localStorage.setItem('overlay.pace', 'steady');
	expect(loadPace()).toBe('steady');
});
