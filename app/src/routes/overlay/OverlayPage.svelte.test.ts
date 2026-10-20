import { afterEach, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Page from './+page.svelte';
import type { Caption, OverlayConfig, StatusUpdate } from '#lib/types.js';

const handlers = vi.hoisted(() => ({
	caption: (_: Caption) => {},
	config: (_: OverlayConfig) => {},
	status: (_: StatusUpdate) => {}
}));
vi.mock('#lib/tauri.js', () => ({
	isTauri: () => true,
	api: {},
	on: {
		caption: (callback: typeof handlers.caption) => {
			handlers.caption = callback;
			return Promise.resolve(() => {});
		},
		overlayConfig: (callback: typeof handlers.config) => {
			handlers.config = callback;
			return Promise.resolve(() => {});
		},
		status: (callback: typeof handlers.status) => {
			handlers.status = callback;
			return Promise.resolve(() => {});
		}
	}
}));

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	localStorage.clear();
});

it('retains stable captions across pauses, cleans only displayed text, and clears on Stop', async () => {
	vi.useFakeTimers();
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} }
	});
	localStorage.setItem('overlay.captionLayout', 'stable');
	const view = render(Page);
	await tick();
	handlers.config({ fontSize: 38, captionLayout: 'stable', cleanSpeech: true });
	const first: Caption = {
		turnId: 1,
		text: 'Um, hello.',
		sourceText: 'Euh, bonjour.',
		origin: 'system',
		final: true,
		startMs: 0,
		endMs: 1000
	};
	handlers.caption(first);
	await tick();
	expect(view.getByText('Hello.')).toBeTruthy();
	expect(first.text).toBe('Um, hello.');
	await vi.advanceTimersByTimeAsync(10000);
	await tick();
	expect(view.getByText('Hello.')).toBeTruthy();
	handlers.caption({ ...first, turnId: 2, text: 'Next sentence.' });
	await tick();
	expect(view.getByText('Hello. Next sentence.')).toBeTruthy();
	handlers.status({ state: 'idle' });
	await tick();
	expect(view.container.querySelector('.captions')).toBeNull();
	view.unmount();
});

// Whisper's translate task returns English and no transcription of what was said. With the
// original speech switched on, such a caption is the caption alone: no empty second line.
it('shows no original line for a translation that has none, and one for a translation that has', async () => {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} }
	});
	const view = render(Page);
	await tick();
	handlers.config({ fontSize: 38, captionLayout: 'compact', showOriginal: true });
	const english: Caption = {
		turnId: 1,
		text: 'We begin.',
		sourceText: '',
		origin: 'system',
		final: true,
		startMs: 0,
		endMs: 1000
	};
	handlers.caption(english);
	await tick();
	// Fitted text is laid out by measurement, which jsdom cannot do: the structure is the test.
	expect(view.container.querySelectorAll('.captions .row')).toHaveLength(1);
	expect(view.container.querySelector('.original')).toBeNull();
	handlers.caption({ ...english, turnId: 2, text: 'Next.', sourceText: 'Ensuite.' });
	await tick();
	expect(view.container.querySelector('.original')).not.toBeNull();
	view.unmount();
});

it('restores caption expiry when leaving stable mode after its old timer elapsed', async () => {
	vi.useFakeTimers();
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} }
	});
	localStorage.setItem('overlay.captionLayout', 'stable');
	const view = render(Page);
	await tick();
	handlers.caption({
		turnId: 1,
		text: 'A caption',
		sourceText: '',
		origin: 'system',
		final: true,
		startMs: 0,
		endMs: 1000
	});
	await tick();
	await vi.advanceTimersByTimeAsync(10000);
	handlers.config({ fontSize: 38, captionLayout: 'fit' });
	await tick();
	expect(view.container.querySelector('.captions')).not.toBeNull();
	await vi.advanceTimersByTimeAsync(4000);
	await tick();
	expect(view.container.querySelector('.captions')).toBeNull();
	view.unmount();
});

it('honors a custom hold time and cancels buffered interim text on stable Stop', async () => {
	vi.useFakeTimers();
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} }
	});
	const view = render(Page);
	await tick();
	handlers.config({ fontSize: 38, captionLayout: 'fit', holdSeconds: 8, pace: 'steady' });
	const c: Caption = {
		startMs: 0,
		endMs: 1000,
		origin: 'system',
		turnId: 1,
		text: 'Final text',
		sourceText: 'Original',
		final: true
	};
	handlers.caption(c);
	await tick();
	expect(view.container.querySelector('.captions')).not.toBeNull();
	await vi.advanceTimersByTimeAsync(7999);
	await tick();
	expect(view.container.querySelector('.captions')).not.toBeNull();
	await vi.advanceTimersByTimeAsync(1);
	await tick();
	expect(view.container.querySelector('.captions')).toBeNull();
	handlers.config({ fontSize: 38, captionLayout: 'stable', pace: 'steady' });
	handlers.caption({ ...c, turnId: 2, final: false, text: 'Pending' });
	handlers.status({ state: 'idle' });
	await vi.advanceTimersByTimeAsync(500);
	await tick();
	expect(view.container.querySelector('.captions')).toBeNull();
	expect(c.text).toBe('Final text');
	view.unmount();
});

it('starts from the stored word list and follows the lists the operator pushes', async () => {
	vi.useFakeTimers();
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} }
	});
	// Stable reading paints text without measuring it, which jsdom cannot do.
	localStorage.setItem('overlay.captionLayout', 'stable');
	localStorage.setItem('overlay.cleanSpeech', 'true');
	localStorage.setItem('overlay.fillerWords', '["bah"]');
	const view = render(Page);
	await tick();
	const c: Caption = {
		turnId: 1,
		text: 'Bah, um, voilà.',
		sourceText: 'Bah, euh, voilà.',
		origin: 'system',
		final: true,
		startMs: 0,
		endMs: 1000
	};
	handlers.caption(c);
	await tick();
	expect(view.getByText('Um, voilà.')).toBeTruthy();
	// Validated on arrival: the phrase is dropped, and the duplicate collapses.
	handlers.config({
		fontSize: 38,
		captionLayout: 'stable',
		cleanSpeech: true,
		fillerWords: ['um', 'two words', 'BAH']
	});
	await tick();
	expect(view.getByText('Voilà.')).toBeTruthy();
	handlers.config({ fontSize: 38, captionLayout: 'stable', cleanSpeech: true, fillerWords: [] });
	await tick();
	expect(view.getByText('Bah, um, voilà.')).toBeTruthy();
	// A push without a usable list keeps the one in use.
	handlers.config({
		fontSize: 38,
		captionLayout: 'stable',
		cleanSpeech: true,
		fillerWords: 'um' as unknown as string[]
	});
	handlers.config({ fontSize: 38, captionLayout: 'stable', cleanSpeech: true });
	await tick();
	expect(view.getByText('Bah, um, voilà.')).toBeTruthy();
	expect(c).toMatchObject({ text: 'Bah, um, voilà.', sourceText: 'Bah, euh, voilà.' });
	view.unmount();
});
