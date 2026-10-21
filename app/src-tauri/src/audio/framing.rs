//! Bounded, timestamped audio backlog for local recognition.
//!
//! Ingestion never waits for inference: it appends chunks and drops the oldest audio when the
//! queue is full. Memory is fixed by `max_bytes`, and no file is created — this replaces the
//! previous anonymous on-disk spool. `QueueStatus` exposes backlog, drop and lag state to the
//! local pipeline.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use anyhow::{ensure, Result};
use serde::Serialize;

/// About two minutes of 16 kHz mono PCM16. A slow recognizer loses old audio rather than
/// growing without bound; the live edge keeps moving.
const MAX_BYTES: u64 = 120 * 16_000 * 2;
const MAX_CHUNK_BYTES: usize = 32_000;
/// The operator is told processing is behind once the queue holds more than this.
const LAG_AFTER_MS: u64 = 30_000;
const BYTES_PER_MS: u64 = 32;

#[derive(Debug, Clone)]
pub struct TimedChunk {
    pub start_ms: u64,
    pub pcm: Vec<u8>,
}

/// What a reader gets from `next_timeout`.
pub enum Next {
    Chunk(TimedChunk),
    /// Nothing arrived within the timeout and input is still open.
    Idle,
    /// Input has ended and every queued chunk has been read.
    End,
}

/// Observable backlog state for the operator and logs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStatus {
    pub pending_ms: u64,
    pub dropped_ms: u64,
    pub dropped_frames: u64,
    pub lagging: bool,
}

struct Data {
    chunks: VecDeque<TimedChunk>,
    /// Bytes still in the queue (bounded memory).
    queued_bytes: u64,
    /// Bytes pushed but not yet consumed by a processed window. This is what makes a slow
    /// recognizer visible even though reading a chunk removes it from the queue.
    unprocessed_bytes: u64,
    ended: bool,
    dropped_frames: u64,
    dropped_samples: u64,
}

pub struct FrameQueue {
    data: Mutex<Data>,
    changed: Condvar,
    max_bytes: u64,
    /// Set by the capture side when its bounded channel is full; stops the source.
    pub overflowed: AtomicBool,
    pub finalizing: AtomicBool,
    pub capture_error: Mutex<Option<String>>,
}

