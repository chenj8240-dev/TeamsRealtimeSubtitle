# Windows 10 WASAPI device loopback (T03)

Measured on **2026-10-21** on Windows 10 Pro 22H2, build **10.0.19045.2965**, x64.
The production path is the upstream WASAPI shared-mode render-loopback backend
(`wasapi` 0.26) now selected through the T02 `CaptureBackend` boundary. It captures the
selected output endpoint's mix — every application playing to that device — never a single
process on this build.

## What T03 added

- Decode tests for the loopback reader: 32-bit float, 16-bit integer and 32-bit integer are
  converted to `[-1, 1]`; an unsupported 24-bit format yields silence of the right length
  instead of panicking.
- An ignored hardware test, `manual_loopback_captures_audio_energy`, that opens the default
  (or `LOOPBACK_PROBE_DEVICE`) render endpoint, captures the device mix for
  `LOOPBACK_PROBE_SECONDS` (default 5), prints the active status and energy, cancels, joins,
  and asserts that no level or audio updates arrive after the capture thread stopped.
- This record. No audio file is written; the test tone is generated in memory.

## Procedure

```powershell
$env:LOOPBACK_PROBE_SECONDS = '6'
cargo test --manifest-path app/src-tauri/Cargo.toml --lib `
  manual_loopback_captures_audio_energy -- --ignored --nocapture
```

While it runs, play a controlled 3-second 440 Hz tone through the default output. The tone
was generated as an in-memory stereo 16-bit/44.1 kHz WAV and played with
`System.Media.SoundPlayer`; no file was created.

## Result

Default endpoint: `扬声器 (2- Audio Device)`. The capture status was:

```json
{"origin":"system","scope":"deviceMix","deviceName":"扬声器 (2- Audio Device)","format":{"sampleRate":48000,"channels":2,"bitsPerSample":32,"encoding":"float"},"phase":"active"}
```

Test output:

```text
manual loopback: levels=53 chunks=29 max_rms=0.2125
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 243 filtered out; finished in 6.05s
```

Interpretation:

- The endpoint opened as 48 kHz, stereo, 32-bit float; `CaptureState` resampled/downmixed it
  to the 16 kHz mono PCM16 pipeline.
- 29 chunks of roughly 100 ms is about 2.9 seconds of the 3-second tone, so the capture was
  live for the whole tone. 53 level updates were observed.
- `max_rms=0.2125` is well above the test's 0.001 energy threshold. The tone amplitude was
  0.3, so the captured level is plausible for endpoint volume and mixing.
- After cancellation the test joined the capture thread and asserted that no further level or
  audio messages arrived. The backend calls `stop_stream` and drops the COM/device objects.

## Not covered by this record

- Other endpoint formats (24-bit, unusual channel layouts), device removal/reinsert,
  Bluetooth/dock transitions, sleep/wake, or exclusive/protected audio.
- Process-level loopback: Windows 10 19045 is below the 20348 minimum, so the application
  scope remains unavailable and must not be shown as working.
- UI rendering of the `capture-status` event, installer packaging and end-to-end captions.
  Those stay in later tasks (T08/T10).
