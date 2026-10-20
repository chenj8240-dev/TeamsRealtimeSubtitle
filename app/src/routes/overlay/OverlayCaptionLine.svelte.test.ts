import { afterEach, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import OverlayCaptionLine from './OverlayCaptionLine.svelte';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('holds earlier rows until a full line overflows and refits whole rows after resizing', async () => {
	// jsdom has no text layout: provide measured browser dimensions and trigger the
	// same ResizeObserver notifications Svelte receives as streamed text wraps.
	const observers: { callback: ResizeObserverCallback; elements: Element[] }[] = [];
	vi.stubGlobal(
		'ResizeObserver',
		class {
			entry: (typeof observers)[number];
			constructor(callback: ResizeObserverCallback) {
				this.entry = { callback, elements: [] };
				observers.push(this.entry);
			}
			observe(element: Element) {
				this.entry.elements.push(element);
			}
			unobserve() {}
			disconnect() {}
		}
	);
	let rows = 2;
	vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
	vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
		this: HTMLElement
	) {
		return this.tagName === 'P' ? rows * 40 : 120;
	});
	vi.spyOn(window, 'getComputedStyle').mockReturnValue({
		lineHeight: '40px'
	} as CSSStyleDeclaration);
	const props = {
		stable: true,
		lead: 'First sentence.',
		text: 'Next words',
		interim: true,
		height: 125,
		fontKey: '40',
		language: 'en'
	};
	const view = render(OverlayCaptionLine, props);
	function resize() {
		for (const observer of observers)
			observer.callback(
				observer.elements.map(
					(target) =>
						({ target, contentRect: { width: 400, height: rows * 40 } }) as ResizeObserverEntry
				),
				{} as ResizeObserver
			);
	}
	resize();
	const paragraph = view.container.querySelector('.stable-viewport p') as HTMLElement;
	await waitFor(() => expect(paragraph.style.transform).toBe('translateY(-0px)'));
	await view.rerender({ ...props, text: 'Next words arrive' });
	rows = 3;
	resize();
	await waitFor(() => expect(paragraph.style.transform).toBe('translateY(-0px)'));
	rows = 4;
	resize();
	await waitFor(() => expect(paragraph.style.transform).toBe('translateY(-40px)'));
	await view.rerender({ ...props, height: 85 });
	await waitFor(() => expect(paragraph.style.transform).toBe('translateY(-80px)'));
	expect(paragraph.textContent).toContain('First sentence.');
	expect(view.container.querySelector('.caret')).toBeNull();
	await view.rerender({ ...props, text: 'مرحبا بكم', language: 'ar' });
	expect(view.container.querySelector('.text-region')).toHaveAttribute('dir', 'rtl');
	expect(view.container.querySelector('.text-region')).toHaveAttribute('lang', 'ar');
	await view.rerender({ ...props, stable: false, text: 'こんにちは', language: 'ja' });
	expect(view.container.querySelector('.text-region')).toHaveAttribute('dir', 'ltr');
	expect(view.container.querySelector('.text-region')).toHaveAttribute('lang', 'ja');
	view.unmount();
});

// Stable reading keeps one paragraph for the whole session. Past the trim threshold it hands
// back everything above a rendered line start, so the overlay can drop it without moving any
// line that is still laid out. Synthetic layout: ten characters to a 40 px line.
it('hands back whole lines of stable context once it runs far past the viewport', async () => {
	const observers: { callback: ResizeObserverCallback; elements: Element[] }[] = [];
	vi.stubGlobal(
		'ResizeObserver',
		class {
			entry: (typeof observers)[number];
			constructor(callback: ResizeObserverCallback) {
				this.entry = { callback, elements: [] };
				observers.push(this.entry);
			}
			observe(element: Element) {
				this.entry.elements.push(element);
			}
			unobserve() {}
			disconnect() {}
		}
	);
	const linesOf = (element: Element) => Math.ceil((element.textContent ?? '').length / 10);
	vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
	vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
		this: HTMLElement
	) {
		return this.tagName === 'P' ? linesOf(this) * 40 : 400;
	});
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
		this: HTMLElement
	) {
		return { top: 0, height: linesOf(this) * 40 } as DOMRect;
	});
	vi.spyOn(window, 'getComputedStyle').mockReturnValue({
		lineHeight: '40px'
	} as CSSStyleDeclaration);
	const rangeRect = Range.prototype.getBoundingClientRect;
	Range.prototype.getBoundingClientRect = function (this: Range) {
		return { top: Math.floor(this.startOffset / 10) * 40 } as DOMRect;
	};
	try {
		const onTrim = vi.fn();
		const props = {
			stable: true,
			// 200 lines of context and a short current turn, in a ten-line viewport.
			lead: 'x'.repeat(2000),
			text: 'now',
			interim: false,
			height: 400,
			fontKey: '40',
			language: 'en',
			onTrim
		};
		const view = render(OverlayCaptionLine, { ...props, lead: 'x'.repeat(1500) });
		for (const observer of observers)
			observer.callback(
				observer.elements.map(
					(target) => ({ target, contentRect: { width: 400, height: 400 } }) as ResizeObserverEntry
				),
				{} as ResizeObserver
			);
		// 151 lines, 141 hidden: under the threshold, so nothing is handed back.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onTrim).not.toHaveBeenCalled();

		// 201 lines, 191 hidden: keep the last 60 hidden lines, so everything before the
		// first character of line 131 goes.
		await view.rerender(props);
		await waitFor(() => expect(onTrim).toHaveBeenCalledWith(1310));
		view.unmount();
	} finally {
		Range.prototype.getBoundingClientRect = rangeRect;
	}
});
