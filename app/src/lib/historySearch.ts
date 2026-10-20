import type { SavedSession } from './history';
import type { TargetLanguage } from './languages';
export interface HistoryFilter {
	query: string;
	from: string;
	to: string;
	language: string;
}

function fold(text: string): string {
	return text.normalize('NFKC').toLocaleLowerCase();
}

// Normalising every line of every session on each keystroke cost tens of milliseconds with a
// long history. A listed session is decoded once and never mutated, and the History tab keeps
// the same object until its file changes (`createHistoryCache`), so its folded text is
// computed on first search and reused for as long as the session is unchanged.
const searchText = new WeakMap<SavedSession, string[]>();

function foldedText(session: SavedSession): string[] {
	let texts = searchText.get(session);
	if (!texts) {
		texts = [session.title ?? '', ...session.lines.flatMap((l) => [l.text, l.sourceText])].map(
			fold
		);
		searchText.set(session, texts);
	}
	return texts;
}

/** The languages a session was captioned in: its target and, when it had one, the second
 *  caption language. Empty for same-language subtitles. Sessions saved before the second
 *  language existed simply have none. */
export function captionLanguagesOf(session: SavedSession): TargetLanguage[] {
	if (!session.targetLanguage) return [];
	return session.secondTargetLanguage
		? [session.targetLanguage, session.secondTargetLanguage]
		: [session.targetLanguage];
}

/** Date inputs mean the operator's local calendar date, including its whole final day. */
export function matchesSession(session: SavedSession, filter: HistoryFilter): boolean {
	const date = new Date(session.startedAt);
	const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	if ((filter.from && day < filter.from) || (filter.to && day > filter.to)) return false;
	// A session in two caption languages was read in both, so either one finds it. Subtitles
	// are in the language spoken, when it is known.
	const captioned = captionLanguagesOf(session);
	const languages: string[] = captioned.length ? captioned : [session.sourceLanguage];
	if (filter.language && !languages.includes(filter.language)) return false;
	const query = fold(filter.query.trim());
	if (!query) return true;
	return foldedText(session).some((text) => text.includes(query));
}
