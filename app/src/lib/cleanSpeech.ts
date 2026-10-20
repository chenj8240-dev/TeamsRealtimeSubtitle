import { readFlag, readStored, removeStored, writeStored } from './persisted';

export const CLEAN_SPEECH_KEY = 'overlay.cleanSpeech';

/** Absent while the list is the built-in one, so everyone who never edited it keeps the
 *  shipped behaviour. `[]` is a list the operator emptied on purpose, and stays empty. */
export const FILLER_WORDS_KEY = 'overlay.fillerWords';

/** Hesitation sounds in English and French: exact tokens, never discourse words that can
 *  carry meaning. The operator can change the list; this is what Reset restores. */
export const DEFAULT_FILLER_WORDS: readonly string[] = Object.freeze([
	'um',
	'uh',
	'erm',
	'hmm',
	'euh',
	'heu'
]);

/** Bounds on what the list can hold. Every overlay push carries it, and every caption is
 *  matched against it. */
export const MAX_FILLER_WORDS = 100;
export const MAX_FILLER_WORD_LENGTH = 40;

export function loadCleanSpeech(): boolean {
	return readFlag(CLEAN_SPEECH_KEY);
}

/** Why an entry was not added. A blank entry is not reported: there is nothing to add. */
export type FillerWordProblem = 'blank' | 'phrase' | 'characters' | 'length' | 'duplicate' | 'full';

/** One word the filter can match whole: letters, marks and digits, joined only by hyphens or
 *  apostrophes (`mm-hmm`, `y'know`). ZWNJ and ZWJ are part of words in Persian and Indic
 *  scripts. */
const WORD = /^[\p{L}\p{M}\p{N}‌‍]+(?:['’-][\p{L}\p{M}\p{N}‌‍]+)*$/u;

/** Matching ignores case, so the list does too: `Um` and `um` are one entry. */
const wordKey = (word: string) => word.toLowerCase();

/** `list` with `input` added at the end, trimmed and composed, or why it was not added. */
export function addFillerWord(
	list: readonly string[],
	input: string
): { list: string[]; word: string } | { problem: FillerWordProblem } {
	const word = input.trim().normalize('NFC');
	if (!word) return { problem: 'blank' };
	if (/\s/u.test(word)) return { problem: 'phrase' };
	if (!WORD.test(word)) return { problem: 'characters' };
	if ([...word].length > MAX_FILLER_WORD_LENGTH) return { problem: 'length' };
	if (list.some((entry) => wordKey(entry) === wordKey(word))) return { problem: 'duplicate' };
	if (list.length >= MAX_FILLER_WORDS) return { problem: 'full' };
	return { list: [...list, word], word };
}

export function removeFillerWord(list: readonly string[], word: string): string[] {
	return list.filter((entry) => wordKey(entry) !== wordKey(word));
}

/** A valid list from any array: storage written by another build, or an overlay event. Each
 *  acceptable word once, in order, within the limits; the rest are dropped, not the list. */
export function normalizeFillerWords(values: readonly unknown[]): string[] {
	let list: string[] = [];
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const added = addFillerWord(list, value);
		if ('list' in added) list = added.list;
	}
	return list;
}

/** The built-in words, in any order or case. Assumes a normalized (duplicate-free) list. */
export function isDefaultFillerWords(list: readonly string[]): boolean {
	return (
		list.length === DEFAULT_FILLER_WORDS.length &&
		DEFAULT_FILLER_WORDS.every((word) => list.some((entry) => wordKey(entry) === word))
	);
}

export function loadFillerWords(): string[] {
	const stored = readStored(FILLER_WORDS_KEY);
	if (stored !== null) {
		try {
			const parsed: unknown = JSON.parse(stored);
			if (Array.isArray(parsed)) return normalizeFillerWords(parsed);
		} catch {
			/* Unreadable: fall back to the built-in list, as if nothing were stored. */
		}
	}
	return [...DEFAULT_FILLER_WORDS];
}

export function saveFillerWords(list: readonly string[]): void {
	if (isDefaultFillerWords(list)) removeStored(FILLER_WORDS_KEY);
	else writeStored(FILLER_WORDS_KEY, JSON.stringify(list));
}

/** Clause punctuation, Latin and Arabic, removed along with the word it follows or precedes:
 *  "we need to, uh, validate" loses both commas. */
const CLAUSE = ',;:،؛';
/** What may follow a word for it to count as whole. Anything else — a letter in any script, a
 *  hyphen, a quotation mark — means the word is part of something longer. */
const WORD_END = `\\s${CLAUSE}.!?…؟`;
const WORD_END_CHAR = new RegExp(`[${WORD_END}]`, 'u');
const LEADING_RESIDUE = new RegExp(`^[${WORD_END}]+`, 'u');

/** A word as a pattern: escaped, with either apostrophe and any hyphen accepted, since the
 *  operator types one and the provider may return another. */
function wordPattern(word: string): string {
	return word
		.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		.replace(/['’]/g, "['’]")
		.replace(/-/g, '[-‐‑]');
}

/** An all-capitals word is an abbreviation ("HMM", "UM"), not a hesitation. Scripts without
 *  case have no abbreviations to protect this way. */
function isAbbreviation(token: string): boolean {
	return /\p{Lu}/u.test(token) && !/\p{Ll}/u.test(token);
}

/** Display-only removal of `words` from caption text. Whole words only, never substrings,
 *  matched without regard to case. Keeps uppercase abbreviations and quoted or compound
 *  words, and while streaming requires a completed token, so an incoming "um" does not
 *  disappear before becoming "umbrella". The spacing and punctuation around what is left are
 *  the provider's own: only the removed word and the clause punctuation around it go. */
export function createFillerFilter(
	words: readonly string[]
): (text: string, final?: boolean) => string {
	if (!words.length) return (text) => text;
	const alternatives = [...words]
		.sort((a, b) => b.length - a.length)
		.map(wordPattern)
		.join('|');
	// Opening quotation marks before the word, or closing ones after it, with French spacing
	// allowed (« euh »): a quoted word is being talked about, not hesitated over.
	const pattern = new RegExp(
		`(?<![«‹“„]\\s*)(^|[${CLAUSE}]?\\s+|[${CLAUSE}])(${alternatives})(?=$|[${WORD_END}])(?!\\s*[»›”])([${CLAUSE}]?)`,
		'giu'
	);
	return (text, final = true) => {
		let changed = false;
		let leading = null as string | null;
		const cleaned = text.replace(
			pattern,
			(match, before: string, token: string, after: string, offset: number) => {
				const end = offset + match.length;
				if (isAbbreviation(token) || (!final && end === text.length && !after)) return match;
				changed = true;
				if (leading === null && !text.slice(0, offset).trim()) leading = token;
				// What follows keeps its own spacing: a space, punctuation or the end needs
				// nothing more. A word jammed against a comma ("Take,um,the") needs one space.
				const next = text.charAt(end);
				return before && next && !WORD_END_CHAR.test(next) ? ' ' : '';
			}
		);
		if (!changed) return text;
		if (leading === null) return cleaned;
		// A removed opening word leaves its trailing punctuation behind ("Euh… je pense").
		// The sentence then starts at the next word, capitalized if the removed one was.
		const rest = cleaned.replace(LEADING_RESIDUE, '');
		return /^\p{Lu}/u.test(leading) ? rest.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : rest;
	};
}
