# Local multilingual Whisper transcription

Included in **1.6.0** ([PR #99](https://github.com/fmadore/Live-translation/pull/99)), following
[issue #98](https://github.com/fmadore/Live-translation/issues/98), where
[@valentinrabot](https://github.com/valentinrabot) suggested local transcription for
same-language meetings without ongoing API costs. Whisper is an additional **Subtitles**
provider, and since 1.7.0 ([PR #121](https://github.com/fmadore/Live-translation/pull/121))
also translates into English offline under **Live translation**; see
[translation into English](#translation-into-english).

New installations open on Whisper with Base and automatic language detection selected.
Downloading a model and starting capture both require the user's action. Saved engine, model,
language and audio choices are kept on upgrade.

On a processor that cannot run the Whisper engine (see [processor requirements](#processor-requirements)),
the setup sheet lists Whisper as unavailable with a one-line reason, Start is not offered for it,
and a selected Whisper — including the first-launch default — is replaced by the built-in demo,
so the keyless first launch always opens on something that starts. Whisper's translation is
listed as unavailable in the same way, but stays selected until the operator chooses a cloud
engine: the demo cannot translate, so it is no stand-in.

## Using it

1. Choose Subtitles, the microphone/system/application source, and **Whisper** as the engine.
2. Select a spoken language, or leave **Detect automatically** selected. Choosing the known
   language helps with short utterances and avoids repeated language guessing.
3. Download a model. The download needs an internet connection; transcription is then offline.
4. Start captioning. Captions feed the existing overlay, history, recovery and export workflows.
5. Stop when the meeting ends, then let **Finishing the transcript** complete before exporting
   the complete transcript. The pending duration reports unprocessed audio, not a prediction
   of processing time. Discarding pending audio requires confirmation and leaves an explicit
   incomplete-transcript notice.

Closing the app while audio is still waiting is different from Stop: the close prompt says how
many seconds remain, closing gives the backlog a few seconds, and whatever is left is then
discarded so the app can actually quit. Stop first and let it finish if the transcript has to
be complete.

| Model | Download | Intended choice |
| --- | ---: | --- |
| Tiny Q5_1 | 31 MiB | Lowest CPU and memory demand; try first on slower machines |
| Base Q5_1 (default) | 57 MiB | A balance between speed and recognition quality |
| Small Q5_1 | 182 MiB | More capacity, with higher CPU and memory demand |

All three are multilingual models, not the English-only `.en` variants. The selector exposes
all 99 language tokens they support, which is not a claim of equal accuracy across languages.
The separate Cantonese token introduced with large-v3 is not advertised for these models.

Models are pinned to Hugging Face `ggerganov/whisper.cpp` revision
`5359861c739e955e79d9a303bcbc70fb988958b1`. Exact sizes and SHA-256 digests are in
`src-tauri/src/whisper/models.rs`. Downloads use HTTPS and can be cancelled. There is no overall
time limit, so a slow connection still finishes Small; a connection that delivers nothing for
60 seconds fails instead. Downloads follow the proxy server set in Windows Settings → Network &
internet → Proxy (manual setup, including its bypass list) and the `HTTPS_PROXY`/`HTTP_PROXY`
variables; automatic proxy scripts (PAC/WPAD) are not read. The file is written as
`<model>.part` in the models folder and renamed into place only after its size and SHA-256
match; a failed or cancelled download deletes it, and starting a download first deletes any
partial file an interrupted one left behind (quitting mid-download cannot clean up). Installed
bytes are verified again before passing them to the native loader. Files in use cannot be
deleted or replaced.

## Translation into English

Whisper's models have a second task besides transcription: translating what is said, in any of
their 99 languages, into English. The app offers it as **Local Whisper** under **Live
translation** ("Offline · into English only"), the one translation engine that needs no account,
API key or internet connection once a model is downloaded. It is a separate provider,
`whisper-translate`, for the reason the two Gemini engines are: it serves the other mode. It runs
exactly the pipeline described here — the same models and download, processor check, buffering,
segmentation, pause, Stop drain, pending-audio discard and close prompt — and differs only in
the task whisper.cpp is given (`translate`).

1. Choose **Live translation**, the audio source and **Local Whisper**.
2. Keep **English** as the caption language. Whisper translates into English only: any other
   caption language is refused with the message every engine gives for a language it cannot
   write, and Start waits until English is chosen. There is no second caption language, and the
   F2 swap has nothing to swap to; a second language saved for a cloud engine is kept for it but
   not used.
3. Choose the spoken language, or leave **Detect automatically**. It is the language Whisper
   translates from, and works as for subtitles: a window of 3 seconds or more detects its own
   language, a shorter one reuses the last detection, and a chosen language is always used.
   English speech comes out as English.
4. Choose **Small** and download it. Translation is where the smaller models fall short: Tiny
   and Base often mistranslate, and the setup sheet says so. Small needs the processor speed
   discussed under [processor requirements](#processor-requirements) to keep up.

The task returns English and no transcription of what was said, so captions carry no source
text. The overlay and the operator's stage show the English alone, with no original-speech line
even when that option is on, and a saved transcript has no original to include, so the
bilingual export option is not offered. **Rehearse** plays the French recording, as it does for
any English translation target.

Limits worth knowing before an event:

- **English only.** It does nothing for an audience that reads another language.
- **Quality follows the model.** The smoke test below translates the French rehearsal recording
  with Tiny into recognisable but poor English ("This is a recording of repetition for the
  subject system to direct…"). Use Small for an audience, and test it on the room's own speech
  first.
- **Captions per window, not word by word.** As with subtitles, each window of up to roughly
  10 seconds is captioned when it is finished.
- **Window boundaries.** The second of overlap between windows is trimmed by comparing the
  English. A translation of that second can be worded differently in each window, so an
  occasional repeated phrase at a boundary is more likely than in transcription.

## Audio handling and limits

Capture produces about 100 ms of 16 kHz mono PCM16 per frame. A bounded queue gives the disk
writer 30 seconds of scheduling slack. The inference worker reads an anonymous local temporary
file rather than the cloud clients’ low-latency queues, so delayed recognition does not
trigger their stale-audio discard. Buffering is bounded to 2 GiB per source (roughly 18 hours
of audio without the reader catching up and resetting the file); disk-full, I/O failure and
writer overflow stop the source and report that its transcript may be incomplete. Memory does
not grow with the audio backlog.

Recognition uses windows of up to roughly 10 seconds, one second of overlap and conservative
silence endpointing. It produces finalized captions, not speculative word-by-word interim
captions. A final short window is padded for inference and its timestamps are clamped to the
actual audio duration. Pauses retain elapsed meeting timing, and each window's time is taken
from the capture timestamp of the audio it starts in rather than counted in samples, so a
capture clock running slightly fast or slow cannot drift caption times over a long meeting.

When the backlog exceeds 30 seconds, windows grow to about 28 seconds until it has cleared.
Whisper encodes 30 seconds of audio however short the window is, so long windows clear a
backlog with roughly a third of the encoder passes; timestamps are unaffected.

Text repeated across the second of overlap is removed only where the timestamps actually
overlap; later repetitions are kept. It is compared word by word, ignoring case and
punctuation ("there" does not match "here"); Chinese, Japanese, Thai and other scripts written
without spaces are compared by character. whisper.cpp already drops a window it judges silent;
the app additionally drops a segment only when the window's no-speech probability is above 0.6
**and** the segment's mean token log-probability is below −1 (whisper.cpp's own thresholds,
applied per segment), which removes the "Thank you." Whisper invents over room noise without
dropping confident speech. Text that is not valid UTF-8 loses only the broken character.
Accuracy at window boundaries, background noise and code-switching still need real meeting
acceptance tests. Whisper can misrecognize speech or hallucinate text.

With **Detect automatically**, every window of 3 seconds or more detects its own language, so a
French/English room is followed as speakers alternate. A shorter window — a quick reply, a
name, the last words before a pause — reuses the language detected on the last longer window
that produced captions, because a second or two of audio is where detection is least reliable
and most likely to turn a phrase into the other language. A chosen spoken language is always
used as chosen.

Pause stops new audio entering transcription or its temporary file, while the existing backlog
continues processing. When no new audio has arrived for a second — after Pause, or when system
audio goes quiet because nothing is playing — the audio already held is transcribed straight
away instead of waiting for more. Normal Stop drains input and the final partial window
without the cloud pipeline’s five-second limit. An explicit discard token interrupts
inference. Temporary audio is delete-on-close and cannot be recovered after the process exits;
see [privacy](privacy.md).

Inference uses about half the logical processors on x64 (one thread per core, assuming
simultaneous multithreading) and all but one core on ARM64, at most eight threads either way.
With Both sources, the two sources take turns rather than running inference at the same time,
so they do not compete for the same cores with capture and the interface.

## Building

`whisper-rs` 0.16.0 vendors whisper.cpp 1.8.3 through `whisper-rs-sys` 0.15.0, both pinned
exactly in `Cargo.toml`. The CPU backend is statically linked. No Python, external Whisper
executable, GPU, CUDA or model is bundled in the installer. Model loading uses Rust’s
filesystem API so non-ASCII Windows usernames work.

Install LLVM/Clang with libclang, CMake and Ninja alongside the normal Rust/Tauri Windows
prerequisites. Run in a Visual Studio Developer PowerShell for the target architecture:

```powershell
$env:CC = 'clang-cl'
$env:CXX = 'clang-cl'
$env:CXXFLAGS = '/EHsc'
$env:CMAKE_GENERATOR = 'Ninja'
$env:LIBCLANG_PATH = 'C:\Program Files\LLVM\bin'
npm ci
npm run tauri dev
```

The native Windows ARM64 backend requires Clang; plain MSVC cannot compile this version of
GGML’s ARM CPU code. CI and release packaging use native Windows x64 and ARM64 runners with
the same compiler setup. Real-time throughput is not guaranteed; Both sources runs two
inference states and increases memory use.

### Processor requirements

`.cargo/config.toml` builds GGML's CPU code for a fixed instruction-set level rather than the
build machine's, because GGML's quantised maths has no fast path below it and Small would not
keep up with speech:

| Architecture | Built for | Checked at runtime |
| --- | --- | --- |
| x64 | AVX2, FMA, F16C, SSE4.2 — clang-cl's `/arch:AVX2`, which also allows BMI1, BMI2, LZCNT, MOVBE and POPCNT | All of those (Intel Haswell, AMD Excavator/Zen and later, including Alder Lake-N) |
| ARM64 | `armv8.2-a+dotprod+fp16` | Dot-product (Snapdragon 850 and later); Windows reports FP16 only on recent builds, and every SoC with dot-product has it |

`src-tauri/src/whisper/cpu.rs` checks this before any whisper.cpp code runs — model load,
context creation, the smoke test — because GGML code built for AVX2 stops the whole app with
an illegal instruction on an older processor. Such a PC is refused with a translated
explanation, and the setup sheet learns it before Start through `whisper_cpu_support`. The
other engines are unaffected. CI proves the x64 side by running the test binary under Intel SDE
emulating Goldmont Plus (the pre-AVX core in budget Celeron and Pentium Silver laptops): the
binary starts without executing AVX code and the gate reports the processor unsupported.

The whisper-rs-sys build script does not watch these variables. After changing them, run
`cargo clean -p whisper-rs-sys` and bump the Rust cache `prefix-key` in the workflows, or the
old native libraries are reused.

Whisper.cpp and the OpenAI model weights use the MIT license; whisper-rs uses the Unlicense.
Their notices are included under `resources/licenses` and bundled with the app.

## Validation

CI builds, lints and tests the application on Linux, Windows x64 and Windows ARM64. The opt-in
`local_whisper_smoke` test downloads the pinned Tiny model and runs the production buffering,
segmentation and inference path over bundled English (auto-detect) and French
(explicit-language) recordings, then translates the French one into English with its language
detected. It checks recognisable transcript content, monotonic timestamps and complete EOF
draining:

```sh
cd src-tauri
cargo test --locked --all-features local_whisper_smoke -- --ignored --nocapture
```

Unit tests cover language vocabulary, corrupt model rejection, active-model protection,
writer overflow, pause filtering, final-tail handling, timestamp gaps and producer failure
ordering; the processor check; downloads against a loopback HTTP server (verified install,
hash mismatch, oversized body, stalled connection, cancellation, partial-file clean-up); the
spool's idle signal and size limit; the segmenter's gap threshold, jittered and drifting
timestamps, long windows and idle flush; segment reconciliation (overlap by word and by
character, clamped and monotonic times, broken UTF-8, the no-speech filter); short-window
language reuse; thread counts; and the translate task reaching whisper.cpp. Validation tests
cover translation's English-only target and its lack of a second language. UI tests cover
persisted multilingual settings, model/progress controls, the unsupported-processor engine
card, the close prompt's pending audio, and translation's engine card, English-only note and
captions without original speech. For
PR #99 (4 October 2026) the smoke test passed on ARM64, including non-ASCII model paths, and
all seven PR CI jobs passed on
[run 37196818518](https://github.com/fmadore/Live-translation/actions/runs/37196818518).

Before release, test packaged x64 and ARM64 applications on real devices: download/cancel/remove,
relaunch offline, microphone and Teams/application loopback, Both sources, pause/resume, long
backlogs, Stop/discard, quitting with a backlog, exports, non-Latin speech and clean
uninstall; a model download behind a proxy configured in Windows Settings; and an x64 PC
without AVX2, where Whisper must be listed as unavailable and the demo selected. CI audio
fixtures do not
establish microphone permissions, actual conference-call capture quality or battery
performance. Package acceptance is tracked in the
[release handoff](store-updates.md#release-171-handoff).
