//! The device side of a source, shared by sessions and the preflight test: which devices it
//! opens, its level meter, joining its threads at Stop, and how a failure reaches the operator.

use std::thread::JoinHandle;
use std::time::Duration;

use anyhow::Result;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{channel, Sender};
use tokio_util::sync::CancellationToken;

use crate::audio::applications::{ProcessIdentity, SystemCapture};
use crate::audio::backend::{
    publish_status, CaptureBackend, CapturePhase, CaptureScope, CaptureStatus,
};
use crate::audio::capture::{run_microphone, MicrophoneRuntimeError};
use crate::audio::loopback::run_system_loopback;
use crate::audio::sink::AudioSink;
use crate::errors::{id, AppError};
use crate::realtime::Events;
use crate::types::{events, AudioLevel, Origin, SessionState, StartOptions, StatusUpdate};

const LEVEL_CHANNEL_CAPACITY: usize = 8;
const STATUS_CHANNEL_CAPACITY: usize = 8;
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

/// The microphone backend. Device choice, format conversion and metering remain in
/// `audio::capture`; no provider or UI type enters this module.
struct MicrophoneBackend {
    device_name: Option<String>,
}

impl CaptureBackend for MicrophoneBackend {
    fn status(&self) -> CaptureStatus {
        CaptureStatus::new(Origin::Microphone, CaptureScope::Microphone)
            .with_optional_device_name(self.device_name.clone())
    }

    fn run(
        self: Box<Self>,
        target_rate: u32,
        level_tx: Sender<AudioLevel>,
        audio_tx: AudioSink,
        status_tx: Option<&Sender<CaptureStatus>>,
        cancel: &CancellationToken,
    ) -> Result<()> {
        run_microphone(
            self.device_name.as_deref(),
            target_rate,
            level_tx,
            audio_tx,
            status_tx,
            cancel,
        )
    }
}

/// The whole render-endpoint mix. The friendly endpoint name is filled in by the backend
/// once it opens the device; the endpoint ID alone is not a user-facing device name.
struct OutputBackend {
    device_id: Option<String>,
}

impl CaptureBackend for OutputBackend {
    fn status(&self) -> CaptureStatus {
        CaptureStatus::new(Origin::System, CaptureScope::DeviceMix)
    }

    fn run(
        self: Box<Self>,
        target_rate: u32,
        level_tx: Sender<AudioLevel>,
        audio_tx: AudioSink,
        status_tx: Option<&Sender<CaptureStatus>>,
        cancel: &CancellationToken,
    ) -> Result<()> {
        run_system_loopback(
            self.device_id.clone(),
            SystemCapture::Output,
            target_rate,
            level_tx,
            audio_tx,
            status_tx,
            cancel,
        )
    }
}

/// One application's process tree. `None` is preserved rather than defaulted to the device
/// mix: an application scope without a selection is a validation error, never system audio.
struct ApplicationBackend {
    process: Option<ProcessIdentity>,
}

impl CaptureBackend for ApplicationBackend {
    fn status(&self) -> CaptureStatus {
        CaptureStatus::new(Origin::System, CaptureScope::Application)
            .with_process(self.process.clone())
    }

    fn run(
        self: Box<Self>,
        target_rate: u32,
        level_tx: Sender<AudioLevel>,
        audio_tx: AudioSink,
        status_tx: Option<&Sender<CaptureStatus>>,
        cancel: &CancellationToken,
    ) -> Result<()> {
        run_system_loopback(
            None,
            SystemCapture::Application {
                process: self.process.clone(),
            },
            target_rate,
            level_tx,
            audio_tx,
            status_tx,
            cancel,
        )
    }
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

    /// Pick the backend without exposing cpal or WASAPI to the caller.
    fn backend(&self, origin: Origin) -> Box<dyn CaptureBackend> {
        match origin {
            Origin::Microphone => Box::new(MicrophoneBackend {
                device_name: self.mic_name.clone(),
            }),
            Origin::System => match &self.system_capture {
                SystemCapture::Output => Box::new(OutputBackend {
                    device_id: self.system_id.clone(),
                }),
                SystemCapture::Application { process } => Box::new(ApplicationBackend {
                    process: process.clone(),
                }),
            },
        }
    }

    /// Capture `origin` on the calling thread until `cancel` fires or the device fails.
    /// Status is best-effort: a full channel drops an update rather than stalling audio.
    pub(super) fn run(
        self,
        origin: Origin,
        target_rate: u32,
        level_tx: Sender<AudioLevel>,
        audio_tx: AudioSink,
        status_tx: Option<&Sender<CaptureStatus>>,
        cancel: &CancellationToken,
    ) -> Result<()> {
        let backend = self.backend(origin);
        let starting = backend.status();
        publish_status(status_tx, &starting);

        let result = backend.run(target_rate, level_tx, audio_tx, status_tx, cancel);

        let mut finished = starting;
        finished.phase = if result.is_ok() {
            CapturePhase::Stopped
        } else {
            CapturePhase::Error
        };
        finished.message = result.as_ref().err().map(|error| format!("{error:#}"));
        publish_status(status_tx, &finished);
        result
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

/// Forward capture status to the interface until every producer has dropped its sender.
pub(super) fn spawn_status_forwarder(app: &AppHandle) -> Sender<CaptureStatus> {
    let (status_tx, mut status_rx) = channel::<CaptureStatus>(STATUS_CHANNEL_CAPACITY);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(status) = status_rx.recv().await {
            let _ = app.emit(events::CAPTURE_STATUS, &status);
        }
    });
    status_tx
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

    #[test]
    fn capture_scopes_are_explicit_and_backend_agnostic() {
        let output = CaptureTarget::for_session(&options("system", None));
        let output = output.backend(Origin::System).status();
        assert_eq!(output.scope, CaptureScope::DeviceMix);
        assert!(output.device_name.is_none());

        let microphone = CaptureTarget::for_session(&options("microphone", None));
        assert_eq!(
            microphone.backend(Origin::Microphone).status().scope,
            CaptureScope::Microphone
        );

        let mut application = options("system", None);
        application.system_capture = SystemCapture::Application {
            process: Some(ProcessIdentity {
                pid: 42,
                created_at: "1".into(),
            }),
        };
        let application = CaptureTarget::for_session(&application)
            .backend(Origin::System)
            .status();
        assert_eq!(application.scope, CaptureScope::Application);
        assert_eq!(application.process.unwrap().pid, 42);
        assert!(application.device_name.is_none());
    }
}
