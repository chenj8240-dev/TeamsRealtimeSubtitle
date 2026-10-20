import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import UnsavedPrompt from './UnsavedPrompt.svelte';

function mount(props: Partial<Parameters<typeof render<typeof UnsavedPrompt>>[1]> = {}) {
	const onChoice = vi.fn();
	const view = render(UnsavedPrompt, {
		props: { lines: 12, endedSession: false, saving: false, error: '', onChoice, ...props }
	});
	return { ...view, onChoice };
}

describe('UnsavedPrompt', () => {
	// The three answers issue #25 requires, and no fourth way out that quietly discards.
	it('offers save, discard and cancel', () => {
		const { getByRole } = mount();
		expect(getByRole('button', { name: 'Save and close' })).toBeInTheDocument();
		expect(getByRole('button', { name: 'Discard and close' })).toBeInTheDocument();
		expect(getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('is a labelled modal dialog', () => {
		const { getByRole } = mount();
		const dialog = getByRole('dialog');
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(dialog).toHaveAccessibleName('Save this transcript before closing?');
	});

	it('says how much would be lost', () => {
		const { getByRole } = mount({ lines: 12 });
		expect(getByRole('dialog')).toHaveTextContent('12 lines have not been saved');
	});

	it('reads correctly for a single line', () => {
		const { getByRole } = mount({ lines: 1 });
		expect(getByRole('dialog')).toHaveTextContent('1 line has not been saved');
	});

	// Lines that appear during the drain would otherwise seem to come from nowhere.
	it('explains a count that grew while the session was being stopped', () => {
		const { getByRole } = mount({ endedSession: true });
		expect(getByRole('dialog')).toHaveTextContent('The session has been stopped');
	});

	it('reports each answer', async () => {
		const { getByRole, onChoice } = mount();

		await fireEvent.click(getByRole('button', { name: 'Save and close' }));
		expect(onChoice).toHaveBeenLastCalledWith('save');

		await fireEvent.click(getByRole('button', { name: 'Discard and close' }));
		expect(onChoice).toHaveBeenLastCalledWith('discard');

		await fireEvent.click(getByRole('button', { name: 'Cancel' }));
		expect(onChoice).toHaveBeenLastCalledWith('cancel');
	});

	// Save takes focus, so Enter is the answer that keeps the transcript and the destructive
	// button has to be aimed at.
	it('focuses save, and treats Escape as cancel', async () => {
		const { getByRole, onChoice } = mount();
		expect(getByRole('button', { name: 'Save and close' })).toHaveFocus();

		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onChoice).toHaveBeenCalledWith('cancel');
	});

	it('locks the answers while the file is being written', () => {
		const { getByRole } = mount({ saving: true });
		expect(getByRole('button', { name: 'Saving…' })).toBeDisabled();
		expect(getByRole('button', { name: 'Discard and close' })).toBeDisabled();
		expect(getByRole('button', { name: 'Cancel' })).toBeDisabled();
	});

	// A write that did not land must be visible, not quietly followed by a quit.
	it('shows a failed save as an alert and keeps the prompt open', () => {
		const { getByRole } = mount({ error: 'could not create "D:\\Docs"' });
		expect(getByRole('alert')).toHaveTextContent('could not create');
		expect(getByRole('button', { name: 'Save and close' })).toBeEnabled();
	});

	// Issue #24. `aria-modal` hides what is behind the dialog from a screen reader, but only a
	// trap keeps the Tab key from walking into a window the operator can no longer see.
	describe('the keyboard cannot leave it', () => {
		it('wraps forward from the last answer to the first', async () => {
			const { getByRole } = mount();
			getByRole('button', { name: 'Cancel' }).focus();

			await fireEvent.keyDown(window, { key: 'Tab' });

			expect(getByRole('button', { name: 'Save and close' })).toHaveFocus();
		});

		it('wraps backward from the first answer to the last', async () => {
			const { getByRole } = mount();
			getByRole('button', { name: 'Save and close' }).focus();

			await fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });

			expect(getByRole('button', { name: 'Cancel' })).toHaveFocus();
		});

		it('pulls focus back in when it is somewhere else entirely', async () => {
			const outside = document.createElement('button');
			document.body.append(outside);
			const { getByRole } = mount();
			outside.focus();

			await fireEvent.keyDown(window, { key: 'Tab' });

			expect(getByRole('button', { name: 'Save and close' })).toHaveFocus();
			outside.remove();
		});
	});
});
