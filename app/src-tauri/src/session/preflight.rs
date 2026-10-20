//! The preflight level test: a session's capture path with every sample thrown away, so an
//! operator can check the devices before starting. It shares the session's lifecycle lock.

use std::thread::JoinHandle;

use anyhow::{Context, Result};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::channel;
use tokio_util::sync::CancellationToken;

use super::builder::AUDIO_CHANNEL_CAPACITY;
use super::capture::{join_threads, source_failure, spawn_level_forwarder, CaptureTarget};
use super::options::live_origins;
use super::{lock, SessionManager};
use crate::audio::applications::SystemCapture;
use crate::audio::AudioChunk;
use crate::types::{events, AudioSource, AudioTestUpdate, Origin};

/// The preflight test throws its audio away, and `audio/capture.rs` accumulates the level meter
/// over the mono signal *before* resampling, so this rate reaches nothing that can observe it.
/// It exists only because the capture path requires a target.
const TEST_SAMPLE_RATE: u32 = 16_000;

/// Level-only capture started from the preflight. No client tasks and no fixture tasks by
/// construction — that absence is the entire point of it.
pub(super) struct ActiveTest {
    cancel: CancellationToken,
    capture_threads: Vec<JoinHandle<()>>,
}

fn complete_probe(
    result: Result<()>,
    origin: Origin,
    cancel: &CancellationToken,
    publish: impl FnOnce(AudioTestUpdate),
) {
    if let Err(error) = result {
        tracing::error!(?origin, "audio test failed: {error:#}");
        cancel.cancel();
        publish(AudioTestUpdate {
            active: false,
            message: Some(source_failure(origin, &error)),
        });
    }
}

impl SessionManager {
    /// Level-only capture for the preflight, so an operator can confirm the room microphone or
    /// the loopback is actually producing sound before committing to a session.
    ///
    /// It opens the same devices a session would and then throws every sample away. There is no
    /// provider client, no caption, and nothing written anywhere, so it cannot bill and cannot
    /// leak room audio. Dropping the audio receiver is the whole mechanism: `audio/capture.rs`
    /// sees a closed channel, discards the chunk and carries on, while the level channel keeps
    /// flowing because levels are accumulated before the chunk is ever sent.
    pub async fn start_test(
        &self,
        app: &AppHandle,
        source: AudioSource,
        mic_device_name: Option<String>,
        system_device_id: Option<String>,
        system_capture: SystemCapture,
    ) -> Result<()> {
        let _lifecycle = self.lifecycle.lock().await;
        if lock(&self.active)
            .as_ref()
            .is_some_and(|session| session.sources.iter().any(|source| !source.is_cancelled()))
        {
            anyhow::bail!("A session is already running, so its meters are already live");
        }
        self.stop_test_active(app).await;
        // A failed provider may have left completed handles to join, but no live client.
        self.stop_active(app).await;

        if source != AudioSource::Microphone {
            crate::audio::applications::validate(&system_capture)?;
        }

        let cancel = CancellationToken::new();
        let cancel_guard = cancel.clone().drop_guard();
        let level_tx = spawn_level_forwarder(app);
        let capture = CaptureTarget {
            mic_name: mic_device_name,
            system_id: system_device_id,
            system_capture,
        };
        let mut capture_threads = Vec::new();
        let mut starters = Vec::new();

        for origin in live_origins(source) {
            let (audio_tx, audio_rx) = channel::<AudioChunk>(AUDIO_CHANNEL_CAPACITY);
            // The receiver is dropped immediately and deliberately: that is what makes this
            // level-only rather than a silent session.
            drop(audio_rx);

            let probe_app = app.clone();
            // A preflight is one test: failure on either source stops both devices.
            let probe_cancel = cancel.clone();
            let level_tx = level_tx.clone();
            let capture = capture.clone();
            let (start_tx, start_rx) = std::sync::mpsc::channel();
            let handle = std::thread::Builder::new()
                .name(format!("audio-test-{origin:?}"))
                .spawn(move || {
                    // Publish active before a fast device-open error can publish inactive.
                    // A failed thread spawn drops the senders and releases earlier workers.
                    if start_rx.recv().is_err() || probe_cancel.is_cancelled() {
                        return;
                    }
                    let result = capture.run(
                        origin,
                        TEST_SAMPLE_RATE,
                        level_tx,
                        audio_tx.into(),
                        &probe_cancel,
                    );
                    complete_probe(result, origin, &probe_cancel, |update| {
                        let _ = probe_app.emit(events::AUDIO_TEST, update);
                    });
                })
                .context("failed to spawn audio test thread")?;
            capture_threads.push(handle);
            starters.push(start_tx);
        }

        let cancel = cancel_guard.disarm();
        *lock(&self.active_test) = Some(ActiveTest {
            cancel,
            capture_threads,
        });
        let _ = app.emit(
            events::AUDIO_TEST,
            AudioTestUpdate {
                active: true,
                message: None,
            },
        );
        for starter in starters {
            let _ = starter.send(());
        }
        tracing::info!(?source, "audio test started");
        Ok(())
    }

    pub async fn stop_test(&self, app: &AppHandle) {
        let _lifecycle = self.lifecycle.lock().await;
        self.stop_test_active(app).await;
    }

    /// Releases the capture devices and joins the probe threads. Callers already hold
    /// `lifecycle`.
    pub(super) async fn stop_test_active(&self, app: &AppHandle) {
        let test = lock(&self.active_test).take();
        if let Some(test) = test {
            test.cancel.cancel();
            join_threads(test.capture_threads, "audio test").await;
            let _ = app.emit(
                events::AUDIO_TEST,
                AudioTestUpdate {
                    active: false,
                    message: None,
                },
            );
            tracing::info!("audio test stopped");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::capture::MicrophoneRuntimeError;
    use crate::errors::id;

    #[test]
    fn a_preflight_runtime_failure_stops_both_sources_and_reports_test_status() {
        let test = CancellationToken::new();
        let system = test.child_token();
        let error = anyhow::Error::new(MicrophoneRuntimeError(cpal::Error::new(
            cpal::ErrorKind::DeviceNotAvailable,
        )));
        let mut updates = Vec::new();
        complete_probe(Err(error), Origin::Microphone, &test, |update| {
            updates.push(update)
        });
        assert!(test.is_cancelled());
        assert!(system.is_cancelled());
        assert_eq!(updates.len(), 1);
        assert!(!updates[0].active);
        assert_eq!(updates[0].message.as_ref().unwrap().id, id::MIC_STREAM);
    }

    #[test]
    fn a_clean_preflight_stop_does_not_publish_a_failure() {
        let test = CancellationToken::new();
        complete_probe(Ok(()), Origin::System, &test, |_| {
            panic!("unexpected failure")
        });
    }
}
