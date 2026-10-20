import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import ActiveSessionPrompt from './ActiveSessionPrompt.svelte';

function mount(overrides: Record<string, unknown> = {}) {
	const onChoice = vi.fn();
	const view = render(ActiveSessionPrompt, {
		props: { elapsed: '42:17', fromTray: false, onChoice, ...overrides }
	});
	return { ...view, onChoice };
}

describe('ActiveSessionPrompt', () => {
	it('is a labelled modal dialog', () => {
		const dialog = mount().getByRole('dialog');
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(dialog).toHaveAccessibleName('A caption session is running');
	});

	// Naming what would be lost, rather than asking about an abstraction.
	it('says how long the session has been live', () => {
		expect(mount({ elapsed: '42:17' }).getByRole('dialog')).toHaveTextContent(
			'Captions have been live for 42:17'
		);
	});

	// The accident this whole issue exists to prevent: one click on the X ending an event's
	// captions. So the safe answer is the default one.
	it('focuses the answer that keeps captioning', () => {
		expect(mount().getByRole('button', { name: 'Keep captioning' })).toHaveFocus();
	});

	// Quitting gives local Whisper a few seconds and then discards the rest of its backlog, so
	// the operator hears how much before choosing — and nothing when there is none.
	it('says how much untranscribed Whisper audio closing would discard', () => {
		for (const props of [{}, { pendingSeconds: 0 }]) {
			const view = mount(props);
			expect(view.getByRole('dialog')).not.toHaveTextContent('to transcribe');
			view.unmount();
		}
		expect(mount({ pendingSeconds: 95 }).getByRole('dialog')).toHaveTextContent(
			'Local Whisper still has 95 s of audio to process'
		);
	});

	it('reports each answer', async () => {
		const { getByRole, onChoice } = mount();

		await fireEvent.click(getByRole('button', { name: 'Keep captioning' }));
		expect(onChoice).toHaveBeenLastCalledWith(false);

		await fireEvent.click(getByRole('button', { name: 'Stop and close' }));
		expect(onChoice).toHaveBeenLastCalledWith(true);
	});

	it('treats Escape as keeping the session', async () => {
		const { onChoice } = mount();
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onChoice).toHaveBeenCalledWith(false);
	});

	// When the X is what raised this, the operator has a way to get what they probably wanted
	// — the window gone, the captions running.
	it('points at the tray when the request came from the window', () => {
		expect(mount({ fromTray: false }).getByRole('dialog')).toHaveTextContent('Minimize to tray');
	});

	it('does not point back at the tray when the request came from it', () => {
		expect(mount({ fromTray: true }).getByRole('dialog')).not.toHaveTextContent('Minimize to tray');
	});
});
