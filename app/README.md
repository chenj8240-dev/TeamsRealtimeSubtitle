# Live Translation & Subtitles

Live captions over your meetings, video calls and slides. Transcribe speech locally with
**Whisper**, or translate it — into English locally with Whisper, or into many languages with
**Google Gemini** or **OpenAI** — in a transparent Windows overlay.

[Microsoft Store](https://apps.microsoft.com/detail/9PFB8LR3RR9X) ·
[GitHub releases](https://github.com/fmadore/Live-translation/releases) ·
[Privacy](docs/privacy.md) · [Documentation](docs/README.md)

**Windows 11 · Native x64 and ARM64 · English, French and German interface · MIT license**

**[1.6.1](https://github.com/fmadore/Live-translation/releases/tag/v1.6.1)** (6 October 2026),
with local Whisper, is the version in the [Microsoft Store](https://apps.microsoft.com/detail/9PFB8LR3RR9X);
**[1.7.1](https://github.com/fmadore/Live-translation/releases/tag/v1.7.1)** (20 October 2026)
is the latest on GitHub. It brings everything in
[1.7.0](https://github.com/fmadore/Live-translation/releases/tag/v1.7.0), published the same day
on GitHub only: offline translation into English with Whisper, an overlay that reopens where
you placed it and comes back when a projector is unplugged, and cloud sessions that reconnect
instead of ending. 1.7.1 adds a fix for the taskbar icon, which no longer sits on a coloured
square. It is awaiting Store submission and will replace 1.6.1 there. See its
[release notes](docs/release-1.7.1.md) and [Store handoff](docs/store-updates.md#release-171-handoff).

## What it does

- **Offline subtitles.** Whisper runs on your CPU with 99 spoken-language choices or automatic
  detection. Download Tiny (31 MiB), Base (57 MiB) or Small (182 MiB) once; then caption without
  an account, API key or internet connection. Speed and accuracy depend on the computer,
  model and language; on x64, Whisper needs a processor with AVX2.
- **Offline translation into English.** Whisper also translates any of those languages into
  English, with the same models and no key. English is its only target; choose Small, since
  Tiny and Base translate poorly.
- **Cloud translation and subtitles.** Gemini offers 78 translation targets and OpenAI 13 in
  the app's catalog. Gemini and Mistral also offer same-language subtitles. Cloud engines
  need your own compatible account, API key and internet connection; provider usage charges apply.
- **Your choice of audio.** Capture a microphone, Windows system audio, one application's
  process tree, or microphone and system audio together. Test levels before starting.
- **Captions where people look.** Place a transparent, always-on-top, click-through overlay
  over slides or calls; it reopens where you last placed it on each display setup. Adjust
  fonts, colour, contrast, size and reading pace; choose Fit window, Compact or Stable reading.
  Right-to-left captions are supported.
- **Bilingual audiences.** Show two translation languages at once, or include the original
  speech beneath translations in Fit window or Compact when the provider supplies it. A second
  translation language opens another cloud session per source and increases provider usage.
- **Meeting controls.** Pause and resume without splitting the transcript, reuse named meeting
  profiles, and search or pin caption languages. Customize the overlay's filler-word filter
  while keeping the raw transcript intact.
- **A transcript you can keep.** Export text, Markdown, SRT or WebVTT. Optional local history
  adds session titles, search and reopening; optional recovery protects unsaved captions.
  Both are off by default.

## Start captioning

1. Install from the [Microsoft Store](https://apps.microsoft.com/detail/9PFB8LR3RR9X), or use
   an installer from [GitHub releases](https://github.com/fmadore/Live-translation/releases).
   Check the release version: Whisper requires 1.6.0, and its translation into English 1.7.0.
   GitHub installers are unsigned; Store packages are signed and update through the Store.
2. For local captions, choose **Subtitles → Whisper**, select your audio source and spoken
   language, then **Download model**. Base balances speed and quality; try Tiny on slower PCs.
   For translation, choose **Live translation**, Gemini or OpenAI, your key and target language,
   or **Local Whisper** to translate into English without a key.
3. Test the source, start the session, and use **Move overlay** to position captions. Lock
   the overlay to make it click-through again.
4. **Pause** during breaks. Cloud connections close after their final turn; Whisper stops
   accepting new audio while processing any pending speech. **Hide overlay** only hides captions.
5. **Stop**, let Whisper finish any pending audio, then **Save as…**. Enable history in
   **Settings → Transcript history** if you want sessions saved automatically on this PC.

A fresh installation opens on **Whisper** with Base and automatic language detection;
existing saved setups are preserved. A scripted English/French demo shows the overlay without
any setup.

## Privacy and local processing

Whisper audio stays on the PC. Pending audio uses an automatically deleted temporary file;
it is not a saved recording. Models download from Hugging Face only when requested and are
verified before use. Cloud audio goes directly to the chosen provider. API keys stay in
Windows Credential Manager. The developer receives no audio, keys, transcripts or telemetry.
See the [privacy policy](docs/privacy.md) for temporary storage, history and recovery details.

## Build and contribute

Use Windows with Node 22.13+ or 24, Rust stable (1.90+), Visual Studio C++ Build Tools and the
Windows SDK. Whisper also needs LLVM/Clang with libclang, CMake and Ninja. Follow the
[native compiler setup](docs/local-whisper.md#building) before building the desktop app.

```powershell
npm ci
npm run tauri dev
```

`npm run dev` previews the interface in a browser; it cannot capture audio or run native engines.
Before committing, run:

```powershell
npm run format:check
npm run check
npm run lint
npm run knip
npm run check:languages
npm test
npm run build
npm run test:style
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Build installers with `npm run tauri build`; build Store packages with
`npm run bundle:msix:arm64` or `npm run bundle:msix:x64` in the matching compiler environment.
See [MSIX packaging](docs/packaging-msix.md), [architecture](docs/architecture.md),
[security](SECURITY.md) and the [roadmap](ROADMAP.md). `npm run test:style` checks the
operator window's styles and overflow in Edge; `npm run test:e2e` builds a separate debug copy
of the app and drives it end to end, and needs the Rust toolchain. Both test the last
`npm run build`. CI checks the frontend, Rust on Linux and Windows x64/ARM64, both Playwright
suites, dependencies and workflows, and reports test coverage (`npm run test:coverage`
locally). Tagged releases build installers and a
combined Store bundle; Partner Center submission is manual.

Originally developed for the workshop *Digital Humanities and Artificial Intelligence in
African Studies*, STIAS, Stellenbosch, 21–24 September 2026. Thanks to
[@valentinrabot](https://github.com/valentinrabot) for proposing local transcription in
[issue #98](https://github.com/fmadore/Live-translation/issues/98) and for his meeting feedback.
[Citation metadata](CITATION.cff) · [MIT license](LICENSE).
