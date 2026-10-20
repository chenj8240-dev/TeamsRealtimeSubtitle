import { readStored } from './persisted';

export type CaptionLayout = 'fit' | 'compact' | 'stable';
export const CAPTION_LAYOUT_KEY = 'overlay.captionLayout';
export const DEFAULT_CAPTION_LAYOUT: CaptionLayout = 'fit';

/** The original speech under a translation is set this much smaller than the caption. */
export const ORIGINAL_SCALE = 0.6;
/** Space between a caption and the original under it, in px. */
export const ORIGINAL_GAP = 4;

/** Height of `lines` lines of original speech under a caption set at `fontSize`. */
export function originalHeight(fontSize: number, lines: number): number {
	return lines * Math.ceil(ORIGINAL_SCALE * fontSize * 1.34);
}

/** Bottom alignment is a subtitle strip; manually resizing still permits more context. With
 *  the original shown, each row also gets one line of it. */
export function bottomCaptionHeight(
	fontSize: number,
	origins: number,
	layout: CaptionLayout,
	original = false
): number {
	// Up to four rows: two sources, each in two caption languages.
	const rows = Math.max(1, Math.min(4, origins));
	const originalRow = original ? originalHeight(fontSize, 1) + ORIGINAL_GAP : 0;
	const textHeight = (2 * fontSize * 1.34 + originalRow) * rows + 18 * (rows - 1);
	return Math.max(160, Math.ceil(layout === 'compact' ? textHeight / 0.85 : textHeight + 32));
}

export function isCaptionLayout(value: unknown): value is CaptionLayout {
	return value === 'fit' || value === 'compact' || value === 'stable';
}

export function loadCaptionLayout(): CaptionLayout {
	const value = readStored(CAPTION_LAYOUT_KEY);
	return isCaptionLayout(value) ? value : DEFAULT_CAPTION_LAYOUT;
}

/** The most of one turn, or of one source's reading context, that any caption view lays out.
 *  Far more than a projector region or the operator's stage can show, and the bound on what
 *  each update costs while a turn streams for minutes of continuous speech. The transcript
 *  keeps every word; this is presentation only. */
export const CAPTION_TAIL_CHARS = 12_000;

/** Bounded reading context, separate from the full session transcript. */
export function appendCaptionHistory(history: string, text: string): string {
	return `${history} ${text}`.replace(/\s+/g, ' ').trim().slice(-CAPTION_TAIL_CHARS);
}

/** Keep the last `limit` characters, cutting on a word boundary, behind an ellipsis when
 *  anything was cut. */
export function tail(text: string, limit: number): string {
	const t = text.replace(/\s+/g, ' ').trim();
	if (t.length <= limit) return t;
	let cut = t.length - limit;
	// Don't start mid-word: jump to the next space if it's close.
	const sp = t.indexOf(' ', cut);
	if (sp !== -1 && sp - cut < 24) cut = sp + 1;
	return '… ' + t.slice(cut);
}

/**
 * Keep the newest words using the actual rendered height, including the live caret.
 *
 * Every call to `fits` is a synchronous layout, and in Fit window the text carries up to
 * 12,000 characters of context, so the search used to begin by laying out a paragraph far
 * larger than any window. `reach` is the caller's bound on how many characters the region
 * could ever show: the search starts from that tail, and only if even the tail fits — the
 * bound was too tight — does it fall back to the whole text. The result is the same either
 * way; the bound only decides how much is laid out to find it.
 */
export function fitCaptionTail(
	text: string,
	fits: (candidate: string) => boolean,
	reach = Infinity
): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return normalized;
	const cut = normalized.length > reach ? normalized.indexOf(' ', normalized.length - reach) : -1;
	if (cut !== -1) {
		const tail = normalized.slice(cut + 1);
		if (!fits('… ' + tail)) return fitWords(tail.split(' '), fits);
	}
	if (fits(normalized)) return normalized;
	return fitWords(normalized.split(' '), fits);
}

/** The newest words that fit behind an ellipsis, given that all of `words` do not. */
function fitWords(words: string[], fits: (candidate: string) => boolean): string {
	let low = 1;
	let high = words.length;
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (fits('… ' + words.slice(mid).join(' '))) high = mid;
		else low = mid + 1;
	}
	if (low < words.length) return '… ' + words.slice(low).join(' ');
	// A single long token can exceed the region. Keep its newest Unicode code points.
	const chars = Array.from(words.at(-1) ?? '');
	low = 0;
	high = chars.length;
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (fits('… ' + chars.slice(mid).join(''))) high = mid;
		else low = mid + 1;
	}
	const result = '… ' + chars.slice(low).join('');
	return fits(result) ? result : '';
}

/**
 * More characters than a `width` × `height` region could show at `lineHeight`: two rows of
 * slack, and an average glyph a fifth of the line height wide — narrower than any caption
 * face's average, so the figure only ever bounds the search in `fitCaptionTail`.
 */
export function captionReach(width: number, height: number, lineHeight: number): number {
	if (width <= 0 || height <= 0 || lineHeight <= 1) return Infinity;
	return Math.ceil(((Math.floor(height / lineHeight) + 2) * width) / (lineHeight * 0.2));
}

/**
 * The first character offset that sits on rendered line `line` or below, given `lineOf`, the
 * line each character is laid out on (never decreasing along the text). 0 when no character
 * reaches that line. Stable reading cuts its context here: text that starts a line wraps
 * from there exactly as it did before the cut, so no line after it moves.
 */
export function firstOffsetOnLine(
	length: number,
	lineOf: (offset: number) => number,
	line: number
): number {
	if (line <= 0 || length === 0 || lineOf(length - 1) < line) return 0;
	let low = 0;
	let high = length - 1;
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (lineOf(mid) >= line) high = mid;
		else low = mid + 1;
	}
	return low;
}
