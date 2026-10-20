# App review — 6 October 2026

Scope: a read-only review of 1.6.1 (`b4cd7f1`) looking for defects, refactoring, efficiency,
testing and new features. It concentrates on what 1.6.0 added since the
[22 September review](app-review-2026-09-22.md): local Whisper, Pause, two caption languages,
original speech, the Gemini handover and the append-only history log. Nothing was changed.
Findings marked **verified** were traced in the code (several were rechecked by a second pass);
**plausible** ones rest on reading the code or provider documentation and need a run to confirm.

Baseline: `npm test` passes 550 tests in 59 files; `npm run check` reports 0 errors and 0
warnings; CI on `main` passes 120 Rust tests (3 ignored) and takes about 5 minutes wall time,
with `windows-11-arm` on the critical path.

**Status (7 October 2026):** batches 1 and 2 (§7) were merged in
[#116](https://github.com/fmadore/Live-translation/pull/116) and batch 3 in
[#117](https://github.com/fmadore/Live-translation/pull/117). Batch 4 was merged in two parts:
its CI, static-analysis and coverage items in
[#118](https://github.com/fmadore/Live-translation/pull/118), and T4 and T5 in
[#119](https://github.com/fmadore/Live-translation/pull/119), and batch 5 in
[#120](https://github.com/fmadore/Live-translation/pull/120). For batch 6 the maintainer chose
F1 and F2, merged in [#121](https://github.com/fmadore/Live-translation/pull/121); F3 to F8 stay
open. [#122](https://github.com/fmadore/Live-translation/pull/122) reconnects Mistral after the
3803 error noted under batches 1 and 2. All of it is prepared as
[1.7.0](store-updates.md#release-170-handoff).

## Implementation tracker — batches 1 and 2

| Item | Change | Status |
| --- | --- | --- |
| D1 | A mid-stream close is a handover; OpenAI and Mistral `error` events classified, and OpenAI's `session_expired` is a planned handover | Done; live checks pending |
| D2 | `drain_complete`: Transcribe ends on the final after `audioStreamEnd`; Translate now sends `audioStreamEnd` and ends on `turnComplete`; an empty turn after 3 quiet seconds closes at once | Done; Translate's answer to `audioStreamEnd` not yet seen live |
| D3 | Sends bounded at 3 s; a ping every 15 s; 30 s with no inbound frame reconnects | Done; pong replies not yet seen live |
| D4 | Pause honoured during connect and setup; no Running before Paused; an unchanged pause is not published | Done |
| D5 | A 30-chunk backlog while a handover's socket opens, sent in order | Done; live handover pending |
| D6 | Capture joins give up after 3 s; a relay ends with its source | Done |
| D7 | A failed start shuts down through `SessionManager::shutdown`, without an Idle | Done; no automated test (needs an `AppHandle`) |
| R1 | `realtime/{mod,policy,socket}.rs` and an `Events` seam | Done |
| T1 | `realtime/tests.rs`: loopback server and paused clock, 15 runner tests, plus 9 policy tests | Done |
| E1 | ggml with AVX2/FMA/F16C on x64 and `armv8.2-a+dotprod+fp16` on ARM64; `whisper/cpu.rs` gate; `whisper_cpu_support`; demo fallback; Intel SDE step in CI | Done; SDE step awaits its first CI run; hardware checks pending |
| D8, E8 | reqwest 0.13 with `system-proxy`; no total timeout; fixed `.part` file and stale clean-up; `whisper-rs-sys` pinned | Done; proxy network pending |
| D9 | `Spool::next_timeout`; 1 s idle releases the held window; window times re-anchored | Done |
| D10 | Quit discards pending local audio; the running-session prompt says how much | Done |
| D11 | Lossy segment text, U+FFFD stripped | Done |
| D12 | Word-level overlap trimming; characters only for unspaced scripts | Done |
| D13 | A segment is dropped only when no-speech > 0.6 **and** mean log-probability < −1 | Done |
| E2 | Short windows reuse the last long window's language (changed; see notes) | Done |
| E4 | One inference at a time per model; threads half the logical processors on x64, all cores but one on ARM64, at most 8 | Done; laptop check under load pending |
| E5 | 28 s windows while the backlog exceeds 30 s | Done |
| T2 | `reconcile.rs`, `language.rs`; segmenter, spool, download and CPU-gate tests | Done |

### Notes

- **E2 differs from the review on purpose.** Locking the detected language for a session would
  mis-transcribe the other language of a bilingual room for minutes. Windows of 3 s or more
  still detect their language; shorter ones reuse the language of the last longer window that
  produced captions, which skips detection where it is least reliable.
- **D2 trade-off.** Stop or Pause straight after speech on Gemini Translate now waits up to the
  4 s drain for the last translation instead of dropping it; after 3 quiet seconds with no open
  turn it closes at once.
- **E1.** clang-cl treats `/arch:AVX2` as Haswell, so the gate requires the whole Haswell set on
  x64 (BMI1/2, LZCNT, MOVBE, POPCNT included). On ARM64 it checks dot-product only: Windows'
  FP16 flag exists only on recent builds, and every Windows-on-ARM SoC with dot-product has
  FP16. whisper-rs-sys does not rebuild ggml when these variables change, so the Rust cache keys
  in `ci.yml` and `release.yml` moved to `-v2`.
- **E4.** "All cores but one" applies to ARM64 only; on x64, half the logical processors already
  leaves each core's second hardware thread free.
- **Measured** (Tiny smoke test, Snapdragon X, best of quiet runs): English 3.10 s → 1.46 s,
  French 1.73 s → 1.04 s. E1 alone gave 1.2×, and the thread change most of the rest. Under
  other load every build was erratic, because ggml's workers busy-wait.

Still needs Windows hardware or live providers: Gemini Translate's answer to `audioStreamEnd`;
an OpenAI session past 60 minutes; Mistral's real `error` payloads (one seen on 7 October, in
1.6.0: code 3803, a gRPC `UNAVAILABLE` inside Mistral's backend, which ended the session; it
matched none of D1's transient rules, and now reconnects by its wording); pong replies from every
provider; a live handover; an x64 PC without AVX2 (Whisper unavailable, demo selected); the
ARM64 Store package (gate and speed on Base and Small); a model download behind a Windows
proxy; quitting with a large backlog.

## Implementation tracker — batch 3

| Item | Change | Status |
| --- | --- | --- |
| D16 | The preflight controller takes `{ locked, holdSelection }`: a device failure holds the automatic device fallback, not Test audio | Done; desktop check pending |
| D17 | The rail counts streams from the sources actually in use, so a rehearsal is one System stream per language | Done |
| D18 | History matches and prints either caption language (`→ FR + DE`) | Done |
| D19 | `exportFormat.ts`: a persisted format shared by the monitor, the History tab and quit Save (Markdown when a recovered transcript has no timing) | Done |
| D20 | `history.ts`, `i18n/index.ts` and `MeetingProfiles` go through `persisted.ts`; a test imports them with storage throwing | Done |
| D21 | No `aria-pressed` on Pause or the three Move buttons (their labels flip; Move uses the primary style while on); `LiveActivity` speaks only on stale or error | Done; Narrator check pending |
| D22 | Width stepper labelled "Shorter/Longer caption lines", shared bounds; seven dead keys removed | Done |
| R6 | One derived list of start blockers for Start, Rehearse and the shortcut; the `hasKey` store replaced by the preflight controller's engine readiness; the R14 effects are derived | Done |
| R7 | `captionLanguageError` in `languages.ts`, used by the page and the session controller | Done |
| E6 | `list_history(known)` returns contents only for new or grown files and the ids removed; unreadable files are skipped; rename reads the header line; the History tab caches decoded sessions by id | Done |
| E7 | `tail()` and `CAPTION_TAIL_CHARS` in `captionLayout.ts` bound the live turns and the Fit original line | Done |
| T3 | `src/lib/testing/tauriMock.ts` on `mockIPC`/`mockWindows`; `OperatorPage.svelte.test.ts` runs a demo session through the page, Start to quit Save | Done |

Found on the way:

- `ApiKeyPanel` re-read the keychain on every setup change, briefly disabling Start; it now
  re-checks only when the engine changes.
- The pressed style had overridden the paused Pause button's primary fill.
- The Ctrl+Shift+Space shortcut with a missing application now shows the same message as
  Start instead of doing nothing; Rehearse now waits for a profile load like Start.
- `audio::devices` presence tests raced on a process-wide counter and are now serialised.
- One gap is known in E6: a whole-file rewrite after a failed append that lands on exactly the
  same length is missed until the next change.

Verification: `npm test` 595 passed in 67 files (556 before); `npm run check`, `format:check`,
`build` and `check:languages` pass; `cargo test` 189 passed, 4 ignored (183 before), five runs
in a row; clippy passes for aarch64 and x86_64; in the browser preview the width stepper reads
"Raccourcir/Allonger les lignes de sous-titres" and the console is clean. Still needs a
desktop run: Narrator on Pause/Resume, Move/Done and the input-status announcements; the
primary-filled Resume and Done in a contrast theme; Test audio with the failure banner up; the
History tab updating during a session; quit Save with SRT chosen.

## Implementation tracker — batch 4

| Item | Change | Status |
| --- | --- | --- |
| Audit gate | Pull requests run `npm audit --omit=dev --audit-level=moderate`; `audit.yml` runs the full audit every Monday and on demand | Done; first scheduled run pending |
| CI | `fail-fast: false` on the Node matrix; the smoke test takes the Tiny model from `WHISPER_SMOKE_MODEL_CACHE` when it matches the pin, and CI caches that folder | Done; `main`'s first run after #118 saved the cache |
| T6 (TypeScript) | `noUnusedLocals` and `noUnusedParameters`; three dead declarations removed | Done |
| T6 (ESLint) | `eslint.config.js`, typed: `no-floating-promises`, `no-misused-promises`, `await-thenable`, `svelte/require-each-key`, `prefer-writable-derived`, `infinite-reactive-loop`; four `{#each}` blocks keyed | Done |
| T6 (knip) | `knip.jsonc` with its plugins only and hints as errors; 20 unused exports and types un-exported or deleted | Done |
| T6 (Clippy) | `[lints.clippy]`: the four cast lints, `needless_pass_by_value`, `match_same_arms`, `unnecessary_wraps`; 81 findings fixed, 11 `#[expect]` with reasons, 2 Linux-only `#[allow]` | Done |
| T7 | `@vitest/coverage-v8` on the Node 24 lane, summarised in the job summary by `scripts/coverage-summary.mjs`, with per-file floors on 11 pure modules; `cargo-llvm-cov` replaces `cargo test` on the Ubuntu lane, smoke test included | Done; both summaries appear on `main` |
| T4 | `e2e/native`, `npm run test:e2e`: a debug exe built with its own identifier (`….live-translation.e2e`), both windows driven over WebView2's DevTools port with Playwright `connectOverCDP`, each test on a first-launch profile. The demo spec: Start, the first line in the overlay, Pause, Resume, Stop, then the frame's X, the unsaved prompt and Discard. The Whisper spec: Tiny on the English rehearsal recording, copied from the smoke test's cache when that holds the pin, otherwise downloaded through the interface. An `e2e` job on `windows-latest` | Done; passes on CI in about 3 min, the model from the cache |
| T5 | `e2e/style`, `npm run test:style`: the production bundle in Edge against a fake core in the page, whose answers `idleCore.ts` shares with the Vitest mock. Nine states: four idle layouts, a running session and the four settings tabs. Computed-style text snapshots at four corners (EN, FR and DE at 100%, EN at 225%; 36 snapshots), and an overflow scan of every state in EN/FR/DE at 100/150/225% at the minimum window size (81 tests), with the two intended overflows listed and explained. A `styles` job on `windows-latest` | Done; passes on CI in about 2 min |

Found on the way:

- The promise rules cannot see an async function passed as a Svelte event handler or as a
  `() => void` prop: `svelte/elements` types handlers as returning `any`. A one-off typed scan
  found 30 such handlers, and each catches its own errors; `architecture.md` now records that
  convention, since nothing static enforces it.
- No defects among the 81 Clippy findings: every cast was in range given its guards.
  `set_tray_state` returned an always-`Ok` `Result` and now returns nothing (the window already
  treated it as `void`); placement clamps in `i32` with saturation instead of casting through
  `i64`; Whisper's centisecond timestamps saturate instead of overflowing on absurd input.
  `cast_precision_loss` was tried and left out: its 15 findings were all integer samples or
  counts turned into floats.
- eslint-plugin-svelte's `recommended` set found five things, all intended (an external link,
  the overlay's measuring probe, a `prettier-ignore` space), so none of it was adopted.
- `knip --production` lists 44 exports that only tests import, nearly all the seams pure
  modules are tested through. Gating it would mean tagging each `@internal`; one dead constant
  (`cleanSpeech`) moved into its test instead.
- `tauri.ts` imported three types inline (`import('./x').T`), which knip cannot follow; they are
  ordinary `import type` now.
- ESLint 10 needs Node 22.13 on the 22 line, so `engines` and the README now say 22.13.

Verification: `npm test` 595 passed in 67 files, and under coverage 86.8% of lines and 80.4%
of branches overall; adding an untested function to a floored module fails the run.
`npm run check` 0 errors and 0 warnings; `lint`, `knip`, `format:check`, `build` and
`check:languages` pass; `cargo test` 189 passed, 4 ignored; Clippy passes for aarch64 and
x86_64; the smoke test passes with the cache empty, filled and unset. The instrumented Ubuntu
lane, the model cache, both job summaries and actionlint have since run on `main`.

Found on the way in T4 and T5:

- The overflow scan found two clippings, both in German at 225% in the smallest window. The
  API-key row's description ran 202 px out of its column, because "Anmeldeinformationsverwaltung"
  cannot break. The first shortcut cap, "Strg+Umschalt+Leertaste", was 26 px wider than its
  half of the panel. The description now breaks anywhere as a last resort, and a key cap in the
  shortcut list breaks after a `+` (`Kbd` marks where). Everywhere else a cap stays whole.
- Two departures from the plan. There are no `toHaveScreenshot` captures: a computed-value
  snapshot says what changed (`padding: 12px → 16px — 4 element(s)`) where a pixel diff only
  says where, and it does not depend on the machine's font rendering. Style snapshots cover
  four corners of the language × scale matrix rather than all nine combinations, because the
  values move with language and scale independently; the overflow scan covers every
  combination.
- The plan's `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` worked locally and failed on CI: WebView2
  ignores `WEBVIEW2_*` variables when its host runs elevated, and GitHub's Windows runners run
  everything elevated. The e2e build now compiles the DevTools port into its window config
  instead (Tauri's `additionalBrowserArgs`, which goes through WebView2's API), from an
  override the suite generates out of `tauri.conf.json`. The shipped config is untouched.
  `--lang=en-GB` rides along, so the first launch is English whatever the machine's language.
- When the port never opens, the failure now lists the app's processes with their command
  lines, its windows and the WebView2 runtime; that listing is how the elevation problem
  showed itself.
- A debug build reads `.env` from its working directory and every parent, so the fixture
  starts the app in a temporary folder and sets the three key variables blank. Keys saved in
  Credential Manager still reach the e2e app: `secrets.rs` names its keychain service itself,
  not after the identifier. Neither spec needs a key, so neither notices.
- Playwright strips types without checking them, so `npm run check` now ends with
  `tsc -p e2e`.

Verification (T4, T5), on Windows 11 ARM64: `npm run test:style` 117 passed (one run lost two
tests when Edge restarted to update itself, and the reruns passed); `npm run test:e2e` 2 passed
in 1.1 min after a 38 s incremental build, the first Whisper caption 13.6 s after Rehearse,
the model downloaded through the interface. `npm test` 595 passed; `check` (with
`tsc -p e2e`), `lint`, `knip`, `format:check`, `check:languages` and `build` pass; actionlint
1.7.12 passes. On CI (`windows-latest`, WebView2 153): `styles` passes in about 2 minutes;
`e2e` in about 3, building in 40 s with the Rust cache warm and taking the model from the
smoke test's cache, the demo spec in 10 s and the Whisper spec in 25 s (first caption 22 s
after Rehearse).

## Implementation tracker — batch 5

| Item | Change | Status |
| --- | --- | --- |
| R2 | `session.rs` is now `session/{mod, settings, options, builder, capture, preflight}.rs`; each test sits beside the code it tests, under its old name. `spawn_producer`'s two completion blocks are one `finish_producer`; `start` works out the session's origins once | Done |
| `bearer_request`, `gemini_request` | `realtime/wire.rs` builds the OpenAI and Mistral handshake, `gemini/mod.rs` both Gemini ones; tests pin each provider's handshake bytes (the random key masked) and its error text | Done |
| `parse_or_log<T>` | One copy, in `realtime/wire.rs` | Done |
| `ServerMessage::control` | One in `gemini/mod.rs` for setup, `goAway` and errors in both Gemini clients; a test pins both error wordings | Done |
| `MessageOutcome` booleans | `Signal { None, SetupComplete, TranscriptActivity }`: no message ever set both | Done |
| `MistralConfig.received_delta` | `MistralConfig` holds configuration only; the flag lives in `MistralClient`, made by `into_client()` | Done |
| `TurnAccumulator` | `translated` is `text`; the lane is a constructor argument and private | Done |
| `emit_status` | `StatusUpdate::{session, source, lane}` build every status, and every one leaves through `Events::status` | Done |
| `atomic_write` / `replace_snapshot` | `atomic_file.rs`: exports, recovery and history replace files through one implementation | Done |
| String errors, `{path:?}` | Recovery, history and window commands reject with `AppError`: five new ids, worded in all three catalogs; details show `path.display()` | Done |
| D15 and the ten sample-format arms | One generic `build::<T>` with an F32 fast path; I24 and U24 accepted | Done; needs a 24-bit microphone |
| COM `Apartment` guard | `audio/com.rs`, used by device enumeration and loopback | Done |
| Long functions | `run_microphone` about 40 lines, loopback's `run` 135 → 44, each split into named steps | Done |
| Stale docs | `lib.rs` header and panic message, `commands.rs` (four sync commands, not three), one `TRANSCRIPT_WRITE` doc line | Done |
| R8 | `fromOverlayConfig` in `appearance.ts`, the inverse of `toOverlayConfig`; the overlay keeps one appearance state | Done |
| R9 | `stores.ts` re-exports `sessionStatus.ts`, `transcriptLog.ts`, `sourceActivity.ts` and `preferences.ts`; `types.ts` lost the provider predicates (to `providers.ts`), the overlay keys and clamps (to `appearance.ts`) and the `StartOptions` defaults (to `startOptions.ts`) | Done |
| September R8 | Pre-log (v1) history files are read by checking `version === 1` and mapping lines through `readLine`, without the recovery decoder | Done |
| September R10 | The preflight and quit controllers are classes with `$state` and `$derived` fields, behind their unchanged `create…` factories; the overlay controller stays a closure, as §3 suggests | Done |
| September R13 | `SystemCapturePicker` uses `Field`. The recovery checkbox stays as it is (see below), and the `Icon` item is closed: only 3 of 27 inline SVG paths repeat | Partly done |

Found on the way:

- A failed export from the History tab showed "[object Object]": `save_transcript` already
  rejected with an `AppError`, and the tab used `String(e)`. Its four catch sites now keep the
  structured error, and its two alerts word it at render time, so they follow a change of
  language.
- The five new ids are `error.recoveryWrite`, `recoveryRead`, `recoveryDelete`,
  `historyStorage` and `operatorWindow`. A failed `spawn_blocking` reports `TASK_FAILED`.
  `tray.rs` had nothing to convert: `set_tray_state` has returned nothing since batch 4. The
  catalogs' `transcriptDir` sentence, whose id left the core in 1.2.3, is gone.
- The staging file for an atomic replace is now opened with `create_new`, after deleting a
  leftover from a crash; `File::create` used to truncate it.
- The overlay's rules differ from `normalizeAppearance`, so `fromOverlayConfig` takes the
  current appearance: a missing field keeps what is on screen, a size or width that is not a
  positive number keeps the current value, and an unparsable colour falls back to the shipped
  one. A throwaway comparison over 200,000 random pushes found no difference from the old
  per-field code. The overlay now passes hold, pace and Hide filler words to the caption model
  on every push; real pushes always carried the full appearance, so only partial pushes in
  tests behave differently.
- Every overlay push restarts the hold timers and releases paced text, so changing the font
  size or toggling Move during a session keeps finished captions up longer and, in steady
  pace, releases buffered text early. It predates this batch; fixing it changes behaviour.
- Moving the recovery checkbox onto `Preference` changes its line height, wrapping, checkbox
  margin and accessible name (the note becomes its description), and renames the element paths
  in all four `running-*` style snapshots. Keeping the old look would take three rules that
  undo `Preference`, so it belongs in a batch that allows a visual change. Likewise
  `SystemCapturePicker` keeps its tighter gap and muted label through a two-line override,
  while the microphone field above it has the shared look.
- No style snapshot shows the capture picker; a throwaway spec found identical computed styles
  and boxes before and after, at 100% and 225%, in both capture modes.
- cpal 0.18.2 reports I24 for 24-bit PCM and for 32-bit containers with 24 valid bits, and
  opens both in a 32-bit container. A throwaway test showed the generic conversions give the
  same bits as the removed arms for every 8- and 16-bit value and 2 million values of each wider
  format. The loopback output path was checked by a temporary test against this machine's
  default render device. D14 is untouched; `devices::watch` still joins COM without the guard,
  because the guard would add a `CoUninitialize` when that app-lifetime thread exits.
- Left alone: the ignored `openai/language_probe.rs` builds its own bearer request; Gemini's
  "setup complete" debug line duplicates the runner's info line; `finish_producer` has no unit
  test (one branch needs an `AppHandle`, the other a real spool); the History tab puts its
  "could not be updated" sentence in front of export failures too; `TranscriptMonitor` and
  `quit` tests mock `save_transcript` rejections as `Error` rather than as an `AppError`.
- The only log change is the debug line for an unparsed frame, now "unparsed {provider}
  message" for every provider.
- R10 saves less than the September estimate of about 100 lines (preflight 358 → 334, quit
  187 → 173): a class needs a constructor and declared private fields. Every public method is
  an arrow-function field, because the page and components pass several on bare
  (`onclick={preflight.startAudioTest}`, `onHideWindow={quit.hideWindow}`). One trade-off:
  state that was read-only outside the closure is now an assignable field; nothing assigns it.

Verification, on Windows 11 ARM64: `npm test` 608 passed in 69 files (595 before); `npm run
check` 0 errors and 0 warnings; `lint`, `knip`, `format:check`, `check:languages` and `build`
pass; `cargo test` 210 passed, 4 ignored (189 before); `cargo fmt --check` and Clippy for
aarch64 and x86_64 pass; `npm run test:style` 117 passed with every snapshot unchanged;
`npm run test:e2e` 2 passed in 1.4 min, and again after R10, whose quit controller the demo
spec's close and Discard go through. Still needs a desktop run: a 24-bit microphone (D15);
the new recovery and history sentences in all three languages.

## Implementation tracker — batch 6

The maintainer chose F1 and F2 on 7 October; F3 to F8 stay open.

| Item | Change | Status |
| --- | --- | --- |
| F1 | `Provider::WhisperTranslate` (`whisper-translate`): a keyless, offline translation engine running the local Whisper pipeline with `set_translate(true)`. English is its only caption language and it has no second one. `is_local_whisper()` / `isLocalWhisper()` mark what runs the local pipeline; the subtitle-only branches keep `'whisper'`. The setup sheet offers it in translation mode with "Choose Small: Tiny and Base translate poorly" | Done; needs a check on x64 and with Small |
| F2 | The overlay reopens where it was last placed, one placement per display layout (at most eight, least recently used dropped), in `overlay.geometry`. A new `display_layout` command names the layout from each monitor's position, size and scale. The placement is saved on Done, on the overlay's Lock or Enter and after a meeting profile places it, and restored once as the operator window mounts, always through `set_overlay_placement`'s clamp | Done; needs a mixed-DPI check |

Found on the way:

- `set_overlay_placement` sized the window, then moved it. Moving onto a display with another
  scale factor sends `WM_DPICHANGED`, and tao resizes the window to keep its logical size, so a
  placement on a 100% projector from a 150% laptop landed at two-thirds of its size; that
  already affected meeting profiles. The window is now moved, sized, then moved again. Move
  mode's Escape restore had the same order and the same fix.
- Done in the operator window ended Move mode without marking the overlay placed, so the
  preflight still said "Not placed yet" after the operator had placed it. Done now counts, like
  the overlay's own Lock.
- Whisper's translate task returns English and no source text, so `sourceText` is empty: the
  overlay draws no original line even with original speech on, the live stage no source line,
  the monitor hides "Include original", and exports with `original` are byte-identical to those
  without. Whisper's subtitle captions already had this shape.
- A second caption language saved for a cloud engine stays in the setup and is neither sent nor
  counted with Whisper, as in subtitle mode. `providerDetectsLanguage` stays false for the
  translation engine: the room reads English, so there is nothing to detect there.
- whisper.cpp still detects the spoken language before translating, so the E2 rule holds.
  Overlap trimming now compares English, where a rephrased overlap can repeat a phrase at a
  window boundary; `local-whisper.md` says so.
- The backlog row, the discard confirmation and the quit prompt said "transcribe" while
  translating; they now say "process" in all three languages. The privacy policy names
  translation into English and the remembered overlay placement; its effective date still
  names 1.6.0 and moves at the next release.
- The display-layout signature leaves out the work area, so moving the taskbar is not a new
  layout. A projector whose scale changed between sessions gets a new signature: the most recent
  placement is restored in physical pixels, so the strip covers the same pixels with larger
  text, and placing it again saves the new layout.
- The native e2e fixture gained `relaunch()`, which closes the app as the X does, waits for
  WebView2 to release its profile and starts again on it; `placement.spec.ts` places the
  overlay, relaunches and checks it reopened in place. CI has one monitor, so other layouts,
  the cap and mixed DPI are unit-tested and listed for a manual check in `caption-layout.md`.
- Left alone: whisper-rs 0.16's `set_language` leaks its C string, a few bytes per window;
  the first two F1 commits fail `contract.test.ts` until the third adds the TypeScript provider.

Verification, on Windows 11 ARM64: `npm test` 643 passed in 71 files (608 before); `npm run
check` 0 errors and 0 warnings; `lint`, `knip`, `format:check`, `check:languages` and `build`
pass; `cargo test` 218 passed, 4 ignored (210 before); `cargo fmt --check` and Clippy for
aarch64 and x86_64 pass; `npm run test:style` 117 passed, with the four `idle-translation-*`
snapshots updated for the new engine card; `npm run test:e2e` 3 passed in 2.0 min (demo,
Whisper, placement). The smoke test's new case translates the French rehearsal with Tiny:
French detected (p = 0.99), English out, as weak as Tiny is expected to be. Its wording moves
with the instruction set ("a recording of repetition" on ARM64, "an arrangement of repetition"
on x64, which failed the first CI run's check for "recording"), so the case now checks that the
output reads as English by its function words. Still needs: Small on real speech, and a laptop
at 150% with a projector at 100%.

## 1. Defects

### Cloud sessions (`realtime.rs`, provider clients)

| ID | Priority | Finding | Suggested change | Effort |
| --- | --- | --- | --- | --- |
| D1 | High | **A provider close or `error` event mid-session ends the source for good** (verified). `MessageControl::Closed` maps to `RunEnd::Stopped` in the pump (`realtime.rs:550`), which breaks out of `run_session` (`:265`), emits Idle and cancels capture. OpenAI `session.closed` (`openai/client.rs:113`) and Mistral `transcription.done` (`mistral/client.rs:105-122`) take that path if they arrive mid-session, and every OpenAI and Mistral `error` event is `Fatal` (`openai/client.rs:93`, `mistral/client.rs:124`), including expiry and transient server errors. If `/translations` shares the 60-minute Realtime cap (*plausible*), a 90-minute talk loses that source at the cap. | `Closed` means "drain finished" only inside `graceful_close`; in the pump it becomes `Handover`/`Reconnect`. Classify errors: auth and invalid-request are `Fatal`, `session_expired`/`server_error` reconnect. Harness tests for each. | S |
| D2 | High | **Close drains ignore the provider's own end signal** (code verified, server behaviour plausible). `graceful_close` (`realtime.rs:626-641`) stops on `Closed`/`Fatal`, end of stream or the 4 s deadline. Gemini Transcribe sends `audioStreamEnd` but never returns `Closed`, so every Pause and Stop waits the full 4 s. Gemini Translate sends no closing frame and closes at once, losing the translation of the last 1–3 s of speech on every Stop and Pause. | A `drain_complete(&MessageOutcome)` trait method: Transcribe finishes on the final after `audioStreamEnd`. Send `audioStreamEnd` from Translate too and finish on `turnComplete`, after a `live_probe` confirms the server accepts it. | S |
| D3 | Medium | **A stalled socket freezes the client** (plausible). `write.send(...).await` has no timeout (`realtime.rs:523-526`) and there is no ping or inbound-liveness check. After a Wi-Fi handoff or NAT drop, sends block until Windows abandons TCP retransmission; meanwhile the status still says Running, Pause is not seen, and Stop ends it only through the 5 s abort. | `timeout(≈3 s)` around each send, expiry → `Reconnect`; a ping arm every ~15 s and a `last_inbound` instant, ~30 s of silence → `Reconnect`. | S–M |
| D4 | Medium | **Pause gaps** (verified). The connect and setup selects (`realtime.rs:409-414`, `:431-444`) ignore pause, so Pause during a slow connect can wait up to 30 s and then completes a setup only to close it. `Running` is emitted (`:482`) before the pause check (`:497`), so the UI flickers. `set_paused` calls `send_replace` unconditionally (`session.rs:878`), so a redundant Resume wakes clients and cuts their backoff short (`realtime.rs:335`). | `pause.changed()` arms returning `RunEnd::Paused`; check pause before emitting Running; `send_if_modified`. | S |
| D5 | Medium | **Handover keeps only the first half-second** (mechanism verified). A `goAway` handover keeps the backlog (`realtime.rs:256`, `next_chunk` `:368`), but the producer queue holds 5 chunks (`session.rs:46`, `try_send`), so speech during the reconnect's TLS handshake and setup beyond ~500 ms is dropped. | While `catch_up` is set, select connect/setup against `audio_rx.recv()` into a `VecDeque` capped at ~30 chunks, then flush it in order: the gap becomes latency, not lost words. | S–M |
| D6 | Low | **Shutdown has no deadline on capture joins** (plausible). `join_threads` (`session.rs:390-402`) waits forever under the lifecycle lock; `confirm_close` (`lifecycle.rs:152`) awaits it. A driver hang on unplug makes the app impossible to quit. | `timeout(3 s)` around the `spawn_blocking`, then log and detach. | S |
| D7 | Low | **A failed `add_source` leaks the first source** (verified). The error path at `session.rs:740` drops threads and tasks without joining and leaves a dead token in `local_abort`. Rare: needs the second source's spawn or `Spool::new` to fail. | Fold `stop_active`'s body into `shutdown(session)` and call it there (part of R2). | S |

### Local Whisper and capture

| ID | Priority | Finding | Suggested change | Effort |
| --- | --- | --- | --- | --- |
| D8 | High | **Model download fails on slow or proxied networks and leaks partial files** (verified). `.timeout(1800 s)` bounds the whole request (`whisper/models.rs:164`), so Small needs ≥ 106 KB/s; the 60 s per-chunk stall timeout (`:176`) already covers hangs. `default-features = false` (`Cargo.toml:50`) drops reqwest 0.12's default `system-proxy` feature, so Windows proxy settings — common on university networks — are ignored. `NamedTempFile::new_in` (`:156`) is not cleaned up when the app exits mid-download (`app.exit(0)` skips destructors), leaving up to 190 MB per attempt. | Drop the total timeout; add `"system-proxy"`; download to a fixed `<file>.part` and delete stale parts on start. Optional resume with `Range`. | S (M with resume) |
| D9 | Medium | **The last ≤ 10 s before Pause is not captioned until Resume or Stop** (verified for Pause). Paused frames are dropped and `Spool::next` waits with no timeout (`whisper/spool.rs:86-88`); the segmenter flushes only on a later gap, a full window, digital silence or `finish()` (`whisper/segment.rs:28-58`). Plausibly the same when loopback stops delivering packets. Also, with microphone noise the segmenter never empties, so caption times are pure sample counts and drift accumulates over a meeting. | `Spool::next_timeout` (`Condvar::wait_timeout`) returning Idle; after ~1 s idle with a non-empty segmenter, `finish()`. Re-anchor `start_ms` from chunk timestamps at each `take()`. | S–M |
| D10 | Medium | **Quit during "Finishing the transcript" waits for the whole backlog** (traced). The renderer gives up after 8 s (`src/lib/quit.ts:84`), but `confirm_close` (`lifecycle.rs:158`) calls `manager.stop()`, which drains under the lifecycle lock; captions keep arriving after the save prompt committed the document. | `discard_local_pending()` in `confirm_close` before `stop`; show pending Whisper audio in the quit prompt. | S |
| D11 | Medium | **One invalid-UTF-8 segment ends the source** (verified). `segment.to_str()?` (`whisper/mod.rs:287`) fails `transcribe`, the drop guard cancels capture and the source goes to Error. | `to_str_lossy()`, strip U+FFFD. | S |
| D12 | Medium | **Window-boundary de-duplication matches characters, not words** (verified). `trim_overlap` (`whisper/segment.rs:90-106`) turns "…went there" + "here we go" into "we go", and is case- and punctuation-sensitive, so a re-capitalised "We…" is never de-duplicated. | Compare normalised words with boundaries; characters only for scripts without spaces. | S |
| D13 | Low | **The extra no-speech filter can drop confident speech** (plausible). `no_speech_probability()` is one value per window; `whisper/mod.rs:277` drops every segment above 0.8. whisper.cpp already suppresses `no_speech_prob > 0.6 && avg_logprob < −1`. | Remove the filter, or also require a low mean token probability. | S |
| D14 | Low | **Loopback reads one packet per wake into a ~10–20 ms buffer** (code verified, loss plausible). `read_from_device_to_deque` does one `GetBuffer` (`audio/loopback.rs:139-142, 181-195`); under load the backlog overflows. SILENT and DATA_DISCONTINUITY flags are discarded. | Loop while `get_next_packet_size() > 0`, request ≥ 100 ms, zero-fill SILENT packets, log discontinuities; optionally MMCSS "Pro Audio". | S |
| D15 | Low | **24-bit microphones are rejected** (verified). The ten sample-format arms (`audio/capture.rs:138-233`) have no `I24`, which cpal 0.18 reports for 24-bit WASAPI devices. | The R3 generic `build::<T: SizedSample>` with the F32 fast path adds it for free. | S |

### Operator and overlay

| ID | Priority | Finding | Suggested change | Effort |
| --- | --- | --- | --- | --- |
| D16 | Medium | **Test audio does nothing while the device-failure banner is up** (verified). `startAudioTest` returns when `locked()` is true (`preflightController.svelte.ts:93`), and the page's `locked()` includes `device.failed !== null` (`+page.svelte:69`), but the button's disabled state uses only `controlsLocked` (`PreflightChecklist.svelte:127`). After a capture failure, choosing another mic and clicking Test audio is silent. | A separate test gate (`controlsLocked` only), or `device.clear()` when the failed source's device changes. | S |
| D17 | Medium | **Rehearsal doubles the cost estimate** (verified). `LiveRail.svelte:43` counts streams from `$options.source` and `:128` shows "two sources", but a rehearsal is one System stream (`types.ts:230-236`). | `rehearsing ? 1 : …` in both places. | S |
| D18 | Medium | **History ignores the second caption language** (verified). The filter (`historySearch.ts:34`) checks only `targetLanguage`; the list row (`TranscriptHistory.svelte:230`) prints only `→ FR`. | Match either language; print `FR + DE`. | S |
| D19 | Medium | **Export format resets on Start/Stop, and quit Save always writes Markdown** (verified; the September D8). `TranscriptMonitor` is mounted twice (`+page.svelte:377, 398`), resetting `exportFormat`, the clear confirmation and follow-scroll; `quit.ts:104` hard-codes Markdown. | A persisted export-format store read by the monitor and `resolveClose`. | S |
| D20 | Low | **Three storage reads bypass `persisted.ts`** (code verified, trigger plausible). `history.ts:13-18` and `i18n/index.ts:43-45, 63` read localStorage at module load; `MeetingProfiles.svelte:29, 42` too. WebView2 throws when site data is blocked, which here would blank the window at import. | `persistedFlag` / `readStored` / `writeStored`. | S |
| D21 | Low | **Accessibility.** Pause has `aria-pressed={paused}` while its label flips to "Resume" (`SessionControls.svelte:62`), so Narrator says "Resume, toggle button, pressed"; Move does the same (`LiveRail.svelte:150-153`) (verified). `LiveActivity.svelte:10` is a `role="status"` region whose labels flip on every 3 s gap, so Narrator may re-read it constantly (plausible). | Drop `aria-pressed` or keep the label fixed; announce only error and stale transitions. | S |
| D22 | Low | **Width stepper reads "Caption width −/+"** (verified). `overlayControls.narrower`/`wider` exist in all three catalogs but `ReadingPreferences.svelte:33-41` passes no labels, and hard-codes 20/60 and 2/30 instead of `OVERLAY_WIDTH_MIN/MAX` and the `reading.ts` bounds. Seven other keys are dead in all catalogs: `settings.close`, `history.browse`, `history.close`, `transcript.saveText`, `transcript.saveMarkdown`, `cost.elapsed`, `cost.streamed`. French and German have no untranslated strings. | Wire the two labels and constants; delete the seven keys. | S |

## 2. Efficiency

| ID | Finding | Change | Effort |
| --- | --- | --- | --- |
| E1 | **Whisper's matrix maths runs without SIMD on x64 and below baseline on ARM64** (scalar path verified; speed-up plausible, likely several ×). `.cargo/config.toml` turns off AVX, AVX2, FMA, F16C and SSE4.2, and the q5_1 dot product (`ggml_vec_dot_q5_1_q8_1`) has only AVX2/AVX paths, so all three shipped models fall back to scalar code. ARM64 is built for `armv8-a`, disabling the dot-product and FP16 instructions every Windows-on-ARM SoC has. The config's own comment calls this the conservative first-release setting. This is the biggest single performance lever in the app: it decides whether Small keeps up in real time. | Build x64 with AVX/AVX2/FMA/F16C/SSE4.2 and ARM64 with `armv8.2-a+dotprod+fp16`. Gate Whisper at runtime (`is_x86_feature_detected!` / `is_aarch64_feature_detected!`) in `whisper::load` and the readiness check, so a CPU without them gets a different first-launch default — the keyless-path lesson applies. Run the packaged x64 app under Intel SDE `-wsm` to prove no AVX runs at start-up. Runtime dispatch (`GGML_BACKEND_DL`) needs a whisper-rs-sys fork. | M |
| E2 | **Automatic language detection doubles encoder work on every window** (verified). With `language = None` whisper.cpp runs detection (an encoder pass) then encodes again (`whisper/mod.rs:245`); re-detecting every 10 s also lets the language flip on short windows. Automatic is the first-launch default. | Read `full_lang_id_from_state()` after `full()`; once two ≥ 3 s speech windows agree, pass it explicitly; re-check every ~2 min or on an empty result. | S |
| E3 | **Silence detection is a −80 dBFS gate** (verified). `\|x\| > 1e-4` (`whisper/segment.rs:45`) means only digital zeros are silence: on a real microphone every window is speech, cut at exactly 10 s mid-word, and room noise is transcribed ("Thank you." hallucinations). | Silero VAD: whisper-rs 0.16 exposes `WhisperVadContext`, but `enable_vad` is ignored by `full_with_state`, so call `segments_from_samples` directly (one context per source, ≥ 1–2 s input). Bundle `ggml-silero-v6.2.0.bin` (MIT, ~0.9 MB). Cut at 300–500 ms pauses, force a cut at 15–20 s. | M–L |
| E4 | **Thread oversubscription with two sources; underuse on big ARM chips** (plausible). Each source uses `min(cores, 4)` threads (`whisper/mod.rs:236-238`): two concurrent `full()` calls spin 8 ggml workers against capture and WebView2, while a 12-core Snapdragon X uses 4. | An inference `Mutex` on `LoadedModel` around `full()`, threads = `min(physical cores, 8)`; or divide by active sources. | S |
| E5 | **Each 10 s window pays for a 30 s encoder pass** (verified). `n_ctx` is fixed at 1500 unless `audio_ctx` is set. | When the backlog exceeds 30 s, use ~28 s windows (latency no longer matters); optionally benchmark `set_audio_ctx`. | S |
| E6 | **The History tab re-reads and re-decodes every session every ≤ 5 s while recording** (plausible magnitude). Each history write bumps the revision; `read_sessions` (`history.rs:83-109`) sends every file in full and `TranscriptHistory.svelte:63-99` decodes them all, discarding the search cache. Also, one unreadable file (`?` at `history.rs:91, 98, 104`) hides all history, and `rename_session` reads the whole log to check its header. | `list_history(known: [(id, len)])` returning only changed files (logs are append-only, so length is a sound key); skip bad files with a warning; read only the first line in rename; cache decoded sessions by id. | S–M |
| E7 | **Live turns are unbounded outside the overlay caption text** (plausible). `LiveTurns.svelte:58-62` re-renders the full turn at display size on every interim; in Fit, the overlay's original speech is unbounded (`overlayCaptions.svelte.ts:172, 181`) while the caption is cut at 12,000 characters. | Move `tail()` (`overlayCaptions.svelte.ts:29`) to `captionLayout.ts` and use it in all three places. | S |
| E8 | **Two copies of reqwest are compiled** (verified in `Cargo.lock`). Tauri 2.12 pulls reqwest 0.13.4; the app adds 0.12.28. | `reqwest = { version = "0.13", default-features = false, features = ["native-tls", "system-proxy"] }` (with D8). Do *not* bump `sha2` to 0.11: wry and tauri-codegen use 0.10. | S |

Checked and fine: the meter path (one store per source, transform-only bars, 500 ms activity
throttle); listener and timer teardown; copies between capture, spool and inference; the
resampler's ~1.6 M multiply-adds per second; per-chunk base64/JSON allocations. The Whisper
model list's 500 ms interval wakes while idle but calls nothing unless a download is running.

## 3. Refactoring

### Rust core

- **R1 — Split the realtime runner.** `run_session` (`realtime.rs:193`, 163 lines) and
  `connect_and_run` (`:396`, 165 lines, was 122) carry the reconnect state machine inline.
  Move it into a pure `Reconnect::after(&RunEnd, uptime) -> Next { status, wait, drain_stale,
  catch_up }` (`realtime/policy.rs`) and the socket side into `open()` + `pump()` +
  `graceful_close` (`realtime/socket.rs`). `run_session` drops to about 50 lines and pause,
  handover and backoff become unit-testable (T1). M.
- **R2 — Split `session.rs` (1,190 lines)** into `session/{mod, settings, options, builder,
  capture, preflight}.rs` along the existing seams (`ProviderSettings` `:104-176, 430-495`;
  validation and origins `:96-102, 236-283, 308-329`; `SessionBuilder`/`ClientIo`/`relay_audio`
  `:285-306, 404-428, 497-672`; `CaptureTarget` and joins `:178-234, 331-402`; preflight
  `:66-71, 748-866`). On the way: merge the two identical completion blocks in `spawn_producer`
  (`:636-645`, `:655-664`), fix D7, and compute `session_origins` once (`:729, 739`). M.
- **R3–R5 from September are all still open.**

  | Item | Where |
  | --- | --- |
  | `bearer_request` | `openai/client.rs:71-81`, `mistral/client.rs:56-65` |
  | `gemini_request` | `gemini/client.rs:39-58`, `gemini/transcribe.rs:38-58` |
  | `parse_or_log<T>` (4 copies) | `gemini/client.rs:76`, `transcribe.rs:81`, `openai/client.rs:97`, `mistral/client.rs:85` |
  | `ServerMessage::control` | `gemini/client.rs:84-96`, `transcribe.rs:89-103` |
  | `atomic_write` / `replace_snapshot` | `export.rs:13`, `recovery.rs:37` |
  | Ten sample-format arms (D15) | `audio/capture.rs:138-233` |
  | String errors instead of `AppError` | `recovery.rs:80-183`, `history.rs`, `lifecycle.rs:134`, `tray.rs:237` |
  | `{path:?}` shown to operators | `recovery.rs:110, 113, 147, 151, 177, 179` |
  | `MessageOutcome` booleans | `realtime.rs:115-121` |
  | `MistralConfig.received_delta` is runtime state | `mistral/client.rs:37`, set at `session.rs:476` |
  | `TurnAccumulator.translated` holds transcriptions; `lane` set after construction | `realtime.rs:57, 211` |
  | `emit_status` duplicated (now 6 sites) | `realtime.rs:690`, `session.rs:210, 886, 966`, `ondevice/mod.rs:227`, `whisper/mod.rs:84` |
  | COM `Apartment` guard duplicated | `audio/devices.rs:66-73`, `audio/loopback.rs:80-86` |
  | Stale docs | `lib.rs:1-5` (Gemini-only "Live Captions"); `commands.rs:5` says every command is async (3 are sync); two doc lines on `TRANSCRIPT_WRITE` in `errors.rs` |
  | Long functions | `capture.rs:104` (156 lines), `loopback.rs:67` (135), the two runner functions (R1) |

### Frontend

- **R6 — One start gate (with R14).** The Start logic is written three ways
  (`+page.svelte:273-275, 289-294, 295-299`), and Rehearse lacks the profile-busy check, so it
  stays enabled while a profile loads. One derived `startBlockers` for Start, Rehearse and the
  shortcut. Replace the `hasKey` writable (`stores.ts:213`, written from `+page.svelte:86-96`
  and `PreflightChecklist.svelte:95`) with an `engineReady` value derived in the preflight
  controller. The remaining R14 effects: `LanguagePicker.svelte:43-46`, `DateField.svelte:8-11`
  (`$derived(value)` is writable in Svelte 5.57), `WhisperActivity.svelte:16-22`,
  `TranscriptMonitor.svelte:92-95`. M.
- **R7 — The unsupported-language check is written twice** (`+page.svelte:245-253`,
  `sessionController.ts:33-46`): extract `unsupportedCaptionLanguage(options)` into
  `languages.ts`. S.
- **R8 — The overlay re-validates its config by hand** (`overlay/+page.svelte:148-171`, ten
  fields). Add `fromOverlayConfig` to `appearance.ts` as the inverse of `toOverlayConfig`, with
  a round-trip test, and keep one appearance state in the overlay. M.
- **R9 — `stores.ts` and `types.ts` cohesion.** `stores.ts` mixes status aggregation (58-212),
  the caption-to-transcript pipeline (230-369), ~15 persisted preferences (371-450) and the
  appearance aggregate: split into session, transcript-log and preferences modules behind a
  re-exporting `stores.ts`. In `types.ts`, move the provider predicates (86-110) to
  `providers.ts`, overlay keys and clamps (417-475) to `appearance.ts`, and `StartOptions`
  defaults (499-584) to `startOptions.ts`. M, no behaviour change.
- **September leftovers.** R8 (history decoding): only the legacy v1 path still parses twice
  and depends on `RECOVERY_VERSION` (`history.ts:156-160`) — check `version === 1` and map
  through `readLine`. R10 (controller classes): low value; convert preflight and quit only.
  R13: `SystemCapturePicker.svelte:35, 56, 88` should use `Field`, the recovery checkbox
  (`TranscriptMonitor.svelte:233-246`) `Preference`; close the `Icon` item (27 inline SVGs,
  only 3 paths repeat).

## 4. Testing

Untested or thin, ranked by logic density × visibility: `+page.svelte` (2 tests, indirectly),
`audio/loopback.rs` (0), `nativeSync.svelte.ts` (0; a no-op in browser previews, so only a
desktop run exercises it), `lib.rs` (0), `OverlayMoveChrome.svelte` (style tests only),
`SetupSheet.svelte` (0), `secrets.rs` (0; key migration), `tray.rs` (0), `commands.rs`
(names only), `SettingsDialog.svelte` (0), `overlay.rs` (0), `placement.rs` (1),
`LiveRail`/`LiveTurns` (0), `whisper/mod.rs` (3 tests for 424 lines), `export.rs` (1). The
September computed-style harness was never committed.

| ID | Recommendation | Catches | Effort |
| --- | --- | --- | --- |
| T1 | **Runner state-machine tests.** An `Events` trait (caption, status) implemented for `AppHandle`, a loopback `tokio_tungstenite::accept_async` server, a `FakeProto` and `tokio::time::pause()`. Cases: pause mid-stream flushes then reports Paused and resumes via Connecting; `goAway` after 30 s reconnects without sleep and sends queued chunks in order; `goAway` at 2 s backs off; a mid-stream close reconnects (D1); setup timeout is Fatal; cancel during setup sends Close. | Pause, handover and backoff — today all "live check pending" | M (with R1) |
| T2 | **Whisper pure-logic tests.** Extract segment reconciliation (`whisper/mod.rs:276-301`) and test overlap skipping, tail clamping, monotonic times and D12's cases; the segmenter (250 vs 251 ms gaps, backwards timestamps); the spool with an injectable size limit and failing writer; downloads against a local `TcpListener` (oversize, hash mismatch leaves no file, stall, cancel). | D8–D12 regressions | M |
| T3 | **Page-level tests with `@tauri-apps/api/mocks`.** `mockIPC(cb, { shouldMockEvents: true })` and `mockWindows` ship in the installed 2.12.1 and make `isTauri()` true, so the real `tauri.ts` runs in jsdom. Script a demo session through `+page.svelte`, `nativeSync`, `SetupSheet`, `SettingsDialog`, `LiveRail` and `OverlayMoveChrome`; add the D16–D19 regressions. | Orchestration regressions, in seconds on Linux | S–M |
| T4 | **Native end-to-end on `windows-latest`.** Launch the debug exe with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and drive it with Playwright `connectOverCDP` (documented for WebView2; `@playwright/test` 1.63.0), or `@wdio/tauri-service` 1.4.0 on WebdriverIO 9.32 (not 10, released 5 October; the service still depends on 9). First spec: choose the demo (the default engine is Whisper, so it is not keyless), Start, expect the scripted line in the overlay within 15 s, Pause/Resume/Stop, close → unsaved prompt. Second: download Whisper Tiny through the UI and run the EN rehearsal fixture (cache the model). Could also cover move mode, profile placement, history and kill-and-relaunch recovery. | About 40% of the desktop-run backlog (plausible); tray, Narrator, real contrast themes, mixed DPI, meeting apps and Store identity stay manual | M |
| T5 | **Computed-style and overflow regression** in Playwright against `vite preview`: the September harness (8 states × EN/FR/DE × 100/150/225%) as committed JSON snapshots of ~30 properties per element plus a `scrollWidth > clientWidth` scan; a few `toHaveScreenshot` captures on `windows-latest` with `channel: 'msedge'`. | Token, layout and translation-length regressions | M |
| T6 | **Static analysis.** Cheapest: `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json`. Then a minimal typed ESLint for what svelte-check cannot see: `no-floating-promises`/`no-misused-promises` (38 hand-written `void`s today), `svelte/require-each-key` (6 of 26 `{#each}` are unkeyed), `prefer-writable-derived`, `infinite-reactive-loop`. Versions checked: eslint 10.12.0, typescript-eslint 8.71.1 (peer TypeScript < 6.1 — group it with TypeScript in Dependabot), eslint-plugin-svelte 3.23.0. `knip` 6.39.0 for unused files, exports and deps. A curated `[lints.clippy]` table: the cast lints (82 `as` casts), `needless_pass_by_value`, `match_same_arms`, `unnecessary_wraps`. | Unhandled IPC rejections, dead code, lossy casts | S–M |
| T7 | **Coverage, report-only.** `@vitest/coverage-v8` 5.0.3 with `include: ['src/**/*.{ts,svelte}']` to the step summary, thresholds only on pure modules; `cargo-llvm-cov` 0.9.1 in place of `cargo test` on the Ubuntu lane. | Makes the map above visible | S |
| T8 | **Optional nightly audio job.** `LABSN/sound-ci-helpers` installs VB-Cable on x64 Windows runners (donationware; professional use expects a licence) or the MIT `VirtualDrivers/Virtual-Audio-Driver`; play a fixture into the virtual device and capture through loopback and the mic. Flaky; keep fixtures as the per-PR boundary. | WASAPI paths, D14 | M |

### CI

- **`npm audit` fails unrelated PRs** (verified): 14 of the 26 failed runs since 1 August
  failed only there, eight of them in one minute on 3 October over the dev-only `source-map-js`
  advisory. Gate on `npm audit --omit=dev --audit-level=moderate` (only `@tauri-apps/api` and
  the fonts ship) and run the full audit weekly. S.
- `fail-fast: false` on the Node matrix; cache the Whisper smoke-test model (38–104 s per run).
  The Rust cache works (warm clippy 22–31 s). nextest and sccache are not worth it. S.

## 5. Dependencies and provider drift

- **npm majors are out:** `@sveltejs/kit` 3.0.1, `@sveltejs/adapter-static` 4.0.0 and
  `typescript` 7.0.2 (from `npm outdated`). Each needs its own branch; check svelte-check and
  typescript-eslint compatibility before TypeScript 7.
- **Rust:** `wasapi` 0.25.0 (1 October) is available — 0.24 itself has not yet been tested on
  hardware, so take both in one hardware pass. `tauri-plugin-single-instance` 2.5.2 and
  `tokio` 1.53.2 are patch updates. whisper-rs 0.16.0 is still the latest (the project moved to
  Codeberg; upstream whisper.cpp is at 1.9.4 with Parakeet support). The `=0.16.0` pin does not
  pin whisper.cpp: add `whisper-rs-sys = "=0.15.0"` with a comment.
- **Providers: nothing the app uses is deprecated** (checked against the Google, OpenAI and
  Mistral deprecation pages on 6 October). Watch items:
  - OpenAI's migration guide maps `gpt-realtime-whisper` (the translation session's source
    transcriber, `openai/client.rs:24-26`) to `gpt-live-transcribe`, though the translation
    reference still documents only the former. It is the most likely next forced change: probe
    with `OPENAI_TRANSCRIBE_MODEL=gpt-live-transcribe` before switching the default.
  - OpenAI's July notice retires the `gpt-realtime` family on 20 January 2027; it reads as
    excluding `gpt-realtime-translate` (plausible). Re-check monthly.
  - OpenAI sends `noise_reduction: near_field` for every source (`openai/protocol.rs:64`):
    choose per source (`far_field` for a room mic, none for loopback).
  - Gemini Transcribe Live accepts `language_codes` hints (`gemini/protocol.rs`).
  - Gemini's API reference lists `diarization` in `AudioTranscriptionConfig` while the guide
    says it is unsupported live; a `live_probe` would settle it.
- **Pricing:** the rates in `providers.ts` match current Google and OpenAI pricing but have no
  in-repo source or date since the README table went in `f61279d`. Mistral's realtime price
  ($0.006/min at launch) is no longer on its pricing page.
- **Doc drift:** `ROADMAP.md` still lists the glossary, diagnostic export and latency readout
  declined on 24 September. Issue #12's body describes a picker and F2 flip that no longer
  exist; #32's last comment says whisper.cpp is not the shipping fallback, which 1.6.0
  reversed. Open issue #108 asks for Azure MAI-Transcribe-2-Streaming (preview, Azure resource
  plus key, 1-hour sessions).

## 6. Feature candidates

Ranked by value for effort. The glossary, diagnostic export, latency readout and meeting
integrations stay declined.

| # | Feature | Notes | Effort |
| --- | --- | --- | --- |
| F1 | **Offline translation to English with Whisper's translate task** | The first keyless *translation* path. `set_translate(false)` is hard-coded (`whisper/mod.rs:248`). `Provider::can_translate` becomes "English target only" for Whisper; touches `types.rs`, `languages.json`, SetupSheet, i18n and `local-whisper.md`. Weak on Tiny/Base, so recommend Small (and E1 first). Does nothing for a francophone audience. | S–M |
| F2 | **Remember overlay position and size**, per profile or per monitor | On the roadmap; nothing persists geometry today. Store it in `profiles.ts` or use `tauri-plugin-window-state` 2.5.0; clamp to visible work areas for unplugged and mixed-DPI monitors. | S–M |
| F3 | **Automatic FR ⇄ EN for Gemini (#12)** | Two lanes with `echoTargetLanguage: false`, merged into one track: the EN lane is silent on English speech and vice versa, so the room always reads the other language with no detection or reconnects. Output is billed only while a lane speaks, so it costs roughly one extra input leg (~$0.32/h), not double (plausible). Needs a `live_probe` first. | M |
| F4 | **Captions on attendees' phones over the LAN, and an OBS mode** | A small read-only HTTP/SSE server fed by caption events, a static page and a QR code; each attendee picks a lane and size. The same server serves `localhost` for OBS; a solid-background window mode alone is S. Bind to private interfaces with a random URL token; campus Wi-Fi often blocks client-to-client traffic; update `privacy.md`. | M–L |
| F5 | **Source labels and per-origin overlay styling** | On the roadmap: a subtle Room/Remote prefix when both sources are live. True speaker labels need live diarization, which no engine in use offers today. | S |
| F6 | **Small provider adoptions** | Gemini Transcribe language hints from the spoken-language selector; OpenAI noise reduction per source; an opt-in `gpt-live-transcribe` subtitle engine for OpenAI-key holders (~$1.02/h). | S each |
| F7 | **Opt-in "polish transcript" after the session** | Keep the session audio (opt-in), re-run with a larger local model or a cheap batch cloud model with speaker labels. Reverses a privacy promise: consent wording, disk space and deletion controls. | M–L |
| F8 | **Research** | Local text translation with Mozilla's Bergamot/Marian models (MPL-2.0, ~37 MB per direction; WASM in WebView2 avoids native ARM64 builds). Parakeet through whisper.cpp ≥ 1.9 once whisper-rs releases. Avoid NLLB (non-commercial licence). | L |

## 7. Suggested batches

1. **Cloud session robustness:** D1–D6, with R1 and T1 so the fixes ship with tests. Needs
   live checks against each provider, including a session longer than 60 minutes on OpenAI.
2. **Whisper:** E1 (with the runtime CPU gate and an SDE run), D8–D13, E2, E4, E5 and T2. E3
   (VAD) as its own follow-up once E1 shows the new real-time headroom.
3. **Operator fixes:** D16–D22, R6, R7, E6, E7, with T3 for the regressions.
4. **Tooling:** the `npm audit` gate, `tsconfig` unused checks, then ESLint/knip, coverage and
   T4/T5.
5. **Structure:** R2, R3–R5 (including D15), R8, R9 — no behaviour change.
6. **Features** in whatever order the maintainer picks; F1 and F2 are the cheapest wins.
