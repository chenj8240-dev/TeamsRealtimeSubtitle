//! Provider-specific capture delivery. Local capture has a bounded disk-writer queue;
//! overflowing it stops capture visibly instead of silently omitting speech.
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tokio::sync::mpsc::{error::TrySendError, Sender};
use tokio_util::sync::CancellationToken;

use super::AudioChunk;
use crate::realtime::PauseRx;
use crate::timing::SessionClock;
use crate::whisper::spool::{Spool, TimedChunk};

pub enum AudioSink {
    Realtime(Sender<AudioChunk>),
    Local {
        sender: Sender<TimedChunk>,
        spool: Arc<Spool>,
        clock: SessionClock,
        pause: PauseRx,
        cancel: CancellationToken,
    },
}

/// Keep the input channel open until the producer has published its outcome. Without this
/// guard, dropping CaptureState can expose EOF before a device-open error is recorded.
pub struct CaptureCompletion {
    spool: Arc<Spool>,
    _sender: Sender<TimedChunk>,
    completed: bool,
}

impl CaptureCompletion {
    pub fn finish(&mut self, error: Option<String>) {
        *self
            .spool
            .capture_error
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = error;
        self.completed = true;
    }
}

impl Drop for CaptureCompletion {
    fn drop(&mut self) {
        if !self.completed {
            self.finish(Some(
                "The audio capture worker stopped unexpectedly".to_owned(),
            ));
        }
        // Fields drop after this method: readers cannot see EOF until the error is visible.
    }
}

impl From<Sender<AudioChunk>> for AudioSink {
    fn from(sender: Sender<AudioChunk>) -> Self {
        Self::Realtime(sender)
    }
}

impl AudioSink {
    pub fn completion_guard(&self) -> Option<CaptureCompletion> {
        match self {
            Self::Local { sender, spool, .. } => Some(CaptureCompletion {
                spool: spool.clone(),
                _sender: sender.clone(),
                completed: false,
            }),
            Self::Realtime(_) => None,
        }
    }
    pub fn local_spool(&self) -> Option<Arc<Spool>> {
        match self {
            Self::Local { spool, .. } => Some(spool.clone()),
            _ => None,
        }
    }
    pub fn is_closed(&self) -> bool {
        match self {
            Self::Realtime(sender) => sender.is_closed(),
            Self::Local { sender, .. } => sender.is_closed(),
        }
    }

    pub fn try_send(&self, chunk: AudioChunk) -> Result<(), TrySendError<AudioChunk>> {
        match self {
            Self::Realtime(sender) => sender.try_send(chunk),
            Self::Local {
                sender,
                spool,
                clock,
                pause,
                cancel,
            } => {
                if *pause.borrow() {
                    return Ok(());
                }
                let duration_ms = chunk.pcm_le.len() as u64 / 32;
                let frame = TimedChunk {
                    start_ms: clock.elapsed_ms().saturating_sub(duration_ms),
                    pcm: chunk.pcm_le,
                };
                sender.try_send(frame).map_err(|error| {
                    if matches!(error, TrySendError::Full(_)) {
                        spool.overflowed.store(true, Ordering::Relaxed);
                        cancel.cancel();
                    }
                    TrySendError::Closed(AudioChunk {
                        pcm_le: error.into_inner().pcm,
                    })
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn producer_outcome_is_visible_before_eof_even_when_it_unwinds() {
        let (sender, mut rx) = tokio::sync::mpsc::channel(1);
        let spool = Arc::new(Spool::new().unwrap());
        let sink = AudioSink::Local {
            sender,
            spool: spool.clone(),
            clock: SessionClock::at(0),
            pause: tokio::sync::watch::channel(false).1,
            cancel: CancellationToken::new(),
        };
        let guard = sink.completion_guard().unwrap();
        drop(sink);
        assert!(matches!(
            rx.try_recv(),
            Err(tokio::sync::mpsc::error::TryRecvError::Empty)
        ));
        drop(guard);
        assert!(matches!(
            rx.try_recv(),
            Err(tokio::sync::mpsc::error::TryRecvError::Disconnected)
        ));
        assert!(spool.capture_error.lock().unwrap().is_some());
    }
    #[test]
    fn local_overflow_stops_capture_and_pause_does_not_enqueue_audio() {
        let (sender, mut rx) = tokio::sync::mpsc::channel(1);
        let spool = Arc::new(Spool::new().unwrap());
        let cancel = CancellationToken::new();
        let (pause, paused) = tokio::sync::watch::channel(true);
        let sink = AudioSink::Local {
            sender,
            spool: spool.clone(),
            clock: SessionClock::at(5000),
            pause: paused,
            cancel: cancel.clone(),
        };
        sink.try_send(AudioChunk {
            pcm_le: vec![0; 3200],
        })
        .unwrap();
        assert!(rx.try_recv().is_err());
        pause.send_replace(false);
        sink.try_send(AudioChunk {
            pcm_le: vec![0; 3200],
        })
        .unwrap();
        assert!(sink
            .try_send(AudioChunk {
                pcm_le: vec![0; 3200]
            })
            .is_err());
        assert!(cancel.is_cancelled());
        assert!(spool.overflowed.load(Ordering::Relaxed));
        assert!(rx.try_recv().unwrap().start_ms >= 4900);
    }
}
