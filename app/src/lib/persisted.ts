// One read/write policy for operator preferences in localStorage.
//
// Storage can be absent (the node test environment), and it can refuse: WebView2 throws on
// access when site data is blocked, and `setItem` throws when the quota is full. A preference
// that cannot be stored should still work for the rest of the run, so every access goes
// through here and none of them throws.

import { writable, type Writable } from 'svelte/store';

/** The stored string for `key`, or null when it is absent or storage is unavailable. */
export function readStored(key: string): string | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** Store `value` under `key`. A refusal is ignored: the in-memory value is still the truth. */
export function writeStored(key: string, value: string): void {
	try {
		if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
	} catch {
		/* Preferences remain usable when storage is unavailable. */
	}
}

/** Forget `key`, for a preference whose absence means "the default". A refusal is ignored. */
export function removeStored(key: string): void {
	try {
		if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
	} catch {
		/* Preferences remain usable when storage is unavailable. */
	}
}

/** Stored flags are the string `'true'`; anything else, including nothing, is off. */
export function readFlag(key: string): boolean {
	return readStored(key) === 'true';
}

/**
 * A store that starts from `load()` and saves every value it holds with `save`.
 *
 * `load` has to validate what it reads: storage is shared with the overlay window and outlives
 * app updates, so it can hold anything. `save` also runs for the initial value, which rewrites
 * a corrupt stored value as the one the store actually uses.
 */
export function persistedWith<T>(load: () => T, save: (value: T) => void): Writable<T> {
	const store = writable(load());
	store.subscribe((value) => {
		try {
			save(value);
		} catch {
			/* Preferences remain usable when storage is unavailable. */
		}
	});
	return store;
}

/** The common case: one key, written as `String(value)`. */
export function persisted<T extends string | number | boolean>(
	key: string,
	load: () => T
): Writable<T> {
	return persistedWith(load, (value) => writeStored(key, String(value)));
}

/** A boolean preference that is off unless it was switched on. */
export function persistedFlag(key: string): Writable<boolean> {
	return persisted(key, () => readFlag(key));
}
