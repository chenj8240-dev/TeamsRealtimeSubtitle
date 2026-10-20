import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/svelte';
import FillerWordList from './FillerWordList.svelte';
import ReadingPreferences from './ReadingPreferences.svelte';
import { createOverlayController } from './overlayController.svelte';
import { api } from './tauri';
import { overlayCleanSpeech, overlayFillerWords } from './stores';
import { DEFAULT_FILLER_WORDS, FILLER_WORDS_KEY } from './cleanSpeech';
import { setLocale } from './i18n';

const DEFAULTS = [...DEFAULT_FILLER_WORDS];

function controller() {
	const setOverlayConfig = vi.fn().mockResolvedValue(undefined);
	return { overlay: createOverlayController({ ...api, setOverlayConfig }), setOverlayConfig };
}

beforeEach(() => {
	overlayCleanSpeech.set(true);
	overlayFillerWords.set(DEFAULTS);
});

afterEach(() => {
	overlayCleanSpeech.set(false);
	overlayFillerWords.set(DEFAULTS);
	setLocale('en');
});

it('shows the active list under Hide filler words only while it is on', async () => {
	overlayCleanSpeech.set(false);
	const { overlay } = controller();
	const view = render(ReadingPreferences, { overlay });
	expect(view.queryByRole('group', { name: 'Words to hide' })).toBeNull();
	await fireEvent.click(view.getByLabelText('Hide filler words'));
	const list = view.getByRole('list', { name: 'Words to hide' });
	expect(
		within(list)
			.getAllByRole('button')
			.map((b) => b.getAttribute('aria-label'))
	).toEqual(DEFAULTS.map((word) => `Remove “${word}”`));
	// The meaning warning is part of what the group says, not only a tooltip.
	expect(view.getByText(/whatever it means there/)).toBeInTheDocument();
});

it('adds, removes and resets words, storing and pushing every change live', async () => {
	const { overlay, setOverlayConfig } = controller();
	const view = render(FillerWordList, { overlay });
	const field = view.getByLabelText('Add a word');

	await fireEvent.input(field, { target: { value: '  bah ' } });
	await fireEvent.click(view.getByRole('button', { name: 'Add' }));
	expect(get(overlayFillerWords)).toEqual([...DEFAULTS, 'bah']);
	expect(JSON.parse(localStorage.getItem(FILLER_WORDS_KEY)!)).toEqual([...DEFAULTS, 'bah']);
	expect(setOverlayConfig).toHaveBeenLastCalledWith(
		expect.objectContaining({ fillerWords: [...DEFAULTS, 'bah'] })
	);
	expect(field).toHaveValue('');
	await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('“bah” added.'));

	await fireEvent.click(view.getByRole('button', { name: 'Remove “um”' }));
	expect(get(overlayFillerWords)).toEqual(['uh', 'erm', 'hmm', 'euh', 'heu', 'bah']);
	expect(setOverlayConfig).toHaveBeenLastCalledWith(
		expect.objectContaining({ fillerWords: ['uh', 'erm', 'hmm', 'euh', 'heu', 'bah'] })
	);
	// Focus stays in the list, on the word that took the removed one's place.
	await waitFor(() => expect(view.getByRole('button', { name: 'Remove “uh”' })).toHaveFocus());
	await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('“um” removed.'));

	const reset = view.getByRole('button', { name: 'Reset to defaults' });
	await fireEvent.click(reset);
	expect(get(overlayFillerWords)).toEqual(DEFAULTS);
	// Back on the built-in list, nothing is stored: later defaults would reach it.
	expect(localStorage.getItem(FILLER_WORDS_KEY)).toBeNull();
	expect(setOverlayConfig).toHaveBeenLastCalledWith(
		expect.objectContaining({ fillerWords: DEFAULTS })
	);
	await waitFor(() => expect(reset).toBeDisabled());
	expect(field).toHaveFocus();
	await waitFor(() =>
		expect(view.getByRole('status')).toHaveTextContent('Default words restored.')
	);
});

it('explains a rejected entry beside the field, and clears it on the next edit', async () => {
	const { overlay, setOverlayConfig } = controller();
	const view = render(FillerWordList, { overlay });
	const field = view.getByLabelText('Add a word');
	const add = view.getByRole('button', { name: 'Add' });

	await fireEvent.input(field, { target: { value: '   ' } });
	expect(add).toBeDisabled();

	await fireEvent.input(field, { target: { value: 'you know' } });
	await fireEvent.click(add);
	const alert = view.getByRole('alert');
	expect(alert).toHaveTextContent('Add one word at a time.');
	expect(field).toHaveAttribute('aria-invalid', 'true');
	expect(field).toHaveAttribute('aria-describedby', alert.id);

	await fireEvent.input(field, { target: { value: ' UM ' } });
	expect(view.queryByRole('alert')).toBeNull();
	expect(field).not.toHaveAttribute('aria-invalid');
	await fireEvent.click(add);
	expect(view.getByRole('alert')).toHaveTextContent('“UM” is already in the list.');

	await fireEvent.input(field, { target: { value: '«um»' } });
	await fireEvent.click(add);
	expect(view.getByRole('alert')).toHaveTextContent('Use letters and numbers.');

	expect(get(overlayFillerWords)).toEqual(DEFAULTS);
	expect(setOverlayConfig).not.toHaveBeenCalled();
});

it('lets the list be emptied on purpose, and says that nothing is hidden', async () => {
	const { overlay, setOverlayConfig } = controller();
	const view = render(FillerWordList, { overlay });
	for (const word of DEFAULTS)
		await fireEvent.click(view.getByRole('button', { name: `Remove “${word}”` }));
	expect(view.queryByRole('list')).toBeNull();
	expect(view.getByText('The list is empty, so nothing is hidden.')).toBeInTheDocument();
	expect(localStorage.getItem(FILLER_WORDS_KEY)).toBe('[]');
	expect(setOverlayConfig).toHaveBeenLastCalledWith(expect.objectContaining({ fillerWords: [] }));
	await waitFor(() => expect(view.getByLabelText('Add a word')).toHaveFocus());
	expect(view.getByRole('button', { name: 'Reset to defaults' })).not.toBeDisabled();
});

it('keeps a curated list through Reset appearance, which only switches the filter off', async () => {
	const { overlay, setOverlayConfig } = controller();
	overlay.setFillerWords(['bah']);
	overlay.resetOverlayAppearance();
	expect(get(overlayCleanSpeech)).toBe(false);
	expect(get(overlayFillerWords)).toEqual(['bah']);
	expect(setOverlayConfig).toHaveBeenLastCalledWith(
		expect.objectContaining({ cleanSpeech: false, fillerWords: ['bah'] })
	);
});

it('is translated, with each language’s own quotation marks', async () => {
	const { overlay } = controller();
	setLocale('fr');
	const fr = render(FillerWordList, { overlay });
	expect(fr.getByRole('group', { name: 'Mots à masquer' })).toBeInTheDocument();
	expect(fr.getByRole('button', { name: 'Retirer « um »' })).toBeInTheDocument();
	fr.unmount();
	setLocale('de');
	const de = render(FillerWordList, { overlay });
	expect(de.getByRole('group', { name: 'Auszublendende Wörter' })).toBeInTheDocument();
	expect(de.getByRole('button', { name: '„um“ entfernen' })).toBeInTheDocument();
	expect(de.getByRole('button', { name: 'Standardwörter wiederherstellen' })).toBeDisabled();
});
