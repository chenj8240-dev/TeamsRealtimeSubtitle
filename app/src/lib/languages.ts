import catalog from './languages.json';
import { TARGET_LANGUAGES, type TargetLanguage } from './languageCodes';
import { secondCaptionLanguageOf, type Provider, type StartOptions } from './types';
import type { Messages } from './i18n/en';

export { TARGET_LANGUAGES, type TargetLanguage };
/** Languages with bundled demo scripts and rehearsal recordings. Mirrors `DemoLanguage`. */
export const DEMO_LANGUAGES = ['en', 'fr'] as const;
export type DemoLanguage = (typeof DEMO_LANGUAGES)[number];
export const LANGUAGE_FAVOURITES_KEY = 'language.favourites';
const DEFAULT_FAVOURITES: TargetLanguage[] = ['en', 'fr'];

export function isTargetLanguage(value: unknown): value is TargetLanguage {
	return typeof value === 'string' && (TARGET_LANGUAGES as readonly string[]).includes(value);
}

export function supportsLanguage(provider: Provider, code: TargetLanguage): boolean {
	return (
		provider === 'whisper' ||
		provider === 'mistral' ||
		provider === 'gemini-transcribe' ||
		!!catalog.languages.find((l) => l.code === code)?.providers.includes(provider)
	);
}

/** The first caption language of a run that its engine cannot write, or undefined. The second
 *  language counts as much as the first: it stays in the saved setup across an engine change,
 *  so it can be one the new engine does not offer. The page disables Start on it and the
 *  session controller refuses it, both through here, so the two cannot disagree. */
export function unsupportedCaptionLanguage(
	options: Pick<StartOptions, 'provider' | 'mode' | 'targetLanguage' | 'secondTargetLanguage'>
): TargetLanguage | undefined {
	const second = secondCaptionLanguageOf(options);
	return [options.targetLanguage, ...(second ? [second] : [])].find(
		(code) => !supportsLanguage(options.provider, code)
	);
}

/** The operator's sentence for `unsupportedCaptionLanguage`, or '' when the engine writes
 *  every caption language the run asks for. */
export function captionLanguageError(
	options: Pick<StartOptions, 'provider' | 'mode' | 'targetLanguage' | 'secondTargetLanguage'>,
	messages: Messages,
	locale: string
): string {
	const unsupported = unsupportedCaptionLanguage(options);
	return unsupported
		? messages.language.unsupported(
				messages.engine[options.provider],
				languageName(unsupported, locale)
			)
		: '';
}

export function languageName(code: TargetLanguage, locale: string): string {
	const fallback = catalog.languages.find((l) => l.code === code)?.english ?? code;
	try {
		const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
		return name && name !== code ? name : fallback;
	} catch {
		return fallback;
	}
}

export function captionDirection(code?: string): 'rtl' | 'ltr' | 'auto' {
	if (!code) return 'auto';
	return ['ar', 'he', 'fa', 'ur', 'sd'].includes(code.split('-')[0]) ? 'rtl' : 'ltr';
}

function normalizeLanguageSearch(text: string): string {
	return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

/** Prefixes outrank substrings; ties retain favourites' pin order, then localized names. */
export function languageRows(
	provider: Provider,
	favourites: readonly TargetLanguage[],
	query: string,
	locale: string
) {
	const needle = normalizeLanguageSearch(query);
	return catalog.languages
		.filter((l) => l.providers.includes(provider) || favourites.includes(l.code as TargetLanguage))
		.map((l) => {
			const code = l.code as TargetLanguage;
			const name = languageName(code, locale);
			const fields = [code, name, l.english, l.endonym, ...(l.aliases ?? [])].map(
				normalizeLanguageSearch
			);
			const rank =
				needle && fields.includes(needle)
					? 0
					: fields.some((s) => s.startsWith(needle))
						? 1
						: fields.some((s) => s.includes(needle))
							? 2
							: 3;
			return {
				code,
				name,
				supported: supportsLanguage(provider, code),
				favourite: favourites.includes(code),
				rank
			};
		})
		.filter((l) => l.rank < 3)
		.sort((a, b) => {
			if (needle && a.rank !== b.rank) return a.rank - b.rank;
			if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
			return a.favourite
				? favourites.indexOf(a.code) - favourites.indexOf(b.code)
				: a.name.localeCompare(b.name, locale);
		});
}

export function loadLanguageFavourites(storage?: Pick<Storage, 'getItem'>): TargetLanguage[] {
	try {
		const raw = (
			storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
		)?.getItem(LANGUAGE_FAVOURITES_KEY);
		if (raw == null) return [...DEFAULT_FAVOURITES];
		const values: unknown = JSON.parse(raw);
		return Array.isArray(values)
			? [...new Set(values.filter(isTargetLanguage))]
			: [...DEFAULT_FAVOURITES];
	} catch {
		return [...DEFAULT_FAVOURITES];
	}
}

/** F2 swaps the first two pins, without skipping unsupported pins. Outside the pair it
 * selects the first; fewer than two pins or either unsupported makes the shortcut a no-op. */
export function nextFavourite(
	current: TargetLanguage,
	favourites: readonly TargetLanguage[],
	provider: Provider
): TargetLanguage | undefined {
	const [first, second] = favourites;
	if (
		!first ||
		!second ||
		!supportsLanguage(provider, first) ||
		!supportsLanguage(provider, second)
	)
		return;
	return current === first ? second : first;
}
