# Documentation

These guides describe **[1.7.1](https://github.com/fmadore/Live-translation/releases/tag/v1.7.1)**,
published on GitHub on 20 October 2026. It carries everything in
[1.7.0](https://github.com/fmadore/Live-translation/releases/tag/v1.7.0), published the same day
on GitHub only: offline translation into English with Whisper, an overlay that reopens where it
was placed and comes back when a display is unplugged, and cloud sessions and Whisper that hold
up better through a long meeting. 1.7.1 adds a packaging fix for the taskbar icon. The Store
serves **1.6.1** (6 October 2026), confirmed by the maintainer on 20 October 2026, until 1.7.1
replaces it.
The [6 October app review](app-review-2026-10-06.md) records the work in 1.7.0 and the feature candidates still open; the [22 September app review](app-review-2026-09-22.md), [archived reviews](archive/) and older release handoffs are historical records.

## Using the app

- [Local Whisper](local-whisper.md): models, languages, offline setup, translation into English,
  pending audio and Stop.
- [Language coverage](language-coverage.md): translation targets, spoken-language selection and verification limits.
- [Audio checks](audio-device-testing.md) and [application capture](application-capture.md).
- [Meeting controls and profiles](usability.md): Pause, two caption languages and shortcuts.
- [Caption layout](caption-layout.md): overlay placement, reading modes and filler-word lists.
- [Transcript export](transcript-export.md) and [optional history](transcript-history.md).
- [Privacy](privacy.md), [accessibility checks](accessibility.md) and [interface localization](localization.md).

## Development

- [Architecture](architecture.md) and [native Whisper build requirements](local-whisper.md#building).
- Provider integration notes: [Gemini](gemini-live-api.md), [OpenAI](openai-realtime-api.md), [Mistral](mistral-realtime-api.md).
- [Security policy](../SECURITY.md), [roadmap](../ROADMAP.md) and [release history](release-notes.md).

## Release 1.7.1 (awaiting Store submission)

- [Release notes](release-1.7.1.md) and [release handoff](store-updates.md#release-171-handoff).
- 1.7.0, GitHub only and superseded in the Store by 1.7.1: [release notes](release-1.7.0.md) and [release handoff](store-updates.md#release-170-handoff).
- 1.6.1, the version in the Store: [release notes](release-1.6.1.md) and [release handoff](store-updates.md#release-161-handoff).
- 1.6.0: [release notes](release-1.6.0.md) and [release handoff](store-updates.md#release-160-handoff).
- [Store copy in English, French and German](store-listing.md) and [screenshot plan](store-screenshots/README.md).
- [MSIX packaging](packaging-msix.md), [Store identity and acceptance](microsoft-store.md),
  [Partner Center walkthrough](partner-center-walkthrough.md).
