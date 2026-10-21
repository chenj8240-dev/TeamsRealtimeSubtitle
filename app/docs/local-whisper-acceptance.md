# Local Whisper acceptance (T05)

Measured on **2026-10-21** on Windows 10 Pro 22H2, build **10.0.19045.2965**, x64, CPU only.
The pipeline is the upstream local Whisper implementation, now reading from T04's bounded
in-memory frame queue. No GPU, microphone or provider key is involved.

## Model and command

- Model: pinned multilingual **Tiny**, file `ggml-tiny-q5_1.bin`, **31.57 MB**.
- The first run downloaded it from the pinned Hugging Face URL in 16.27 s and copied it to
  `D:\Codex\.toolchains\whisper-smoke-cache`; later runs read that verified cache.
- Test: `cargo test --lib local_whisper_smoke -- --ignored --nocapture`
- The test loads the two bundled 16 kHz mono fixtures, pushes them as 100 ms frames, runs the
  T04 queue + segmenter + whisper.cpp inference, and asserts timestamps, words and that
  `pending_ms() == 0` after EOF.

## Observed result

```text
rehearsal-en.wav (11.88s): This is a rehearsal recording for the live caption system. A speaker is presenting to an aud…
rehearsal-fr.wav (7.65s): Ceci est un enregistrement de répétition pour le système de soutien de directe. Une oratrice …
rehearsal-fr.wav translate (18.15s): This is a recording of repetition for the subject system to direct. A portrait is a public a…
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 245 filtered out; finished in 38.83s
```

Language detection reported English (p≈0.998) for the English fixture and French (p≈0.98–0.99)
for the French fixture. The translate pass produced English from the French fixture. Captions
carried monotonically increasing start/end times within the fixture duration, and the queue was
empty at the end.

## What this verifies

- The pinned model loads and runs on this CPU-only Windows 10 machine.
- English and French same-language transcription; Whisper's translate task produces English.
- The T04 bounded queue, overlap windows, silence gate, timestamp anchors and EOF drain work
  together with real whisper.cpp inference.
- No captured audio is written to disk: the queue is in memory, and the model temp directory
  contains only the model file. The existing abort/discard test covers leaving queued work
  unflushed on Stop.

## Limits

- Tiny is the smallest model; the timings above are inference wall time for short fixtures,
  not real-time factors for Base/Small or a live meeting. Quality is visibly rough, especially
  in translation.
- Local Whisper emits **finalized window captions**, not word-by-word interim captions. The
  caption event still carries the shared final flag and timestamps; speculative interim text is
  not produced by this engine.
- Chinese target translation is not part of this run (T06/T07). No real meeting, overlay,
  packaged build or long-duration stability test is claimed.
- The first model download needs network access. This run used the verified cache; inference
  itself has no network path, but an OS-level offline run was not separately performed.
