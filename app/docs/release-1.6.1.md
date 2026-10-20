# Live Translation & Subtitles 1.6.1

A new icon and a refreshed operator window. Behaviour is unchanged from 1.6.0 apart from the
small fixes listed below.

- **New app icon.** The "wave to words" mark, a speech wave settling into a caption line,
  replaces the generic translation glyph in the Start menu, taskbar, tray, toolbar and Store
  tiles. Its colours are now the app's own palette.
- **Windows 11 geometry.** Controls and cards round by 4px and dialogs and flyouts by 8px.
  Default buttons now stand out from ghost buttons on the rail. The settings gear and the
  dialog close button share one icon-button style.
- **One status pill.** Live, Paused, Connecting and Error use the same strength of colour and
  the same weight, so no state reads as less urgent than it is.
- **Settings tabs that look like tabs.** The selected tab is brighter, with a short accent
  underline, so it no longer looks like a pressed toggle.
- **A placement preview you can judge.** In move mode, the preview caption uses your caption
  colour, outline and backing, so it stays readable over a white slide. The move-mode toolbar
  stays on one line with full-height dividers and standard key caps.
- **One stepper everywhere.** Caption size and backing strength behave the same on the rail,
  in Settings and on the move-mode toolbar. − and + now stop at their limits instead of
  clamping silently.
- **Smaller fixes.** The Whisper model settings are spaced like the rest of the rail. The
  pre-flight intro now points to Start at the top of the window. The Remote speaker chip is
  neutral, so mint means only live, primary or on.

For developers: the stylesheet tokens were regularised (`-wash` / `-chip` / `-border` at
8 / 14 / 40% for every hue, role-named radii, control heights, one caps tracking and three
leadings). New guard tests keep components on them. See
[PR #112](https://github.com/fmadore/Live-translation/pull/112).

No runtime dependency, privacy or data-handling changes. The build-time `source-map-js` is
patched for GHSA-68fv-2mgg-jv7q; it is not shipped in the app. Cloud translation and cloud
subtitles still require your own provider account and API key and may incur usage charges.

For the Microsoft Store, upload
[Live.Translation_1.6.1.msixbundle](https://github.com/fmadore/Live-translation/releases/download/v1.6.1/Live.Translation_1.6.1.msixbundle),
containing native x64 and ARM64 packages at version **1.6.1.0**. The Store signs accepted packages.
Separate MSIX files are provided for per-architecture testing; EXE/MSI installers are for
installation outside the Store. The
[release handoff](https://github.com/fmadore/Live-translation/blob/main/docs/store-updates.md#release-161-handoff)
records the package evidence and remaining Store acceptance checks.
