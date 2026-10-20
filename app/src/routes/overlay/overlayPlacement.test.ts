import { describe, expect, it } from 'vitest';
import { centreOnADisplay, overlayKeyCommand } from './overlayPlacement.svelte';

const key = (name: string, extra: { shiftKey?: boolean; onButton?: boolean } = {}) => ({
	key: name,
	shiftKey: extra.shiftKey ?? false,
	onButton: extra.onButton ?? false
});

describe('overlay keys', () => {
	it('change the caption size in either mode', () => {
		for (const interactive of [false, true]) {
			expect(overlayKeyCommand(key('+'), interactive)).toEqual({ kind: 'bump', delta: 2 });
			expect(overlayKeyCommand(key('='), interactive)).toEqual({ kind: 'bump', delta: 2 });
			expect(overlayKeyCommand(key('-'), interactive)).toEqual({ kind: 'bump', delta: -2 });
		}
	});

	it('do nothing else outside move mode', () => {
		for (const name of ['Enter', 'Escape', 'ArrowLeft', 'a'])
			expect(overlayKeyCommand(key(name), false)).toBeNull();
	});

	it('offer both ways out of move mode', () => {
		expect(overlayKeyCommand(key('Enter'), true)).toEqual({ kind: 'lock' });
		expect(overlayKeyCommand(key('Escape'), true)).toEqual({ kind: 'cancel' });
	});

	// A focused toolbar button already answers Enter; the shortcut must not run it twice.
	it('leave Enter to a focused button', () => {
		expect(overlayKeyCommand(key('Enter', { onButton: true }), true)).toBeNull();
		expect(overlayKeyCommand(key('Escape', { onButton: true }), true)).toEqual({
			kind: 'cancel'
		});
	});

	it('nudge by one pixel, or ten with Shift', () => {
		expect(overlayKeyCommand(key('ArrowLeft'), true)).toEqual({ kind: 'nudge', dx: -1, dy: 0 });
		expect(overlayKeyCommand(key('ArrowDown', { shiftKey: true }), true)).toEqual({
			kind: 'nudge',
			dx: 0,
			dy: 10
		});
		expect(overlayKeyCommand(key('ArrowUp'), true)).toEqual({ kind: 'nudge', dx: 0, dy: -1 });
		expect(overlayKeyCommand(key('ArrowRight', { shiftKey: true }), true)).toEqual({
			kind: 'nudge',
			dx: 10,
			dy: 0
		});
	});
});

// What Escape checks before it puts the window back where move mode found it. Monitor bounds
// are physical and measured from the primary display's corner, as `availableMonitors` gives them.
describe('centreOnADisplay', () => {
	const display = (x: number, y: number, width: number, height: number) => ({
		position: { x, y },
		size: { width, height }
	});
	const laptop = display(0, 0, 2560, 1600);
	const strip = { x: 2608, y: 880, width: 1824, height: 160 };

	it('finds a rect on the display it was placed on', () => {
		const projector = display(2560, 0, 1920, 1080);
		expect(centreOnADisplay(strip, [laptop, projector])).toBe(true);
	});

	it('loses a rect whose display has been unplugged', () => {
		expect(centreOnADisplay(strip, [laptop])).toBe(false);
		expect(centreOnADisplay(strip, [])).toBe(false);
	});

	it('goes by the centre, not by any overlap', () => {
		// Mostly off the laptop's right edge: a sliver an operator cannot see or take hold of.
		const hanging = { x: 2400, y: 700, width: 1000, height: 200 };
		expect(centreOnADisplay(hanging, [laptop])).toBe(false);
		// Mostly on it, with a corner hanging off.
		expect(centreOnADisplay({ ...hanging, x: 1800 }, [laptop])).toBe(true);
	});

	it('handles displays to the left of and above the primary', () => {
		const left = display(-1920, 200, 1920, 1080);
		const above = display(0, -1440, 2560, 1440);
		const onLeft = { x: -1872, y: 1000, width: 1824, height: 160 };
		const onTop = { x: 48, y: -400, width: 1824, height: 160 };
		expect(centreOnADisplay(onLeft, [laptop, left])).toBe(true);
		expect(centreOnADisplay(onTop, [laptop, above])).toBe(true);
		// The same rects once those displays have gone.
		expect(centreOnADisplay(onLeft, [laptop])).toBe(false);
		expect(centreOnADisplay(onTop, [laptop])).toBe(false);
		// Above the left display's top edge, though level with the primary: on neither.
		expect(centreOnADisplay({ ...onLeft, y: 0 }, [laptop, left])).toBe(false);
	});

	it('counts the right and bottom edges as off the display', () => {
		const point = (x: number, y: number) => ({ x, y, width: 0, height: 0 });
		expect(centreOnADisplay(point(0, 0), [laptop])).toBe(true);
		expect(centreOnADisplay(point(2559, 1599), [laptop])).toBe(true);
		expect(centreOnADisplay(point(2560, 800), [laptop])).toBe(false);
		expect(centreOnADisplay(point(1280, 1600), [laptop])).toBe(false);
	});
});
