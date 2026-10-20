# Live Translation & Subtitles 1.7.1

A packaging fix for the app icon, on top of everything in 1.7.0.

- **The icon without a coloured square.** Installed from the Microsoft Store or an MSIX
  package, the app showed its icon on a square in your Windows accent colour on the taskbar, in
  Start's app list, in Alt+Tab and in jump lists, so the rounded corners of the wave-to-words
  tile showed blue. It has looked like this since the new icon reached the Store in 1.6.1. The
  icon now appears on its own, with transparent corners. Installs from the EXE and MSI
  installers use a separate icon file and were not affected.

How: the package now carries unplated taskbar sizes of the icon, from 16 to 256 pixels, and a
resource index (`resources.pri`), which is how Windows finds them.

Everything in [1.7.0](https://github.com/fmadore/Live-translation/releases/tag/v1.7.0) is
included, with the app code unchanged: offline translation into English with Whisper, an
overlay that reopens where you placed it and comes back when a display is unplugged, cloud
sessions that reconnect instead of ending, and faster Whisper. 1.7.0 was published on GitHub
only and was not submitted to the Store, so the Store goes from 1.6.1 straight to 1.7.1.

For the Microsoft Store, upload
[Live.Translation_1.7.1.msixbundle](https://github.com/fmadore/Live-translation/releases/download/v1.7.1/Live.Translation_1.7.1.msixbundle),
containing native x64 and ARM64 packages at version **1.7.1.0**. The Store signs accepted packages.
Separate MSIX files are provided for per-architecture testing; EXE/MSI installers are for
installation outside the Store. The
[release handoff](https://github.com/fmadore/Live-translation/blob/main/docs/store-updates.md#release-171-handoff)
records the package evidence and remaining Store acceptance checks.