impl FrameQueue {
    #[allow(
        clippy::unnecessary_wraps,
        reason = "the historical Spool API is fallible; callers keep their existing paths"
    )]
    pub fn new() -> Result<Self> {
        Self::with_limit(MAX_BYTES)
    }

    #[allow(
        clippy::unnecessary_wraps,
        reason = "the historical Spool API is fallible; callers keep their existing paths"
    )]
    fn with_limit(max_bytes: u64) -> Result<Self> {
        Ok(Self {
            data: Mutex::new(Data {
                chunks: VecDeque::new(),
                queued_bytes: 0,
                unprocessed_bytes: 0,
                ended: false,
                dropped_frames: 0,
                dropped_samples: 0,
            }),
            changed: Condvar::new(),
            max_bytes,
            overflowed: AtomicBool::new(false),
            finalizing: AtomicBool::new(false),
            capture_error: Mutex::new(None),
        })
    }

    pub fn push(&self, chunk: &TimedChunk) -> Result<()> {
        ensure!(
            chunk.pcm.len() <= MAX_CHUNK_BYTES && chunk.pcm.len().is_multiple_of(2),
            "Invalid local audio frame"
        );
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        let bytes = chunk.pcm.len() as u64;
        if bytes > self.max_bytes {
            Self::drop(&mut data, chunk.pcm.len() as u64 / 2);
            self.changed.notify_one();
            return Ok(());
        }
        data.chunks.push_back(chunk.clone());
        data.queued_bytes += bytes;
        data.unprocessed_bytes += bytes;
        while data.queued_bytes > self.max_bytes {
            let Some(front) = data.chunks.pop_front() else {
                break;
            };
            let dropped = front.pcm.len() as u64;
            data.queued_bytes -= dropped;
            data.unprocessed_bytes = data.unprocessed_bytes.saturating_sub(dropped);
            data.dropped_frames += 1;
            data.dropped_samples += dropped / 2;
        }
        self.changed.notify_one();
        Ok(())
    }

    fn drop(data: &mut Data, samples: u64) {
        data.dropped_frames += 1;
        data.dropped_samples += samples;
    }

    pub fn finish(&self) {
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        data.ended = true;
        self.finalizing.store(true, Ordering::Relaxed);
        self.changed.notify_all();
    }

    /// Blocking read with no idle signal; the worker uses `next_timeout`.
    #[cfg(test)]
    #[allow(
        clippy::unnecessary_wraps,
        reason = "the historical Spool API is fallible; callers keep their existing paths"
    )]
    pub fn next(&self) -> Result<Option<TimedChunk>> {
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        while data.chunks.is_empty() && !data.ended {
            data = self.changed.wait(data).unwrap_or_else(|e| e.into_inner());
        }
        Ok(Self::pop(&mut data))
    }

    /// Like `next`, but gives up after `idle` without new audio, so a quiet input can be
    /// finalized without waiting for a chunk that may never come.
    #[allow(
        clippy::unnecessary_wraps,
        reason = "the historical Spool API is fallible; callers keep their existing paths"
    )]
    pub fn next_timeout(&self, idle: Duration) -> Result<Next> {
        let deadline = Instant::now() + idle;
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        while data.chunks.is_empty() && !data.ended {
            let Some(left) = deadline.checked_duration_since(Instant::now()) else {
                return Ok(Next::Idle);
            };
            data = self
                .changed
                .wait_timeout(data, left)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        match Self::pop(&mut data) {
            Some(chunk) => Ok(Next::Chunk(chunk)),
            None => Ok(Next::End),
        }
    }

    fn pop(data: &mut MutexGuard<'_, Data>) -> Option<TimedChunk> {
        let chunk = data.chunks.pop_front()?;
        data.queued_bytes = data.queued_bytes.saturating_sub(chunk.pcm.len() as u64);
        Some(chunk)
    }

    /// A processed window has consumed `samples` unique samples (overlap included by the
    /// segmenter's own accounting). Until then the audio still counts as backlog, exactly as
    /// the previous spool did.
    pub fn complete(&self, samples: usize) {
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        data.unprocessed_bytes = data.unprocessed_bytes.saturating_sub(samples as u64 * 2);
    }

    pub fn pending_ms(&self) -> u64 {
        let data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        data.unprocessed_bytes / BYTES_PER_MS
    }

    pub fn status(&self) -> QueueStatus {
        let data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        let pending_ms = data.unprocessed_bytes / BYTES_PER_MS;
        QueueStatus {
            pending_ms,
            dropped_ms: data.dropped_samples / 16,
            dropped_frames: data.dropped_frames,
            lagging: pending_ms > LAG_AFTER_MS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn chunk(start_ms: u64) -> TimedChunk {
        TimedChunk {
            start_ms,
            pcm: vec![0; 3200],
        }
    }

    #[test]
    fn a_slow_reader_keeps_every_frame_that_fits() {
        let queue = Arc::new(FrameQueue::new().unwrap());
        for i in 0..600u64 {
            queue.push(&chunk(i * 100)).unwrap();
        }
        assert_eq!(queue.pending_ms(), 60_000);
        assert_eq!(queue.status().dropped_frames, 0);
        queue.finish();
        for i in 0..600u64 {
            let frame = queue.next().unwrap().unwrap();
            assert_eq!(frame.start_ms, i * 100);
            queue.complete(1600);
        }
        assert!(queue.next().unwrap().is_none());
        assert_eq!(queue.pending_ms(), 0);
    }

    #[test]
    fn a_caught_up_queue_can_be_reused_and_wakes_on_stop() {
        let queue = Arc::new(FrameQueue::new().unwrap());
        for _ in 0..3 {
            queue.push(&chunk(42)).unwrap();
            assert_eq!(queue.next().unwrap().unwrap().start_ms, 42);
            queue.complete(1600);
            assert_eq!(queue.pending_ms(), 0);
        }
        let other = queue.clone();
        let reader = std::thread::spawn(move || other.next().unwrap());
        queue.finish();
        assert!(reader.join().unwrap().is_none());
    }

    #[test]
    fn a_quiet_input_reports_idle_then_hands_over_new_audio_and_the_end() {
        let queue = Arc::new(FrameQueue::new().unwrap());
        let started = Instant::now();
        assert!(matches!(
            queue.next_timeout(Duration::from_millis(50)).unwrap(),
            Next::Idle
        ));
        assert!(started.elapsed() >= Duration::from_millis(50));

        let writer = queue.clone();
        let feeder = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            writer.push(&chunk(7)).unwrap();
        });
        let Next::Chunk(frame) = queue.next_timeout(Duration::from_secs(10)).unwrap() else {
            panic!("expected the pushed frame");
        };
        assert_eq!(frame.start_ms, 7);
        feeder.join().unwrap();

        queue.push(&chunk(8)).unwrap();
        queue.finish();
        assert!(matches!(
            queue.next_timeout(Duration::ZERO).unwrap(),
            Next::Chunk(TimedChunk { start_ms: 8, .. })
        ));
        assert!(matches!(
            queue.next_timeout(Duration::from_secs(10)).unwrap(),
            Next::End
        ));
    }

    #[test]
    fn overflow_drops_the_oldest_frames_and_reports_them() {
        let queue = FrameQueue::with_limit(2 * 3200).unwrap();
        queue.push(&chunk(0)).unwrap();
        queue.push(&chunk(100)).unwrap();
        queue.push(&chunk(200)).unwrap();
        let status = queue.status();
        assert_eq!(status.pending_ms, 200);
        assert_eq!(status.dropped_frames, 1);
        assert_eq!(status.dropped_ms, 100);

        queue.push(&chunk(300)).unwrap();
        let status = queue.status();
        assert_eq!(status.pending_ms, 200);
        assert_eq!(status.dropped_frames, 2);
        assert_eq!(status.dropped_ms, 200);
        assert!(!status.lagging);
    }

    #[test]
    fn memory_stays_bounded_over_a_long_stream() {
        let queue = FrameQueue::new().unwrap();
        for i in 0..10_000u64 {
            queue.push(&chunk(i * 100)).unwrap();
        }
        let data = queue.data.lock().unwrap();
        assert!(data.queued_bytes <= queue.max_bytes);
        assert_eq!(data.chunks.len(), 1200);
        assert_eq!(data.unprocessed_bytes, 120 * 32_000);
        assert!(data.dropped_frames > 0);
        drop(data);
        assert!(queue.status().lagging);
        assert!(queue.status().dropped_ms > 0);
    }

    #[test]
    fn a_backlog_over_the_lag_threshold_is_reported() {
        let queue = FrameQueue::with_limit(120 * 32_000).unwrap();
        for i in 0..310u64 {
            queue.push(&chunk(i * 100)).unwrap();
        }
        let status = queue.status();
        assert_eq!(status.dropped_frames, 0);
        assert_eq!(status.pending_ms, 31_000);
        assert!(status.lagging);
    }
}
