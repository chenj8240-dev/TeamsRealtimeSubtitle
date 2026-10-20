// The overlay reopens where it was placed. It is placed as an operator places it — move mode,
// a new rectangle, Done — then the app is quit and started again on the same profile, and the
// core reports that rectangle once the operator window has restored it. A runner has one
// display, so this is the same-layout case; other layouts, the eight-layout cap and mixed DPI
// are left to the unit tests and the manual checklist in docs/caption-layout.md.
//
// And Move overlay finds an overlay stranded off every display (issue #137). A runner cannot
// unplug a monitor, so the overlay strands itself, as a projector pulled out from under it
// would leave it; what is checked is that entering move mode brings it back onto the one
// display there is. The display-change event itself is left to the manual checklist.

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Bounds {
	position: { x: number; y: number };
	size: { width: number; height: number };
}

interface Monitor extends Bounds {
	workArea: Bounds;
}

type TauriWindow = {
	__TAURI_INTERNALS__: { invoke(cmd: string, args: unknown): Promise<unknown> };
};

/** A command sent from the page as the app sends it, so the window's capability applies. */
function invoke<T>(page: Page, cmd: string, args: Record<string, unknown> = {}): Promise<T> {
	return page.evaluate(
		([cmd, args]) => (window as unknown as TauriWindow).__TAURI_INTERNALS__.invoke(cmd, args),
		[cmd, args] as const
	) as Promise<T>;
}

test('the overlay reopens where it was last placed', async ({ app }) => {
	const created = await invoke<Rect>(app.operator, 'get_overlay_placement');
	const { workArea } = await invoke<Monitor>(app.operator, 'plugin:window|primary_monitor');
	// Well inside the work area, so the core's clamp keeps it as it is, and nowhere near the
	// centre the window is created at.
	const placed: Rect = {
		x: workArea.position.x + 40,
		y: workArea.position.y + 60,
		width: Math.min(640, workArea.size.width - 80),
		height: 200
	};
	expect(placed).not.toEqual(created);

	await app.operator.getByRole('button', { name: 'Move overlay' }).click();
	// The drag: the window moves and resizes itself in move mode, through the placement command.
	await invoke(app.operator, 'set_overlay_placement', { placement: placed });
	await app.operator.getByRole('button', { name: 'Finish placing the overlay' }).click();
	await expect
		.poll(() => app.operator.evaluate(() => localStorage.getItem('overlay.geometry')), {
			message: 'the placement remembered'
		})
		.toContain(`"placement":${JSON.stringify(placed)}`);

	await app.relaunch();

	await expect
		.poll(() => invoke<Rect>(app.operator, 'get_overlay_placement'), {
			message: 'the overlay back where it was placed'
		})
		.toEqual(placed);
});

/** Whether `rect` lies wholly inside `area`. */
function inside(rect: Rect, { position, size }: Bounds): boolean {
	return (
		rect.x >= position.x &&
		rect.y >= position.y &&
		rect.x + rect.width <= position.x + size.width &&
		rect.y + rect.height <= position.y + size.height
	);
}

test('Move overlay brings back an overlay stranded off every display', async ({ app }) => {
	const monitors = await invoke<Monitor[]>(app.operator, 'plugin:window|available_monitors');
	const { workArea } = await invoke<Monitor>(app.operator, 'plugin:window|primary_monitor');
	// Well past the right-hand edge of everything, as if the display it was on had gone. Sent
	// from the overlay, whose capability lets it move itself, and in physical pixels, as
	// `PhysicalPosition` reaches the window plugin.
	const right = Math.max(...monitors.map(({ position, size }) => position.x + size.width));
	await invoke(app.overlay, 'plugin:window|set_position', {
		label: 'overlay',
		value: { Physical: { x: right + 4000, y: workArea.position.y + 200 } }
	});
	await expect
		.poll(async () => (await invoke<Rect>(app.operator, 'get_overlay_placement')).x, {
			message: 'the overlay stranded'
		})
		.toBeGreaterThan(right);

	await app.operator.getByRole('button', { name: 'Move overlay' }).click();
	await expect
		.poll(async () => inside(await invoke<Rect>(app.operator, 'get_overlay_placement'), workArea), {
			message: 'the overlay back inside the work area'
		})
		.toBe(true);
	// Shown, as move mode always shows it: on a window the operator can see this time.
	expect(await invoke<boolean>(app.overlay, 'plugin:window|is_visible', { label: 'overlay' })).toBe(
		true
	);

	await app.operator.getByRole('button', { name: 'Finish placing the overlay' }).click();
	await expect(app.operator.getByRole('button', { name: 'Move overlay' })).toBeVisible();
});
