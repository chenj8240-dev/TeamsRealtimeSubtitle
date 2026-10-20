import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';

// The operator page with a scripted core: what Start, Rehearse and the start shortcut accept is
// decided by one rule on the page, and these drive it the way an operator would.
const native = vi.hoisted(() => ({
	handlers: {} as Record<string, (value?: unknown) => void>,
	startSession: vi.fn(),
	hasApiKey: vi.fn(),
	listMicrophones: vi.fn()
}));
vi.mock('./tauri', () => ({
	isTauri: () => true,
	api: new Proxy(
		{
			startSession: native.startSession,
			hasApiKey: native.hasApiKey,
			listMicrophones: native.listMicrophones,
			listOutputs: vi.fn().mockResolvedValue([{ id: 'render-1', name: 'Dock', isDefault: true }]),
			listApplications: vi.fn().mockResolvedValue({ supported: true, applications: [] }),
			onDeviceReadiness: vi.fn().mockResolvedValue({ ready: true }),
			readRecovery: vi.fn().mockResolvedValue(null)
		},
		{
			get: (target, key) =>
				key in target ? target[key as keyof typeof target] : vi.fn().mockResolvedValue(undefined)
		}
	),
	on: new Proxy(
		{},
		{
			get: (_, key) => (handler: (value?: unknown) => void) => {
				native.handlers[String(key)] = handler;
				return Promise.resolve(() => {
					delete native.handlers[String(key)];
				});
			}
		}
	)
}));
vi.mock('./textScale', () => ({ followTextScale: async () => () => {} }));
vi.mock('./overlayController.svelte', () => ({
	createOverlayController: () => ({
		captionFaces: [],
		initialize() {},
		async restorePlacement() {},
		pushOverlayConfig() {},
		applyState() {},
		overlayVisible: true,
		moveOverlay: false
	})
}));
import Page from '../routes/+page.svelte';
import { applyStatus, clearTranscript, options } from './stores';
import { locale } from './i18n';
import { PROFILES_KEY } from './profiles';
import { DEFAULT_START_OPTIONS } from './startOptions';
import type { StartOptions } from './types';

const translation: StartOptions = {
	...DEFAULT_START_OPTIONS,
	mode: 'translate',
	provider: 'gemini',
	targetLanguage: 'en',
	source: 'system'
};

beforeEach(() => {
	vi.clearAllMocks();
	locale.set('en');
	clearTranscript();
	applyStatus({ state: 'idle' });
	options.set(translation);
	native.hasApiKey.mockResolvedValue(true);
	native.listMicrophones.mockResolvedValue([{ id: 'mic-1', name: 'Mic', isDefault: true }]);
	localStorage.removeItem(PROFILES_KEY);
});

it('holds Rehearse, like Start, while a meeting profile is loading', async () => {
	localStorage.setItem(
		PROFILES_KEY,
		JSON.stringify([
			{ id: 'hall', name: 'Lecture hall', options: translation, appearance: {}, placement: null }
		])
	);
	const view = render(Page);
	const start = () => view.getByRole('button', { name: /Start translating/ });
	const rehearse = () => view.getByRole('button', { name: 'Rehearse' });
	await waitFor(() => expect(rehearse()).toBeEnabled());
	expect(start()).toBeEnabled();

	// A profile load re-lists the devices before it applies anything; hold it there.
	let finishLoading!: () => void;
	native.listMicrophones.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finishLoading = () => resolve([{ id: 'mic-1', name: 'Mic', isDefault: true }]);
			})
	);
	await fireEvent.click(view.getByRole('button', { name: 'Manage profiles' }));
	await fireEvent.click(view.getByRole('button', { name: 'Load profile' }));
	await waitFor(() => expect(start()).toBeDisabled());
	expect(rehearse()).toBeDisabled();

	finishLoading();
	await waitFor(() => expect(rehearse()).toBeEnabled());
	expect(start()).toBeEnabled();
	view.unmount();
});

it('asks the keychain again when the engine changes, not on every setup change', async () => {
	const view = render(Page);
	const start = () => view.getByRole('button', { name: /Start translating/ });
	await waitFor(() => expect(start()).toBeEnabled());
	// Each re-check used to turn Start off for a round trip.
	options.update((value) => ({ ...value, targetLanguage: 'fr' }));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(start()).toBeEnabled();
	expect(native.hasApiKey).toHaveBeenCalledOnce();

	options.update((value) => ({ ...value, provider: 'openai' }));
	await waitFor(() => expect(native.hasApiKey).toHaveBeenLastCalledWith('openai'));
	view.unmount();
});

it('starts from the shortcut only when Start itself could', async () => {
	// No key stored for this engine: the button is disabled, and the shortcut does nothing.
	native.hasApiKey.mockResolvedValue(false);
	const view = render(Page);
	const start = view.getByRole('button', { name: /Start translating/ });
	await waitFor(() => expect(native.hasApiKey).toHaveBeenCalledWith('gemini'));
	const shortcut = { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true };
	await fireEvent.keyDown(window, shortcut);
	expect(start).toBeDisabled();
	expect(native.startSession).not.toHaveBeenCalled();
	view.unmount();

	native.hasApiKey.mockResolvedValue(true);
	const ready = render(Page);
	await waitFor(() =>
		expect(ready.getByRole('button', { name: /Start translating/ })).toBeEnabled()
	);
	await fireEvent.keyDown(window, shortcut);
	await waitFor(() => expect(native.startSession).toHaveBeenCalledOnce());
	ready.unmount();
});
