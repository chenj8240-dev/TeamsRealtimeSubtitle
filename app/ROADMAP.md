# Roadmap

GitHub milestones are the source of truth for active work. This file holds the current status,
the open work and a short record of what each release shipped; the
[release notes](docs/release-notes.md), the [Store handoffs](docs/store-updates.md) and git
history keep the detail.

## Current status — 1.7.1 on GitHub, 1.6.1 in the Store

The latest [GitHub release is **1.7.1**](https://github.com/fmadore/Live-translation/releases/tag/v1.7.1)
(20 October 2026), awaiting Store submission, where it will replace 1.6.1. It is 1.7.0's app
code with a packaging fix: the taskbar and Start drew the icon on a plate in the Windows accent
colour, and the package now carries unplated icon sizes and a resource index. The
[1.7.1 handoff](docs/store-updates.md#release-171-handoff) has the Store steps.

[1.7.0](https://github.com/fmadore/Live-translation/releases/tag/v1.7.0), published the same day
on GitHub only, is [#116](https://github.com/fmadore/Live-translation/pull/116)–[#122](https://github.com/fmadore/Live-translation/pull/122),
the six batches of the [6 October app review](docs/app-review-2026-10-06.md) and a Mistral
reconnect fix, then overlay recovery when a display is disconnected
([#139](https://github.com/fmadore/Live-translation/pull/139)), SvelteKit 3
([#138](https://github.com/fmadore/Live-translation/pull/138)) and the October dependency
batches. For operators it brings offline translation into English with Whisper (F1), an overlay
that reopens where it was last placed on each display layout (F2) and moves onto a connected
display when its own is unplugged, cloud sessions that reconnect after a mid-stream close, a
transient provider error or a stalled network, and Whisper built with SIMD behind a runtime
processor check: about twice as fast on ARM64, and on x64 limited to processors with AVX2. The
rest is operator fixes, 24-bit microphones, structure, and CI gates with two Playwright suites.
The [1.7.0 handoff](docs/store-updates.md#release-170-handoff) has its package evidence and the
manual checks that carry over to 1.7.1.

The Store serves [**1.6.1**](https://github.com/fmadore/Live-translation/releases/tag/v1.6.1)
(6 October 2026, MSIX 1.6.1.0), confirmed by the maintainer on 20 October 2026; its submission
and certification dates were not recorded. It added the wave-to-words icon
([#111](https://github.com/fmadore/Live-translation/pull/111)) and the 5 October design review
([#112](https://github.com/fmadore/Live-translation/pull/112)) to
[1.6.0](https://github.com/fmadore/Live-translation/releases/tag/v1.6.0), which it replaced in
the Store. The [1.6.1](docs/store-updates.md#release-161-handoff) and
[1.6.0](docs/store-updates.md#release-160-handoff) handoffs record their status and the native
checks still open against the Store build; the 1.6.0 package evidence is in that file's git
history.

Store copy leads with offline captions and optional cloud translation; the scripted demo stays
available as a setup-free display check. Fresh installs select Whisper with Base and automatic
detection, while upgrades preserve saved setups.

## Open verification

The code for these has landed; what remains is evidence from Windows hardware, an installed
package or a native speaker, kept distinct from unit and fixture tests. The
[1.7.1 handoff](docs/store-updates.md#release-171-handoff) is the current checklist.

- **Local Whisper:** live hardware, language and Store-package checks
  ([local Whisper](docs/local-whisper.md)), now including Small translating real speech into
  English, the speed of the SIMD builds on x64 and ARM64, an x64 PC without AVX2, a model
  download behind a proxy and quitting with a large backlog.
- **Cloud session resilience** (6 October review, batches 1–2): a live handover, an OpenAI
  session past 60 minutes, Gemini Translate's answer to `audioStreamEnd`, pong replies from
  every provider and Mistral's real `error` payloads.
- **Cloud caption languages** ([#78](https://github.com/fmadore/Live-translation/issues/78)):
  live endpoint and speech acceptance ([language coverage](docs/language-coverage.md)).
- **Accessibility and tray** ([#24](https://github.com/fmadore/Live-translation/issues/24),
  [#22](https://github.com/fmadore/Live-translation/issues/22)): the Narrator, contrast-theme
  and text-scaling walks in [accessibility](docs/accessibility.md#release-checklist-manual-on-windows),
  and keyboard and Narrator operation of the tray menu. Text scaling at the 980 × 660 minimum
  has been verified only in a browser preview at a forced factor, not with the Windows slider.
- **French and German Store listings** (French:
  [#23](https://github.com/fmadore/Live-translation/issues/23)): final-package screenshots and
  a native-speaker review of the catalog and Store copy ([localization](docs/localization.md)).
- **Audio** ([#27](https://github.com/fmadore/Live-translation/issues/27),
  [#28](https://github.com/fmadore/Live-translation/issues/28)): the application isolation
  matrix and the [hardware matrix](docs/audio-device-testing.md) — Teams/Zoom, browser child
  processes, device changes, sleep/wake and mixed-DPI displays. System capture on wasapi 0.26
  has been tested on ARM64 hardware but not on x64, and a 24-bit microphone has not been
  tried.
- **Export and responsive captions** ([#26](https://github.com/fmadore/Live-translation/issues/26),
  [#77](https://github.com/fmadore/Live-translation/issues/77)): the remaining
  [export checks](docs/transcript-export.md); user feedback, packaged Windows checks and fresh
  screenshots for the [caption layout](docs/caption-layout.md), including the overlay's restore
  across launches with a 150% laptop and a 100% projector and its recovery when a display is
  unplugged mid-session.

## Planning conventions

- A milestone is a release outcome, not a promised date.
- Each active issue owns one independently testable change and carries its acceptance criteria.
- High-priority correctness, data-safety, and build work lands before optional features in the
  same milestone.
- Windows behavior is verified in an installed MSIX as well as browser/Tauri development; audio
  changes also require real hardware and a meeting-app test.
- Experimental Windows APIs remain outside Store builds until Microsoft documents them as stable
  and Store-eligible.

## Unscheduled and research

- [#32 — Windows AI speech-recognition prototype](https://github.com/fmadore/Live-translation/issues/32)
  stays unmilestoned and is blocked on evidence: it crashed natively on the target ARM64
  Surface during the 1.0.x certification attempts, must survive a clean ARM64 and a clean x64
  machine before it is considered, and cannot enter a Store build while the API is experimental.
- [#12 — automatic FR ⇄ EN direction](https://github.com/fmadore/Live-translation/issues/12)
  needs a measured provider-switching design before it becomes a release commitment. Two
  caption languages already serve the bilingual room: both directions run side by side, at
  twice the cost, with no switching to get wrong.
- Multi-monitor overlay presets: named placements to switch between in a running session, such
  as "bottom of the projector" and "top of the laptop". The overlay already reopens where it was
  last placed on each display arrangement, clamped to a connected display, and a meeting
  profile already carries a placement with its setup, and since 1.7.0 a display unplugged or
  reconnected mid-session moves the overlay off it and back; what remains is choosing among
  several without a profile and without move mode.
- Per-origin caption styling on the overlay, such as a subtle prefix when both sources are live.
- Make rate-card verification dates visible: the rates in `providers.ts` have no in-repo source
  or date, and Mistral's realtime price is no longer on its pricing page
  ([6 October review](docs/app-review-2026-10-06.md#5-dependencies-and-provider-drift)).
- The other feature candidates of the
  [6 October review](docs/app-review-2026-10-06.md#6-feature-candidates), beyond #12 (its F3)
  and per-origin styling (F5): captions on attendees' phones over the LAN and an OBS mode (F4),
  small provider adoptions (F6), an opt-in transcript polish after the session (F7) and
  research into local text translation (F8).
- A billable provider smoke workflow: an explicitly manual run of live credentials against a
  golden audio fixture. It is intentionally not automatic because it costs money and CI secrets
  are not available to forked pull requests.

## Shipped

- **1.7.1** (20 October 2026, GitHub; Store submission pending): 1.7.0's app code with
  unplated taskbar icon sizes and a resource index in the package, so the taskbar and Start no
  longer draw the icon on an accent-coloured plate. [Release body](docs/release-1.7.1.md).
- **1.7.0** (20 October 2026, GitHub only; superseded in the Store by 1.7.1): the six batches
  of the [6 October app review](docs/app-review-2026-10-06.md)
  ([#116](https://github.com/fmadore/Live-translation/pull/116)–[#121](https://github.com/fmadore/Live-translation/pull/121)),
  with offline Whisper translation into English (F1) and an overlay that reopens where it was
  placed (F2); Mistral reconnects after error 3803
  ([#122](https://github.com/fmadore/Live-translation/pull/122)); overlay recovery when a
  display is disconnected ([#139](https://github.com/fmadore/Live-translation/pull/139));
  SvelteKit 3 ([#138](https://github.com/fmadore/Live-translation/pull/138)).
  [Release body](docs/release-1.7.0.md).
- **1.6.1** (6 October 2026, Store): the wave-to-words icon
  ([#111](https://github.com/fmadore/Live-translation/pull/111)) and the 5 October design
  review ([#112](https://github.com/fmadore/Live-translation/pull/112)).
  [Release body](docs/release-1.6.1.md).
- **1.6.0** (4 October 2026, Store): local Whisper transcription
  ([#99](https://github.com/fmadore/Live-translation/pull/99)), suggested by @valentinrabot in
  [#98](https://github.com/fmadore/Live-translation/issues/98); two translation targets,
  original speech in exports and optionally in the overlay, and Pause/Resume (#90); an
  editable filler-word list (#89 / #85); review batches 3–4 (#87/#88), lighter history and
  caption updates, improved Gemini reconnection. [Release body](docs/release-1.6.0.md).
- **1.5.1** (23 September 2026, Store): batches 1–2 of the
  [22 September app review](docs/app-review-2026-09-22.md)
  ([#86](https://github.com/fmadore/Live-translation/pull/86)). [Release body](docs/release-1.5.1.md).
- **1.5.0** (22 September 2026): searchable caption-language selector with favourites (#78):
  78 Gemini and 13 OpenAI targets, including German
  ([#56](https://github.com/fmadore/Live-translation/issues/56)).
  [Release body](docs/release-1.5.0.md).
- **1.4.2** (21 September 2026): a persistent Start/Stop bar below the app header.
- **1.4.1** (20 September 2026): the [operator UI audit](docs/ui-audit-implementation.md) —
  tabbed Settings, profile picker, history browser, presets and swatches, localized tray labels
  and date fields.
- **1.4.0** (19 September 2026): [meeting profiles, reading controls](docs/usability.md),
  history titles and search, live input status, keyboard shortcuts and Gemini subtitle
  corrections.
- **1.3.0** (19 September 2026): opt-in [transcript history](docs/transcript-history.md) (#81),
  Stable reading, the overlay filler-word filter and the German interface.
- **1.2.3–1.2.4:** native Save As with SRT/VTT export (#26), application audio capture (#27)
  and the responsive caption layout (#77).
- **1.2.1–1.2.2:** device lifecycle and output selection (#28), Jump to latest, shorter
  transcript paragraphs, per-source handling of fatal provider errors and atomic recovery
  snapshots.
- **1.2.0:** the French interface (#23); operator-chosen caption typeface, colours and width
  ([#54](https://github.com/fmadore/Live-translation/issues/54),
  [#55](https://github.com/fmadore/Live-translation/issues/55)) with a composite contrast
  readout; a settings panel; the accessibility pass, including Windows text scaling (#24);
  caption timestamps; and separate operator and overlay capabilities
  ([#31](https://github.com/fmadore/Live-translation/issues/31)).
- **1.1.0** (27 August 2026, the first Store update): Gemini Transcribe Live as a second
  subtitle engine; the transcript as a document with an optional recovery spool
  ([#25](https://github.com/fmadore/Live-translation/issues/25)); a system tray with safe
  close and quit (#22); a truthful audio preflight
  ([#20](https://github.com/fmadore/Live-translation/issues/20)); F2 no longer promises a
  mid-session direction flip ([#21](https://github.com/fmadore/Live-translation/issues/21));
  no Tauri IPC calls in browser previews
  ([#29](https://github.com/fmadore/Live-translation/issues/29)).
- **1.0.5** (first Store certification): MSIX packaging, the privacy policy and a keyless
  default path. Store policy 10.8.3 bars individual accounts from requiring API keys for primary
  functionality, and policy 10.3 requires certification to be able to test the app. On-device
  recognizers failed on unconfigured review hardware, so 1.0.5 replaced them with a
  deterministic bundled demonstration and became native x64 and ARM64. The lesson stands for
  the next attempt: a keyless path that depends on the reviewer's hardware, language packs or
  privacy settings is not a keyless path. macOS support was dropped; the Linux CI lane is a
  compile check only. See [Microsoft Store submission](docs/microsoft-store.md).
- **0.4.0** (August 2026): Mistral Voxtral subtitles, plain-text and Markdown export, current
  provider contracts, a serialized start/stop lifecycle, bounded audio channels, frontend
  tests, Windows and Linux Rust CI with npm/RustSec audits.
- **0.3.0:** fixes from the July and August 2026 reviews — per-origin status and captions,
  capture-error reporting, a shared realtime session runner with backoff reset and fail-fast
  handshakes, stale audio dropped before reconnecting, async commands, overlay move mode and
  the first CI workflow.
