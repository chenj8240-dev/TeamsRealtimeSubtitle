import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import SystemCapturePicker from './SystemCapturePicker.svelte';
import { options } from './stores';
import { DEFAULT_START_OPTIONS } from './startOptions';
beforeEach(() => options.set({ ...DEFAULT_START_OPTIONS, source: 'both' }));
it('requires an explicit application selection and preserves its identity', async () => {
	const process = { pid: 123, createdAt: '987' };
	const changed = vi.fn();
	const view = render(SystemCapturePicker, {
		locked: false,
		outputs: [],
		applications: [{ process, name: 'Teams meeting' }],
		supported: true,
		refresh: vi.fn().mockResolvedValue(undefined),
		changed
	});
	await fireEvent.change(view.getByRole('combobox', { name: 'System capture' }), {
		target: { value: 'application' }
	});
	expect(get(options).systemCapture).toEqual({ kind: 'application', process: null });
	await fireEvent.change(view.getByRole('combobox', { name: 'Select an application' }), {
		target: { value: '123:987' }
	});
	expect(get(options).systemCapture).toEqual({ kind: 'application', process });
	expect(view.queryByText('System audio output')).toBeNull();
	expect(changed).toHaveBeenCalledTimes(2);
});
it('an unavailable selection remains explicit instead of selecting a replacement', () => {
	options.set({
		...get(options),
		systemCapture: { kind: 'application', process: { pid: 123, createdAt: 'old' } }
	});
	const view = render(SystemCapturePicker, {
		locked: false,
		outputs: [],
		applications: [],
		supported: true,
		refresh: vi.fn().mockResolvedValue(undefined),
		changed: vi.fn()
	});
	expect(
		view.getByRole('option', { name: 'Application unavailable — select it again' })
	).toBeInTheDocument();
	expect(get(options).systemCapture?.kind).toBe('application');
});
