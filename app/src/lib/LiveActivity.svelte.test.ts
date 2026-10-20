import { afterEach, beforeEach, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import LiveActivity from './LiveActivity.svelte';
import { setLocale } from './i18n';
import { activityTimes, originStates, sessionStartedAt } from './stores';

const now = 1_000_000;

beforeEach(() => {
	setLocale('en');
	sessionStartedAt.set(now - 20_000);
	originStates.set({ system: 'running', microphone: 'running' });
	activityTimes.set({});
});
afterEach(() => {
	originStates.set({});
	activityTimes.set({});
	sessionStartedAt.set(null);
});

function live() {
	return render(LiveActivity, { props: { now, microphone: true, system: true } });
}

// Review D21: the whole panel was the live region, and its labels flip with every pause in
// speech, so Narrator could read it out again and again. Only going wrong is announced now.
it('shows every source but announces nothing while they are well', () => {
	activityTimes.set({ system: { audio: now - 1000, caption: now - 1000 } });
	const view = live();
	expect(view.getByRole('group', { name: 'Live input status' })).toHaveTextContent(
		/Remote · Receiving captions/
	);
	expect(view.getByRole('status')).toHaveTextContent(/^$/);
	view.unmount();
});

it('announces a source that has gone quiet on captions or stopped with an error', async () => {
	// Audio for 20 seconds and not one caption: the stale state.
	activityTimes.set({ system: { audio: now - 1000, caption: 0 } });
	const view = live();
	expect(view.getByRole('status')).toHaveTextContent(/no captions have arrived for 15 seconds/);
	expect(view.getByRole('status')).not.toHaveTextContent(/Room/);

	originStates.set({ system: 'running', microphone: 'error' });
	await Promise.resolve();
	expect(view.getByRole('status')).toHaveTextContent(/Source stopped with an error/);
	view.unmount();
});
