# Audio capture interface (T02)

The capture contract is [`audio/backend.rs`](../src-tauri/src/audio/backend.rs). A live
session and the preflight test both go through [`session/capture.rs`](../src-tauri/src/session/capture.rs),
which chooses a backend from the source and the selected scope. The UI receives only the
generic names below; no cpal or WASAPI type crosses that boundary.

## Capture scope

| Scope | Backend | What it covers |
|---|---|---|
| `microphone` | cpal input | One input endpoint, selected by ID or name. |
| `deviceMix` | WASAPI render loopback | Every application playing to the selected output endpoint, or the default. |
| `application` | WASAPI process loopback | The selected process tree only. Windows build 20348 or later. |

`Origin` still keys captions, levels and session status. `CaptureScope` is the range the
capture status reports. On Windows 10 build 19045 the application scope is not available;
the device mix is the only system scope, and it is never labelled as one application's audio.

## Status model

`CaptureStatus` carries:

- `origin` — `microphone` or `system`.
- `scope` — `microphone`, `deviceMix` or `application`.
- `deviceName` — the endpoint's friendly name once a device is open; absent for a process
  scope.
- `process` — the selected `{ pid, createdAt }` identity for an application scope.
- `format` — `{ sampleRate, channels, bitsPerSample, encoding }`, where encoding is
  `float`, `int` or `unknown`. These are the endpoint's native values, not the provider's
  target rate.
- `phase` — `starting`, `active`, `silent`, `stopped` or `error`.
- `message` — untranslated technical detail on `error`.

`silent` is reserved for the VAD in T04; current live backends emit `starting`, `active`,
`stopped` and `error`. Pause/resume is a session concern: while paused, capture and
metering continue and only provider clients stop. That is the existing default behaviour and
is deliberately not a capture phase.

The status is emitted as the `capture-status` event (`events::CAPTURE_STATUS` in
[`types.rs`](../src-tauri/src/types.rs), `EVT.captureStatus` in the front-end) through a
bounded channel of 8. A full channel drops a status update; it never blocks the audio thread.
The front-end does not render this event yet; T08 will surface the device and scope.

## Lifecycle

- **Start.** `CaptureBackend::run` opens the device and reports `active` with the actual
  endpoint name and native format. A device-open failure reports `error` and returns to the
  session, which stops that source.
- **Pause / resume.** Session-level only. The capture thread keeps reading and metering; the
  provider clients close and later reconnect. No backend method is called, so a future backend
  cannot silently change this behaviour.
- **Stop.** `SessionManager` cancels the source token, joins capture threads with the existing
  3-second bound, and reports `stopped`. Dropping the WASAPI/cpal objects releases the device.
- **Device loss.** A missing endpoint or application returns an error; the session reports it
  and never falls back to another device, the microphone, or all system audio.

## Backends and queues

- `MicrophoneBackend` → `run_microphone` in [`audio/capture.rs`](../src-tauri/src/audio/capture.rs) (cpal).
- `OutputBackend` → `run_system_loopback(SystemCapture::Output)` in
  [`audio/loopback.rs`](../src-tauri/src/audio/loopback.rs) (WASAPI device mix).
- `ApplicationBackend` → `run_system_loopback(SystemCapture::Application)` (WASAPI process
  loopback).

The capture path never opens a WAV/MP3 file or writes a recording. Realtime audio uses a
bounded channel of 5 × 100 ms chunks; the local writer uses a bounded queue of 300 chunks;
levels use a channel of 8. T04 replaced the old anonymous on-disk spool with the bounded
in-memory [frame queue](audio-framing-vad.md); the capture interface itself only sees the
bounded `AudioSink`.

## Verification

T02 ran `cargo check --all-targets`, `cargo clippy --all-targets -- -D warnings`, and the
backend, session-capture, cpal-format and WASAPI-format unit tests. Real device capture,
Windows 10 19045 hardware, application isolation, silence detection and UI rendering remain
unverified; those belong to T03/T04/T08.
