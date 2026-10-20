// The operator window against the fake core, and the states both specs measure.
//
// Everything is found by role and accessible name, as the Vitest page tests find it, with the
// names read from the app's own catalogs so the same steps work in all three languages. Clicks
// are dispatched rather than performed with the mouse: a real pointer would leave the last
// control it pressed in its `:hover` state, and that would be measured too.

import { expect, type Page } from '@playwright/test';
import { de } from '../../src/lib/i18n/de';
import { en, type Messages } from '../../src/lib/i18n/en';
import { fr } from '../../src/lib/i18n/fr';
import type { HistoryListing } from '../../src/lib/history';
import type { AudioLevel, Caption, StatusUpdate } from '../../src/lib/types';
import { FakeCore } from './fakeCore';

const CATALOGS = { en, fr, de } as const;
export type Locale = keyof typeof CATALOGS;
export const LOCALES = Object.keys(CATALOGS) as Locale[];

/** Windows' text-size slider at its default, halfway and its maximum (`textScale.ts`). */
export const SCALES = [1, 1.5, 2.25] as const;
export type Scale = (typeof SCALES)[number];

/** The operator window's default and minimum sizes, from `src-tauri/tauri.conf.json`. */
export const DEFAULT_WINDOW = { width: 1200, height: 820 };
export const MINIMUM_WINDOW = { width: 980, height: 660 };

/** `LOCALE_KEY` in `src/lib/i18n/index.ts`: where the app keeps the interface language. */
const LOCALE_KEY = 'ui.locale';

/** A fixed clock, so the session timer and every date on screen read the same on each run. */
const NOW = new Date('2026-10-07T09:30:00Z');

interface Operator {
	page: Page;
	core: FakeCore;
	/** The catalog of the interface language the window is in. */
	t: Messages;
}

interface State {
	/** What the style snapshot covers, when not the whole window: a settings tab is drawn
	 *  over the idle window, which `idle-whisper` already records. */
	scope?: string;
	/** Answers the core has to give before the window loads. */
	prepare?(core: FakeCore): void;
	/** From a freshly loaded window, as an operator would get there. */
	reach(app: Operator): Promise<void>;
}

/** `^` + a literal: a button whose name starts with `text`. */
const startsWith = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

/** A click as `fireEvent.click` makes one: no pointer, so no hover or focus left behind. */
async function press(page: Page, role: 'button' | 'tab', name: string | RegExp) {
	const target = page.getByRole(role, { name, exact: typeof name === 'string' });
	await expect(target).toBeEnabled();
	await target.dispatchEvent('click');
}

