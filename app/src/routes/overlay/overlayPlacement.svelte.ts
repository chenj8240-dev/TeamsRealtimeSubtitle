// Move mode for the overlay window: entering it, nudging and snapping the window, and the two
// ways out — lock the region into place, or cancel and put the window back where it was.

import { api, isTauri } from '#lib/tauri.js';
import { writeStored } from '#lib/persisted.js';
import { OVERLAY_PLACED_KEY } from '#lib/appearance.js';

/** Physical pixels, straight off the window: restoring what was read needs no conversion. */
interface Geometry {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A display's bounds as `availableMonitors` reports them: physical pixels, like `Geometry`,
 *  and measured from the primary display's corner — so a display to the left of it or above it
 *  starts at negative coordinates. */
interface DisplayBounds {
	position: { x: number; y: number };
	size: { width: number; height: number };
}

/**
 * Whether the middle of `rect` is on one of `displays`. The centre rather than any overlap: a
 * window with a sliver on a screen is not one an operator can see or take hold of, and it is
 * the test the core applies when it decides an overlay is stranded, so the two agree on what
 * still counts as there.
 */
export function centreOnADisplay(rect: Geometry, displays: readonly DisplayBounds[]): boolean {
	const x = rect.x + rect.width / 2;
	const y = rect.y + rect.height / 2;
	return displays.some(
		({ position, size }) =>
			x >= position.x &&
			x < position.x + size.width &&
			y >= position.y &&
			y < position.y + size.height
	);
}

/** Whether the rect move mode found is still on a display. A projector pulled out during
 *  move mode takes it away: the core has already brought the window onto a screen that is
 *  there, and putting it back would strand it again where nobody can see it. When the
 *  displays cannot be read, assume it is — that is how Escape behaved before it looked. */
async function stillOnADisplay(
	geo: Geometry,
	availableMonitors: () => Promise<DisplayBounds[]>
): Promise<boolean> {
	try {
		return centreOnADisplay(geo, await availableMonitors());
	} catch (err) {
		console.error('Could not read the connected displays', err);
		return true;
	}
}

export type OverlayCommand =
	| { kind: 'bump'; delta: number }
	| { kind: 'lock' }
	| { kind: 'cancel' }
	| { kind: 'nudge'; dx: number; dy: number };

/**
 * What a key does in the overlay. The overlay only has a keyboard in move mode, and that is
 * exactly when it may be covering the operator window's own "Done moving" button (issue #11)
 * — so both ways out have to be reachable from here. The +/− size keys work in either mode.
 */
export function overlayKeyCommand(
	key: { key: string; shiftKey: boolean; onButton: boolean },
	interactive: boolean
): OverlayCommand | null {
	if (key.key === '+' || key.key === '=') return { kind: 'bump', delta: 2 };
	if (key.key === '-') return { kind: 'bump', delta: -2 };
	if (!interactive) return null;
	const step = key.shiftKey ? 10 : 1;
	switch (key.key) {
		// A focused toolbar button already answers Enter itself; hijacking it would run the
		// button and the shortcut at once.
		case 'Enter':
			return key.onButton ? null : { kind: 'lock' };
		case 'Escape':
			return { kind: 'cancel' };
		case 'ArrowLeft':
			return { kind: 'nudge', dx: -step, dy: 0 };
		case 'ArrowRight':
			return { kind: 'nudge', dx: step, dy: 0 };
		case 'ArrowUp':
			return { kind: 'nudge', dx: 0, dy: -step };
		case 'ArrowDown':
			return { kind: 'nudge', dx: 0, dy: step };
		default:
			return null;
	}
}

export function createOverlayPlacement(port = api) {
	// Click-through is off and the whole stage becomes a Tauri drag region, so the window can
	// be dragged and resized into place.
	let interactive = $state(false);
	// Where the window sat when move mode was entered, so Escape can undo the whole move.
	// Not reactive — nothing renders it.
	let entryGeometry: Geometry | null = null;

	/** Remember the current window rect so a cancelled move can be undone. */
	async function snapshotGeometry() {
		if (!isTauri()) {
			entryGeometry = null;
			return;
		}
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			// `setPosition` takes the outer position and `setSize` the inner size, so read the
			// pair that can be handed straight back to them.
			const pos = await win.outerPosition();
			const size = await win.innerSize();
			entryGeometry = { x: pos.x, y: pos.y, width: size.width, height: size.height };
		} catch (err) {
			console.error('Could not record the overlay geometry', err);
			entryGeometry = null;
		}
	}

