# Architecture

## Data flow

```text
microphone / system / application audio
                  │
          resampling + PCM16
                  ├── cloud WebSocket client(s) ──────────────┐
                  └── temporary spool → Whisper CPU worker ──┤
scripted demo ───────── deterministic caption timeline ──────┤
                                                             ▼
                                              operator + caption overlay
                                                             │
                                              transcript / export / history
```

1. **Live capture.** Each live source owns a native capture thread. `CaptureState` downmixes,
   applies a Kaiser-windowed sinc anti-alias filter when downsampling, resamples to the
   provider rate by linear interpolation, converts to mono PCM16,
   and forms roughly 100 ms chunks. Realtime callbacks write only to bounded channels.
2. **Provider sessions.** Gemini Live Translate and OpenAI produce translated captions;
   Mistral Voxtral and Gemini Transcribe Live produce same-language captions. One async client
   runs per selected source and owns setup, timeouts, backoff, reconnect classification, audio
   pumping, turn finalization, and graceful shutdown.
3. **Built-in demonstration.** The compatibility provider id `ondevice` starts
   `ondevice::run_session`, which opens no device and contacts no service. A deterministic
   English or French timeline emits the same status, level, partial- and final-caption events
   as a live provider, so it exercises the shipping UI, timer, overlay, transcript and export
   paths on x64 and ARM64. It is presented as a demonstration, not speech recognition.
