//! Capture contract shared by live sessions and the preflight test.
//!
//! One backend owns one capture range: a microphone, a render-endpoint mix, or one
//! application's process tree. It receives a bounded `AudioSink` and a cancellation token,
//! and it never writes WAV/MP3 recordings or parses provider messages. The types here
//! deliberately contain no cpal/WASAPI items, so the interface and the front-end stay
//! backend-agnostic.
//!
//! Pause/resume remains a session concern: while paused, capture and metering continue and
//! only the provider clients stop (see `SessionManager::set_paused`). That is the existing
//! default behaviour; a backend is not asked to stop reading on Pause.

use anyhow::Result;
use serde::Serialize;
use tokio::sync::mpsc::Sender;
use tokio_util::sync::CancellationToken;

use crate::audio::applications::ProcessIdentity;
use crate::audio::sink::AudioSink;
use crate::types::{AudioLevel, Origin};

/// What a backend captures. `DeviceMix` is the whole output endpoint; `Application` is one
/// process tree; `Microphone` is an input endpoint. These are the only scope names the UI
/// should ever see.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureScope {
    Microphone,
    DeviceMix,
    Application,
}

/// Sample encoding without naming a platform API.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureEncoding {
    Float,
    Int,
    Unknown,
}

/// The endpoint's format as the generic contract describes it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub encoding: CaptureEncoding,
}

impl CaptureFormat {
    #[must_use]
    pub const fn new(
        sample_rate: u32,
        channels: u16,
        bits_per_sample: u16,
        encoding: CaptureEncoding,
    ) -> Self {
        Self {
            sample_rate,
            channels,
            bits_per_sample,
            encoding,
        }
    }
}

/// Capture lifecycle. `Silent` is reserved for the VAD in T04; current live backends emit
/// Starting, Active, Stopped and Error. Session pause is separate (see the module docs).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CapturePhase {
    Starting,
    Active,
    #[allow(
        dead_code,
        reason = "T04 VAD will emit Silent; keeping the state in the capture contract"
    )]
    Silent,
    Stopped,
    Error,
}

/// One capture source's public state: what is captured, from where, in what format, and how
/// it is doing. This is the payload of the `capture-status` event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub origin: Origin,
    pub scope: CaptureScope,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process: Option<ProcessIdentity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<CaptureFormat>,
    pub phase: CapturePhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl CaptureStatus {
    #[must_use]
    pub fn new(origin: Origin, scope: CaptureScope) -> Self {
        Self {
            origin,
            scope,
            device_name: None,
            process: None,
            format: None,
            phase: CapturePhase::Starting,
            message: None,
        }
    }

    #[must_use]
    pub fn with_device_name(mut self, device_name: impl Into<String>) -> Self {
        self.device_name = Some(device_name.into());
        self
    }

    #[must_use]
    pub fn with_optional_device_name(mut self, device_name: Option<String>) -> Self {
        self.device_name = device_name;
        self
    }

    #[must_use]
    pub fn with_process(mut self, process: Option<ProcessIdentity>) -> Self {
        self.process = process;
        self
    }

    #[must_use]
    pub fn with_format(mut self, format: CaptureFormat) -> Self {
        self.format = Some(format);
        self
    }

    #[must_use]
    pub fn with_phase(mut self, phase: CapturePhase) -> Self {
        self.phase = phase;
        self
    }
}

/// Publish a status without blocking the capture thread. A full queue drops the update;
/// the next state, or the session's own status, is authoritative.
pub fn publish_status(tx: Option<&Sender<CaptureStatus>>, status: &CaptureStatus) {
    if let Some(tx) = tx {
        let _ = tx.try_send(status.clone());
    }
}

/// One capture backend. Implementations do device work on their own thread and return
/// promptly after `cancel` fires; the session joins that thread with a bounded timeout.
pub trait CaptureBackend: Send {
    /// Descriptor before a device is opened. `format` is unknown here and `phase` is
    /// normally Starting; the backend fills both in when the stream is live.
    fn status(&self) -> CaptureStatus;

    fn run(
        self: Box<Self>,
        target_rate: u32,
        level_tx: Sender<AudioLevel>,
        audio_tx: AudioSink,
        status_tx: Option<&Sender<CaptureStatus>>,
        cancel: &CancellationToken,
    ) -> Result<()>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_names_are_generic_and_stable() {
        assert_eq!(
            serde_json::to_string(&CaptureScope::Microphone).unwrap(),
            "\"microphone\""
        );
        assert_eq!(
            serde_json::to_string(&CaptureScope::DeviceMix).unwrap(),
            "\"deviceMix\""
        );
        assert_eq!(
            serde_json::to_string(&CaptureScope::Application).unwrap(),
            "\"application\""
        );
    }

    #[test]
    fn status_carries_scope_device_format_phase_and_process() {
        let status = CaptureStatus::new(Origin::System, CaptureScope::Application)
            .with_process(Some(ProcessIdentity {
                pid: 42,
                created_at: "123".into(),
            }))
            .with_format(CaptureFormat::new(48_000, 2, 32, CaptureEncoding::Float))
            .with_phase(CapturePhase::Active);
        let value = serde_json::to_value(&status).unwrap();
        assert_eq!(value["scope"], "application");
        assert_eq!(value["process"]["pid"], 42);
        assert_eq!(value["format"]["sampleRate"], 48_000);
        assert_eq!(value["format"]["channels"], 2);
        assert_eq!(value["format"]["bitsPerSample"], 32);
        assert_eq!(value["format"]["encoding"], "float");
        assert_eq!(value["phase"], "active");
        assert!(value.get("deviceName").is_none());
        assert!(value.get("message").is_none());
    }

    #[test]
    fn phases_include_active_silent_and_error() {
        for (phase, name) in [
            (CapturePhase::Active, "active"),
            (CapturePhase::Silent, "silent"),
            (CapturePhase::Error, "error"),
        ] {
            assert_eq!(
                serde_json::to_string(&phase).unwrap(),
                format!("\"{name}\"")
            );
        }
    }

    #[test]
    fn status_delivery_drops_instead_of_blocking_a_full_queue() {
        let (tx, mut rx) = tokio::sync::mpsc::channel(1);
        let status = CaptureStatus::new(Origin::Microphone, CaptureScope::Microphone);
        publish_status(Some(&tx), &status);
        publish_status(Some(&tx), &status);
        assert!(rx.try_recv().is_ok());
        assert!(rx.try_recv().is_err());
    }
}