	/** Arrow-key nudge, in whole physical pixels — finer than a mouse drag can manage. */
	async function nudge(dx: number, dy: number) {
		if (!isTauri()) return;
		try {
			const { getCurrentWindow, PhysicalPosition } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			const pos = await win.outerPosition();
			await win.setPosition(new PhysicalPosition(pos.x + dx, pos.y + dy));
		} catch (err) {
			console.error('Nudge failed', err);
		}
	}

	/** Stretch the region across the presentation display, sitting on the bottom margin, as a
	 *  strip `stripHeight` logical pixels tall. */
	async function snapToBottom(stripHeight: number) {
		if (!isTauri()) return;
		try {
			const { getCurrentWindow, currentMonitor, LogicalSize, LogicalPosition } =
				await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			const monitor = await currentMonitor();
			if (!monitor) return;
			// Monitor geometry is physical; window setters take logical pixels.
			const bounds = monitor.size.toLogical(monitor.scaleFactor);
			const corner = monitor.position.toLogical(monitor.scaleFactor);
			const height = Math.min(stripHeight, Math.max(1, bounds.height - 80));
			await win.setSize(new LogicalSize(Math.round(bounds.width - 96), Math.round(height)));
			await win.setPosition(
				new LogicalPosition(
					Math.round(corner.x + 48),
					Math.round(corner.y + bounds.height - height - 40)
				)
			);
		} catch (err) {
			console.error('Snap to bottom failed', err);
		}
	}

	/** Leave move mode: click-through back on, and both windows told the region is placed. */
	async function lock() {
		try {
			// Also re-enables no-activate on the Rust side, so raising can't steal focus.
			await port.setOverlayClickThrough(true);
		} catch (err) {
			console.error('Failed to restore overlay click-through', err);
		}
		entryGeometry = null;
		interactive = false;
		writeStored(OVERLAY_PLACED_KEY, 'true');
		void port.emitOverlayState({ interactive: false, placed: true });
	}

	/** Move and size the window back to `geo`, unless that is on a display that has gone. */
	async function restoreGeometry(geo: Geometry) {
		try {
			const { getCurrentWindow, availableMonitors, PhysicalPosition, PhysicalSize } =
				await import('@tauri-apps/api/window');
			if (!(await stillOnADisplay(geo, availableMonitors))) return;
			const win = getCurrentWindow();
			// Moved back before it is sized, as `set_overlay_placement` does: a window dragged
			// onto a display with another scale factor is rescaled by Windows on the way back,
			// which would undo a size set first.
			const position = new PhysicalPosition(geo.x, geo.y);
			await win.setPosition(position);
			await win.setSize(new PhysicalSize(geo.width, geo.height));
			await win.setPosition(position);
		} catch (err) {
			// A failed restore must not trap the operator in move mode — carry on and exit.
			console.error('Could not restore the overlay geometry', err);
		}
	}

	/** Put the window back where move mode found it and leave without placing it. Where it was
	 *  may be on a display that has gone since; then it stays where it is, and the move is
	 *  abandoned all the same. */
	async function cancel() {
		const geo = entryGeometry;
		if (geo && isTauri()) await restoreGeometry(geo);
		try {
			await port.setOverlayClickThrough(true);
		} catch (err) {
			console.error('Failed to restore overlay click-through', err);
		}
		entryGeometry = null;
		interactive = false;
		// No `placed`: the move was abandoned, so the pre-flight check must still ask for it.
		void port.emitOverlayState({ interactive: false });
	}

	return {
		get interactive() {
			return interactive;
		},
		/** The operator window turned move mode on or off. Entering records the rect first,
		 *  so Escape has something to restore. */
		setInteractive(next: boolean) {
			if (next && !interactive) void snapshotGeometry();
			interactive = next;
		},
		nudge,
		snapToBottom,
		lock,
		cancel
	};
}
