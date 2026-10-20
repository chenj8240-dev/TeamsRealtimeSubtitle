import { fireEvent, render } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import Tabs from './Tabs.svelte';

const tabs = [
	{ id: 'captions', label: 'Captions' },
	{ id: 'reading', label: 'Reading' },
	{ id: 'history', label: 'History' },
	{ id: 'app', label: 'App' }
] as const;

function setup(selected: (typeof tabs)[number]['id'] = 'captions') {
	const view = render(Tabs, {
		tabs,
		selected,
		label: 'Settings',
		idPrefix: 'settings',
		panelId: 'settings-panel'
	});
	const tab = (name: string) => view.getByRole('tab', { name });
	const current = () =>
		view.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
	return { view, tab, current };
}

it('keeps one tab stop on the selected tab and names what each tab controls', () => {
	const { view, tab } = setup('reading');
	expect(view.getByRole('tablist', { name: 'Settings' })).toBeTruthy();
	expect(tab('Reading').getAttribute('tabindex')).toBe('0');
	for (const name of ['Captions', 'History', 'App'])
		expect(tab(name).getAttribute('tabindex')).toBe('-1');
	expect(tab('App').id).toBe('settings-app');
	expect(tab('App').getAttribute('aria-controls')).toBe('settings-panel');
});

it('moves selection and focus with the arrow keys, wrapping at both ends', async () => {
	const { tab, current } = setup('app');
	await fireEvent.keyDown(tab('App'), { key: 'ArrowRight' });
	expect(current().map((t) => t.textContent)).toEqual(['Captions']);
	expect(document.activeElement).toBe(tab('Captions'));
	await fireEvent.keyDown(tab('Captions'), { key: 'ArrowLeft' });
	expect(current().map((t) => t.textContent)).toEqual(['App']);
	expect(document.activeElement).toBe(tab('App'));
	await fireEvent.keyDown(tab('App'), { key: 'ArrowLeft' });
	expect(document.activeElement).toBe(tab('History'));
});

it('jumps to the first and last tab with Home and End, and ignores other keys', async () => {
	const { tab, current } = setup('reading');
	await fireEvent.keyDown(tab('Reading'), { key: 'End' });
	expect(document.activeElement).toBe(tab('App'));
	await fireEvent.keyDown(tab('App'), { key: 'Home' });
	expect(document.activeElement).toBe(tab('Captions'));
	await fireEvent.keyDown(tab('Captions'), { key: 'a' });
	expect(current().map((t) => t.textContent)).toEqual(['Captions']);
});

it('selects a tab on click', async () => {
	const { tab, current } = setup();
	await fireEvent.click(tab('History'));
	expect(current().map((t) => t.textContent)).toEqual(['History']);
});
