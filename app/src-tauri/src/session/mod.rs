//! Session orchestration: one bounded audio pipeline and realtime client per source.
//!
//! This module owns the lifecycle — start, pause, stop — and what a running session holds.
//! `options` validates a start and decides its sources and caption languages, `settings`
//! resolves the provider and spawns its clients, `builder` wires each source's producer to
//! them, `capture` covers the devices, and `preflight` is the level-only test that shares the
//! lifecycle lock.

mod builder;
mod capture;
mod options;
mod preflight;
mod settings;

use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::Duration;

use anyhow::{Context, Result};
use futures_util::future::join_all;
use tauri::async_runtime::JoinHandle as AsyncJoinHandle;
use tauri::AppHandle;
use tokio::sync::watch;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;

use crate::errors::AppError;
use crate::realtime::Events;
use crate::secrets;
use crate::timing::SessionClock;
use crate::types::{Origin, SessionState, StartOptions, StatusUpdate};
use crate::whisper;
use builder::SessionBuilder;
use capture::{join_threads, spawn_level_forwarder, CaptureTarget};
use options::{session_origins, validate_start};
use preflight::ActiveTest;
use settings::ProviderSettings;

const CLIENT_DRAIN_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Default)]
pub struct SessionManager {
    /// Serializes concurrent start/stop commands so an older request cannot tear down a
    /// newly-started session.
    lifecycle: AsyncMutex<()>,
    active: Mutex<Option<ActiveSession>>,
    /// Preflight level test. Shares `lifecycle` with the session, so the two can never be
    /// holding the same capture device at once.
    active_test: Mutex<Option<ActiveTest>>,
    local_abort: Mutex<Option<CancellationToken>>,
}

struct ActiveSession {
    cancel: CancellationToken,
    local: bool,
    failure: Arc<Mutex<Option<AppError>>>,
    abort: CancellationToken,
    /// One per source, in the order `start` added them, so `set_paused` can zip the two.
    origins: Vec<Origin>,
    /// Every client holds a receiver; see `SessionManager::set_paused`.
    pause: watch::Sender<bool>,
    sources: Vec<CancellationToken>,
    capture_threads: Vec<JoinHandle<()>>,
    /// Timer-driven audio producers used by commercial-provider rehearsal playback.
    fixture_tasks: Vec<AsyncJoinHandle<()>>,
    /// With a second caption language, one relay per source copies its audio to both clients.
    relay_tasks: Vec<AsyncJoinHandle<()>>,
    client_tasks: Vec<AsyncJoinHandle<()>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Publish a pause or resume to every client. False when it changes nothing: an unchanged
/// value must wake no client, or a repeated Resume would cut a reconnect backoff short.
fn signal_pause(pause: &watch::Sender<bool>, paused: bool) -> bool {
    pause.send_if_modified(|current| std::mem::replace(current, paused) != paused)
}

impl SessionManager {
    pub async fn start(&self, app: &AppHandle, options: StartOptions) -> Result<()> {
        let _lifecycle = self.lifecycle.lock().await;
        self.stop_active(app).await;
        // A preflight test is holding the very devices this session is about to open.
        self.stop_test_active(app).await;
        validate_start(&options)?;

        let provider = options.provider;
        // The built-in demo and local Whisper start with no credential.
        // Credential Manager is a blocking call, and this holds the lifecycle lock: keep it off
        // the async workers that are pumping the other windows' events meanwhile.
        let api_key = if provider.requires_api_key() {
            tauri::async_runtime::spawn_blocking(move || secrets::resolve_api_key(provider))
                .await
                .context("keychain lookup did not complete")??
        } else {
            String::new()
        };
        let settings = ProviderSettings::resolve(provider)?;
        let local_model = if provider.is_local_whisper() {
            let app = app.clone();
            let model = options.whisper_model;
            Some(
                tauri::async_runtime::spawn_blocking(move || whisper::load(&app, model))
                    .await
                    .context("Whisper model loading stopped unexpectedly")??,
            )
        } else {
            None
        };

        let cancel = CancellationToken::new();
        let cancel_guard = cancel.clone().drop_guard();
        let abort = CancellationToken::new();
        if provider.is_local_whisper() {
            *lock(&self.local_abort) = Some(abort.clone());
        }
        let origins = session_origins(&options);
        let mut builder = SessionBuilder {
            app,
            options: &options,
            settings,
            api_key,
            capture: CaptureTarget::for_session(&options),
            target_rate: provider.input_sample_rate(),
            // One clock for the session, copied into every source, so the microphone and
            // system timelines agree in a transcript that interleaves them. See
            // `timing::SessionClock`.
            clock: SessionClock::start(),
            level_tx: spawn_level_forwarder(app),
            session: ActiveSession {
                cancel,
                local: provider.is_local_whisper(),
                failure: Arc::new(Mutex::new(None)),
                abort,
                origins: origins.clone(),
                pause: watch::Sender::new(false),
                sources: Vec::new(),
                capture_threads: Vec::new(),
                fixture_tasks: Vec::new(),
                relay_tasks: Vec::new(),
                client_tasks: Vec::new(),
            },
            local_model,
        };
        for &origin in &origins {
            if let Err(error) = builder.add_source(origin) {
                // The sources before this one are already capturing and connecting. Release
                // them as Stop would, so a failed start leaves no thread, task or token behind.
                // No Idle: the start reports its own failure, and a late Idle would clear it.
                self.shutdown(builder.session).await;
                return Err(error);
            }
        }

        cancel_guard.disarm();
        *lock(&self.active) = Some(builder.session);
        Ok(())
    }

