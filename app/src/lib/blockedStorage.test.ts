import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { blockStorage } from './testing/storage';

// D20: WebView2 throws on any access to localStorage when site data is blocked. These modules
// read it as they load, and a throw at import leaves the window blank, so each is imported
// afresh with storage refusing. Every one of them used to throw here.

let restore = () => {};

afterEach(() => {
	restore();
	restore = () => {};
	vi.resetModules();
});

async function importBlocked<T>(load: () => Promise<T>): Promise<T> {
	vi.resetModules();
	restore = blockStorage();
	return load();
}

it('loads history with automatic saving off, and lets it be switched on for the run', async () => {
	const { historyEnabled } = await importBlocked(() => import('./history'));
	expect(get(historyEnabled)).toBe(false);
	expect(() => historyEnabled.set(true)).not.toThrow();
	expect(get(historyEnabled)).toBe(true);
});

it('loads the interface in a supported language, and lets it be changed for the run', async () => {
	const i18n = await importBlocked(() => import('./i18n'));
	expect(i18n.LOCALES).toContain(get(i18n.locale));
	expect(() => i18n.setLocale('de')).not.toThrow();
	expect(get(i18n.locale)).toBe('de');
});

it('loads the export format as Markdown, and lets it be changed for the run', async () => {
	const { exportFormat } = await importBlocked(() => import('./exportFormat'));
	expect(get(exportFormat)).toBe('markdown');
	expect(() => exportFormat.set('srt')).not.toThrow();
	expect(get(exportFormat)).toBe('srt');
});
