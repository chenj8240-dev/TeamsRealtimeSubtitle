Clearer audio for speech engines, safer release builds and lighter long sessions.

- Microphone and system audio at 44.1 or 48 kHz now pass through a sharper filter before they are downsampled for the engine. At 48 → 16 kHz, speech stays at full level up to 6 kHz; the previous filter was already 4.3 dB down at 4 kHz. Content at 10–12 kHz that would fold back into speech is now 80–87 dB down instead of 16–20 dB.
- Release builds no longer read a `.env` file or honour `*_WS_HOST` host overrides; those developer settings now apply to debug builds only. A malformed setting for one engine no longer stops another engine from starting.
- A failure in one capture or engine thread now ends that source instead of closing the app, so the transcript on screen survives. This makes the executable larger (5.2 MB → 9.2 MB).
- With a quit prompt open over Settings, Escape and Tab now act only on the prompt, and **Discard and close** can be reached from the keyboard.
- Transcript history saves a long session at most every 5 seconds instead of after every caption, and an open History tab refreshes at the same pace. A session that ends by itself, for example after an engine error, is now closed in history with its real end time.
- Stable reading keeps a bounded overlay history, trimmed at the start of a line so nothing already on screen re-wraps. Changing **Hide filler words** during a Stable reading session now applies to new captions only.
- The microphone selector has a visible **Microphone device** label. It and the caption typeface selector now have full-height targets and the standard focus ring. Meeting profiles no longer grow wider than the other setup panels at larger Windows text sizes.
- Under the surface: the tray menu is rewritten only when its text changes, history search is faster, caption text is no longer copied on every update, and the package ships only `.woff2` fonts.

Validation: 368 frontend tests and 80 Rust tests passed, plus type checks, production build, formatting, catalog parity, `npm audit` and Clippy on Rust 1.98. New tests cover the filter's passband, alias rejection and block-size invariance, the dialog stack, history write throttling, Stable trimming and sessions ended by the engine. These changes come from the [22 September app review](https://github.com/fmadore/Live-translation/blob/main/docs/app-review-2026-09-22.md), batches 1 and 2 ([#86](https://github.com/fmadore/Live-translation/pull/86)).

A live 48 kHz session through the new filter was checked before tagging. Its effect on recognition accuracy has not been measured systematically; the bundled rehearsal recordings are 16 kHz and bypass the filter.

**Known verification gaps:** the tray and the release-only `.env` handling are covered by compilation and unit tests only. The packaged-app and native Narrator checks carried over from 1.5.0 remain pending, and issue #78 stays open for live language acceptance.

For the next Microsoft Store submission, use **Live.Translation_1.5.1.msixbundle** (x64 + ARM64). It supersedes the unsubmitted 1.5.0. Store submission and certification are separate from this GitHub release. See [the Store handoff](https://github.com/fmadore/Live-translation/blob/main/docs/store-updates.md#release-151-handoff).
