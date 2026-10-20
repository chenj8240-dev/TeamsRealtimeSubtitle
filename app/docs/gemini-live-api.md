# Gemini Live API

Two Gemini models share one `BidiGenerateContent` socket and one API key. For subtitles without a
cloud connection, see [local Whisper](local-whisper.md).

| Model | Status | Mode it serves |
| --- | --- | --- |
| `gemini-3.5-live-translate-preview` | Preview | Translated captions |
| `gemini-3.5-transcribe-live` | Stable | Same-language subtitles |

Re-verified 27 August 2026 against Google’s
[Live translation guide](https://ai.google.dev/gemini-api/docs/live-api/live-translate)
(last updated 2026-07-23), the
[Live transcription guide](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)
(last updated 2026-08-26), the [model list](https://ai.google.dev/gemini-api/docs/models) and
the [Live API reference](https://ai.google.dev/api/live). Live Translate is still preview with
no stable equivalent (Transcribe went GA), so re-check it before an event; its wire format is
unchanged since the 12 August 2026 verification.

## Gemini 3.5 Live Translate

### Connection and audio

```text
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=<API_KEY>
```

- Model: `gemini-3.5-live-translate-preview`, sent as `models/...` in setup.
- Input: mono PCM16 LE at 16 kHz, base64 in `realtimeInput.audio`.
- Output modality: `AUDIO`. The app discards model audio and displays
  `outputTranscription`; this can still incur audio-output charges.

### Setup

```json
{
  "setup": {
    "model": "models/gemini-3.5-live-translate-preview",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "translationConfig": {
        "targetLanguageCode": "en",
        "echoTargetLanguage": true
      }
    },
    "inputAudioTranscription": {},
    "outputAudioTranscription": {}
  }
}
```

The SDKs flatten both levels into one `LiveConnectConfig`, but on the wire they are distinct:

- `inputAudioTranscription` and `outputAudioTranscription` are fields of
  `BidiGenerateContentSetup` itself ([Live API reference](https://ai.google.dev/api/live)).
  Nested under `generationConfig`, they make the server reject the whole session with
  `Unknown name "inputAudioTranscription" at 'setup.generation_config': Cannot find field.`
- `translationConfig` *is* a `generationConfig` field, and is Gemini Developer API only —
  the SDKs raise on it in Enterprise/Vertex mode.

Both placements are pinned by `python-genai`'s converter tests (`tests/live/test_live.py`:
`test_bidi_setup_to_api_with_input_transcription`,
`test_bidi_setup_to_api_with_translation_config`). Older revisions used
`realtimeInput.mediaChunks`; that shape is not used here.

### Streaming and events

```json
{
  "realtimeInput": {
    "audio": {
      "mimeType": "audio/pcm;rate=16000",
      "data": "<base64 PCM16>"
    }
  }
}
```

- `serverContent.inputTranscription.text` is source-language monitor text.
- `serverContent.outputTranscription.text` is translated caption text.
- `echoTargetLanguage` stays enabled so speech already in the target language still appears
  in the caption stream; this is essential for bilingual meetings.
- `serverContent.turnComplete` finalizes and advances the per-source turn.
- `goAway` triggers an immediate planned reconnect; see [the ten-minute cap](#the-ten-minute-cap).
- A provider `error` becomes a terminal operator-visible status instead of a silent log.

### Closing

Pause and Stop send `{"realtimeInput":{"audioStreamEnd":true}}`, then drain until the
`turnComplete` that follows it (at most four seconds) before closing — unless no turn is open
and nothing has been captioned for three seconds, when they close at once. Closing at once, as the
client did through 1.6.1, discards whatever translation of the last one to three seconds of
speech is still in flight. **Live check pending:** the reference documents `audioStreamEnd` for
the Live API in general, and no probe has yet shown how Live Translate answers it. The client
is safe either way: an `error` or a close during the drain ends it quietly — no error status —
and the turn accumulated so far is still finalized. Things to confirm on the first live run:
the drain ends well before four seconds on Stop mid-sentence, the last words are translated,
and nothing is logged as `provider error while closing`.

## Gemini 3.5 Transcribe Live

Same endpoint, audio frame and key; a subtitle engine rather than a translator, so the setup
message and transcription fields differ.

### Setup

```json
{
  "setup": {
    "model": "models/gemini-3.5-transcribe-live",
    "generationConfig": {
      "responseModalities": ["TEXT"]
    },
    "inputAudioTranscription": {
      "languageCodes": [],
      "mode": "SMART"
    }
  }
}
```

- `responseModalities: ["TEXT"]` separates the transcription pipeline from a live agent: no
  generated audio to discard, no output sidecar to read.
- `inputAudioTranscription` is a `BidiGenerateContentSetup` field here too, and carries
  configuration rather than being an empty marker.
- `languageCodes: []` enables automatic language identification across utterances, including
  code-switching — the right default for a bilingual room. The guide's table lists 84 entries:
  **83 distinct BCP-47 codes and 77 distinct languages** once locale variants collapse
  (`en-US`/`en-GB`/`en-IN`, `bn-BD`/`bn-IN`, …). User-facing copy therefore says "over 70
  languages", not "100+".
- `mode: "SMART"` removes fillers and false starts, resolves spoken self-corrections, and
  applies punctuation and casing; an audience reading an overlay needs that more than every
  "um". `VERBATIM` (Google's default) is the alternative, not an extra setting. SMART rules out
  word-level annotations, which the app does not use. Google's
  [15 September 2026 audio announcement](https://blog.google/innovation-and-ai/technology/developers-tools/build-real-time-voice-applications-gemini-audio/)
  confirms the disfluency removal; its Gemini 3.8 Live models are conversational audio models,
  not replacements for this integration.
- `customVocabulary` (up to 1,000 terms, best under 100) is available and not yet wired up.

### Streaming and events

The audio frame is the one live translate uses — 16 kHz mono PCM16 LE, base64 in
`realtimeInput.audio`, 100 ms chunks.

- `serverContent.interimInputTranscription.text` is a speculative partial hypothesis, revised
  as the speaker talks.
- `serverContent.inputTranscription.text` is the finalized, authoritative transcript for one
  speech segment, emitted when the speaker pauses.

**Both describe the same segment, so each replaces the caption buffer rather than extending
it.** Live translate appends `inputTranscription` deltas; doing so here would repeat every
revised hypothesis on screen. One finalized segment becomes one transcript line.

When a message carries both, the finalized text wins. An empty final or segment close retracts
an all-filler speculative caption rather than keeping it as speech, and the front end discards
the pending empty turn (regression-tested; no live probe was run for this 1.4.0 change). The
local [Hide filler words](caption-layout.md#hide-filler-words) filter is separate.

`{"realtimeInput":{"audioStreamEnd":true}}` is sent on close so a last segment can still
arrive during the shared runner's drain window. The drain ends on the authoritative final that
follows it, rather than always waiting out the four-second window. The server sends no
acknowledgement when there is nothing left to flush, so a close with no turn open and nothing
captioned for three seconds skips the wait altogether.

### What the wire does that the guide does not mention

Found with `live_probe` (below) against the real endpoint on 27 August 2026:

- **Replies arrive as WebSocket _binary_ frames carrying UTF-8 JSON.** The guide's browser
  sample hides the difference; a client matching only text frames has setup accepted and then
  hears nothing. `realtime/socket.rs` decodes `Message::Binary` — check this first if a session
  ever appears to hang.
- **`generationComplete` closes a segment**, not the `turnComplete` the translate path sends.
  It lets the client finalize a segment that produced only a speculative hypothesis.
- **`setupComplete` *is* sent**, although the guide's sample never waits for one. Waiting is
  correct and matches the Live API contract.

### Segmentation is the model's, and it is not sentence-shaped

On the bundled twenty-second recording, continuous speech runs two sentences into one segment
without a space (`…Use this recording toThe overlay before…`), breaks can fall mid-word
(`…every sentence is` / `described and shown on screen…`, from "transcribed"), and segmentation
varies between runs on identical audio. A caption therefore grows until the model closes the
segment — on continuous speech, a paragraph. The client does not re-split: that would invent
sentence boundaries and make text still being revised jump. Voxtral's 900 ms idle finalization
gives shorter lines, a fair reason to prefer it for a speaker who rarely pauses.

### The ten-minute cap

> Live transcription sessions support continuous streaming for up to 10 minutes.

Mistral Voxtral has no such limit, so this is the one operational difference between the two
subtitle engines: a room session reconnects several times an hour.

`goAway` arrives before the cut, and both Gemini clients answer it with
`MessageControl::Handover`: a planned move, not a failure. After a connection that lasted at
least 30 seconds the runner finalizes the in-flight turn, keeps the source Running and
reconnects at once with no backoff. While the new socket's TLS handshake and setup round trip
run it keeps reading the capture into a backlog of up to about three seconds, and sends it in
order once setup completes, so the gap shows up as a moment of extra latency rather than lost
words. A `goAway` straight after connecting still backs off, so a server refusing the session
is never hammered. Opening the new socket before closing the old one would remove even the
latency; the runner holds one socket per client today.

Speaker diarization and word-level timestamps are not available over the Live API; they belong
to the non-streaming `gemini-3.5-transcribe` model, which takes uploaded files and cannot serve
this app.

## Re-verifying against the live endpoint

Serialization tests pin both clients to the shapes above but cannot show the documentation is
right — and it is not everywhere: the translate guide still nests the transcription sidecars
under `generationConfig`. `gemini::transcribe::live_probe` sends the production setup, audio
frame and response types to Google with the bundled rehearsal recording and reports the
interim and finalized segments.

```bash
GEMINI_API_KEY=... cargo test -p live-translation --lib live_probe -- --ignored --nocapture
```

It is `#[ignore]`d, so CI never runs it or bills anyone. Run it before an event and after any
change to either setup message; it costs a few cents (about twenty seconds of audio). The key
comes from the environment or a `.env` at the repo root (`dotenvy` walks up from the crate
directory; copy `.env.example`). Its assertions concern the shape of the exchange, not the
words: setup is accepted, `generationComplete` arrives, and speculative updates outnumber
finalized segments — which is what makes replace-don't-append correct.

## Target-language catalog

Rechecked against the [live translation guide](https://ai.google.dev/gemini-api/docs/live-api/live-translate)
on 2026-09-22 (page updated 2026-09-16): 78 languages / 79 codes. The app shows one Norwegian
row and sends `no`; `nb` is a search alias. The canonical catalog, with each code's provider
memberships, is `src/lib/languages.json`; generated Rust and TypeScript types share it. This is
documentation verification, not a live-speech pass; see [language coverage](language-coverage.md).