    /// Pause or resume the running session. While paused every client closes its provider
    /// connection — so nothing is streamed or billed — and capture keeps metering, so the
    /// operator can see when the room starts talking again. Not behind the lifecycle lock: a
    /// pause is a signal to the clients, and must not wait out a start or stop.
    pub fn set_paused(&self, app: &AppHandle, paused: bool) -> Result<()> {
        let active = lock(&self.active);
        let session = active
            .as_ref()
            .filter(|session| session.sources.iter().any(|source| !source.is_cancelled()))
            .context("No session is running")?;
        if !signal_pause(&session.pause, paused) {
            return Ok(());
        }
        if session.local {
            for (origin, source) in session.origins.iter().zip(&session.sources) {
                if source.is_cancelled() {
                    continue;
                }
                let state = if paused {
                    SessionState::Paused
                } else {
                    SessionState::Running
                };
                app.status(StatusUpdate::source(*origin, state, None));
            }
        }
        Ok(())
    }

    /// Available while Stop owns the lifecycle lock and drains a long local backlog.
    pub fn discard_local_pending(&self) {
        if let Some(abort) = lock(&self.local_abort).as_ref() {
            abort.cancel();
        }
        if let Some(session) = lock(&self.active).as_ref().filter(|s| s.local) {
            session.cancel.cancel();
        }
    }

    pub async fn stop(&self, app: &AppHandle) {
        let _lifecycle = self.lifecycle.lock().await;
        self.stop_active(app).await;
    }

    async fn stop_active(&self, app: &AppHandle) {
        let session = lock(&self.active).take();
        if let Some(session) = session {
            let failure = session.failure.clone();
            self.shutdown(session).await;
            app.status(StatusUpdate::session(
                SessionState::Idle,
                lock(&failure).clone(),
            ));
            tracing::info!("session stopped");
        }
    }

    /// Cancel a session and wait for everything it started: capture, playback, relays and
    /// clients. Shared by Stop and by a start that failed part-way.
    async fn shutdown(&self, mut session: ActiveSession) {
        session.cancel.cancel();
        join_threads(session.capture_threads, "capture").await;

        // Rehearsal playback holds the producer end of its audio channel, and the client
        // below only sees the stream end once that is dropped — so drain it here, in the
        // same place the capture threads are joined.
        // A relay ends once its producer has: the capture threads are joined and the
        // rehearsal tasks are next, so this cannot wait on anything still running.
        for result in join_all(
            session
                .fixture_tasks
                .iter_mut()
                .chain(session.relay_tasks.iter_mut()),
        )
        .await
        {
            if let Err(error) = result {
                tracing::warn!("rehearsal playback task failed: {error}");
            }
        }

        // Providers may emit their last transcript while flushing. Do not report Idle
        // (or start a replacement session) until that bounded drain has completed.
        if session.local {
            // Local Stop is an EOF, not cancellation of inference. Do not truncate the
            // transcript at the cloud client's five-second shutdown deadline.
            for result in join_all(session.client_tasks.iter_mut()).await {
                if let Err(error) = result {
                    tracing::warn!("local transcription task failed: {error}");
                }
            }
            *lock(&self.local_abort) = None;
        } else if tokio::time::timeout(
            CLIENT_DRAIN_TIMEOUT,
            join_all(session.client_tasks.iter_mut()),
        )
        .await
        .is_err()
        {
            tracing::warn!("realtime clients did not finish graceful shutdown in time");
            for task in &session.client_tasks {
                task.abort();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A Gemini start captioning in French from `source`, shared by the submodules' tests.
    pub(super) fn options(source: &str, rehearsal: Option<&str>) -> StartOptions {
        serde_json::from_value(serde_json::json!({
            "source": source,
            "targetLanguage": "fr",
            "provider": "gemini",
            "rehearsal": rehearsal,
        }))
        .unwrap()
    }

    #[test]
    fn an_unchanged_pause_wakes_no_client() {
        let pause = watch::Sender::new(false);
        let mut client = pause.subscribe();
        assert!(!signal_pause(&pause, false));
        assert!(
            !client.has_changed().unwrap(),
            "a redundant Resume woke a client"
        );

        assert!(signal_pause(&pause, true));
        assert!(client.has_changed().unwrap());
        assert!(*client.borrow_and_update());
        assert!(!signal_pause(&pause, true));
        assert!(!client.has_changed().unwrap());
    }
}
