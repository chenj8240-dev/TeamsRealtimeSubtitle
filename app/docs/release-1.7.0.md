# Live Translation & Subtitles 1.7.0

Offline translation into English with Whisper, an overlay that reopens where you placed it,
and cloud sessions and local Whisper that hold up better through a long meeting.

- **Translate into English offline.** Under Live translation, **Local Whisper** translates
  speech in any of its 99 languages into English on your PC, with no account, API key or
  internet connection once a model is downloaded. English is its only caption language, with
  no second one. Choose **Small**: Tiny and Base often mistranslate. Whisper returns the
  English alone, so there is no original-speech line. See
  [translation into English](https://github.com/fmadore/Live-translation/blob/v1.7.0/docs/local-whisper.md#translation-into-english).
- **The overlay reopens where you left it.** Its position and size are remembered for each
  display arrangement, up to eight. Place it on the projector, and the next launch with the
  projector connected puts it back there; without the projector, it opens on a display that
  is connected. Done, the overlay's own Lock and loading a meeting profile save the placement.
- **The overlay comes back when a display goes.** Unplug the projector during a session, or
  switch Windows projection mode with Win+P, and within about two seconds the overlay moves
  onto a connected display, resized if it no longer fits, without interrupting captions. Plug the projector
  back in and it returns to its place there. Move overlay and showing a hidden overlay first
  check that it is on a display, and Escape in move mode no longer sends it back to a display
  that has gone.
- **Cloud sessions that keep going.** When a provider closes the session mid-stream, reports a
  transient error or the network stops delivering, that source now reconnects instead of
  ending. This covers OpenAI's session expiry and the Mistral error 3803 seen on 1.6.0. Speech
  during a reconnect is held, up to three seconds, and sent in order. Pause now takes effect
  while a session is still connecting.
- **The last words before Pause and Stop.** Gemini Translate now asks for the translation of
  the final words and waits up to four seconds for it instead of closing at once; Gemini
  Transcribe stops as soon as its last caption arrives instead of always waiting four seconds.
  Whisper captions the last words before Pause after a second of quiet, not on Resume.
- **Faster Whisper.** Whisper now uses the processor's vector instructions: in our Tiny
  measurements on a Snapdragon X it is about twice as fast. On x64 it needs a processor with
  AVX2 (Intel Haswell, AMD Excavator or Zen, or later). Where that is missing, as on some
  budget Celeron and Pentium Silver laptops, Whisper is listed as unavailable with the reason,
  a first launch opens on the built-in demo, and the cloud engines still work. With Both
  sources the two take turns instead of competing for the processor, and a long backlog
  clears in fewer passes.
- **Model downloads on slow or proxied networks.** Downloads follow the proxy set in Windows
  Settings and have no overall time limit, so a slow connection still finishes Small. A partial
  file is deleted when a download fails or is cancelled, or at the next download if the app was
  closed mid-way.
- **24-bit microphones** are accepted.

Fixes:

- Closing the app while Whisper is still finishing no longer waits for the whole backlog; the
  close prompt says how many seconds of audio would be discarded. Stop no longer hangs on a
  capture device that stops responding.
- Whisper trims the overlap between windows by whole words ("there" no longer swallows
  "here"), caption times no longer drift over a long meeting, one undecodable character no
  longer ends the source, and confident speech is no longer dropped as silence.
- Moving the overlay between displays with different scaling, such as a 150% laptop and a
  100% projector, keeps its size; meeting profiles were affected too. Done in the operator
  window now counts as placing the overlay.
- Test audio works while a device-failure notice is showing, a rehearsal's cost estimate counts
  one stream instead of two, and transcript history finds and shows both caption languages. The
  export format is remembered through Start, Stop and restarts, and Save on quit uses it.
- The History tab re-reads only new or grown sessions, and an unreadable session file no longer
  hides the others. A failed export there shows its reason instead of "[object Object]", and
  recovery, history and window errors are worded in the interface language.
- Narrator no longer announces Pause and Move overlay as pressed toggle buttons, the live input
  status speaks only when input goes quiet or fails, and the caption-width stepper reads
  "Shorter/Longer caption lines".

Under the surface: the realtime runner and the session module are split along their seams, and
a loopback WebSocket server drives the reconnect logic in tests. Pull requests now pass typed
ESLint, knip, a curated Clippy table and an audit of shipped packages, and CI reports coverage.
Two Playwright suites run on Windows: one drives the real app end to end, the other checks
styles and overflow in English, French and German at 100–225% text. reqwest moves to 0.13 (the
copy Tauri already compiles, now with `system-proxy`), and whisper-rs-sys is pinned so
whisper.cpp stays at 1.8.3. Each change, its tests and the checks that still need hardware or
live providers are in the
[6 October app review](https://github.com/fmadore/Live-translation/blob/main/docs/app-review-2026-10-06.md)
([#116](https://github.com/fmadore/Live-translation/pull/116)–[#122](https://github.com/fmadore/Live-translation/pull/122)).
Since the release candidate, a display watcher recovers the overlay
([#139](https://github.com/fmadore/Live-translation/pull/139), closing
[#137](https://github.com/fmadore/Live-translation/issues/137)), the interface builds on
SvelteKit 3 and adapter-static 4 ([#138](https://github.com/fmadore/Live-translation/pull/138)),
and the October dependency batches ([#135](https://github.com/fmadore/Live-translation/pull/135),
[#151](https://github.com/fmadore/Live-translation/pull/151)) bring Tauri 2.12.3 and wasapi
0.26, which drives system-audio capture.

The [privacy policy](https://fmadore.github.io/Live-translation/privacy) now covers translation
into English, downloads through a proxy and the remembered overlay placement; the app still
sends nothing to the developer. Cloud translation and cloud subtitles still require your own
provider account and API key and may incur usage charges.

For the Microsoft Store, upload
[Live.Translation_1.7.0.msixbundle](https://github.com/fmadore/Live-translation/releases/download/v1.7.0/Live.Translation_1.7.0.msixbundle),
containing native x64 and ARM64 packages at version **1.7.0.0**. The Store signs accepted packages.
Separate MSIX files are provided for per-architecture testing; EXE/MSI installers are for
installation outside the Store. The
[release handoff](https://github.com/fmadore/Live-translation/blob/main/docs/store-updates.md#release-170-handoff)
records the package evidence and remaining Store acceptance checks.
