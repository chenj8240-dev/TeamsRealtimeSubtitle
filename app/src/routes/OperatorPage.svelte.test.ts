// The operator page against a scripted core. Tauri's own IPC mocks stand in for `src-tauri`
// (`#lib/testing/tauriMock`), so the real `tauri.ts`, the page's controllers and its child
// components all run as they do in the app, and the test plays the core: it answers commands
// and emits `status` and `caption` events the way the built-in demo does. Everything is found
// by role and accessible name, so rearranging the page does not break these tests; changing
// what the operator can see and do does.

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { mockTauri, type TauriMock } from '#lib/testing/tauriMock.js';
import { IDLE_CORE } from '#lib/testing/idleCore.js';
import { OVERLAY_GEOMETRY_KEY } from '#lib/overlayGeometry.js';
import type { Caption, StatusUpdate } from '#lib/types.js';

// The stores read their preferences as they load, and in this pool storage outlives a test
// file, so the page is imported only once nothing is stored.
localStorage.clear();
const { default: Page } = await import('./+page.svelte');
const { applyStatus, clearTranscript, options } = await import('#lib/stores.js');
const { DEFAULT_START_OPTIONS } = await import('#lib/startOptions.js');
const { exportFormat } = await import('#lib/exportFormat.js');
const { locale } = await import('#lib/i18n/index.js');

let core: TauriMock;

beforeEach(() => {
	locale.set('en');
	clearTranscript();
	applyStatus({ state: 'idle' });
	options.set({ ...DEFAULT_START_OPTIONS });
	exportFormat.set('markdown');
	// jsdom has no canvas. The caption-face probe already treats a missing context as nothing
	// to measure with; this only keeps jsdom from complaining about it.
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
	core = mockTauri();
	// As `SessionManager::stop` does: the whole-session idle status goes out before the
	// command returns.
	core.handle('stop_session', async () => {
		await core.emit('status', { state: 'idle' } satisfies StatusUpdate);
	});
});

afterEach(async () => {
	// Unmounted before the mock goes: the page unsubscribes from its events through it.
	cleanup();
	await core.dispose();
	vi.restoreAllMocks();
});

const DEMO_LINES = [
	[
		'This is a built-in demonstration',
		'This is a built-in demonstration of the live caption display.'
	],
	[
		'Captions appear in the operator window',
		'Captions appear in the operator window and in the presentation overlay.'
	]
] as const;

/** Choose the keyless demo, the engine every machine can run. */
async function chooseDemo() {
	await fireEvent.click(await screen.findByRole('button', { name: /^Built-in demo/ }));
	await screen.findByRole('button', { name: 'Start demo subtitles' });
}

/** Press Start and play the core's side of `ondevice::run_session`: Connecting, Running,
 *  then each line as a partial and a final on its own turn, timed on the session clock. */
async function runDemo() {
	const started = core.callsTo('start_session').length;
	const start = screen.getByRole('button', { name: 'Start demo subtitles' });
	await waitFor(() => expect(start).toBeEnabled());
	await fireEvent.click(start);
	await waitFor(() => expect(core.callsTo('start_session')).toHaveLength(started + 1));
	await core.emit('status', { state: 'connecting', origin: 'microphone' } satisfies StatusUpdate);
	await core.emit('status', { state: 'running', origin: 'microphone' } satisfies StatusUpdate);
	for (const [i, [partial, text]] of DEMO_LINES.entries()) {
		const startMs = i * 3000;
		const turn = { turnId: i + 1, sourceText: '', origin: 'microphone', lane: 0, startMs } as const;
		const interim: Caption = { ...turn, text: partial, final: false, endMs: startMs + 900 };
		const complete: Caption = { ...turn, text, final: true, endMs: startMs + 2400 };
		await core.emit('caption', interim);
		await core.emit('caption', complete);
	}
	await screen.findByRole('button', { name: 'Stop captions' });
}

async function stop() {
	await fireEvent.click(screen.getByRole('button', { name: 'Stop captions' }));
	await screen.findByRole('button', { name: 'Start demo subtitles' });
}

it('runs the built-in demo from Start to Stop and keeps its transcript', async () => {
	render(Page);
	await chooseDemo();
	await runDemo();

	expect(core.callsTo('start_session')[0].options).toMatchObject({
		provider: 'ondevice',
		mode: 'transcribe',
		source: 'microphone'
	});
	const live = screen.getByRole('region', { name: 'Transcript' });
	await waitFor(() => expect(live).toHaveTextContent(DEMO_LINES[0][1]));
	expect(live).toHaveTextContent(DEMO_LINES[1][1]);

	await stop();
	expect(core.callsTo('stop_session')).toHaveLength(1);
	// Idle, the page shows the transcript from a second mount of the monitor.
	const kept = screen.getByRole('region', { name: 'Transcript' });
	expect(kept).toHaveTextContent(DEMO_LINES[0][1]);
	expect(kept).toHaveTextContent(DEMO_LINES[1][1]);
	expect(within(screen.getByRole('main')).getByText('Unsaved')).toBeInTheDocument();
});

