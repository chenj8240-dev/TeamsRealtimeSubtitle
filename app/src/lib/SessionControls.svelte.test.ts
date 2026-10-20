import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import SessionControls from './SessionControls.svelte';
import OperatorToolbar from './OperatorToolbar.svelte';
import { setLocale } from './i18n';
import { originStates } from './stores';

function controls(paused = false, onPause = vi.fn()) {
	return render(SessionControls, {
		props: {
			busy: false,
			startDisabled: false,
			rehearseDisabled: false,
			paused,
			onStart: vi.fn(),
			onRehearse: vi.fn(),
			onStop: vi.fn(),
			onPause
		}
	});
}

afterEach(() => {
	originStates.set({});
	setLocale('en');
});

describe('the session actions', () => {
	// The key used to float after Rehearse as a chip that read as a third button. It is part of
	// the action it triggers now, printed in the interface language and announced as a
	// shortcut rather than as part of the button's name.
	it('carry the start key on Start, outside its accessible name', () => {
		const start = controls().getAllByRole('button')[0];
		expect(start).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Space');
		expect(start).toHaveTextContent('Ctrl+Shift+Space');
		expect(start).not.toHaveAccessibleName(/Ctrl/);
	});

	it('print the key the way the interface language names it', () => {
		setLocale('de');
		expect(controls().getAllByRole('button')[0]).toHaveTextContent('Strg+Umschalt+Leertaste');
	});

	it('put the same key on Stop, because it stops too', () => {
		originStates.set({ system: 'running' });
		const stop = controls().getByRole('button', { name: /Stop/ });
		expect(stop).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Space');
		expect(stop).not.toHaveAccessibleName(/Ctrl/);
	});

	// The label says what a press does. A pressed state on top of it made Narrator read
	// "Resume, toggle button, pressed", which says the opposite of what is going on.
	it('offer Pause beside Stop while running, and Resume once paused, as plain actions', async () => {
		originStates.set({ system: 'running' });
		const onPause = vi.fn();
		const pause = controls(false, onPause).getByRole('button', { name: /Pause/ });
		expect(pause).not.toHaveAttribute('aria-pressed');
		expect(pause).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+P');
		pause.click();
		expect(onPause).toHaveBeenCalledOnce();

		originStates.set({ system: 'paused' });
		const resume = controls(true).getByRole('button', { name: /Resume/ });
		expect(resume).not.toHaveAttribute('aria-pressed');
	});

	it('leave Rehearse without a shortcut of its own', () => {
		const rehearse = controls().getAllByRole('button')[1];
		expect(rehearse).not.toHaveAttribute('aria-keyshortcuts');
	});
});

describe('the operator toolbar', () => {
	// Windows prints the name in the frame, so the bar no longer does; the heading that the
	// rest of the window hangs from has to survive that for Narrator's heading navigation.
	it('keeps the window a single h1, and renders the actions it is given', () => {
		const view = render(OperatorToolbar, {
			props: {
				elapsed: '00:00',
				settingsOpen: false,
				onOpenSettings: vi.fn(),
				actions: createRawSnippet(() => ({ render: () => '<button>Start</button>' }))
			}
		});
		expect(view.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Live Translation & Subtitles'
		);
		expect(view.getByRole('button', { name: 'Start' })).toBeInTheDocument();
		expect(view.getByRole('button', { name: 'Open settings' })).toHaveAttribute(
			'aria-haspopup',
			'dialog'
		);
	});
});