async function chooseEngine({ page }: Operator, vendor: string) {
	await press(page, 'button', startsWith(vendor));
	await expect(page.getByRole('button', { name: startsWith(vendor) })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
}

/** Open Settings on the tab called `label`. */
async function openSettings({ page, t }: Operator, label: string) {
	await press(page, 'button', t.settings.openLabel);
	await expect(page.getByRole('dialog', { name: t.settings.heading })).toBeVisible();
	await press(page, 'tab', label);
	await expect(page.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
}

// ---- The demo session's script ----------------------------------------------------------
// Two speakers, as `realtime.rs` reports a translation of both sources: the remote speaker on
// System, the room on the microphone, each a final turn and one still being spoken.

const SPEECH: Caption[] = [
	{
		turnId: 1,
		origin: 'system',
		lane: 0,
		final: true,
		startMs: 0,
		endMs: 4200,
		sourceText: 'Bonjour à toutes et à tous, merci d’être venus si nombreux ce matin.',
		text: 'Good morning, everyone, and thank you for coming in such numbers this morning.'
	},
	{
		turnId: 1,
		origin: 'microphone',
		lane: 0,
		final: true,
		startMs: 4800,
		endMs: 9100,
		sourceText: 'Merci. Commençons par le rapport financier du troisième trimestre.',
		text: 'Thank you. Let us begin with the financial report for the third quarter.'
	},
	{
		turnId: 2,
		origin: 'system',
		lane: 0,
		final: false,
		startMs: 9600,
		endMs: 11000,
		sourceText: 'Les recettes ont augmenté de',
		text: 'Revenue grew by'
	}
];

// ---- History ----------------------------------------------------------------------------
// Two saved sessions in the log format `history.ts` writes, so the History tab shows a list
// and a selected transcript rather than its empty state.

const SAVED = [
	{
		id: '3f6c1a2e-8b4d-4c1e-9a7f-2d5e6b8c9a01',
		title: 'Quarterly board meeting',
		startedAt: '2026-10-05T08:00:00Z',
		mode: 'translate',
		sourceLanguage: 'fr',
		targetLanguage: 'en',
		lines: SPEECH.filter((c) => c.final).map((c, i) => ({
			id: i + 1,
			text: c.text,
			sourceText: c.sourceText,
			origin: c.origin,
			startMs: c.startMs,
			endMs: c.endMs
		})),
		progress: {
			savedAt: '2026-10-05T09:12:00Z',
			durationMs: 4_320_000,
			endedAt: '2026-10-05T09:12:00Z'
		}
	},
	{
		id: '9b2e4d6f-1a3c-4e5b-8d7f-0c2a4e6b8d10',
		startedAt: '2026-10-06T14:30:00Z',
		mode: 'transcribe',
		sourceLanguage: 'auto',
		targetLanguage: null,
		lines: [
			{ id: 1, text: 'Welcome to the afternoon session.', sourceText: '', origin: 'microphone' }
		],
		progress: { savedAt: '2026-10-06T14:41:00Z', durationMs: 660_000, endedAt: null }
	}
];

function historyListing(): HistoryListing {
	return {
		removed: [],
		sessions: SAVED.map(({ lines, progress, ...header }) => {
			const contents = [{ version: 2, ...header }, ...lines.map((line) => ({ line })), progress]
				.map((record) => `${JSON.stringify(record)}\n`)
				.join('');
			return { id: header.id, length: contents.length, contents };
		})
	};
}

/** The settings dialog and the scrim it sits on. */
const DIALOG = ':has(> [role="dialog"])';

// ---- The states -------------------------------------------------------------------------
// The idle window once per engine choice that changes its layout, a running session, and each
// settings tab. Subtitles have two layouts: local Whisper (the first-run engine, with its
// model list and spoken-language choice) and a cloud engine (a key panel and an auto-detect
// note). Both translation engines share one layout, as do Voxtral and Gemini Transcribe.

const STATES = {
	/** First run: subtitles with local Whisper, no model downloaded yet. */
	'idle-whisper': {
		async reach() {}
	},
	/** Subtitles from a cloud engine, with no key saved. */
	'idle-voxtral': {
		reach: (app) => chooseEngine(app, app.t.provider.vendor.mistral)
	},
	/** The built-in demonstration: one virtual source and a script language. */
	'idle-demo': {
		reach: (app) => chooseEngine(app, app.t.provider.vendor.ondevice)
	},
	/** Translation, with the language picker and the second caption language. */
	'idle-translation': {
		async reach(app) {
			await press(app.page, 'button', startsWith(app.t.rail.translate.title));
			await expect(
				app.page.getByRole('button', { name: startsWith(app.t.provider.vendor.gemini) })
			).toHaveAttribute('aria-pressed', 'true');
		}
	},
	/** Translating both sources, two speakers' captions arriving. */
	running: {
		prepare(core) {
			core.handle('has_api_key', () => true);
		},
		async reach(app) {
			const { page, core, t } = app;
			await press(page, 'button', startsWith(t.rail.translate.title));
			await press(page, 'button', t.source.both);
			await press(page, 'button', t.preflight.start.translate);
			await expect.poll(() => core.callsTo('start_session').length).toBe(1);
			for (const origin of ['system', 'microphone'] as const) {
				await core.emit('status', { state: 'connecting', origin } satisfies StatusUpdate);
				await core.emit('status', { state: 'running', origin } satisfies StatusUpdate);
			}
			await core.emit('audio-level', {
				source: 'system',
				rms: 0.32,
				peak: 0.5
			} satisfies AudioLevel);
			await core.emit('audio-level', {
				source: 'microphone',
				rms: 0.18,
				peak: 0.3
			} satisfies AudioLevel);
			for (const caption of SPEECH) await core.emit('caption', caption);
			await expect(page.getByRole('button', { name: t.rail.stop })).toBeVisible();
			await expect(page.getByRole('region', { name: t.transcript.heading })).toContainText(
				SPEECH[1].text
			);
		}
	},
	'settings-captions': {
		scope: DIALOG,
		reach: (app) => openSettings(app, app.t.design.captions)
	},
	'settings-reading': {
		scope: DIALOG,
		reach: (app) => openSettings(app, app.t.design.reading)
	},
	'settings-history': {
		scope: DIALOG,
		prepare(core) {
			core.handle('list_history', historyListing);
		},
		async reach(app) {
			await openSettings(app, app.t.history.heading);
			await press(app.page, 'button', startsWith(SAVED[0].title!));
			await expect(
				app.page.getByRole('button', { name: startsWith(SAVED[0].title!) })
			).toHaveAttribute('aria-pressed', 'true');
		}
	},
	'settings-app': { scope: DIALOG, reach: (app) => openSettings(app, app.t.design.app) }
} satisfies Record<string, State>;

type StateName = keyof typeof STATES;
export const STATE_NAMES = Object.keys(STATES) as StateName[];

/** What the style snapshot of `state` covers; undefined for the whole window. */
export const scopeOf = (state: StateName): string | undefined => (STATES[state] as State).scope;

/**
 * Load the operator window in `locale` at `scale`, reach `state`, and wait until it is still.
 *
 * Both settings go in the way the app takes them: the interface language from its stored
 * choice, the text scale from the core's `text_scale_factor` answer, which `textScale.ts`
 * writes onto the root as `--text-scale`. Each is checked on the page before going further.
 */
export async function openOperator(
	page: Page,
	{ state, locale, scale }: { state: StateName; locale: Locale; scale: Scale }
): Promise<Operator> {
	const t = CATALOGS[locale];
	const core = await FakeCore.install(page);
	core.handle('text_scale_factor', () => scale);
	(STATES[state] as State).prepare?.(core);
	await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
		LOCALE_KEY,
		locale
	] as const);
	await page.clock.setFixedTime(NOW);
	await page.goto('/');

	await expect(page.locator('html')).toHaveAttribute('lang', t.locale.tag);
	// Read from the root's own style, where only `applyTextScale` writes: the stylesheet's
	// `--text-scale: 1` would satisfy a computed read at 100% without the app doing anything.
	await expect
		.poll(() =>
			page.evaluate(() => document.documentElement.style.getPropertyValue('--text-scale'))
		)
		.toBe(String(scale));
	await expect(page.getByRole('button', { name: t.preflight.start.subtitles })).toBeVisible();

	const app = { page, core, t };
	await STATES[state].reach(app);
	await settle(app);
	return app;
}

/** Wait until the window has stopped asking the core for things, every font it declares
 *  has loaded, and a frame has been drawn after both. */
async function settle({ page, core }: Operator) {
	let seen = -1;
	await expect
		.poll(
			async () => {
				const before = seen;
				seen = core.calls.length;
				await page.waitForTimeout(100);
				return before === seen && core.calls.length === seen;
			},
			{ intervals: [0] }
		)
		.toBe(true);
	await page.evaluate(async () => {
		// `document.fonts.ready` alone only waits for loads already under way, and on a busy
		// machine it once settled before the window's own face had been asked for: text
		// measured in a fallback face overflows differently, and every `ch` length computes to
		// a different px value. So the Basic Latin face of every family and weight the
		// stylesheet declares is loaded outright, then a layout asks for whatever else the text
		// on screen needs, and only then is `ready` awaited.
		const basicLatin = (range: string) =>
			range.split(',').some((part) => {
				const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-');
				return parseInt(from, 16) <= 0x30 && parseInt(to, 16) >= 0x30;
			});
		await Promise.all(
			[...document.fonts].filter((face) => basicLatin(face.unicodeRange)).map((face) => face.load())
		);
		void document.body.offsetWidth;
		await document.fonts.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
}
