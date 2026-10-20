// The remembered overlay placement through the controller, against Tauri's IPC mocks: the real
// `tauri.ts` runs, and the test plays a core with one overlay window on a known set of
// displays. What is checked is what the core is asked to do and what ends up in storage.

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mockTauri, type TauriMock } from './testing/tauriMock';
import { createOverlayController } from './overlayController.svelte';
import { OVERLAY_GEOMETRY_KEY } from './overlayGeometry';
import { overlayPlaced } from './preferences';
import type { Placement } from './profiles';

const LAPTOP = '0,0 2560x1600 150%';
const ROOM = '0,0 2560x1600 150%; 2560,0 1920x1080 100%';
const created: Placement = { x: 640, y: 720, width: 1280, height: 160 };
const strip: Placement = { x: 2608, y: 880, width: 1824, height: 160 };
const corner: Placement = { x: 40, y: 1300, width: 900, height: 200 };

let core: TauriMock;
/** The overlay window's rectangle as the fake core holds it. */
let rect: Placement;
let layout: string;

const stored = () => JSON.parse(localStorage.getItem(OVERLAY_GEOMETRY_KEY) ?? 'null') as unknown;
const store = (value: unknown) => localStorage.setItem(OVERLAY_GEOMETRY_KEY, JSON.stringify(value));

beforeEach(() => {
	localStorage.removeItem(OVERLAY_GEOMETRY_KEY);
	overlayPlaced.set(false);
	rect = { ...created };
	layout = ROOM;
	core = mockTauri();
	core.handle('display_layout', () => layout);
	core.handle('get_overlay_placement', () => rect);
	core.handle('set_overlay_placement', ({ placement }) => {
		rect = placement as Placement;
	});
});

afterEach(async () => {
	await core.dispose();
});

it('remembers the placement under the display layout when the operator presses Done', async () => {
	const overlay = createOverlayController();
	await overlay.toggleMoveOverlay();
	// Entering move mode is not a placement.
	expect(core.callsTo('get_overlay_placement')).toHaveLength(0);
	expect(stored()).toBeNull();
	expect(get(overlayPlaced)).toBe(false);
	rect = strip; // dragged onto the projector
	await overlay.toggleMoveOverlay();
	expect(overlay.moveOverlay).toBe(false);
	expect(stored()).toEqual([{ layout: ROOM, placement: strip }]);
	// Done counts as placing it, as locking it from the overlay does.
	expect(get(overlayPlaced)).toBe(true);
});

it('remembers a placement locked from the overlay, but not one Escape put back', async () => {
	const overlay = createOverlayController();
	await overlay.toggleMoveOverlay();
	rect = strip;
	// Escape: the overlay restores the rectangle move mode found and says only that it left.
	rect = created;
	overlay.applyState({ interactive: false });
	expect(overlay.moveOverlay).toBe(false);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(core.callsTo('get_overlay_placement')).toHaveLength(0);
	expect(stored()).toBeNull();

	await overlay.toggleMoveOverlay();
	rect = strip;
	// Enter, or the overlay's own Lock button.
	overlay.applyState({ interactive: false, placed: true });
	await expect.poll(stored).toEqual([{ layout: ROOM, placement: strip }]);
});

it('places a profile through the core and remembers where the core put it', async () => {
	const overlay = createOverlayController();
	// The core clamps what it is handed; what is remembered is where the window ended up.
	core.handle('set_overlay_placement', () => {
		rect = { ...corner, y: 1240 };
	});
	await overlay.applyPlacement(corner);
	expect(core.callsTo('set_overlay_placement')).toEqual([{ placement: corner }]);
	expect(stored()).toEqual([{ layout: ROOM, placement: { ...corner, y: 1240 } }]);
});

it('keeps one placement per layout, so each set of displays gets its own back', async () => {
	const overlay = createOverlayController();
	await overlay.applyPlacement(strip);
	layout = LAPTOP; // the projector is unplugged
	await overlay.applyPlacement(corner);
	expect(stored()).toEqual([
		{ layout: LAPTOP, placement: corner },
		{ layout: ROOM, placement: strip }
	]);

	layout = ROOM; // …and plugged back in at the next launch
	await createOverlayController().restorePlacement();
	expect(core.callsTo('set_overlay_placement').at(-1)).toEqual({ placement: strip });
	// Reopening on a layout is a use of it: it is the most recent again.
	expect(stored()).toEqual([
		{ layout: ROOM, placement: strip },
		{ layout: LAPTOP, placement: corner }
	]);
});

