import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import LiveRail from './LiveRail.svelte';
import { createOverlayController } from './overlayController.svelte';
import { api } from './tauri';
import { setLocale } from './i18n';
import { options } from './stores';
import { DEFAULT_START_OPTIONS } from './startOptions';
import type { SessionClock } from './sessionClock.svelte';

// One hour streamed, so the estimate reads as the hourly figure times the streams.
const clock = {
	now: Date.now(),
	elapsedMs: 3_600_000,
	streamedMs: 3_600_000,
	elapsed: '1:00:00'
} as unknown as SessionClock;

function rail(rehearsing: boolean) {
	return render(LiveRail, {
		props: {
			overlay: createOverlayController(),
			clock,
			rehearsing,
			// As the page derives them: a rehearsal is one System stream whatever source is saved.
			usesMic: !rehearsing,
			usesSystem: true
		}
	});
}

beforeEach(() => {
	setLocale('en');
	options.set({
		...DEFAULT_START_OPTIONS,
		mode: 'translate',
		provider: 'gemini',
		targetLanguage: 'fr',
		source: 'both'
	});
});
afterEach(() => options.set({ ...DEFAULT_START_OPTIONS }));

it('bills a live run on both sources as two streams', () => {
	const view = rail(false);
	expect(view.getByText('$3.46')).toBeInTheDocument();
	expect(view.getByText('×2 sources')).toBeInTheDocument();
	view.unmount();
});

// Review D17: the estimate and the tag followed the saved source, so a rehearsal with Both
// saved showed twice what it was streaming.
it('bills a rehearsal as the one System stream it is', () => {
	const view = rail(true);
	expect(view.getByText('$1.73')).toBeInTheDocument();
	expect(view.queryByText('×2 sources')).toBeNull();
	view.unmount();
});

it('counts each caption language of a rehearsal as its own stream', () => {
	options.update((value) => ({ ...value, secondTargetLanguage: 'de' }));
	const view = rail(true);
	expect(view.getByText('$3.46')).toBeInTheDocument();
	expect(view.getByText('×2 languages')).toBeInTheDocument();
	expect(view.queryByText('×2 sources')).toBeNull();
	view.unmount();
});

// Review D21: the name already flips between moving and finishing, so a pressed state on top of
// it was read as "Finish moving the overlay, toggle button, pressed".
it('names the move button by what a press does, without a pressed state', async () => {
	const overlay = createOverlayController({
		...api,
		showOverlay: vi.fn().mockResolvedValue(undefined),
		setOverlayClickThrough: vi.fn().mockResolvedValue(undefined),
		setOverlayConfig: vi.fn().mockResolvedValue(undefined)
	});
	const view = render(LiveRail, {
		props: { overlay, clock, rehearsing: false, usesMic: true, usesSystem: true }
	});
	const move = view.getByRole('button', { name: 'Move overlay' });
	expect(move).not.toHaveAttribute('aria-pressed');
	await fireEvent.click(move);
	const done = await waitFor(() => view.getByRole('button', { name: 'Finish moving the overlay' }));
	expect(done).not.toHaveAttribute('aria-pressed');
	view.unmount();
});