4. **Local Whisper.** The `whisper` provider (subtitles) and `whisper-translate` (translation
   into English, whisper.cpp's translate task) share one pipeline, `Provider::is_local_whisper`:
   16 kHz PCM16, a bounded writer queue, an anonymous temporary audio file and a separate CPU
   inference worker per source. A verified multilingual model context is shared, and the
   sources take turns at inference on it; each source owns its inference state. Capture
   timestamps travel with the audio, so a slow recognizer preserves meeting timing. ggml is
   compiled for AVX2 on x64 and for dot-product on ARM64, so `whisper/cpu.rs` refuses an older
   processor before any native code runs and the interface offers another engine. See
   [local Whisper](local-whisper.md).
5. **Render/export.** Both windows receive caption events. Pending turns are keyed by
   `(origin, turnId)` and finalized lines remain available for plain-text or Markdown export.

Every caption carries an interval — `startMs`/`endMs`, milliseconds since the session started —
stamped in the core by `timing::SessionClock` and shared by every source, so a document that
interleaves the microphone and the system agrees with itself about what happened when. It is
monotonic elapsed time rather than the audio timeline, because cloud clients drop stale
buffered audio before reconnecting and an audio clock would lose every gap where the socket was
down. `realtime::emit_caption` applies it for cloud protocols and the demonstration. Whisper
stamps segments from capture timestamps carried through its spool, so CPU backlog does not
shift the transcript to the later inference time.

Protocol handlers are pure: `handle_message` parses one server message into the turn
accumulator and returns a `CaptionUpdate` (none, interim or final) with the connection
control. The shared runner emits the caption and advances a finished turn, so each wire format
is unit-tested without a socket or an `AppHandle` (`realtime::test_support`). The runner itself
is three parts: `realtime/mod.rs` holds the loop, `realtime/policy.rs` the reconnect decisions
as pure functions (what to report, whether to drop or replay queued audio, how long to wait),
and `realtime/socket.rs` one connection's open, pump and graceful close. It reports through an
`Events` trait that `AppHandle` implements, so `realtime/tests.rs` drives the whole state
machine against a loopback WebSocket server on a paused clock. Every status, from the runner,
the demonstration, Whisper or the session itself, is built by a `StatusUpdate` constructor
(`session`, `source` or `lane`, by what it addresses) and leaves through `Events::status`.
`SessionManager::start` (`session/mod.rs`) builds each source through `SessionBuilder`
(`session/builder.rs`): a producer (the demo's own timeline, the rehearsal fixture or a
`CaptureTarget` thread, `session/capture.rs`) and one client, spawned by
`ProviderSettings::spawn_client` (`session/settings.rs`). Validation and the choice of sources
are in `session/options.rs`; the preflight test (`session/preflight.rs`) opens devices through
the same `CaptureTarget`.

## The transcript document

The transcript is an explicit document with a saved state, not a scrolling side effect.

- **No truncation.** The log is unbounded. Past `TRANSCRIPT_WARN_LINES` (`src/lib/document.ts`)
  an unsaved log is flagged on screen; nothing is ever dropped.
- **Saved vs unsaved.** `savedLineId` records the highest line id written to disk, so a second
  save of an unchanged document stays saved while one further line makes it unsaved again.
  `clearTranscript` resets the marker with the text, because line ids keep climbing and a
  stale marker would make a later run's first lines look as if they were already saved.
- **Optional recovery spool.** Off by default. When enabled, `src/lib/recovery.ts` writes the
  finalized lines to one file in the app's local data directory every few seconds while the
  document is unsaved; `recovery.rs` treats it as opaque UTF-8, and the format (caption fields
  only, intervals validated but optional) lives in `src/lib/document.ts`. It is deleted on
  save, clear, discard, disable, and once a startup recovery offer is answered; a malformed or
  truncated spool is deleted rather than shown. Save, Clear, Disable, Restore and Quit share
  one renderer queue: deletion invalidates queued snapshots and waits for an active write. The
  core serializes filesystem access and writes and flushes a sibling staging file before
  replacing the committed snapshot, so a failed write preserves the previous one; startup and
  deletion remove interrupted staging files.
- **Reading long transcripts.** Paragraphs break on a source change, a five-second pause,
  a backwards timestamp, or before aggregation would exceed 600 characters. Individual
  caption lines remain intact. The monitor follows incoming text only while the operator
  is at the bottom, and provides a localized keyboard-accessible Jump to latest control.

## Provider contracts

| Provider | Mode | Input | Caption source | Graceful stop |
| --- | --- | --- | --- | --- |
| Google Gemini Live Translate | Translate | 16 kHz PCM16 | output transcription | audio stream end, drain to turn complete |
| OpenAI Realtime | Translate | 24 kHz PCM16 | output transcript deltas | close and drain |
| Mistral Voxtral Realtime | Transcribe | 16 kHz PCM16 | transcription deltas | flush, end, drain |
| Google Gemini Transcribe Live | Transcribe | 16 kHz PCM16 | interim/final input transcription | audio stream end, drain to final |
| Local Whisper | Transcribe | 16 kHz PCM16 | finalized multilingual segments | EOF, finish queued audio |
| Local Whisper translation | Translate, English only | 16 kHz PCM16 | finalized segments in English, no source text | EOF, finish queued audio |
| Built-in demo | Transcribe demo | bundled deterministic timeline | scripted partial/final events | cancellation token |

The two Gemini rows are separate `Provider` variants sharing one endpoint and one stored API
key, because their wire format, rate and mode differ, and `Provider::can_translate` has to stay
a plain function of the provider. Live Translate appends transcription deltas; Transcribe Live
sends a revised hypothesis and then an authoritative final for the same segment, each replacing
the last. See [`gemini-live-api.md`](gemini-live-api.md). The two Whisper rows are split the same
way, but they are one local pipeline: everything about running it follows
`Provider::is_local_whisper`, and only the task handed to whisper.cpp follows the mode. The
translating one captions in English only, so validation refuses any other caption language and
any second one.

The subtitle backends and the built-in demo are unavailable in translation mode;
`session/options.rs` enforces this through `Provider::can_translate`.

A drain ends on the provider's own signal (`RealtimeProtocol::drain_complete`, or
`MessageControl::Closed`), on its close or error, or after four seconds. When no turn is open
and the connection has produced no caption for three seconds (`QUIET_BEFORE_CLOSE`), the
closing frames are still sent but not waited on, so a Pause in a quiet room takes effect at
once. Whatever ends a drain, the source reports the Pause or Stop that started it, and the
runner finalizes the turn so far, so a provider that rejects a closing frame costs at most the
drain.

Provider `error` events are classified per provider: authentication, permission, a bad request
or model, and an exhausted quota stop the source with the provider's message; a server error,
a rate limit or an overloaded service reconnect with backoff; an expired session (OpenAI's
60-minute cap) is a planned handover; anything unrecognized stays fatal, so a persistent
failure reports itself instead of looping. A provider that ends its session mid-stream
(OpenAI's `session.closed`, Mistral's `transcription.done`) does not end the source either:
its last caption is emitted and the runner hands over to a new session.

