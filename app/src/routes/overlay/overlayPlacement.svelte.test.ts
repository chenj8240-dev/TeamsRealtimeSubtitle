// Escape in move mode, against Tauri's IPC mocks as the overlay window: the window commands it
// sends are what is checked. Issue #137: a display that went during move mode must not get the
// window back.

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockTauri, type TauriMock } from '#lib/testing/tauriMock.js';
import { on } from '#lib/tauri.js';
import type { OverlayStateMsg } from '#lib/types.js';
import { createOverlayPlacement } from './overlayPlacement.svelte';

const LAPTOP = { position: { x: 0, y: 0 }, size: { width: 2560, height: 1600 } };
const PROJECTOR = { position: { x: 2560, y: 0 }, size: { width: 1920, height: 1080 } };
/** Where move mode found the window: a strip along the bottom of the projector. */
const entry = { x: 2608, y: 880, width: 1824, height: 160 };

let core: TauriMock;
let displays: (typeof LAPTOP)[];

const monitor = (display: typeof LAPTOP) => ({
	name: null,
	scaleFactor: 1,
	...display,
	workArea: display
});

beforeEach(() => {
	displays = [LAPTOP, PROJECTOR];
	core = mockTauri('overlay');
	core.handle('plugin:window|outer_position', () => ({ x: entry.x, y: entry.y }));
	core.handle('plugin:window|inner_size', () => ({ width: entry.width, height: entry.height }));
	core.handle('plugin:window|available_monitors', () => displays.map(monitor));
});

afterEach(async () => {
	await core.dispose();
});

/** Enter move mode and wait for the rect it records for Escape. */
async function enterMoveMode() {
	const placement = createOverlayPlacement();
	placement.setInteractive(true);
	await expect.poll(() => core.callsTo('plugin:window|inner_size')).toHaveLength(1);
	await new Promise((resolve) => setTimeout(resolve, 0));
	return placement;
}

it('puts the window back where move mode found it while that display is there', async () => {
	const placement = await enterMoveMode();
	await placement.cancel();
	expect(core.callsTo('plugin:window|set_position')).toHaveLength(2);
	expect(core.callsTo('plugin:window|set_size')).toHaveLength(1);
	expect(core.callsTo('set_overlay_click_through')).toEqual([{ enabled: true }]);
	expect(placement.interactive).toBe(false);
});

it('leaves the window where the core rescued it when that display has gone', async () => {
	const told: OverlayStateMsg[] = [];
	const unlisten = await on.overlayState((msg) => told.push(msg));
	const placement = await enterMoveMode();
	displays = [LAPTOP]; // the projector is unplugged mid-move
	await placement.cancel();
	expect(core.callsTo('plugin:window|set_position')).toHaveLength(0);
	expect(core.callsTo('plugin:window|set_size')).toHaveLength(0);
	// Move mode is left all the same, and still as a cancel: nothing new was placed.
	expect(core.callsTo('set_overlay_click_through')).toEqual([{ enabled: true }]);
	expect(placement.interactive).toBe(false);
	await expect.poll(() => told).toEqual([{ interactive: false }]);
	unlisten();
});

it('puts the window back as before when the displays cannot be read', async () => {
	const placement = await enterMoveMode();
	core.handle('plugin:window|available_monitors', () => {
		throw new Error('Monitors unavailable');
	});
	const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		await placement.cancel();
		expect(logged).toHaveBeenCalled();
	} finally {
		logged.mockRestore();
	}
	expect(core.callsTo('plugin:window|set_position')).toHaveLength(2);
	expect(placement.interactive).toBe(false);
});
