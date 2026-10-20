# Live Translation & Subtitles 1.6.0

Whisper brings local multilingual subtitles to Windows, alongside cloud translation and
new controls for bilingual meetings.

- **Offline speech recognition with Whisper.** Download a multilingual Tiny, Base or Small
  model, then transcribe microphone, system or application audio on your CPU without an
  account or API key. Choose from 99 spoken languages or automatic detection. Models are
  verified before use; no audio goes to a speech service. Native x64 and ARM64 are supported.
  New installs open on Whisper with Base and automatic language detection selected; download
  the model before starting. Existing saved setups are preserved.
- **Finish the whole transcript.** If recognition falls behind, pending audio is held in an
  automatically deleted local temporary file. Stop lets Whisper finish; discarding pending
  audio requires confirmation and marks the transcript incomplete. Performance varies by PC,
  model and language. Whisper provides same-language subtitles, not local translation.
- **Two caption languages.** Translate into two languages at once with Gemini or OpenAI.
  Each extra target uses a separate cloud session per audio source, increasing provider usage.
- **Original speech alongside translations.** Include available source text in exports and,
  optionally, beneath translations in the Fit window or Compact overlay.
- **Pause and resume.** Keep the session and transcript together during breaks. Cloud
  connections close after flushing their final turn; Whisper stops new input and continues
  processing the existing backlog. Ctrl+Shift+P toggles Pause.
- **Your filler-word list.** Edit the words hidden from the overlay. Raw transcripts, history
  and exports retain the engine's text.
- **Smoother long sessions.** More efficient history writes and caption fitting, improved
  Gemini reconnect handling, and a more consistent operator interface.

The interface remains available in English, French and German. Cloud translation and cloud
subtitles still require your own provider account and API key and may incur usage charges.
The optional scripted English/French demo remains available for trying the display controls.

Thanks to [@valentinrabot](https://github.com/valentinrabot) for suggesting
local transcription in [issue #98](https://github.com/fmadore/Live-translation/issues/98).

See [local Whisper](https://github.com/fmadore/Live-translation/blob/v1.6.0/docs/local-whisper.md)
for model sizes, storage and performance details and the
[privacy policy](https://fmadore.github.io/Live-translation/privacy) for local buffering and cloud processing.

For the Microsoft Store, upload
[Live.Translation_1.6.0.msixbundle](https://github.com/fmadore/Live-translation/releases/download/v1.6.0/Live.Translation_1.6.0.msixbundle),
containing native x64 and ARM64 packages at version **1.6.0.0**. The Store signs accepted packages.
Separate MSIX files are provided for per-architecture testing; EXE/MSI installers are for
installation outside the Store. GitHub publication and Store certification are separate;
the [release handoff](https://github.com/fmadore/Live-translation/blob/main/docs/store-updates.md#release-160-handoff)
records the package evidence and remaining Store acceptance checks.