it('restores the most recent placement on displays it has not seen, through the core', async () => {
	store([
		{ layout: LAPTOP, placement: corner },
		{ layout: ROOM, placement: strip }
	]);
	layout = '0,0 1920x1080 100%';
	await createOverlayController().restorePlacement();
	// The core is what clamps it onto a display that is there.
	expect(core.callsTo('set_overlay_placement')).toEqual([{ placement: corner }]);
	// A placement it was not made for is not remembered as this layout's own.
	expect(stored()).toEqual([
		{ layout: LAPTOP, placement: corner },
		{ layout: ROOM, placement: strip }
	]);
});

it('restores the most recent placement when the core cannot name the layout', async () => {
	store([{ layout: ROOM, placement: strip }]);
	core.handle('display_layout', () => {
		throw new Error('No display available');
	});
	await createOverlayController().restorePlacement();
	expect(core.callsTo('set_overlay_placement')).toEqual([{ placement: strip }]);
});

it('leaves a first launch where the window was created, and ignores malformed storage', async () => {
	await createOverlayController().restorePlacement();
	localStorage.setItem(OVERLAY_GEOMETRY_KEY, '{"layout": broken');
	await createOverlayController().restorePlacement();
	store([{ layout: ROOM, placement: { x: 'left', y: 0, width: 0, height: 160 } }]);
	await createOverlayController().restorePlacement();
	expect(core.calls).toEqual([]);
	expect(rect).toEqual(created);
});

it('applies a profile only once a restore still under way has landed', async () => {
	store([{ layout: ROOM, placement: strip }]);
	let answer!: (signature: string) => void;
	core.handle('display_layout', () => new Promise<string>((resolve) => (answer = resolve)));
	const overlay = createOverlayController();
	const restoring = overlay.restorePlacement();
	const applying = overlay.applyPlacement(corner);
	await expect.poll(() => answer).toBeDefined();
	core.handle('display_layout', () => layout);
	answer(ROOM);
	await Promise.all([restoring, applying]);
	expect(core.callsTo('set_overlay_placement')).toEqual([
		{ placement: strip },
		{ placement: corner }
	]);
	expect(rect).toEqual(corner);
	expect(stored()).toEqual([{ layout: ROOM, placement: corner }]);
});

it('carries on when the placement cannot be read, and remembers nothing', async () => {
	core.handle('get_overlay_placement', () => {
		throw new Error('Overlay unavailable');
	});
	const overlay = createOverlayController();
	await overlay.toggleMoveOverlay();
	await overlay.toggleMoveOverlay();
	expect(overlay.moveOverlay).toBe(false);
	expect(stored()).toBeNull();
});

// Issue #137: a projector unplugged under a running app. The core rescues the window itself
// when the displays change; these are the operator window's second chances, and what it does
// with the layout the core announces.

/** The window commands, in order, without the event plumbing around them. */
const windowCalls = () =>
	core.calls
		.map((call) => call.cmd)
		.filter((cmd) =>
			['recover_overlay_placement', 'show_overlay', 'set_overlay_click_through'].includes(cmd)
		);

it('checks the overlay is on a display before entering move mode, not on the way out', async () => {
	const overlay = createOverlayController();
	await overlay.toggleMoveOverlay();
	expect(windowCalls()).toEqual([
		'recover_overlay_placement',
		'show_overlay',
		'set_overlay_click_through'
	]);
	await overlay.toggleMoveOverlay();
	// Done: the window is where the operator just dragged it.
	expect(windowCalls().filter((cmd) => cmd === 'recover_overlay_placement')).toHaveLength(1);
});

it('checks a hidden overlay is on a display before showing it, not before hiding it', async () => {
	const overlay = createOverlayController();
	await overlay.toggleOverlayVisible();
	expect(overlay.overlayVisible).toBe(false);
	expect(windowCalls()).toEqual(['show_overlay']);
	await overlay.toggleOverlayVisible();
	expect(overlay.overlayVisible).toBe(true);
	expect(windowCalls()).toEqual(['show_overlay', 'recover_overlay_placement', 'show_overlay']);
	expect(core.callsTo('show_overlay')).toEqual([{ visible: false }, { visible: true }]);
});

