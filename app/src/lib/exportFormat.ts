// The transcript export format, as one remembered preference.
//
// It used to be each transcript view's own state. The operator page mounts the transcript
// monitor in two places, one while a session runs and one after it, so Start and Stop each
// put Markdown back; and the quit prompt's Save always wrote Markdown whatever had been
// chosen. One persisted store is read by the monitor, the history view and the quit path.

import { persisted, readStored } from './persisted';
import { hasTranscriptTiming, type TranscriptFormat } from './transcript';
import type { TranscriptLine } from './types';

export const TRANSCRIPT_FORMATS = [
	'markdown',
	'text',
	'vtt',
	'srt'
] as const satisfies readonly TranscriptFormat[];

export const EXPORT_FORMAT_KEY = 'transcript.exportFormat';

function isTranscriptFormat(value: unknown): value is TranscriptFormat {
	return (TRANSCRIPT_FORMATS as readonly unknown[]).includes(value);
}

/** Storage outlives updates and can hold anything, so a value this version does not know is
 *  Markdown, the format a fresh install starts on. */
function loadExportFormat(): TranscriptFormat {
	const stored = readStored(EXPORT_FORMAT_KEY);
	return isTranscriptFormat(stored) ? stored : 'markdown';
}

export const exportFormat = persisted<TranscriptFormat>(EXPORT_FORMAT_KEY, loadExportFormat);

/** Whether the format writes cue times, which an older recovered transcript does not have. */
export function isTimedFormat(format: TranscriptFormat): boolean {
	return format === 'srt' || format === 'vtt';
}

/**
 * The format to save `lines` in when there is no chance to ask: the chosen one, or Markdown
 * when it needs timing the lines lack. The monitor disables Save in that case and explains
 * why; the quit prompt cannot, and a save that throws there would keep the app open with the
 * operator's text still unsaved.
 */
export function savableFormat(format: TranscriptFormat, lines: TranscriptLine[]): TranscriptFormat {
	return isTimedFormat(format) && !hasTranscriptTiming(lines) ? 'markdown' : format;
}
