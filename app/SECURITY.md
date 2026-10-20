# Security policy

## Supported versions

Only the latest tagged release receives fixes. Installers are published per tag on the
[releases page](https://github.com/fmadore/Live-translation/releases).

## Reporting a vulnerability

Report privately through
[GitHub's private vulnerability reporting](https://github.com/fmadore/Live-translation/security/advisories/new)
rather than opening a public issue. Expect an acknowledgement within a week.

## How this app handles credentials

- Provider API keys (Gemini, OpenAI, Mistral) are stored in the OS credential store —
  Windows Credential Manager — and are read only by the Rust core. They are never written to
  frontend storage, application settings, transcript files or logs.
- The webview runs under a restrictive CSP (`connect-src 'self'`); all provider WebSocket
  traffic originates from Rust, not the frontend.
- `.env` is git-ignored and intended for development only. `.env.example` contains variable
  names, never values. Only debug builds load `.env` or honour the `*_WS_HOST` host
  overrides, so a stray `.env` cannot redirect a provider key in a release build.

## What leaves the machine

Cloud modes stream captured audio directly to the selected provider under that provider's
terms. Local Whisper keeps audio on the PC, with pending speech in a delete-on-close temporary
file. User-requested model downloads contact Hugging Face; size and SHA-256 are verified
before installation and again before loading. Models remain cached until removed. The built-in
demo captures no audio and uses no network. The developer receives no audio, keys or transcripts.

Save as writes text, Markdown, SRT or VTT to the folder the user selects in the native
Windows dialog. The optional local recovery copy is off by default and stores finalized
caption text on the same PC. Saved transcripts and recovery data are not uploaded.
Optional session history is also off by default. It stores unencrypted finalized text
locally until the user deletes it; disabling history stops new saves but retains existing
sessions. Meeting profiles store setup preferences and device identifiers, never API keys
or transcript contents.
Responsive-caption history is held only in memory; trimming the overlay does not delete
the operator transcript. See the [privacy policy](docs/privacy.md) and
[transcript export](docs/transcript-export.md) for details.

## Installer signing

**Install from the Microsoft Store if you can.** Store packages are signed by Microsoft, so
they carry no SmartScreen warning and update themselves:
[apps.microsoft.com/detail/9PFB8LR3RR9X](https://apps.microsoft.com/detail/9PFB8LR3RR9X).

The NSIS installers on GitHub Releases remain **unsigned**, so Windows SmartScreen may warn on
first launch ("Windows protected your PC" — choose **More info → Run anyway**). If you use
them, verify the download came from the official releases page linked above. See
[`docs/microsoft-store.md`](docs/microsoft-store.md).