it('shows the overlay and enters move mode even when the check fails', async () => {
	const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
	core.handle('recover_overlay_placement', () => {
		throw new Error('No display available');
	});
	try {
		const overlay = createOverlayController();
		await overlay.toggleMoveOverlay();
		expect(overlay.moveOverlay).toBe(true);
		expect(core.callsTo('set_overlay_click_through')).toEqual([{ enabled: false }]);
		await overlay.toggleMoveOverlay();
		await overlay.toggleOverlayVisible();
		await overlay.toggleOverlayVisible();
		expect(overlay.overlayVisible).toBe(true);
		expect(core.callsTo('show_overlay').at(-1)).toEqual({ visible: true });
		expect(logged).toHaveBeenCalled();
	} finally {
		logged.mockRestore();
	}
});

it('checks again when the overlay leaves move mode by itself', async () => {
	const overlay = createOverlayController();
	await overlay.toggleMoveOverlay();
	overlay.applyState({ fontSize: 40 });
	expect(core.callsTo('recover_overlay_placement')).toHaveLength(1);
	// Escape: the overlay may have put itself back on a display that went during move mode.
	overlay.applyState({ interactive: false });
	await expect.poll(() => core.callsTo('recover_overlay_placement')).toHaveLength(2);
	expect(overlay.moveOverlay).toBe(false);
	expect(overlay.overlayVisible).toBe(true);
});

it('puts the overlay back where the layout had it when its displays return', async () => {
	store([
		{ layout: LAPTOP, placement: corner },
		{ layout: ROOM, placement: strip }
	]);
	const overlay = createOverlayController();
	await overlay.handleDisplaysChanged(ROOM); // the projector is plugged back in
	expect(core.callsTo('set_overlay_placement')).toEqual([{ placement: strip }]);
	// A use of the room's layout, and nothing else rewritten: the laptop keeps its own.
	expect(stored()).toEqual([
		{ layout: ROOM, placement: strip },
		{ layout: LAPTOP, placement: corner }
	]);
	// Nothing read back to be remembered, and the window's state left as it was.
	expect(core.callsTo('get_overlay_placement')).toHaveLength(0);
	expect(windowCalls()).toEqual([]);
	expect(overlay.overlayVisible).toBe(true);
	expect(overlay.moveOverlay).toBe(false);
});

it('leaves the overlay where the core rescued it on displays with no placement of their own', async () => {
	store([{ layout: ROOM, placement: strip }]);
	const overlay = createOverlayController();
	layout = LAPTOP; // the projector is unplugged; the core has already moved the window
	await overlay.handleDisplaysChanged(LAPTOP);
	await overlay.handleDisplaysChanged('');
	expect(core.callsTo('set_overlay_placement')).toHaveLength(0);
	// The rescue is not a placement: the projector's is still the one remembered.
	expect(stored()).toEqual([{ layout: ROOM, placement: strip }]);

	// The operator places it on the laptop by hand; that is saved under the laptop's layout.
	await overlay.toggleMoveOverlay();
	rect = corner;
	await overlay.toggleMoveOverlay();
	expect(stored()).toEqual([
		{ layout: LAPTOP, placement: corner },
		{ layout: ROOM, placement: strip }
	]);
});

it('does not move the overlay from under the operator in move mode', async () => {
	store([{ layout: ROOM, placement: strip }]);
	const overlay = createOverlayController();
	await overlay.toggleMoveOverlay();
	await overlay.handleDisplaysChanged(ROOM);
	expect(core.callsTo('set_overlay_placement')).toHaveLength(0);
	expect(overlay.moveOverlay).toBe(true);
});

it('applies a display change only once a restore still under way has landed', async () => {
	store([
		{ layout: ROOM, placement: strip },
		{ layout: LAPTOP, placement: corner }
	]);
	let answer!: (signature: string) => void;
	core.handle('display_layout', () => new Promise<string>((resolve) => (answer = resolve)));
	const overlay = createOverlayController();
	const restoring = overlay.restorePlacement();
	const changing = overlay.handleDisplaysChanged(LAPTOP);
	await expect.poll(() => answer).toBeDefined();
	answer(ROOM);
	await Promise.all([restoring, changing]);
	expect(core.callsTo('set_overlay_placement')).toEqual([
		{ placement: strip },
		{ placement: corner }
	]);
	expect(rect).toEqual(corner);
	expect(stored()).toEqual([
		{ layout: LAPTOP, placement: corner },
		{ layout: ROOM, placement: strip }
	]);
});
