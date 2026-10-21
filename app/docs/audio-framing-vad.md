# Audio framing and VAD (T04)

Local recognition now uses a bounded in-memory frame queue and the existing energy-gated
segmenter. No captured audio is written to disk.

## Frame queue

[`audio/framing.rs`](../src-tauri/src/audio/framing.rs) defines `FrameQueue`, a timestamped
queue shared by the local Whisper ingest and worker:

- **Bound:** about 120 seconds / 3.84 MB of 16 kHz mono PCM16 per source. A single chunk is at
  most 32 KB (about 1 s).
- **Overload policy:** when the queue is over the bound, the oldest queued chunks are dropped so
  the live edge keeps moving. `QueueStatus` reports `pendingMs`, `droppedMs`,
  `droppedFrames` and `lagging`.
- **Backlog accounting:** reading a chunk removes it from the queue, but it remains `pending`
  until the segmenter has processed a window and calls `complete`. This keeps the long-window
  and progress behaviour of the previous spool.
- **No file:** `whisper/spool.rs` is now a compatibility alias for `FrameQueue`; the old
  anonymous temporary audio file is gone.

## VAD and windows

[`whisper/segment.rs`](../src-tauri/src/whisper/segment.rs) cuts the queue into windows:

- 10 s normal windows, 28 s when the backlog exceeds 30 s; 1 s overlap between windows.
- A conservative energy gate (~−80 dBFS) and 0.8 s of silence endpointing; a window with no
  active sample carries `speech = false` and is not sent to inference, so silence does not
  produce empty captions.
- A chunk starting more than 250 ms after the held audio is a pause/device gap, not jitter; the
  held window is finalized and the timestamp axis keeps the gap.
- Window times come from capture anchors, not sample counts, so a slightly fast/slow capture
  clock cannot drift timestamps over a long meeting.

## Pause, stop and discard

- Pause keeps capture and meters live. New frames are not enqueued by the local sink, so they do
  not reach recognition; the existing queue is processed. An idle queue releases the held window
  after about a second.
- Stop finishes enqueueing, drains the queue and the final partial window. An explicit discard
  token aborts inference and leaves captions already produced.
- The queue is dropped when the source ends; there is no recoverable audio file.

## Observable status

`whisper-progress` now carries `pendingMs`, `droppedMs` and `lagging` beside
`finalizing`. `WhisperActivity` shows a lagging/dropped line, and the local Whisper privacy
copy now says audio is held in a bounded memory buffer rather than a temporary file.

## Verification

- Queue tests cover bounded retention, drop-oldest accounting, idle/end wakeups and lag
  reporting.
- Segmenter tests cover overlap, silent windows, pause gaps, timestamp jitter and long windows.
- The full Rust library suite passes; T05 still has to exercise this queue with a real Whisper
  model and real meeting audio.

## Limits

- The 120 s bound is a deliberate product trade-off: under a longer recognition stall, old audio
  is lost rather than written to disk. The transcript may be incomplete; the UI reports dropped
  seconds.
- The gate is an energy VAD, not a speech model. T04 does not add word-level timestamps or
  interim captions.
- No real-device/T05 ASR acceptance is claimed here.
