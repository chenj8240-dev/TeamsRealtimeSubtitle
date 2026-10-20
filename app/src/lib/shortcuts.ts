export type Shortcut =
	'toggleSession' | 'togglePause' | 'toggleOverlay' | 'larger' | 'smaller' | 'direction';

/** A key as the interface names it. The words come from the catalog (`$t.keys`), because a
 *  German keyboard says Strg and a French one says Maj. */
export type KeyName = 'ctrl' | 'shift' | 'space' | 'p' | 'o' | 'up' | 'down' | 'f2';

/** Every shortcut, once: what the listener matches, what `aria-keyshortcuts` announces and
 *  what the window prints are all read from here, so the three cannot drift apart. */
export const SHORTCUT_KEYS: Record<Shortcut, readonly KeyName[]> = {
	toggleSession: ['ctrl', 'shift', 'space'],
	togglePause: ['ctrl', 'shift', 'p'],
	toggleOverlay: ['ctrl', 'shift', 'o'],
	larger: ['ctrl', 'shift', 'up'],
	smaller: ['ctrl', 'shift', 'down'],
	direction: ['f2']
};

/** The key each name stands for, as `KeyboardEvent.code` reports it — the physical key, so a
 *  layout that moves the letters does not move the shortcut — and as ARIA spells it. F2 is
 *  also matched by `key`, which is what it has always been matched by. */
const KEY: Record<
	Exclude<KeyName, 'ctrl' | 'shift'>,
	{ code: string; key?: string; aria: string }
> = {
	space: { code: 'Space', aria: 'Space' },
	p: { code: 'KeyP', aria: 'P' },
	o: { code: 'KeyO', aria: 'O' },
	up: { code: 'ArrowUp', aria: 'ArrowUp' },
	down: { code: 'ArrowDown', aria: 'ArrowDown' },
	f2: { code: 'F2', key: 'F2', aria: 'F2' }
};

/** The value for `aria-keyshortcuts`, which is in ARIA's key names whatever the interface
 *  language: `Control+Shift+Space`. */
export function ariaKeyShortcut(command: Shortcut): string {
	return SHORTCUT_KEYS[command]
		.map((key) => (key === 'ctrl' ? 'Control' : key === 'shift' ? 'Shift' : KEY[key].aria))
		.join('+');
}

/** The shortcut as the operator reads it, in the interface language: `Ctrl+Shift+Space`,
 *  written the way Windows writes key combinations. */
export function keyLabel(command: Shortcut, names: Record<KeyName, string>): string {
	return SHORTCUT_KEYS[command].map((key) => names[key]).join('+');
}

/** App-local shortcuts. Never intercept typing, repeats, IME or a dialog's own keys. */
export function shortcut(event: KeyboardEvent, dialogOpen: boolean): Shortcut | null {
	if (
		dialogOpen ||
		event.defaultPrevented ||
		event.repeat ||
		event.isComposing ||
		event.altKey ||
		event.metaKey
	)
		return null;
	const target = event.target;
	if (
		target instanceof Element &&
		target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')
	)
		return null;
	for (const [command, keys] of Object.entries(SHORTCUT_KEYS) as [Shortcut, KeyName[]][]) {
		const main = KEY[keys.find((key) => key !== 'ctrl' && key !== 'shift') as keyof typeof KEY];
		if (
			event.ctrlKey === keys.includes('ctrl') &&
			event.shiftKey === keys.includes('shift') &&
			(event.code === main.code || (main.key !== undefined && event.key === main.key))
		)
			return command;
	}
	return null;
}
