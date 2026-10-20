//! The device side of a source, shared by sessions and the preflight test: which devices it
//! opens, its level meter, joining its threads at Stop, and how a failure reaches the operator.

use std::thread::JoinHandle;
use std::time::Duration;

use anyhow::Result;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{channel, Sender};
use tokio_util::sync::CancellationToken;

use crate::audio::applications::SystemCapture;
use crate::audio::capture::{run_microphone, MicrophoneRuntimeError};
use crate::audio::loopback::run_system_loopback;
use crate::audio::sink::AudioSink;
use crate::errors::{id, AppError};
use crate::realtime::Events;
use crate::types::{events, AudioLevel, Origin, SessionState, StartOptions, StatusUpdate};

const LEVEL_CHANNEL_CAPACITY: usize = 8;
/// Capture threads stop within a wake or two of their token being cancelled. One that has not
/// after this long is wedged in a driver call — an unplugged device can do that — and waiting
/// on would make the app impossible to quit.
const CAPTURE_JOIN_TIMEOUT: Duration = Duration::from_secs(3);

/// Which failure this is, for a capture failure on one source.
///
/// The microphone gets its own id on purpose. Under package identity Windows gates the
/// microphone per app, so a blocked install fails at device open with an ordinary cpal error
/// and nothing pointing at the toggle — see gate 6 in `docs/microsoft-store.md`. The
/// interface's wording for `MIC_CAPTURE` therefore names the privacy setting; the id covers a
/// denied device and an absent one alike, because cpal reports both the same way. The
/// underlying error rides along as the detail, so the real cause is still visible.
pub(super) fn source_failure(origin: Origin, error: &anyhow::Error) -> AppError {
    let detail = format!("{error:#}");
    match origin {
        Origin::Microphone if error.downcast_ref::<MicrophoneRuntimeError>().is_some() => {
            AppError::with(id::MIC_STREAM, detail)
        }
        Origin::Microphone => AppError::with(id::MIC_CAPTURE, detail),
        Origin::System => AppError::with(id::SYSTEM_CAPTURE, detail),
    }
}

/// Report a failure on the audio side of one source: log it, tell the operator which source
/// died, and stop that source's client. The other source, if any, stays live.
pub(super) fn report_source_failure(
    app: &AppHandle,
    origin: Origin,
    error: &anyhow::Error,
    cancel: &CancellationToken,
) {
    tracing::error!(?origin, "capture failed: {error:#}");
    cancel.cancel();
    let message = source_failure(origin, error);
    app.status(StatusUpdate::source(
        origin,
        SessionState::Error,
        Some(message),
    ));
}

/// Which devices a live source reads from. Sessions and the preflight test both go through
/// this, so the test opens exactly what a session would.
#[derive(Clone)]
pub(super) struct CaptureTarget {
    pub(super) mic_name: Option<String>,
    pub(super) system_id: Option<String>,
    pub(super) system_capture: SystemCapture,
}

impl CaptureTarget {
    pub(super) fn for_session(options: &StartOptions) -> Self {
        Self {
            mic_name: options
                .mic_device_id
                .clone()
                .or(options.mic_device_name.clone()),
            system_id: options.system_device_id.clone(),
            system_capture: options.system_capture.clone(),
        }
    }

    /// Capture `origin` on the calling thread until `cancel` fires or the device fails.
    pub(super) fn run(
        self,
        origin: Origin,
        target_rate: u32,
        level_tx: Sender<AudioLevel>,
        audio_tx: AudioSink,
        cancel: &CancellationToken,
    ) -> Result<()> {
        match origin {
            Origin::Microphone => run_microphone(
                self.mic_name.as_deref(),
                target_rate,
                level_tx,
                audio_tx,
                cancel,
            ),
            Origin::System => run_system_loopback(
                self.system_id,
                self.system_capture,
                target_rate,
                level_tx,
                audio_tx,
                cancel,
            ),
        }
    }
}

/// Forward meter readings to the interface until every producer has dropped its sender.
pub(super) fn spawn_level_forwarder(app: &AppHandle) -> Sender<AudioLevel> {
    let (level_tx, mut level_rx) = channel::<AudioLevel>(LEVEL_CHANNEL_CAPACITY);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(level) = level_rx.recv().await {
            let _ = app.emit(events::LEVEL, &level);
        }
    });
    level_tx
}

/// Join capture threads without blocking the async runtime, giving up after
/// `CAPTURE_JOIN_TIMEOUT`. `what` names them in the log.
pub(super) async fn join_threads(handles: Vec<JoinHandle<()>>, what: &'static str) {
    let joining = tauri::async_runtime::spawn_blocking(move || {
        for handle in handles {
            if handle.join().is_err() {
                tracing::warn!("{what} thread panicked while stopping");
            }
        }
    });
    match tokio::time::timeout(CAPTURE_JOIN_TIMEOUT, joining).await {
        Ok(Ok(())) => {}
        Ok(Err(error)) => tracing::warn!("{what} join task failed: {error}"),
        // Detached, not killed: the thread holds nothing a later session needs except possibly
        // its device, and a wedged driver call cannot be interrupted from here anyway.
        Err(_) => tracing::warn!(
            "{what} threads did not stop within {} seconds; leaving them behind",
            CAPTURE_JOIN_TIMEOUT.as_secs()
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::tests::options;

    #[test]
    fn device_open_failure_keeps_the_microphone_privacy_guidance() {
        let error = anyhow::Error::new(cpal::Error::new(cpal::ErrorKind::PermissionDenied));
        assert_eq!(
            source_failure(Origin::Microphone, &error).id,
            id::MIC_CAPTURE
        );
    }

    #[tokio::test(start_paused = true)]
    async fn a_wedged_capture_thread_cannot_hold_stop_forever() {
        let (release, wedged) = std::sync::mpsc::channel::<()>();
        let thread = std::thread::spawn(move || {
            let _ = wedged.recv();
        });
        let started = tokio::time::Instant::now();
        tokio::time::timeout(Duration::from_secs(60), join_threads(vec![thread], "test"))
            .await
            .expect("the join had no deadline");
        assert!(started.elapsed() >= CAPTURE_JOIN_TIMEOUT);
        // Lets the detached join finish.
        drop(release);
    }

    #[test]
    fn a_session_uses_the_device_id_before_the_device_name() {
        let mut start = options("microphone", None);
        start.mic_device_name = Some("Room mic".into());
        assert_eq!(
            CaptureTarget::for_session(&start).mic_name.as_deref(),
            Some("Room mic")
        );
        start.mic_device_id = Some("{0.0.1.00000000}".into());
        assert_eq!(
            CaptureTarget::for_session(&start).mic_name.as_deref(),
            Some("{0.0.1.00000000}")
        );
    }
}
