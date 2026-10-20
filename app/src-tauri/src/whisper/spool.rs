//! An anonymous, delete-on-close audio spool. Ingestion never waits for inference.
//! Only unprocessed audio is queued in memory; long inference backlogs live on disk.
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use anyhow::{ensure, Result};

pub struct TimedChunk {
    pub start_ms: u64,
    pub pcm: Vec<u8>,
}

/// What the reader gets from `next_timeout`.
pub enum Next {
    Chunk(TimedChunk),
    /// Nothing arrived within the timeout and input is still open.
    Idle,
    /// Input has ended and every chunk has been read.
    End,
}

// About 18 hours of 16 kHz mono audio per source. Exhaustion is a visible failure, never
// silent loss or unbounded RAM growth. The file disappears when its last handle closes.
const MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_CHUNK_BYTES: usize = 32_000;

struct Data {
    file: File,
    written: u64,
    read: u64,
    ended: bool,
}

pub struct Spool {
    data: Mutex<Data>,
    changed: Condvar,
    max_bytes: u64,
    queued_samples: AtomicU64,
    pub overflowed: AtomicBool,
    pub finalizing: AtomicBool,
    pub capture_error: Mutex<Option<String>>,
}

impl Spool {
    pub fn new() -> Result<Self> {
        Self::with_limit(MAX_BYTES)
    }

