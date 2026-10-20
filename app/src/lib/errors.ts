// Turning what the core reports into what the operator reads.
//
// The core names a failure and hands over the technical text underneath it; the catalog owns
// the sentence (see `src-tauri/src/errors.rs`). Everything here is about being useful when
// that contract does not hold: an id the catalog has never heard of, an error thrown by the
// webview rather than by Rust, a string from a library. None of those may end up on screen as
// "[object Object]" during a live event.

import type { Messages } from './i18n/en';

/** What a Tauri command rejects with, and what a status event carries. */
export interface AppError {
	/** Stable id, looked up in the catalog's `error` group. */
	id: string;
	/** Untranslated technical text — a Windows message, a provider's own wording, a path. */
	detail?: string;
}

export function isAppError(value: unknown): value is AppError {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as AppError).id === 'string' &&
		((value as AppError).detail === undefined || typeof (value as AppError).detail === 'string')
	);
}

/**
 * One line for the operator: the sentence for this failure, then the technical detail.
 *
 * An id the catalog does not have falls back to the detail alone rather than to the id — a
 * core that has learned a new failure still says something an operator can act on, and
 * `error.deviceEnumeration` on screen would help nobody.
 */
export function describeError(value: unknown, m: Messages): string {
	if (isAppError(value)) {
		const sentence = (m.error as Record<string, unknown>)[key(value.id)];
		if (typeof sentence === 'string') {
			return value.detail ? `${sentence} (${value.detail})` : sentence;
		}
		return value.detail ?? value.id;
	}
	// Not from the core: a webview error, a rejected promise, a thrown string.
	if (value instanceof Error) return value.message;
	return String(value);
}

/** `error.micCapture` → `micCapture`, the catalog's own key. */
function key(id: string): string {
	return id.startsWith('error.') ? id.slice('error.'.length) : id;
}

/**
 * Whatever was caught, in the shape the status store holds: the structured error if the core
 * sent one, plain text otherwise. Structure is kept rather than flattened here so the sentence
 * is chosen at render time — an operator who switches language mid-session sees the message
 * they are still looking at change with it.
 */
export function asStatus(value: unknown): string | AppError {
	if (isAppError(value)) return value;
	if (value instanceof Error) return value.message;
	return String(value);
}
