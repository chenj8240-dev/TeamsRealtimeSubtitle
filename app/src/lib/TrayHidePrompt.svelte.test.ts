import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import TrayHidePrompt from './TrayHidePrompt.svelte';

function mount(overrides: Record<string, unknown> = {}) {
	const onChoice = vi.fn();
	const view = render(TrayHidePrompt, { props: { running: true, onChoice, ...overrides } });
	return { ...view, onChoice };
}

describe('TrayHidePrompt', () => {
	it('is a labelled modal dialog', () => {
		const dialog = mount().getByRole('dialog');
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(dialog).toHaveAccessibleName('Live Translation will keep running');
	});

	// The message that has to land: the app is about to leave the taskbar, and where to find
	// it afterwards.
	it('says the window is going and where the app will be', () => {
		const dialog = mount().getByRole('dialog');
		expect(dialog).toHaveTextContent('disappear from the taskbar');
		expect(dialog).toHaveTextContent('notification area');
	});

	// An app that vanishes while still holding a microphone is the case worth being explicit
	// about.
	it('says the session carries on when one is running', () => {
		expect(mount({ running: true }).getByRole('dialog')).toHaveTextContent('keep captioning');
	});

	it('does not claim to be captioning when nothing is', () => {
		const dialog = mount({ running: false }).getByRole('dialog');
		expect(dialog).not.toHaveTextContent('keep captioning');
		expect(dialog).toHaveTextContent('stay ready');
	});

	it('offers both answers and reports which was chosen', async () => {
		const { getByRole, onChoice } = mount();

		await fireEvent.click(getByRole('button', { name: 'Got it — hide to the tray' }));
		expect(onChoice).toHaveBeenLastCalledWith('hide');

		await fireEvent.click(getByRole('button', { name: 'Quit instead' }));
		expect(onChoice).toHaveBeenLastCalledWith('quit');
	});

	it('focuses the answer that matches the preference already set', () => {
		expect(mount().getByRole('button', { name: 'Got it — hide to the tray' })).toHaveFocus();
	});

	// Escape means "I did not mean to hide", which is the quit path — never a silent hide
	// that skips the one explanation.
	it('treats Escape as quitting rather than hiding', async () => {
		const { onChoice } = mount();
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onChoice).toHaveBeenCalledWith('quit');
	});
});
