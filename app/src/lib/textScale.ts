// Windows' accessibility text size, applied to the operator window.
//
// Windows' *Make text bigger* slider does not reach web content inside WebView2, so the Rust
// side reads `UISettings.TextScaleFactor` and hands it over — see `src-tauri/src/textscale.rs`
// and docs/accessibility.md. All this module does with it is set one custom property; the
// `--fs-*` ramp in app.css multiplies every font size in the window by it, and `:root`'s own
// font size carries it into the `em` breakpoints that decide when the two columns stack.
//
// The overlay does not call this. Its captions are projected content sized for a room by the
// operator, the same reason it opts out of contrast themes.

import { api, isTauri, on } from './tauri';

/** The range of the Windows slider; anything outside it is a corrupt read, not a request. */
const TEXT_SCALE_MIN = 1;
export const TEXT_SCALE_MAX = 2.25;
export const TEXT_SCALE_DEFAULT = 1;

/**
 * Hold a factor to the range the layout is verified at.
 *
 * The core clamps too. This is not redundant: the value also arrives from an event payload
 * that has crossed a JSON boundary, and a `NaN` here would invalidate every `calc()` in the
 * stylesheet at once and leave the operator looking at an unstyled window.
 */
export function clampTextScale(factor: unknown): number {
	if (typeof factor !== 'number' || !Number.isFinite(factor)) return TEXT_SCALE_DEFAULT;
	return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, factor));
}

/** Just enough of an element to carry a custom property — `HTMLElement` satisfies it, and so
 *  does a stand-in, which is what keeps this module's tests out of a DOM environment. */
export type StyleTarget = { style: { setProperty(name: string, value: string): void } };

/** Write the factor onto the document root, where app.css picks it up. */
export function applyTextScale(factor: unknown, root?: StyleTarget): void {
	const target = root ?? (typeof document === 'undefined' ? undefined : document.documentElement);
	if (!target) return;
	target.style.setProperty('--text-scale', String(clampTextScale(factor)));
}

/**
 * Apply the operator's current text size and keep following it. Returns an unsubscribe.
 *
 * The initial value is asked for rather than waited for: the window has to lay itself out
 * before it could have subscribed to anything, and someone who needs 225% text should not be
 * shown a frame of 9.5px type first. In a browser preview there is no Windows to ask, and the
 * `1` already in the stylesheet stands.
 */
export async function followTextScale(): Promise<() => void> {
	if (!isTauri()) return () => {};

	const stop = await on.textScale((factor) => applyTextScale(factor));
	try {
		applyTextScale(await api.textScaleFactor());
	} catch {
		// A failed read is not worth an error in front of the operator: the window is usable
		// at the default, and the slider still reports any later change through the event.
	}
	return stop;
}
