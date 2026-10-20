import { get } from 'svelte/store';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/svelte';
import ReadingPreferences from './ReadingPreferences.svelte';
import CaptionPreview from './CaptionPreview.svelte';
import CaptionAppearance from './CaptionAppearance.svelte';
import { createOverlayController } from './overlayController.svelte';
import { api } from './tauri';
import {
	overlayHoldSeconds,
	overlayPace,
	overlayFontSize,
	overlayCaptionLayout,
	overlayCaptionWidth,
	overlayCleanSpeech,
	overlayPalette
} from './stores';
import { loadCleanSpeech } from './cleanSpeech';
import { CAPTION_LAYOUT_KEY, loadCaptionLayout } from './captionLayout';

it('keeps both appearances synchronized with separate accessible contrast descriptions', async () => {
	const setOverlayConfig = vi.fn().mockResolvedValue(undefined);
	const overlay = createOverlayController({ ...api, setOverlayConfig });
	overlayFontSize.set(42);
	const rail = render(CaptionAppearance, { heading: 'Rail', overlay });
	const settings = render(CaptionAppearance, { heading: 'Settings', overlay });
	const descriptions = Array.from(document.querySelectorAll('[aria-describedby]'));
	const ids = descriptions.map((node) => node.getAttribute('aria-describedby'));
	expect(new Set(ids).size).toBe(2);
	for (const id of ids) expect(document.getElementById(id!)).not.toBeNull();
	const increase = Array.from(rail.container.querySelectorAll('button')).find(
		(node) => node.textContent?.trim() === '+'
	)!;
	await fireEvent.click(increase);
	await waitFor(() => {
		expect(rail.container.querySelector('.ui-stepper output')?.textContent).toBe('44 px');
		expect(settings.container.querySelector('.ui-stepper output')?.textContent).toBe('44 px');
	});
	expect(setOverlayConfig).toHaveBeenCalledTimes(1);
	rail.unmount();
	settings.unmount();
});

it('persists stable reading and display cleanup, synchronizes both windows, and resets both', async () => {
	const setOverlayConfig = vi.fn().mockResolvedValue(undefined);
	const overlay = createOverlayController({ ...api, setOverlayConfig });
	overlayCaptionLayout.set('fit');
	overlayCleanSpeech.set(false);
	const view = render(ReadingPreferences, { overlay });
	await fireEvent.change(view.container.querySelector('select')!, { target: { value: 'stable' } });
	await fireEvent.click(view.getByLabelText('Hide filler words'));
	expect(loadCaptionLayout()).toBe('stable');
	expect(loadCleanSpeech()).toBe(true);
	expect(setOverlayConfig).toHaveBeenLastCalledWith(
		expect.objectContaining({ captionLayout: 'stable', cleanSpeech: true })
	);
	overlay.resetOverlayAppearance();
	await waitFor(() => expect(view.getByLabelText('Hide filler words')).not.toBeChecked());
	expect(loadCaptionLayout()).toBe('fit');
	expect(loadCleanSpeech()).toBe(false);
	view.unmount();
});

it('switches layout live, remembers compact width, and resets to fit window', async () => {
	const setOverlayConfig = vi.fn().mockResolvedValue(undefined);
	const overlay = createOverlayController({ ...api, setOverlayConfig });
	overlayCaptionLayout.set('fit');
	overlayCaptionWidth.set(44);
	const view = render(ReadingPreferences, { overlay });
	const selector = view.container.querySelector('select')!;
	expect(view.container.querySelectorAll('.ui-stepper')).toHaveLength(1);
	await fireEvent.change(selector, { target: { value: 'compact' } });
	expect(view.container.querySelectorAll('.ui-stepper')).toHaveLength(2);
	expect(setOverlayConfig).toHaveBeenLastCalledWith(
		expect.objectContaining({ captionLayout: 'compact', captionWidth: 44 })
	);
	expect(localStorage.getItem(CAPTION_LAYOUT_KEY)).toBe('compact');
	expect(loadCaptionLayout()).toBe('compact');
	await fireEvent.change(selector, { target: { value: 'fit' } });
	await fireEvent.change(selector, { target: { value: 'compact' } });
	expect(setOverlayConfig).toHaveBeenLastCalledWith(expect.objectContaining({ captionWidth: 44 }));
	overlay.resetOverlayAppearance();
	await waitFor(() => expect(selector.value).toBe('fit'));
	expect(loadCaptionLayout()).toBe('fit');
	view.unmount();
});