    fn with_limit(max_bytes: u64) -> Result<Self> {
        Ok(Self {
            data: Mutex::new(Data {
                file: tempfile::tempfile()?,
                written: 0,
                read: 0,
                ended: false,
            }),
            changed: Condvar::new(),
            max_bytes,
            queued_samples: AtomicU64::new(0),
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
        let length = u32::try_from(chunk.pcm.len())?;
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        let end = data.written + 12 + chunk.pcm.len() as u64;
        ensure!(
            end <= self.max_bytes,
            "Local audio buffer limit reached; stop and export this session"
        );
        let offset = data.written;
        data.file.seek(SeekFrom::Start(offset))?;
        data.file.write_all(&chunk.start_ms.to_le_bytes())?;
        data.file.write_all(&length.to_le_bytes())?;
        data.file.write_all(&chunk.pcm)?;
        data.written = end;
        self.queued_samples
            .fetch_add(chunk.pcm.len() as u64 / 2, Ordering::Relaxed);
        self.changed.notify_one();
        Ok(())
    }

    pub fn finish(&self) {
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        data.ended = true;
        self.finalizing.store(true, Ordering::Relaxed);
        self.changed.notify_all();
    }

    /// Blocking read with no idle signal; the worker uses `next_timeout`.
    #[cfg(test)]
    pub fn next(&self) -> Result<Option<TimedChunk>> {
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        while data.read == data.written && !data.ended {
            data = self.changed.wait(data).unwrap_or_else(|e| e.into_inner());
        }
        if data.read == data.written {
            return Ok(None);
        }
        Self::read(&mut data).map(Some)
    }

    /// Like `next`, but gives up after `idle` without new audio, so the reader can act on
    /// input going quiet: Pause drops frames before they get here, and system loopback delivers
    /// nothing while nothing plays.
    pub fn next_timeout(&self, idle: Duration) -> Result<Next> {
        let deadline = Instant::now() + idle;
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        while data.read == data.written && !data.ended {
            let Some(left) = deadline.checked_duration_since(Instant::now()) else {
                return Ok(Next::Idle);
            };
            data = self
                .changed
                .wait_timeout(data, left)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        if data.read == data.written {
            return Ok(Next::End);
        }
        Self::read(&mut data).map(Next::Chunk)
    }

    fn read(data: &mut MutexGuard<'_, Data>) -> Result<TimedChunk> {
        let offset = data.read;
        data.file.seek(SeekFrom::Start(offset))?;
        let mut header = [0u8; 12];
        data.file.read_exact(&mut header)?;
        let start_ms = u64::from_le_bytes(header[..8].try_into()?);
        let len = u32::from_le_bytes(header[8..].try_into()?) as usize;
        ensure!(len <= MAX_CHUNK_BYTES, "Invalid local audio buffer");
        let mut pcm = vec![0; len];
        data.file.read_exact(&mut pcm)?;
        data.read += 12 + len as u64;
        // Reuse the file when inference has caught up, keeping a long meeting's disk use
        // proportional to its backlog rather than its entire duration.
        if data.read == data.written {
            data.file.set_len(0)?;
            data.read = 0;
            data.written = 0;
        }
        Ok(TimedChunk { start_ms, pcm })
    }

    pub fn complete(&self, samples: usize) {
        self.queued_samples
            .fetch_sub(samples as u64, Ordering::Relaxed);
    }

    pub fn pending_ms(&self) -> u64 {
        self.queued_samples.load(Ordering::Relaxed) / 16
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
    fn slow_reader_keeps_every_frame_and_timestamp_through_stop() {
        let spool = Arc::new(Spool::new().unwrap());
        for i in 0..2_000u64 {
            spool
                .push(&TimedChunk {
                    start_ms: i * 100,
                    pcm: i16::try_from(i).unwrap().to_le_bytes().repeat(1600),
                })
                .unwrap();
        }
        assert_eq!(spool.pending_ms(), 200_000);
        spool.finish();
        for i in 0..2_000u64 {
            let frame = spool.next().unwrap().unwrap();
            assert_eq!(frame.start_ms, i * 100);
            assert_eq!(
                frame.pcm,
                i16::try_from(i).unwrap().to_le_bytes().repeat(1600)
            );
            spool.complete(1600);
        }
        assert!(spool.next().unwrap().is_none());
        assert_eq!(spool.pending_ms(), 0);
    }

    #[test]
    fn caught_up_spool_can_be_reused_and_wakes_on_stop() {
        let spool = Arc::new(Spool::new().unwrap());
        for _ in 0..3 {
            spool.push(&chunk(42)).unwrap();
            assert_eq!(spool.next().unwrap().unwrap().start_ms, 42);
            spool.complete(1600);
            assert_eq!(spool.data.lock().unwrap().file.metadata().unwrap().len(), 0);
        }
        let other = spool.clone();
        let reader = std::thread::spawn(move || other.next().unwrap());
        spool.finish();
        assert!(reader.join().unwrap().is_none());
    }

    #[test]
    fn a_quiet_input_reports_idle_then_hands_over_new_audio_and_the_end() {
        let spool = Arc::new(Spool::new().unwrap());
        let started = Instant::now();
        assert!(matches!(
            spool.next_timeout(Duration::from_millis(50)).unwrap(),
            Next::Idle
        ));
        assert!(started.elapsed() >= Duration::from_millis(50));

        // A frame arriving during the wait ends it early.
        let writer = spool.clone();
        let feeder = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            writer.push(&chunk(7)).unwrap();
        });
        let Next::Chunk(frame) = spool.next_timeout(Duration::from_secs(10)).unwrap() else {
            panic!("expected the pushed frame");
        };
        assert_eq!(frame.start_ms, 7);
        feeder.join().unwrap();

        spool.push(&chunk(8)).unwrap();
        spool.finish();
        // Queued audio is still delivered after the end of input, then the end itself.
        assert!(matches!(
            spool.next_timeout(Duration::ZERO).unwrap(),
            Next::Chunk(TimedChunk { start_ms: 8, .. })
        ));
        assert!(matches!(
            spool.next_timeout(Duration::from_secs(10)).unwrap(),
            Next::End
        ));
    }

    #[test]
    fn the_size_limit_is_a_visible_failure_and_frees_up_once_the_reader_catches_up() {
        // Room for exactly two frames of header plus 3200 bytes.
        let spool = Spool::with_limit(2 * (12 + 3200)).unwrap();
        spool.push(&chunk(0)).unwrap();
        spool.push(&chunk(100)).unwrap();
        let error = spool.push(&chunk(200)).unwrap_err();
        assert!(error.to_string().contains("limit"), "{error}");
        spool.next().unwrap().unwrap();
        spool.next().unwrap().unwrap();
        // Caught up: the file is reused from the start, so the limit applies to the backlog.
        spool.push(&chunk(300)).unwrap();
        spool.push(&chunk(400)).unwrap();
        assert!(spool.push(&chunk(500)).is_err());
    }
}