## Concurrency and shutdown

`SessionManager` serializes start and stop operations with a lifecycle mutex. A parent
`CancellationToken` owns the run and each live source gets a child token. A capture failure
cancels that source. Stop cancels producers, lets live providers flush and drain briefly, joins
capture threads, clears meters and current captions, and retains completed transcript lines.
The join gives up after three seconds and leaves a thread wedged in a driver call behind, so an
unplugged device cannot make the app impossible to quit. A start that fails part-way shuts down
what it had already started the same way (`SessionManager::shutdown`), without the Idle that
would clear its error.

For Whisper, Stop cancels capture and closes input, then waits for every accepted frame and
the final partial window, with no cloud drain timeout; an independent abort token lets the
operator discard the remaining audio while Stop waits. The writer and inference worker cancel
capture even on unwind, and producer outcome guards publish failures before EOF. Pause keeps
processing the backlog but drops newly captured frames before the writer queue; a second of
idle input releases the window the worker holds, so the last words before a Pause or a quiet
spell are captioned at once. Quit discards the backlog rather than waiting for it. Backlog
limits and disk or overflow failures are covered in [local Whisper](local-whisper.md).

The built-in demo observes the same cancellation token on every short delay, so Stop remains
responsive and cannot leave an audio or recognizer thread behind.

**Pause** is a `watch` channel per session: `pause_session` sets it, and every client holds a
receiver. A connected client closes its provider connection through the same graceful close
as Stop — so the last turn is flushed — reports `Paused`, and waits; on resume it connects
afresh (`Connecting`, no backoff). A pause during a connect or setup abandons it at once, and
one that lands just as setup completes closes the connection before `Running` is reported. A
pause during a reconnect backoff ends the wait. An unchanged value is not sent, so a repeated
Resume wakes nobody. Capture is untouched, so the meters keep running, and the demo's pacer
holds between steps. The renderer counts paused time out of the running cost estimate.

**Connection health.** Every send is bounded (three seconds), and a connected client pings
every 15 seconds; 30 seconds with no inbound frame at all, pongs included, means the path is
gone even if the operating system has not noticed, and the client reconnects. Without this a
Wi-Fi handoff or a dropped NAT entry left a source reporting Running while its sends blocked
for minutes and Pause went unseen.

