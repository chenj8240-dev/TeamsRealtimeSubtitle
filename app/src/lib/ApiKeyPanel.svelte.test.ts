import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import ApiKeyPanel from './ApiKeyPanel.svelte';

// Hoisted so `vi.mock` below can reach them: the factory runs before these declarations do.
const mocks = vi.hoisted(() => ({
	tauriPresent: true,
	hasApiKey: vi.fn(),
	setApiKey: vi.fn(),
	clearApiKey: vi.fn()
}));

vi.mock('./tauri', () => ({
	isTauri: () => mocks.tauriPresent,
	api: {
		hasApiKey: mocks.hasApiKey,
		setApiKey: mocks.setApiKey,
		clearApiKey: mocks.clearApiKey
	}
}));

function mount(provider: 'gemini' | 'openai' = 'gemini') {
	const onAvailability = vi.fn();
	const onError = vi.fn();
	const view = render(ApiKeyPanel, { props: { provider, onAvailability, onError } });
	return { ...view, onAvailability, onError };
}

describe('ApiKeyPanel', () => {
	it('renders the key entry for its provider', () => {
		mocks.tauriPresent = true;
		mocks.hasApiKey.mockResolvedValue(false);
		const { getByPlaceholderText } = mount('gemini');
		expect(getByPlaceholderText('Paste your Gemini API key')).toBeInTheDocument();
	});

	// Issue #24: the field had a placeholder and nothing else, so a screen reader landing on it
	// announced an unlabelled password box, and the placeholder vanishes as soon as typing
	// starts. The row title is its label, and the description explains what the key is for.
	it('gives the key field a real label and a description', () => {
		mocks.tauriPresent = true;
		mocks.hasApiKey.mockResolvedValue(false);
		const { getByLabelText } = mount('gemini');

		const field = getByLabelText('Gemini key');
		expect(field).toHaveAttribute('type', 'password');
		expect(field).toHaveAccessibleDescription(/Windows Credential Manager/);
	});

	// Issue #29: a browser preview has no Credential Manager, and invoking anyway put an
	// un-actionable Tauri IPC error on screen during `npm run dev`.
	it('does not reach for the Tauri runtime in a browser preview', async () => {
		mocks.tauriPresent = false;
		mocks.hasApiKey.mockResolvedValue(true);
		const { onAvailability, onError } = mount('gemini');

		await waitFor(() => expect(onAvailability).toHaveBeenCalledWith('gemini', false));
		expect(mocks.hasApiKey).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it('asks the keychain when the desktop runtime is there', async () => {
		mocks.tauriPresent = true;
		mocks.hasApiKey.mockResolvedValue(true);
		const { onAvailability } = mount('gemini');

		await waitFor(() => expect(onAvailability).toHaveBeenCalledWith('gemini', true));
		expect(mocks.hasApiKey).toHaveBeenCalledWith('gemini');
	});

	// The reason `checkKey` carries a request id at all: switching provider while a slow
	// keychain read is in flight must not let the old answer decide the new provider's state,
	// which would leave Start enabled against a provider that has no key.
	it('ignores a key check that resolves after the provider has already changed', async () => {
		mocks.tauriPresent = true;
		let answerGemini: (hasKey: boolean) => void = () => {};
		mocks.hasApiKey.mockImplementation((provider: string) =>
			provider === 'gemini'
				? new Promise<boolean>((resolve) => {
						answerGemini = resolve;
					})
				: Promise.resolve(false)
		);

		const { rerender, onAvailability } = mount('gemini');
		await rerender({ provider: 'openai' });
		await waitFor(() => expect(mocks.hasApiKey).toHaveBeenCalledWith('openai'));

		// Gemini's read now lands, late, and says a key was present.
		answerGemini(true);
		await Promise.resolve();

		expect(onAvailability).not.toHaveBeenCalledWith('gemini', true);
		expect(onAvailability).toHaveBeenLastCalledWith('openai', false);
	});
});
