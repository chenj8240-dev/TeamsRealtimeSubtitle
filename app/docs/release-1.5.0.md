Choose caption languages with a searchable selector and persistent favourites.

- Translation targets follow the selected engine: 78 Gemini languages and 13 documented OpenAI languages, including German, Japanese and Spanish.
- Search English, localized or native names and language codes, ignoring accents and case. Pin frequently used languages; English and French are pinned initially.
- Unsupported favourites remain visible with an explanation after changing engines. An unsupported selection blocks Start and Rehearse instead of silently changing the target.
- F2 swaps the first two supported favourites while stopped. The built-in demo and rehearsal recordings remain English/French; live subtitle engines still auto-detect speech.
- Expanded targets are preserved in profiles, history and overlay language metadata. Arabic, Hebrew, Persian, Urdu and Sindhi captions use right-to-left direction; stable reading follows the text's start edge.
- Language labels and pin icons are vertically centered, including rows with multiline explanations. Interface language remains independently English, French or German.

Validation: 356 frontend tests and 74 Rust tests passed, plus type checks, production build, formatting, catalog parity and Clippy. Browser checks covered the minimum window size in all three interface languages and Japanese/Arabic font fallback.

**Known verification gaps:** OpenAI endpoint-code probes (especially Portuguese/Chinese variants), non-English/French real-speech acceptance on both providers, native Narrator and final packaged-app checks remain pending. Provider language tables were checked against official documentation on 22 September 2026. Issue #78 remains open for live acceptance.

For the next Microsoft Store submission, use **Live.Translation_1.5.0.msixbundle** (x64 + ARM64). Store submission and certification are separate from this GitHub release. See [the Store handoff](https://github.com/fmadore/Live-translation/blob/main/docs/store-updates.md#release-150-handoff).
