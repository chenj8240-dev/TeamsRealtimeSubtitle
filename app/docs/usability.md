# Meeting profiles and live controls

The controls an operator uses to set up and run a meeting. Native acceptance is tracked in the
[current release checklist](store-updates.md#release-171-handoff).

## Session controls

Start and Stop share a persistent action bar immediately below the app header. The bar
stays visible while either column scrolls, including the stacked layout at narrow widths
or enlarged text sizes. Rehearse appears beside Start. Setup, live captions and the saved
transcript all remain below the session controls.

Start, Rehearse and Ctrl+Shift+Space read one rule: nothing starts while a start, a stop or a
profile load is under way, while a caption language is one the engine does not offer, or
before the engine is ready (its key saved, its Whisper model installed, or the demo checked).
Start also needs a chosen application to be running; Rehearse plays the bundled sample
instead, and the built-in demo has no rehearsal.

New installations open on Whisper with Base and automatic language detection. Switching
from translation to Subtitles also selects Whisper and retains the selected audio source;
it does not start capture or a model download. Existing saved setups are restored on launch.

## Pause

**Pause**, beside Stop (or Ctrl+Shift+P), keeps the session, clock and transcript together.
For cloud engines, each connection closes gracefully and flushes its final turn; after that,
no audio is streamed or billed until **Resume** connects afresh. The cost estimate counts
streamed time. With **Whisper**, Pause stops new audio entering recognition or temporary
storage while pending speech continues processing. The demo holds between scripted steps.

Capture and level meters remain active while paused. **Hide overlay** only blanks the
captions and does not pause capture or provider usage. Normal Stop lets Whisper finish its
backlog; wait for completion before exporting the full transcript.

## Meeting profiles

Use the profile picker above step 01, then **Manage profiles**. Choose **Save current setup…**,
enter a name and save. Each profile row offers **Load profile** and a management menu for
**Rename** or confirmed deletion. Each save creates a named snapshot.
Profiles persist locally across restart, using `meeting.profiles` in webview local storage.

A profile includes output mode, provider, caption language, audio source and device identifiers,
caption appearance, reading pace, hold time, cleanup toggle and the current overlay rectangle.
It excludes API keys, rehearsal mode, transcripts and application process identities. Loading
does not start capture or change the opt-in history/recovery preferences.

Loading is disabled during capture, an audio test or another setup operation. The app enumerates
devices before applying the profile. Missing endpoints fall back to the Windows default with a
notice; application capture remains unselected until the operator explicitly selects a process.
The preflight must be checked again. A saved overlay rectangle is constrained to an available
display's work area; a disconnected projector falls back to the primary display. Check placement
after display or scaling changes. Only the operator window may invoke the placement commands.
A loaded profile's rectangle also becomes the overlay's remembered placement for the current
displays, which the next launch reopens without loading the profile again
([caption layout](caption-layout.md#fit-window)).

## Reading and saved sessions

### Two caption languages and original speech

In **Live translation**, choose your first target in the language step, then use **Second
caption language** for an additional target supported by the same engine. The two targets
must differ. Choose no second language to return to a single output. Both captions appear
in the overlay and transcript; exports preserve each line's language. Each target opens a
separate provider session for each audio source, so adding a target increases cloud usage.

In **Settings → Reading**, **Show the original speech under translations** adds a smaller
source-text line when the provider supplies one. It works in Fit window and Compact, not
Stable reading. This display choice is separate from **Include original speech** in the
export controls. Neither option creates missing source text. Local Whisper transcribes in
the spoken language and does not offer translation targets.

### Settings and history

Settings has **Captions**, **Reading**, **Transcript history** and **App** tabs.
The dialog and tab bar retain their dimensions when switching tabs; the content scrolls
independently and starts at the top of each newly selected tab. Short tabs intentionally
leave spare space. Use Left/Right arrows, Home or End within the tab bar, and Tab to
reach its content. Changes apply immediately; close with the corner button or Escape.

See [caption layout](caption-layout.md#reading-pace-and-preview) for the adjustable reading pause,
Steadier updates and presets. See [transcript history](transcript-history.md#titles-and-search)
for session titles, full-text search and inclusive date/language filters.

## Input status

The running rail describes each active source independently. Connection, reconnection and error
states take precedence. A recent caption is shown as **Receiving captions**; otherwise a recent
level above the existing RMS signal threshold is **Receiving audio**. When audio is arriving
but captions have not arrived for 15 seconds, the app suggests checking the provider/connection.
Quiet inputs say **Listening — no recent audio signal**. These are observations, not speech
detection or a diagnosis of provider failure. The built-in demo uses simulated input events.
A screen reader hears a source only when it stops with an error or goes 15 seconds without
captions, not on every change of label.

## Keyboard controls

These shortcuts apply while the operator window has focus, outside inputs, selects, editable
text and dialogs. Repeated keydown and IME composition do not trigger commands. They are not
system-wide hotkeys and cannot control the app while another application is focused.

| Shortcut | Action |
| --- | --- |
| Ctrl+Shift+Space | Start / stop; follows the same rule as Start, and says why when an unsupported language or a missing application stops it |
| Ctrl+Shift+P | Pause / resume a running session |
| Ctrl+Shift+O | Show / hide the overlay |
| Ctrl+Shift+Up / Down | Increase / decrease caption size |
| F2 | Switch translation direction while stopped |

Shortcut help lives in **Settings → App**. A shortcut hint sits beside Start. Existing overlay
move-mode keys are unchanged.

## Verification

Automated tests cover interim batching without starvation, independent sources, immediate
finalization, stop cancellation, preference validation, profile round trips and hardware checks,
profile controls, safe placement, the placement remembered per display layout (its signature,
saving, the eight-layout cap and the launch restore), concurrent history renames, search,
keyboard guards and live status classification. Gemini tests cover Smart final/interim
precedence and empty finals.
German date regressions cover valid and invalid dates, leap years, calendar event handling,
inclusive bounds and filter reset.

Impeccable browser checks on 19 September 2026 used the real components with a temporary
synthetic backend at 1280×800 and 800×600, in French and German and at 200% text scaling:
appearance previews, the Large room preset, profile save/load, history search and title
editing, input statuses, the stop shortcut and the two-source stable overlay at 1000×400. On
20 September, Settings kept identical dialog and tab-bar positions across all four tabs at
1280×800 and in a narrow preview. Browser checks do not exercise native storage, the native
calendar popup, installed MSIX behaviour or cloud services; native mixed-DPI placement,
keyboard operation in the packaged app and a fresh paid provider probe still require release
acceptance.
