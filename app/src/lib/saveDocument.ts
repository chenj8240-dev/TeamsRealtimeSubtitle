// One place where the transcript reaches disk, shared by the Save buttons in the monitor and
// by the Save answer in the quit prompt — so both mark the document saved, and both retire the
// crash spool, in exactly the same way.

import { get } from 'svelte/store';

import { locale, t } from './i18n';
import { languageName } from './languages';
import { exportOriginal, markTranscriptSaved, transcript } from './stores';
import { api } from './tauri';
import { recovery } from './recovery';
import { formatTranscript, transcriptFilename, type TranscriptFormat } from './transcript';

/**
 * Write the whole log and record what reached disk. Returns the path, or an empty string when
 * there was nothing to write.
 *
 * The spool is dropped afterwards because it only ever existed to cover text that was not on
 * disk. A failure to delete it is not a failure to save — the transcript is safe either way,
 * and the next successful spool write or answered recovery prompt clears it.
 */
export async function saveTranscriptDocument(
	format: TranscriptFormat,
	now = new Date()
): Promise<string> {
	const lines = get(transcript);
	if (!lines.length) return '';
	const messages = get(t);
	const path = await api.saveTranscript(
		formatTranscript(
			lines,
			format,
			now,
			{
				title: messages.export.title,
				origin: messages.export.origin,
				original: messages.export.original,
				language: (code) => languageName(code, get(locale)),
				tag: messages.locale.tag
			},
			{ original: get(exportOriginal) }
		),
		transcriptFilename(now, format)
	);
	if (!path) return '';
	markTranscriptSaved(lines, path);
	try {
		if (get(transcript) === lines) await recovery.clear();
	} catch {
		// Deliberately ignored; see above.
	}
	return path;
}