**Planned handovers.** Gemini's `goAway` returns `MessageControl::Handover`, and a provider
ending its session mid-stream is treated the same way. After a connection that lasted at least
`STABLE_CONNECTION`, the runner reconnects without backoff and keeps the source Running. While
the new socket connects and sets up it keeps reading the producer into a backlog of up to 30
chunks (about three seconds; the oldest go first beyond that), sends it in order once setup
completes, then whatever is still queued (`next_chunk`'s catch-up) rather than coalescing it as
a stall's backlog. The gap becomes latency instead of lost speech.

**Device presence.** Capture threads check that their endpoint still exists through
`audio::devices::PresenceCheck`: at once when the device watcher reports a change, and
otherwise on a fallback interval (5 s for the microphone's enumeration, 1 s for loopback's
endpoint state), rather than polling on every wake.

Terminal provider exits cancel their source, finalize the pending turn, and then publish
their terminal status. Cancellation stays local to that source, preserving the other half
of a Both session. Capture returns runtime errors to its owner: a live session reports a
session error, while preflight stops both test devices and reports on the test channel.
Preflight workers wait until the active event is published, so an immediate device-open
failure cannot be followed by a stale active event. With its receiver closed, preflight
meters audio without resampling it or retaining a PCM buffer.

The operator's `src/lib/sessionController.ts` serializes start/stop requests and resets a
failed startup's clock. A Stop requested during startup waits for startup to settle before
stopping the core; repeated Stop requests share that operation.

## Operator window

The operator page owns native event subscriptions, layout, launch and shortcuts, and
delegates state to controller modules: `preflightController.svelte.ts` (device readiness,
signal expiry, audio tests, and whether the chosen engine is ready: a stored key, an
installed Whisper model on a supported processor, or the bundled demo),
`quitController.svelte.ts` (tray and close prompts),
`overlayController.svelte.ts` (appearance and window commands), `sessionClock.svelte.ts`,
`setupActions.ts` (mode, source, language, engine, F2), `deviceFailure.svelte.ts` (capture
failure recovery), `recoveryOffer.svelte.ts` (the start-up spool offer) and
`nativeSync.svelte.ts` (effects that mirror state to the core and the overlay). These
controllers expose reactive getters and explicit actions; they do not subscribe globally
when imported. Page teardown disposes the preflight timers and capture test. Start, Rehearse
and Ctrl+Shift+Space read one derived list of start blockers (busy, caption language, engine,
application), so the three cannot disagree about whether a session can begin.

The page renders `OperatorToolbar` (the window's one bar, with `SessionControls` passed in as
its actions), `DeviceRecoveryBanner`, `SetupSheet` or `LiveRail`, `PreflightChecklist` or
`LiveTurns`, and `SettingsDialog`, over the shared primitives in `src/lib/ui/`. Every button is
a `ToolButton` (`variant` default, primary, ghost, danger or warn; `size` sm, md or lg), drawn
once under `.ui-tool` in `app.css`. Classes the components share (`kicker`, `hint`,
`divider`, `pref`, `rail-section`) are global there too. `app.css` is also the only place a
design value is written: colours (three surfaces, three lines, four text levels, the accent,
warning, danger and room families), seven type roles, a six-step `rem` spacing scale and four
radii. `palette.test.ts`, `typeScale.test.ts` and `spacing.test.ts` read the component
stylesheets and fail on a value that bypasses them.

`shortcuts.ts` holds the one table of shortcuts that the listener, `aria-keyshortcuts` and the
printed key caps all read, and guards them against editable controls, dialogs, repeated keys
and IME composition. `CaptionAppearance.svelte` renders the same appearance controls in the
live rail and settings dialog, sharing persisted stores while keeping each contrast
description's accessible ID unique; `CaptionPreview.svelte` shares the presets and bright/dark
samples. Settings uses the shared modal's optional stable height, with a fixed header and tabs
over a scrolling, keyed tab panel; other prompts size to their content. `DateField.svelte`
shows localized year-month-day hints over ISO values, validates calendar dates before updating
the bound value, and uses a native date input, excluded from the focus cycle, for its calendar
button; that popup's language can depend on the host runtime.

The eight appearance settings have one schema in `appearance.ts`: `DEFAULT_APPEARANCE`,
`normalizeAppearance`, `toOverlayConfig`, its inverse `fromOverlayConfig` (which the overlay
reads each push through, keeping what is on screen for a field that is missing) and the
reading `PRESETS`. They persist one key each through `persisted.ts`, which reads and writes
localStorage without ever throwing, and `preferences.ts` exposes them together as `appearance`
with `applyAppearance`. `stores.ts` re-exports the four store modules: `sessionStatus.ts`,
`transcriptLog.ts`, `sourceActivity.ts` and `preferences.ts`. Every other module
that reads storage as it loads (history, the interface language, meeting profiles and the
export format in `exportFormat.ts`) goes through `persisted.ts` too, so blocked site data
cannot throw at import and leave a window blank. Names shared with the core (commands, events
and the string values of serde enums) are checked against the Rust source by
`contract.test.ts`.

Page-level tests render `+page.svelte` against Tauri's own IPC mocks
(`src/lib/testing/tauriMock.ts`, imported only by tests): the real `tauri.ts` runs, and the
test plays the core, answering commands and emitting `status` and `caption` events as
`src-tauri` does. `src/routes/OperatorPage.svelte.test.ts` scripts a built-in demo session
from Start to Stop. These tests query by role and accessible name, not by page structure.

Two Playwright suites run on Windows, outside Vitest. `e2e/style` (`npm run test:style`)
loads the production bundle in Edge, the engine WebView2 embeds, over a fake core installed
in the page; its idle answers (`src/lib/testing/idleCore.ts`) are the Vitest mock's too. It
keeps text snapshots of computed styles in `e2e/style/__snapshots__`, which a failure reports
property by property, and fails on any element whose content is wider than its box at the
minimum window size, apart from two overflows listed as intended. `e2e/native`
(`npm run test:e2e`) builds a debug exe whose identifier ends in `.e2e`, so its settings,
history, models and WebView2 profile never touch a developer's own, and drives both real
windows over WebView2's DevTools port. Each test starts on a first-launch profile and can quit
and relaunch the app on it, as the placement spec does to check that the overlay reopens where
it was placed. Both suites test the last `npm run build`.

ESLint (`eslint.config.js`) holds only typed checks that svelte-check cannot make: promises
nobody handles, and Svelte's reactivity mistakes. Its promise rules cannot see an async
function passed as a Svelte event handler or as a `() => void` prop, because Svelte types
handlers as returning `any`, so every such handler catches its own errors. knip
(`knip.jsonc`) fails on unused files, exports and dependencies.

`reading.ts` throttles interim presentation per source at 450 ms in Steadier mode; finals
flush immediately. Hold-time expiry affects the overlay only, and transcript storage is
independent of presentation pacing and the display filter. `profiles.ts` validates local
profile snapshots; `MeetingProfiles.svelte` rechecks devices before loading and excludes API
keys, process IDs and rehearsal state, and operator-only placement commands clamp saved
rectangles to an available monitor work area. Profiles never start a session.
`liveActivity.ts` classifies per-source connection, audio and caption observations; it is not
voice activity detection. See [usability](usability.md).

Audio device lists carry stable endpoint IDs. `audio/devices.rs` forwards Windows
notifications through a bounded worker queue; COM callbacks never enumerate or emit
webview events. `audioDevices.ts` validates idle selections and migrates unambiguous
legacy microphone names. Capture remains pinned to its opened endpoint when Windows
changes the default. The explicit failure recovery controls stop and drain the session
before starting again, preserving the transcript. See the
[hardware matrix](audio-device-testing.md) for issue #28's manual checks.

## Optional persistent history

The renderer's history coordinator creates a UUID at each Start and takes raw finalized lines
from the transcript commit path, with session-relative cue timing. It queues and coalesces
writes and remembers how many of each session's lines are already on disk. It writes a
session's first line at once, later lines at most every 5 seconds, and anything waiting at
Stop, quit, retry and the next Start. It retries failures, orders deletion after
any in-flight write, finishes the record of a run whose sources all end by themselves, and
keeps a tombstone so an active deleted session cannot reappear.

A session file is a log ([file format](transcript-history.md#file-format)). After the first
write, `append_history` adds only the new lines; the first write and any write after a failure
replace the file whole with the same flushed staging-and-replace operation as recovery.
`rename_history` is serialized under the native history I/O mutex and changes only the title
of the latest on-disk record, so a stale view cannot overwrite newer lines; it reads only a
file's header line to tell a log from the older format. `list_history` takes the
`[id, length]` pairs the History tab already holds and sends contents only for files that are
new or have grown, since a log only grows; it skips a file it cannot read with a warning
rather than failing the list. `createHistoryCache` in `history.ts` decodes only what it was
sent, so an unchanged session keeps its object and its search cache. Search normalizes text
with NFKC, uses inclusive local-calendar dates and matches either caption language of a
two-language session. Only the operator has permission to list, save, rename or delete these
files, and UUID validation prevents renderer paths escaping the folder. History is opt-in, off
by default and independent of crash recovery. See [history](transcript-history.md).

## Two caption languages

`StartOptions.second_target_language` adds lane 1 beside the target's lane 0. `SessionBuilder`
gives each source one client per lane; with two, the producer's channel goes to a relay
(`relay_audio`) that copies each chunk to both clients' bounded queues without blocking, so no
device is opened twice. Each lane client has a child of the source's token: one failing leaves
the other captioning, and the relay cancels the source — stopping capture — once both have
gone. `Caption` and `StatusUpdate` carry `lane`; a status with no lane (a capture failure)
applies to every lane of its source.

The renderer keys everything per stream by **track** (`Origin | "<origin>:1"`): current
captions, pending turns, per-source state, the reading presenter and the overlay's context.
Lane 0 keeps the bare origin as its key, so a one-language session is keyed exactly as before.
Committed lines of a two-language run record `lane` and `language`; `groupTranscript` groups
each lane on its own and merges the paragraphs by first line, and exports section or label by
language.

## Responsive caption overlay

The overlay route's `overlayCaptions.svelte.ts` owns current and previous turns per origin, a
bounded in-memory history (12,000 characters per origin), their expiry and the reading-pace
presenter; `overlayPlacement.svelte.ts` owns move mode and its keys, and
`OverlayMoveChrome.svelte` draws it. The persisted `overlay.captionLayout` preference defaults
to Fit window and reaches the overlay in `OverlayConfig` through `overlayController.svelte.ts`.

The overlay window is created centred (`tauri.conf.json`) and paints nothing until there are
captions or move mode, neither of which can start before the operator window has mounted. So
the remembered placement lives in the interface like any other preference:
`overlayGeometry.ts` keeps physical rectangles under `overlay.geometry`, one per display layout
and at most eight, most recently used first. A layout is the signature `display_layout`
(`placement.rs`) builds from the sorted monitors' positions, sizes and scale factors, the work
area left out. `overlayController.svelte.ts` saves the overlay's rectangle when move mode ends
with Done or the overlay's own Lock/Enter (not Escape) and after a profile places it, never on
move events, and restores once as the operator window mounts: the current layout's entry,
otherwise the most recent, always through `set_overlay_placement`. That command clamps the
rectangle to a monitor's work area and moves the window before sizing it, because crossing to
a display with another scale factor makes Windows rescale it (`WM_DPICHANGED`).

Displays can also change under a running app (issue #137). `placement.rs` polls the monitors
about once a second, including their work areas, and once a change has held for two polls it
rescues an overlay left unusable (its centre on no monitor, or larger than the one it is on)
into the work area of the monitor nearest its centre, then emits `displays-changed` with the
new layout signature. The operator window answers that with the layout's own remembered
placement, if it has one, and never saves the rescued rectangle, so the projector's entry
survives a lecture given on the laptop alone. `recover_overlay_placement` runs the same rescue
on demand: before move mode, before showing a hidden overlay and when move mode ends. Escape
in move mode restores the entry rectangle only if it still lies on a connected monitor.

- **Fit window.** `OverlayCaptionLine.svelte` measures candidate text in a hidden paragraph
  with the visible text's font, line height, available width and live-caret footprint.
  `captionLayout.ts` finds a fitting suffix, preserving the newest words and handling long
  unbroken tokens. Viewport size, measured row width and font changes trigger refitting.
  Visible origins share the usable height after padding and row gaps, with system audio above
  the microphone.
- **Compact** retains the previous-turn character budget and an adjustable typographic width.
- **Stable reading** retains context per origin in a top-left viewport whose height is rounded
  down to complete lines, and scrolls by whole lines; font and resize changes re-measure. The
  context is trimmed only at a rendered line start: once 180 lines are hidden, the line
  component measures the live layout and hands back the offset that leaves 60, so no visible
  line re-wraps. A whole-session idle event clears it.

Display-only filler cleanup runs before rendering and does not mutate caption events or
transcript records. `cleanSpeech.ts` compiles the operator's word list into one whole-word
matcher (`createFillerFilter`) and owns the list's validation and storage; the list travels in
every `OverlayConfig` push beside the appearance but is not part of it. Stable reading cleans
each turn once as it joins the context, so a mid-session change to the toggle or the list
applies to the live turn and new turns.

Expiry and trimming affect only the overlay; the operator transcript is never truncated.
Behaviour, idle timers and placement mode are described in [caption layout](caption-layout.md).

## Leaving the app

`lifecycle.rs` owns what closing means; `src/lib/quit.ts` owns the order it happens in. The
window's X, **Quit** in the tray, and the core's watchdog all run the same sequence, so none of
them is a cheap path that skips a step:

1. **Claim it.** `ack_close`, before anything is stopped.
2. **Hide instead?** With *Keep running in the tray* on, closing hides the window and stops
   here — the session, the overlay and the transcript all carry on. The first hide explains
   itself in the window rather than as a toast, which Focus Assist or a full-screen slideshow
   could swallow.
3. **May this session end?** Asked while it is still running, so ending an event's captions is
   a decision rather than a mis-aimed click.
4. **Stop and drain.** `stop_session` cancels capture and gives the providers a bounded window
   to hand over their last turn; `prepareClose` bounds the wait on that.
5. **Finalize.** The in-flight turn is committed, then unsaved text gets Save / Discard /
   Cancel. A save that fails keeps the app open.
6. **Exit.** `confirm_close` stops the session again, so releasing the capture devices does not
   depend on the renderer having got that far, then calls `app.exit(0)`.

`CloseGuard` intercepts a close only while the front-end reports unsaved text, a live session,
or the tray preference. Two rules stop it from ever producing a window that refuses to close:
that default of off, and an interception nothing acknowledges within `ACK_TIMEOUT` is released.
`WindowEvent::Destroyed` on the operator window exits the process, so the undecorated
always-on-top overlay cannot outlive its controls. Hiding to the tray never reaches it: that
window is hidden, never destroyed.

## Tray

Tray behaviour is deliberately explicit: a normal minimize keeps Windows taskbar semantics, and
the operator chooses **Minimize to tray** or enables **Keep running in the tray when I close
the window**. A live session must never disappear silently. The menu always provides Open,
Show/Hide overlay, Stop session and Quit.

`tray.rs` builds the icon and menu once, in `setup`. The menu holds no state of its own —
session and overlay state live in the front-end and are written onto the live menu items
through `set_tray_state`, so a menu that offers **Stop session** is a session that is running.
The front-end also passes localized `TrayLabels`; the menu uses them, plus a disabled status
item showing the elapsed session time. `set_tray_state` is synchronous, so it runs on the main thread; `tray.rs`
remembers the text and enabled state last written to each item and skips unchanged writes,
which leaves one status write per second during a session.

**Open** is handled entirely in the core, because showing a window needs nothing from the
renderer and the menu has to keep working even if the front-end is wedged. Everything else
needs session or transcript state, so it goes back over `TRAY_COMMAND` for the front-end to
carry out.

`tauri-plugin-single-instance` is registered first in the builder chain: a second launch
focuses the running window instead of starting a second process to fight over the same capture
devices.

## Security and privacy

Provider authentication happens in Rust. Each optional key has its own Windows Credential
Manager entry, with an environment-variable fallback, and never enters the Svelte renderer,
whose content-security policy blocks direct connections. Only debug builds load `.env` or
honour the `*_WS_HOST` host overrides. Local Whisper sends no audio over the network and
deletes its temporary audio file on close; its pinned model downloads are integrity-checked and
available only to the operator window. The built-in demo opens no audio device, uses no
network and needs no credential. The developer operates no backend, relay, telemetry,
analytics or crash-reporting service. See [`SECURITY.md`](../SECURITY.md) and the
[privacy policy](privacy.md) for what is stored and what leaves the machine.

## The two windows are not equally trusted

The operator window and the overlay are separate webviews, and the overlay is the one an
audience looks at. It needs to move itself, resize itself and restore its own click-through
while the operator is placing it — and nothing else: not the commands that read a provider
key's presence, start a billable session, write the transcript or quit the app (issue #31).

Two things make the split real rather than documentary:

- `build.rs` declares an **app ACL manifest** (`AppManifest::commands`, fed from
  `src/command_names.rs`), which generates an `allow-<command>` permission per command. Once an
  app has such a manifest, Tauri checks every one of its own commands against the calling
  window's capability and rejects anything not granted — without it, app commands are only
  checked for remote origins.
- `capabilities/operator.json` grants all of them to `operator`;
  `capabilities/overlay.json` grants `overlay` exactly one — `set_overlay_click_through` —
  plus the core event permissions and the three window mutations it uses
  (`set_position`, `set_size`, `start_dragging`) on top of the read-only `core:window:default`.

The tests in `src/command_names.rs` hold the three pieces together: they fail if a command is
registered without a permission (which would be rejected at runtime the first time an operator
used it), if a capability grants something that no longer exists, or if the overlay is handed
anything beyond placing itself.

To see the boundary work, open the overlay's dev tools in `npm run tauri dev` and invoke a
command it does not have:

```js
await window.__TAURI_INTERNALS__.invoke('stop_session')
// stop_session not allowed on window "overlay", webview "overlay", URL: local
// allowed on: [windows: "operator", URL: local]
// referenced by: capability: operator, permission: allow-stop-session
```

## Operational limits

- Windows is the supported release target; native x64 and ARM64 packages are built.
- CI contract-tests provider messages but does not call billable services.
- Cloud caption accuracy and availability depend on the selected third-party provider. Local
  Whisper accuracy and speed depend on its model, language and the computer’s CPU.
- The built-in demo verifies product presentation and workflow, not microphone recognition.
