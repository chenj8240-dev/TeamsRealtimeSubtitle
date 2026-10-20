import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, isTauri } from './tauri';

afterEach(() => {
	vi.unstubAllGlobals();
});

// `browserMode` in the operator window is `!isTauri()`, evaluated at component init so that a
// child can never mount and fire a Tauri-only command during `npm run dev` (issue #29). That
// only holds if this check is synchronous and correct in every environment the app loads in.
describe('isTauri', () => {
	it('is false in a plain browser preview', () => {
		vi.stubGlobal('window', {});
		expect(isTauri()).toBe(false);
	});

	it('is false when there is no window at all', () => {
		vi.stubGlobal('window', undefined);
		expect(isTauri()).toBe(false);
	});

	it('is true once the Tauri runtime has injected its internals', () => {
		vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
		expect(isTauri()).toBe(true);
	});
});

describe('the command boundary', () => {
	it('rejects rather than reaching for a runtime that is not there', async () => {
		vi.stubGlobal('window', {});
		await expect(api.hasApiKey('gemini')).rejects.toThrow('called outside the desktop app');
	});
});
