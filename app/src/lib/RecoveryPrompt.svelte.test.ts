import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import RecoveryPrompt from './RecoveryPrompt.svelte';

function mount(overrides: Record<string, unknown> = {}) {
	const onRestore = vi.fn();
	const onDelete = vi.fn();
	const view = render(RecoveryPrompt, {
		props: {
			lines: 42,
			savedAt: '26/08/2026, 09:30:00',
			path: 'C:\\Users\\op\\AppData\\Local\\io.github.fmadore.live-translation\\recovery\\transcript.json',
			onRestore,
			onDelete,
			...overrides
		}
	});
	return { ...view, onRestore, onDelete };
}

describe('RecoveryPrompt', () => {
	// The metadata is the whole reason the offer is trustworthy: how much, from when, and
	// exactly which file either answer removes.
	it('reports how much was spooled, when, and where it sits', () => {
		const { getByRole } = mount();
		const dialog = getByRole('dialog');

		expect(dialog).toHaveTextContent('42 unsaved lines');
		expect(dialog).toHaveTextContent('26/08/2026, 09:30:00');
		expect(dialog).toHaveTextContent('recovery\\transcript.json');
	});

	it('reads correctly for a single line', () => {
		expect(mount({ lines: 1 }).getByRole('dialog')).toHaveTextContent('1 unsaved line');
	});

	it('says the spool never left the machine', () => {
		expect(mount().getByRole('dialog')).toHaveTextContent('have not left this PC');
	});

	it('is a labelled modal dialog', () => {
		const dialog = mount().getByRole('dialog');
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(dialog).toHaveAccessibleName('Recover the transcript from your last session?');
	});

	it('offers both answers and reports which was chosen', async () => {
		const { getByRole, onRestore, onDelete } = mount();

		await fireEvent.click(getByRole('button', { name: 'Restore the transcript' }));
		expect(onRestore).toHaveBeenCalledTimes(1);

		await fireEvent.click(getByRole('button', { name: 'Delete it' }));
		expect(onDelete).toHaveBeenCalledTimes(1);
	});

	it('focuses the answer that keeps the text', () => {
		const { getByRole } = mount();
		expect(getByRole('button', { name: 'Restore the transcript' })).toHaveFocus();
	});

	// Escape would leave captions on disk that the operator never chose to keep — the one
	// outcome this feature must not produce.
	it('cannot be dismissed without an answer', async () => {
		const { onRestore, onDelete } = mount();

		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(onRestore).not.toHaveBeenCalled();
		expect(onDelete).not.toHaveBeenCalled();
	});
});
