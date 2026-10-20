import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ReadingPreferences from './ReadingPreferences.svelte';
import { createOverlayController } from './overlayController.svelte';
import { api } from './tauri';
import { setLocale } from './i18n';
import { overlayCaptionLayout, overlayCaptionWidth, overlayHoldSeconds } from './stores';
import { HOLD_SECONDS_MAX, HOLD_SECONDS_MIN } from './reading';
import { OVERLAY_WIDTH_MAX, OVERLAY_WIDTH_MIN } from './appearance';

afterEach(() => {
	setLocale('en');
	overlayCaptionLayout.set('fit');
});

function preferences() {
	const overlay = createOverlayController({
		...api,
		setOverlayConfig: vi.fn().mockResolvedValue(undefined)
	});
	return render(ReadingPreferences, { overlay });
}

// Review D22: the width buttons were read as "Line width −" and "Line width +", though the
// catalog has words for them, and the bounds were written out again beside the clamp.
it('names the width buttons in words and stops them at the shared bounds', async () => {
	overlayCaptionLayout.set('compact');
	overlayCaptionWidth.set(OVERLAY_WIDTH_MAX - 2);
	const view = preferences();
	const wider = view.getByRole('button', { name: 'Longer caption lines' });
	await fireEvent.click(wider);
	expect(get(overlayCaptionWidth)).toBe(OVERLAY_WIDTH_MAX);
	expect(wider).toBeDisabled();

	overlayCaptionWidth.set(OVERLAY_WIDTH_MIN);
	await Promise.resolve();
	expect(view.getByRole('button', { name: 'Shorter caption lines' })).toBeDisabled();
	view.unmount();

	setLocale('fr');
	const french = preferences();
	expect(
		french.getByRole('button', { name: 'Allonger les lignes de sous-titres' })
	).toBeInTheDocument();
	french.unmount();
});

it('stops the reading pause at the bounds its clamp keeps', async () => {
	overlayHoldSeconds.set(HOLD_SECONDS_MAX);
	const view = preferences();
	const buttons = view.container.querySelectorAll<HTMLButtonElement>('.ui-stepper button');
	expect(buttons[1]).toBeDisabled();
	overlayHoldSeconds.set(HOLD_SECONDS_MIN);
	await Promise.resolve();
	expect(buttons[0]).toBeDisabled();
	view.unmount();
});