// Whisper's translate task: English captions with no original speech under them. The caption
// language follows the rule every engine does, and a second language saved for a cloud engine
// stays in the setup but is never sent.
it('translates into English with local Whisper, with no original line and no second language', async () => {
	options.set({ ...DEFAULT_START_OPTIONS, targetLanguage: 'fr', secondTargetLanguage: 'de' });
	core.handle('whisper_models', () => [
		{
			id: 'base',
			bytes: 59_707_625,
			installed: true,
			downloading: false,
			downloadedBytes: 0,
			inUse: false
		}
	]);
	render(Page);
	await fireEvent.click(await screen.findByRole('button', { name: /^Live translation/ }));
	await fireEvent.click(screen.getByRole('button', { name: /^Local Whisper/ }));
	const start = screen.getByRole('button', { name: 'Start translating' });
	expect(
		await screen.findByText('Whisper does not support French — choose another language.')
	).toBeInTheDocument();
	expect(start).toBeDisabled();

	options.update((setup) => ({ ...setup, targetLanguage: 'en' }));
	await waitFor(() => expect(start).toBeEnabled());
	await fireEvent.click(start);
	await waitFor(() => expect(core.callsTo('start_session')).toHaveLength(1));
	expect(core.callsTo('start_session')[0].options).toMatchObject({
		provider: 'whisper-translate',
		mode: 'translate',
		targetLanguage: 'en',
		secondTargetLanguage: null
	});
	await core.emit('status', { state: 'running', origin: 'microphone' } satisfies StatusUpdate);
	await core.emit('caption', {
		turnId: 1,
		text: 'We begin with the colonial archive.',
		sourceText: '',
		final: true,
		origin: 'microphone',
		lane: 0,
		startMs: 0,
		endMs: 2400
	} satisfies Caption);
	const live = screen.getByRole('region', { name: 'Transcript' });
	await waitFor(() => expect(live).toHaveTextContent('We begin with the colonial archive.'));
	// The stage shows the caption alone: no empty line where the original speech would go.
	expect(document.querySelector('.turn-source')).toBeNull();
	expect(document.querySelector('.turn-caption')).toHaveTextContent(
		'We begin with the colonial archive.'
	);
	await fireEvent.click(screen.getByRole('button', { name: 'Stop captions' }));
	await screen.findByRole('button', { name: 'Start translating' });
	// The saved setup still has the second language for the next cloud engine.
	expect(get(options).secondTargetLanguage).toBe('de');
});

// F2: the overlay reopens where it was last placed on these displays, as the page mounts and
// through the command that clamps it to a display that is there.
it('reopens the overlay where it was last placed on this display layout', async () => {
	const placement = { x: 48, y: 880, width: 1824, height: 160 };
	const layout = String(IDLE_CORE.display_layout({}));
	localStorage.setItem(OVERLAY_GEOMETRY_KEY, JSON.stringify([{ layout, placement }]));
	try {
		render(Page);
		await waitFor(() => expect(core.callsTo('set_overlay_placement')).toEqual([{ placement }]));
	} finally {
		localStorage.removeItem(OVERLAY_GEOMETRY_KEY);
	}
});

// D19: the monitor is mounted once while a session runs and again after it, and each mount
// used to start from Markdown; the quit prompt's Save wrote Markdown whatever was chosen.
it('keeps the chosen export format through Start and Stop, and saves it on quit', async () => {
	render(Page);
	await chooseDemo();
	await runDemo();
	await fireEvent.change(screen.getByRole('combobox', { name: 'Export format' }), {
		target: { value: 'srt' }
	});

	await stop();
	expect(screen.getByRole('combobox', { name: 'Export format' })).toHaveValue('srt');

	await runDemo();
	expect(screen.getByRole('combobox', { name: 'Export format' })).toHaveValue('srt');
	await stop();

	await core.emit('close-requested');
	await fireEvent.click(await screen.findByRole('button', { name: 'Save and close' }));
	await waitFor(() => expect(core.callsTo('confirm_close')).toHaveLength(1));
	const [saved] = core.callsTo('save_transcript');
	expect(saved.filename).toMatch(/\.srt$/);
	expect(saved.content).toMatch(/^1\n00:00:00,000 --> 00:00:02,400\n/);
	expect(saved.content).toContain(DEMO_LINES[1][1]);
});
