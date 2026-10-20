// Which language the interface is in, and how a component reads a message.
//
// Deliberately not the caption language: an operator running a French-language event may be
// working in English, or the other way round, and issue #23 is explicit that the two are
// independent. Nothing here touches `options.targetLanguage`.

import { derived, writable } from 'svelte/store';
import { readStored, writeStored } from '../persisted';
import { de } from './de';
import { en, type Messages } from './en';
import { fr } from './fr';

export const LOCALES = ['en', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

const CATALOGS: Record<Locale, Messages> = { en, fr, de };

/** Each language's name in its own language — a selector that says "French" to someone who
 *  cannot read English has not helped them. */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: en.locale.name,
	fr: fr.locale.name,
	de: de.locale.name
};

/** localStorage key. Both windows share an origin, so the overlay reads the same choice. */
export const LOCALE_KEY = 'ui.locale';

/** Exported because the overlay is a separate webview and has to validate the locale it is
 *  handed over the config event. Re-listing the locales there is how `de` came close to being
 *  pushed to a window that would have kept rendering English. */
export function isLocale(value: string | null | undefined): value is Locale {
	return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The stored choice if there is one, otherwise Windows' own language, otherwise English.
 *
 * First run follows the machine because an operator who has set Windows to French should not
 * have to find a selector to be spoken to in French; after that the explicit choice wins,
 * because someone who switched the app to English meant it.
 *
 * Called as this module loads, which every window does first, so storage is read through
 * `persisted.ts`: WebView2 throws when site data is blocked, and a throw here would leave the
 * window blank instead of merely forgetful.
 */
export function detectLocale(): Locale {
	const stored = readStored(LOCALE_KEY);
	if (isLocale(stored)) return stored;
	if (typeof navigator !== 'undefined') {
		for (const tag of navigator.languages ?? [navigator.language]) {
			// Match on the primary subtag: fr-CA and fr-FR are both French here, de-AT and
			// de-CH both German.
			const primary = tag?.split('-')[0]?.toLowerCase();
			if (isLocale(primary)) return primary;
		}
	}
	return 'en';
}

export const locale = writable<Locale>(detectLocale());

/** Persisted, so the next launch opens in the language the operator chose. */
export function setLocale(next: Locale): void {
	locale.set(next);
	writeStored(LOCALE_KEY, next);
}

/**
 * Keep `<html lang>` on the interface language.
 *
 * `app.html` ships `lang="en"` and nothing moved it, so a French interface was being handed
 * to Narrator as English — which is not a cosmetic detail: a screen reader picks its voice
 * and its pronunciation rules from this attribute, so every French label was being read with
 * English phonemes. WCAG 3.1.1. Subscribing here rather than in a component means both
 * windows get it, and they get it from the one place that knows the language.
 *
 * This is the *interface* language, and it is the right value for both windows' chrome. The
 * overlay's captions are in the caption language, which this deliberately knows nothing
 * about; they carry their own `lang`, pushed over `OverlayConfig.captionLanguage`.
 */
locale.subscribe(($locale) => {
	if (typeof document === 'undefined') return;
	document.documentElement.lang = CATALOGS[$locale].locale.tag;
});

/** The catalog for the active locale. Components read `$t.…`. */
export const t = derived(locale, ($locale) => CATALOGS[$locale]);

/** BCP 47 tag for `Intl`, so dates and times follow the interface language. */
export const localeTag = derived(locale, ($locale) => CATALOGS[$locale].locale.tag);

/** A timestamp as the interface language writes it — used for the recovery spool's age.
 *  Accepts the ISO string the spool stores as well as a Date or an epoch. */
export function formatDateTime(value: number | string | Date, tag: string): string {
	return new Date(value).toLocaleString(tag, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
}

export { de, en, fr };
export type { Messages };
