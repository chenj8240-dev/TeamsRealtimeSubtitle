import { render, fireEvent } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { locale } from '../i18n';
import DateField from './DateField.svelte';

afterEach(() => locale.set('en'));

it('localizes the date hint and validates actual calendar dates', async () => {
	locale.set('fr');
	const view = render(DateField, { label: 'Du' });
	const field = view.getByRole('textbox', { name: 'Du' });
	expect(field.getAttribute('placeholder')).toBe('AAAA-MM-JJ');
	await fireEvent.input(field, { target: { value: '2026-02-30' } });
	expect(field.getAttribute('aria-invalid')).toBe('true');
	await fireEvent.input(field, { target: { value: '2024-02-29' } });
	expect(field.getAttribute('aria-invalid')).toBe('false');
	expect(view.container.querySelector('input[type=date]')).toHaveProperty('value', '2024-02-29');
	await fireEvent.input(field, { target: { value: '' } });
	expect(view.container.querySelector('input[type=date]')).toHaveProperty('value', '');
	locale.set('de');
	await tick();
	expect(field.getAttribute('placeholder')).toBe('JJJJ-MM-TT');
});

it('reflects native calendar selection and external filter reset', async () => {
	const view = render(DateField, { label: 'From date', value: '2026-09-20' });
	const field = view.getByRole('textbox', { name: 'From date' });
	await fireEvent.change(view.container.querySelector('input[type=date]')!, {
		target: { value: '2026-09-19' }
	});
	expect(field).toHaveProperty('value', '2026-09-19');
	await view.rerender({ label: 'From date', value: '' });
	expect(field).toHaveProperty('value', '');
});

it('supports German entry, validation, calendar selection and clearing', async () => {
	locale.set('de');
	const view = render(DateField, { label: 'Ab Datum' });
	const field = view.getByRole('textbox', { name: 'Ab Datum' });
	const picker = view.container.querySelector<HTMLInputElement>('input[type=date]')!;
	expect(field).toHaveAttribute('placeholder', 'JJJJ-MM-TT');
	expect(picker).toHaveAttribute('lang', 'de-DE');
	await fireEvent.input(field, { target: { value: '2026-02-29' } });
	expect(field).toHaveAttribute('aria-invalid', 'true');
	expect(view.getByText('Geben Sie ein gültiges Datum ein: JJJJ-MM-TT.')).toBeTruthy();
	await fireEvent.input(field, { target: { value: '2024-02-29' } });
	expect(field).toHaveAttribute('aria-invalid', 'false');
	expect(picker.value).toBe('2024-02-29');
	const showPicker = vi.fn();
	Object.defineProperty(picker, 'showPicker', { value: showPicker });
	await fireEvent.click(view.getByRole('button', { name: 'Ab Datum — Datum auswählen' }));
	expect(showPicker).toHaveBeenCalledOnce();
	await fireEvent.change(picker, { target: { value: '2026-12-31' } });
	expect(field).toHaveValue('2026-12-31');
	await fireEvent.input(field, { target: { value: '' } });
	expect(picker.value).toBe('');
	expect(field).toHaveAttribute('aria-invalid', 'false');
});

it('keeps half-typed text until the bound value itself changes', async () => {
	const view = render(DateField, { label: 'From date', value: '2026-09-20' });
	const field = view.getByRole('textbox', { name: 'From date' });
	await fireEvent.input(field, { target: { value: '2026-09-3' } });
	expect(field).toHaveAttribute('aria-invalid', 'true');
	await view.rerender({ label: 'From', value: '2026-09-20' });
	expect(field).toHaveValue('2026-09-3');
	await view.rerender({ label: 'From', value: '2026-09-21' });
	expect(field).toHaveValue('2026-09-21');
	expect(field).toHaveAttribute('aria-invalid', 'false');
});
