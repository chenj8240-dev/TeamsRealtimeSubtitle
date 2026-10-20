# OpenAI Realtime Translate API

Cloud translation integration. Offline same-language captions use [local Whisper](local-whisper.md),
not this endpoint.

Verified 1 August 2026 with the official
[Realtime translation guide](https://developers.openai.com/api/docs/guides/realtime-translation)
and [translation client-event reference](https://developers.openai.com/api/reference/resources/realtime/translation-client-events).

## Connection and audio

```text
wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate
Authorization: Bearer <OPENAI_API_KEY>
```

WebSocket input is base64 mono PCM16 LE at 24 kHz. The engine consumes 200 ms frames; the
capture path’s 100 ms chunks are valid and the service buffers two at a time. Silence remains
part of the continuous stream.

## Setup

```json
{
  "type": "session.update",
  "session": {
    "audio": {
      "input": {
        "transcription": { "model": "gpt-realtime-whisper" },
        "noise_reduction": { "type": "near_field" }
      },
      "output": { "language": "fr" }
    }
  }
}
```

The schema supports output language, optional source transcription and input noise reduction.
Source language is auto-detected.

Audio frames use `session.input_audio_buffer.append`. The app reads
`session.input_transcript.delta` for the operator’s source monitor and
`session.output_transcript.delta` for translated captions; output audio is ignored.

Only output transcript activity arms the 900 ms idle caption boundary, so a source delta cannot
finalize a caption before its translation arrives.

## Graceful stop

The client sends `{"type":"session.close"}`, stops appending audio, and keeps reading until
`session.closed` or a four-second safety timeout. OpenAI documents that closing the socket
immediately can lose translated output still draining from the session.

## Errors and the end of a session

`error` events carry `error.type` (`invalid_request_error`, `server_error`, …) and an
optional `error.code`, and the code is read first. `session_expired` — the Realtime API's
60-minute session cap, which arrives as an `invalid_request_error` — is a planned end, so it
hands over like Gemini's `goAway`: after a stable connection the client reconnects at once and
replays the audio queued meanwhile. It reconnects with the usual backoff on `server_error`, a
rate limit (`rate_limit_exceeded`) and an overloaded service. Authentication, permission, invalid requests and values, an
unknown model, an exhausted quota (`insufficient_quota`, also reported with a 429) and anything
unrecognized stop the source with OpenAI's message. A `session.closed` that arrives
mid-stream, outside a close drain, moves the source to a new session instead of ending it.

**Live check pending:** whether `/translations` shares the 60-minute cap, and which event it
sends there, has not been observed. Run a session longer than an hour before relying on it: the
expected log is one `OpenAI ended the session; moving to a new one` followed by a planned
handover, and captions resuming within a couple of seconds.

## Target-language catalog

On 2026-09-22 the [official cookbook](https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide)
still named 13 targets. The catalog lists `en es pt fr ja ru zh de ko hi id vi it`; its source
is `src/lib/languages.json`, shared by generated Rust and TypeScript types.

**Endpoint verification is pending.** On 2026-09-22 the opt-in probe could not resolve an
OpenAI API key, including outside the sandbox. Portuguese `pt` versus `pt-BR`/`pt-PT` and
Chinese `zh` versus `zh-Hans`/`zh-Hant` must not be represented as proven until it runs.
The probe (`src-tauri/src/openai/language_probe.rs`) opens a separate translation session per
candidate — all 13 targets plus the four ambiguous alternatives — with the production update
payload, waits for `session.updated` or `error`, prints only language verdicts, and closes
without transmitting audio.

Save the key in the app (or set `OPENAI_API_KEY`), then run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib probe_target_language_codes -- --ignored --nocapture
```

Record the returned codes and verdicts here and update the catalog if needed. An accepted
session update proves configuration, not translation quality; the real-speech check is in
[language coverage](language-coverage.md#live-acceptance-procedure).
