# Transcript history

Implements [issue #81](https://github.com/fmadore/Live-translation/issues/81).

Open **Settings → Transcript history** in the operator window and enable **Automatically save
sessions locally** before starting a meeting. It is off by default. Enabling it mid-session
saves subsequent finalized lines; it does not retroactively archive the transcript already in
memory.

Each Start creates a separate session. Finalized lines are saved progressively to
`%LOCALAPPDATA%\io.github.fmadore.live-translation\history\<session-id>.json`. The first line
is written at once; after that, new lines are saved at most every 5 seconds rather than after
every caption. Stop, quit, retry and the next Start write anything still waiting immediately.
Stop drains and saves trailing partial text before finishing the session. Whisper may keep
producing finalized lines after Stop while its backlog drains; wait for completion before
exporting a finished session. Pause keeps the same history session. A crash leaves the last
saved snapshot, which can miss up to the last 5 seconds of lines. Empty sessions create no file.

A session that ends by itself — every source stops, for example after a provider error — is
finished at that moment, so its recorded duration does not run on until the next Start, Stop
or quit. While the History tab is open during a session, its list refreshes at most every 5
seconds; Refresh, rename and delete still update it immediately. A refresh reads only the
sessions that are new or whose file has grown since the tab last read them. A file that cannot
be read at that moment (locked by backup or antivirus software, say) is skipped and logged,
and the other sessions still list; one the tab already shows stays as it was until it can be
read again.

The session list opens automatically and shows start date/time, duration and known language
information; a session captioned in two languages shows both, for example `→ FR + DE`. Source
speech is labelled auto-detected when the provider does not report its language;
demonstration and rehearsal sources have known languages. Whisper history records its source
language as automatic even when an explicit recognition language was chosen. Unfinished
sessions show duration through the last save. Select a session to read its raw captions and
available source transcription, copy it, or export Markdown, plain text, WebVTT or SRT through
the existing Save As dialog. The format is the one chosen in the transcript toolbar, and
changing it here changes it there too. Timed formats require valid cue timing. Browsing and
exporting history never replaces the active transcript.

History remains after clearing the active transcript, export, quitting, and disabling automatic
history. Use **Delete**, then **Delete permanently**, to remove a session. Deleting the current
session prevents further history writes for that session; the next Start creates a new one.
Unreadable records are shown individually and remain deletable. Save failures stay visible with
a retry action; pending failed sessions are retained in memory until retried or the app exits.

There is no automatic expiry and no upload. Files are unencrypted local text. No audio, keys,
device names or application identities are saved. History and the optional single recovery
copy are independent. See [privacy](privacy.md).

## File format

Each session is one file under app-local data/history, named by its UUID: a log with one JSON
record per line.

1. a header — `version: 2`, the id, start time, mode, languages and title;
2. one `{"line": …}` record per finalized line, oldest first;
3. a progress record — `savedAt`, `durationMs`, `endedAt` — after each write;
4. a `{"title": …}` record for each rename.

The latest progress and title records win. The first write of a session, and any write after
a failure, replaces the file whole through a flushed staging file; every later write goes
through `append_history`, which adds only the new lines and flushes them. Appending never
creates a file, so a log never starts without its header, and a record torn by a failed write
is closed off with a newline before the next one; the reader skips it.

The log replaced a format that rewrote the whole session object on every save — about half a
gigabyte of rewrites for a three-hour session. Files in that format are still read and renamed.

Because a log only grows, its length in bytes says whether it has changed. The History tab
tells `list_history` which sessions it holds and at what length; the core lists every session
with its length but sends contents only for files that are new or have grown, and names the
held sessions that are gone. The tab decodes only what it was sent. Renaming a file in the
older format rewrites it whole, possibly at the same length, so the tab reads a renamed session
again regardless. A rename reads only a file's first line to tell a log from the older format.

## Verification

Automated coverage includes opt-in behaviour, progressive writes, raw text preservation,
separate session timelines, trailing partials, duration finalization, restart/readback, atomic
replacement, interrupted writes, write failures and retry, corruption, deletion races, path
validation, operator-only command permissions, and the history UI's copy/export/delete actions.
The listing is covered for unchanged, grown, deleted, unreadable, locked (on Windows) and
lossily read files, and the History tab for keeping an unchanged session's decoded copy.

Native release acceptance should also exercise the built-in demonstration with history enabled,
restart the packaged app, reopen two sessions, export and delete one, and confirm the other is
still available. Abruptly end a disposable demo run and check its last saved snapshot. No paid
provider call is needed for these checks.

## Titles and search

Saved sessions can be renamed (up to 120 characters); a blank title restores the date label.
Titles are stored in the session file, including while the active session continues receiving
captions. Older files without titles remain readable. Changing a title never edits caption
text.

Search matches session titles, caption text and available source text. The caption-language
filter uses the translation target (either one, for a session captioned in two languages), or
the known source language for subtitles; automatically detected languages remain marked
unknown rather than guessed. Filters do not delete sessions or change export contents.

The selected session appears beside the list (below it in narrow windows), with rename, copy,
export and confirmed deletion grouped beside it.

Enter date bounds in year-month-day order, or use the calendar button. The format hint
follows the interface language: **YYYY-MM-DD** (English), **AAAA-MM-JJ** (French) and
**JJJJ-MM-TT** (German); for example, `2026-09-20` in every language. Invalid dates show a
localized error and do not replace the last valid filter. Both bounds include the whole
selected local day. Clear a field to remove that bound, or use **Clear filters** to reset the
search, dates and language. The calendar popup is a native browser/WebView control; its
presentation can follow the host's regional settings independently of the translated field.