it('updates reading preferences, previews presets, and resets the complete appearance', async () => {
	const setOverlayConfig = vi.fn().mockResolvedValue(undefined);
	const overlay = createOverlayController({ ...api, setOverlayConfig });
	overlay.resetOverlayAppearance();
	const view = render(ReadingPreferences, { overlay });
	for (let i = 0; i < 5; i++)
		await fireEvent.click(view.getByRole('button', { name: 'Keep finished captions (seconds) +' }));
	await fireEvent.change(view.getByLabelText('Caption updates'), { target: { value: 'steady' } });
	expect(get(overlayHoldSeconds)).toBe(9);
	expect(get(overlayPace)).toBe('steady');
	const presets = render(CaptionPreview, { overlay, part: 'presets' });
	await fireEvent.click(presets.getByText('Large room'));
	expect(get(overlayFontSize)).toBe(52);
	expect(get(overlayCaptionLayout)).toBe('stable');
	expect(view.getByRole('button', { name: 'Keep finished captions (seconds) +' })).toBeDisabled();
	overlay.resetOverlayAppearance();
	await waitFor(() =>
		expect(
			view.getByRole('button', { name: 'Keep finished captions (seconds) +' })
		).not.toBeDisabled()
	);
	expect(get(overlayHoldSeconds)).toBe(4);
	expect(get(overlayPace)).toBe('immediate');
	presets.unmount();
	view.unmount();
});

// The quick-pick swatches used to be named by their hex value, so a screen reader read out
// "#fff0b3"; they are named colours now, and choosing one is announced as the pressed state.
it('names the colour swatches and marks the chosen one as pressed', async () => {
	const overlay = createOverlayController({
		...api,
		setOverlayConfig: vi.fn().mockResolvedValue(undefined)
	});
	const view = render(CaptionAppearance, { heading: 'Settings', overlay, compact: true });
	const text = view.getByRole('group', { name: 'Caption colour' });
	const mint = within(text).getByRole('button', { name: 'Mint' });
	expect(within(text).queryByRole('button', { name: /^#/ })).toBeNull();
	await fireEvent.click(mint);
	await waitFor(() => expect(mint).toHaveAttribute('aria-pressed', 'true'));
	expect(within(text).getByRole('button', { name: 'White' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	overlay.resetOverlayAppearance();
	view.unmount();
});

// The backing is stored as a fraction but stepped in whole percent: a step past the ceiling
// stops on it, and the stronger button is disabled there, as it was before the shared Stepper.
it('steps the backing strength in whole percent and stops at its ceiling', async () => {
	const overlay = createOverlayController({
		...api,
		setOverlayConfig: vi.fn().mockResolvedValue(undefined)
	});
	overlay.resetOverlayAppearance();
	const view = render(CaptionAppearance, { heading: 'Rail', overlay, compact: true });
	const backing = within(view.container).getByRole('group', { name: 'Backing strength' });
	const stronger = within(backing).getByRole('button', {
		name: 'Stronger backing behind the captions'
	});
	expect(backing.querySelector('output')?.textContent).toBe('72%');
	for (let i = 0; i < 5; i++) await fireEvent.click(stronger);
	await waitFor(() => expect(backing.querySelector('output')?.textContent).toBe('95%'));
	expect(get(overlayPalette).scrimOpacity).toBe(0.95);
	expect(stronger).toBeDisabled();
	await fireEvent.click(
		within(backing).getByRole('button', { name: 'Weaker backing behind the captions' })
	);
	expect(get(overlayPalette).scrimOpacity).toBe(0.9);
	overlay.resetOverlayAppearance();
	view.unmount();
});
