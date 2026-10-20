# Transcript export — issue #26

Included in **1.2.3**. The user confirmed native Save As on the ARM64 test MSIX on
8 September 2026; the acceptance matrix below remains partially unverified.

Choose a format in the transcript toolbar and press **Save as…** (**Enregistrer sous…**). The
choice is remembered through Start, Stop and restarts, and the history view shares it.
Windows opens its native Save As dialog, owned by the operator window; select any writable
folder and filename. Windows supplies overwrite confirmation and the default file extension.
The app remembers the folder after a successful save, including across restarts; a missing
folder falls back to Documents. No filesystem capability is granted to the overlay.

Cancelling leaves the transcript, saved marker and recovery copy unchanged. Cancelling
Save As from the quit prompt keeps the application open. The quit prompt's Save writes the
format chosen in the toolbar; when that is WebVTT or SubRip and the transcript has no timing
(an older recovered one), it writes Markdown instead, so the save cannot fail on the way out. A successful export writes a
snapshot of finalized captions; captions arriving while the dialog is open remain unsaved
and eligible for recovery. Writes use a flushed temporary file in the chosen directory,
followed by replacement, so a failed write does not truncate an existing export.

Markdown and plain text retain paragraph grouping and localized source labels. WebVTT uses
voice tags, and SRT prefixes each cue with its localized source name. Both retain all
finalized text, order cues by start time, permit simultaneous microphone/system cues,
and support durations over 24 hours. One-frame turns receive a minimum 1 ms interval.

Timing comes from the core's monotonic session clock, not wall-clock timestamps or an audio
recording. Cloud provider latency is included; these are caption timings, not forced alignment
with speech. Whisper maps segment offsets to capture timestamps, so pending processing time
does not move cues later; wait for Stop to finish its backlog before saving the complete
transcript (a confirmed discard leaves an incomplete-transcript notice). Reconnects share the
session clock. Separate sessions retained in one transcript are concatenated after its last
cue; idle time between sessions is omitted. Older recovery files without timing remain
exportable as Markdown/text, with timed export disabled and an explanation rather than guessed
timestamps or silently omitted text.

Session titles, history search, reading pace, hold duration and the local filler filter never
change exported text or the date-based filename. Raw export text is what the provider
returned: Gemini Smart transcription may already have removed fillers and false starts. See
[history titles/search](transcript-history.md#titles-and-search) and
[reading controls](caption-layout.md#reading-pace-and-preview).

## Bilingual and two-language exports

Translation keeps what was said before it was translated. When a transcript holds any such
original speech, **Include original speech** appears beside the format selector (and in the
history view); the quit prompt's save follows the same choice. Text puts `Original: …` under
each paragraph, Markdown a `> *Original:* …` quote, and WebVTT and SubRip set the original as
each cue's italic second line (`<i>…</i>`). Subtitles have no separate original, so the option
is not offered for them. It is off by default.

A session captioned in two languages records each line's language. Its paragraphs are grouped
per language rather than alternating line by line; text and Markdown export one section per
language, headed by its name; WebVTT and SubRip interleave both languages' cues by start time,
each labelled with its source and language, which most players show as stacked bilingual
subtitles. The original speech, when included, is written once, under the first language. A
transcript in one language exports exactly as before.

## Verification

Automated tests cover cancelled saves and quit, captions arriving during a save, atomic
replacement and failed replacement cleanup, format selection, untimed recovery, source
overlap, partial replacement, session restart, escaping, and long-duration timestamps. A
page-level test runs the built-in demo through Start and Stop twice and checks that the
chosen format survives both and is what the quit prompt saves.

Native acceptance checks remain manual, separately in development, NSIS and Store MSIX:

- Save each format to a chosen folder, including a path with accents and spaces.
- Reopen Save As and restart the app; verify that the last successful folder is selected.
- Choose an existing filename; decline replacement, then accept it on a second attempt.
- Cancel from both the toolbar and the quit prompt; verify no write and no app exit.
- Try an unwritable destination; verify the prior file and unsaved status survive.
- Open exported SRT/VTT in a subtitle player and check both-source captions.

Issue #26 was closed at the user’s request for release 1.2.3; that closure does not certify
every packaging scenario above.
