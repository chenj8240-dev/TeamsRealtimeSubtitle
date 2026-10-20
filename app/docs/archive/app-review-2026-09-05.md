# App review — 5 September 2026

**Closed and archived on 8 September 2026.** All findings R1–R8 were implemented.
This report preserves the review history and its verification results; it is not
the current Store submission checklist. See [Store updates](../store-updates.md)
for submission guidance and [audio device testing](../audio-device-testing.md)
for subsequent fixes, manual test results, and outstanding hardware coverage.

Scope: source review of audio capture, provider lifecycle, recovery, transcript handling,
and operator orchestration. No live provider or hardware failure was exercised during
the review. Baseline: 236 frontend tests and 50 Rust tests passed, one billable test
ignored, and Svelte check reported no errors or warnings.

## Findings and implementation plan

| ID | Priority | Finding | Proposed change | Status |
| --- | --- | --- | --- | --- |
| R1 | High | Fatal provider exits leave their capture token uncancelled and bypass transcript finalization. The interface can show an inactive source while capture continues. | Give every terminal exit one cleanup path; cancel the source, finalize its turn, and settle its status. Test failure isolation between sources. | Implemented; verification below |
| R2 | High | A closed audio receiver returns before sample-buffer compaction. Preflight intentionally closes this receiver, so the buffer grows continuously. | Skip audio processing when the receiver is closed, keep metering, and test sustained callbacks and a receiver closing mid-stream. | Implemented; verification below |
| R3 | High | Recovery overwrites the only snapshot in place. Independent writes and deletion can race, recreating discarded text. | Atomically replace snapshots, serialize recovery operations, invalidate queued obsolete writes, and test interrupted writes and deletion races. | Implemented; verification below |
| R4 | Medium | Microphone runtime failures always emit session errors, including during preflight; the test can remain displayed as active. | Return capture failures to the owning controller. Preflight errors must end the test and use its event channel. | Implemented; verification below |
| R5 | Medium | Backend mode validation rejects Mistral/demo translation but omits Gemini Transcribe. | Validate capabilities symmetrically and test the entire provider/mode matrix. | Implemented; verification below |
| R6 | Refactor | The 3,309-line operator page combines session/preflight, recovery, quit/tray, overlay settings, and presentation. | Extract independently testable controllers along those boundaries, beginning with the lifecycle and recovery work above. | Implemented; controllers and shared caption appearance extracted |
| R7 | Improvement | New transcript lines force scrolling to the bottom; a single-source session becomes one enormous paragraph. | Preserve reading position, provide a localized Jump to latest control, and group paragraphs using pauses and a length threshold without losing text. | Implemented; verification below |
| R8 | Testing | Existing tests cover pure logic and message formats more thoroughly than lifecycle coordination. | Add regressions for terminal provider exits, closed capture receivers, preflight failure, and delayed recovery writes overlapping deletion. | Implemented; verification below |

## Implementation notes

The first implementation pass preserves the shared provider protocols, localization,
and operator/overlay capability boundaries. No dependencies or permissions changed.

- **R1:** `src-tauri/src/realtime.rs` routes fatal exits through source cancellation,
  caption finalization, and terminal status. A cancellation guard also releases capture
  when a client task is aborted. `src/lib/stores.ts` clears failed-source meters and
  settles the timer when no source is active, preserving a healthy sibling source.
- **R2:** `src-tauri/src/audio/capture.rs` skips resampling and clears pending samples
  when its receiver is closed. A receiver closing during a callback also reaches buffer
  cleanup rather than returning early.
- **R3:** `src/lib/recovery.ts` owns scheduling and one ordered queue shared by save,
  clear, disable, startup recovery, and quit. Clear invalidates queued obsolete writes,
  waits for an active write, and resets the saved-revision cache so unsaved text can be
  protected again. `src-tauri/src/recovery.rs` flushes a sibling staging file before
  replacing the snapshot, serializes filesystem access, and removes staging remnants.
  Replacement semantics were checked against the
  [Rust filesystem documentation](https://doc.rust-lang.org/std/fs/fn.rename.html).
- **R4:** Microphone runtime errors return through a bounded channel to the owning
  capture thread, with a distinct error type preserving the existing localized stream
  error message. Preflight reports only test status and cancels both test devices on
  failure. A start gate prevents a fast device failure from racing the active event.
  Completed failed live sessions are drained before allowing a new audio test.
- **R5:** `validate_provider` compares mode and translation capability symmetrically;
  its regression covers both modes for all five providers.
- **R6:** Recovery scheduling/serialization and session start/stop orchestration now
  have separate controllers and tests. Stop waits for an in-progress start; repeated
  stops share the same operation. Startup failures reset the clock. The second pass
  extracts preflight signal/device state, quit/tray prompt orchestration, and overlay
  commands into Svelte rune controllers. `CaptionAppearance.svelte` now serves both
  the rail and settings dialog, with an independent accessible contrast description
  per instance. The page retains layout, localized derived labels, native event wiring,
  and the startup recovery offer. Broader layout decomposition remains optional.
  Failed overlay move commands preserve the confirmed mode; appearance write failures
  now reach the operator status instead of becoming unhandled rejections.
- **R7:** The monitor preserves a reader's scroll position and offers Jump to latest
  in English and French. The scroll region is named and keyboard-focusable; activating
  Jump returns focus to it. Paragraph grouping uses pauses and a length limit without
  truncating text and is shared by the monitor and both export formats.
- **R8:** Regression tests cover source cancellation/finalization order, authentication
  rejection classification, sibling isolation, sustained preflight buffers, runtime
  preflight failure routing, mode validation, failed snapshot replacement, recovery
  write/delete races, start/stop overlap, and transcript scrolling/grouping.

## Verification and remaining work

All eight review findings are implemented. Further layout decomposition is optional
maintenance, not an outstanding review fix. Version **1.2.1** and its release/Store copy
are prepared; manual desktop testing is deferred to the user before release.

Verified on 5 September 2026:

| Check | Result |
| --- | --- |
| `npm test` | 256 tests passed across 23 files (20 new tests over baseline) |
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | Passed; static production output generated |
| `npm run format:check` | Passed |
| `cargo test --manifest-path src-tauri/Cargo.toml --offline --locked --all-features` | 61 passed, 1 billable live-provider test ignored (11 new tests) |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --offline --locked --all-targets --all-features -- -D warnings` | Passed |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Passed |
| `git diff --check` | Passed |

Tests exercise real Windows filesystem replacement, sustained synthetic capture callbacks,
and injected failure/ordering scenarios. They do not establish microphone-driver behavior,
provider behavior over a real connection, or survival under physical power loss.

Remaining manual checks:

- Windows microphone unplug/replug and denied-device tests, including Both preflight.
- Actual provider rejection and graceful drain in a desktop session; billable tests were
  not enabled.
- Installed MSIX behavior, power interruption, Narrator, and projector/overlay operation.
- Full long-transcript visual checks at minimum window size, French, and 225% text scale.
  The operator browser preview rendered with no console errors or warnings. The browser
  connection became unavailable before the populated visual fixture could be inspected;
  the temporary fixture was removed. Component tests verify reading-position retention
  and follow-mode resumption. The skill's mechanical detector was also unavailable
  after its cached plugin version changed during the task.
