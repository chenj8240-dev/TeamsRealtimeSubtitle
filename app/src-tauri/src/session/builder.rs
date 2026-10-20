//! Wiring one session's sources while `start` spawns them: each source's producer, its audio
//! channel, and the client — or, with a second caption language, the relay and two clients —
//! reading it.

use std::sync::Arc;

use anyhow::{Context, Result};
use tauri::async_runtime::JoinHandle as AsyncJoinHandle;
use tauri::AppHandle;
use tokio::sync::mpsc::{channel, error::TrySendError, Receiver, Sender};
use tokio_util::sync::CancellationToken;

use super::capture::{report_source_failure, CaptureTarget};
use super::options::caption_languages;
use super::settings::ProviderSettings;
use super::ActiveSession;
use crate::audio::fixture::run_rehearsal;
use crate::audio::sink::{AudioSink, CaptureCompletion};
use crate::audio::AudioChunk;
use crate::realtime::{run_session, PauseRx, RealtimeProtocol};
use crate::timing::SessionClock;
use crate::types::{AudioLevel, Origin, Provider, StartOptions, TargetLanguage};
use crate::whisper::{self, spool::Spool, LoadedModel, LocalSession};

/// At most half a second of 100 ms chunks. The realtime consumer coalesces queued chunks
/// to the newest one after a stall, favoring live latency over replaying stale speech.
pub(super) const AUDIO_CHANNEL_CAPACITY: usize = 5;

/// Copy one source's audio to each of its caption-language clients. Never blocks on either:
/// a client that has fallen behind drops chunks on its own queue, as a lone client would at
/// the producer's. Ends when the producer does, once every client has gone — and then
/// cancels the source, which stops its capture — or when the source is cancelled, so Stop
/// never waits on a capture thread that is wedged and still holds the producer end.
async fn relay_audio(
    mut input: Receiver<AudioChunk>,
    outputs: Vec<Sender<AudioChunk>>,
    source: CancellationToken,
) {
    let _stop_capture = source.clone().drop_guard();
    while let Some(chunk) = tokio::select! {
        _ = source.cancelled() => None,
        chunk = input.recv() => chunk,
    } {
        let mut open = 0;
        for output in &outputs {
            if !matches!(output.try_send(chunk.clone()), Err(TrySendError::Closed(_))) {
                open += 1;
            }
        }
        if open == 0 {
            break;
        }
    }
}

/// The per-source plumbing every client gets, whichever provider it speaks.
pub(super) struct ClientIo {
    pub(super) app: AppHandle,
    pub(super) origin: Origin,
    /// Which of the session's caption languages this client produces; see `Caption::lane`.
    lane: u8,
    pub(super) audio_rx: Receiver<AudioChunk>,
    pub(super) cancel: CancellationToken,
    pub(super) clock: SessionClock,
    pub(super) pause: PauseRx,
}

impl ClientIo {
    pub(super) fn spawn_realtime<P: RealtimeProtocol + Send + 'static>(
        self,
        proto: P,
    ) -> AsyncJoinHandle<()> {
        tauri::async_runtime::spawn(run_session(
            self.app,
            proto,
            self.audio_rx,
            self.cancel,
            self.clock,
            self.pause,
            self.lane,
        ))
    }
}

/// Collects one session's sources while `start` spawns them.
pub(super) struct SessionBuilder<'a> {
    pub(super) app: &'a AppHandle,
    pub(super) options: &'a StartOptions,
    pub(super) settings: ProviderSettings,
    pub(super) api_key: String,
    pub(super) capture: CaptureTarget,
    pub(super) target_rate: u32,
    pub(super) clock: SessionClock,
    pub(super) level_tx: Sender<AudioLevel>,
    pub(super) session: ActiveSession,
    pub(super) local_model: Option<Arc<LoadedModel>>,
}

impl SessionBuilder<'_> {
    pub(super) fn add_source(&mut self, origin: Origin) -> Result<()> {
        if self.options.provider.is_local_whisper() {
            return self.add_local_source(origin);
        }
        let (audio_tx, audio_rx) = channel::<AudioChunk>(AUDIO_CHANNEL_CAPACITY);
        let cancel = self.session.cancel.child_token();
        self.session.sources.push(cancel.clone());
        self.spawn_producer(origin, audio_tx.into(), &cancel)?;

        let targets = caption_languages(self.options);
        if targets.len() == 1 {
            // One language: the client reads the producer directly and owns the source's
            // token, so its end stops the capture, as it always has.
            return self.add_client(origin, 0, targets[0], audio_rx, cancel);
        }
        // Two languages: each client gets its own copy of the audio and a child token, so
        // one failing leaves the other captioning. The relay stops the capture when both
        // have gone.
        let mut outputs = Vec::with_capacity(targets.len());
        for (lane, target) in (0u8..).zip(targets) {
            let (lane_tx, lane_rx) = channel::<AudioChunk>(AUDIO_CHANNEL_CAPACITY);
            outputs.push(lane_tx);
            self.add_client(origin, lane, target, lane_rx, cancel.child_token())?;
        }
        self.session
            .relay_tasks
            .push(tauri::async_runtime::spawn(relay_audio(
                audio_rx, outputs, cancel,
            )));
        Ok(())
    }

    fn add_client(
        &mut self,
        origin: Origin,
        lane: u8,
        target: TargetLanguage,
        audio_rx: Receiver<AudioChunk>,
        cancel: CancellationToken,
    ) -> Result<()> {
        let io = ClientIo {
            app: self.app.clone(),
            origin,
            lane,
            audio_rx,
            cancel,
            clock: self.clock,
            pause: self.session.pause.subscribe(),
        };
        let client = self.settings.spawn_client(io, &self.api_key, target)?;
        self.session.client_tasks.push(client);
        Ok(())
    }

    fn add_local_source(&mut self, origin: Origin) -> Result<()> {
        // Thirty seconds of scheduling slack for the disk writer. Inference never consumes
        // this queue; it reads its own spool and may lag by much longer without losing audio.
        let (sender, input) = channel(300);
        let spool = Arc::new(Spool::new()?);
        let cancel = self.session.cancel.child_token();
        self.session.sources.push(cancel.clone());
        let sink = AudioSink::Local {
            sender,
            spool: spool.clone(),
            clock: self.clock,
            pause: self.session.pause.subscribe(),
            cancel: cancel.clone(),
        };
        self.spawn_producer(origin, sink, &cancel)?;
        let model = self
            .local_model
            .clone()
            .context("Whisper model was not loaded")?;
        self.session
            .client_tasks
            .push(tauri::async_runtime::spawn(whisper::run(LocalSession {
                app: self.app.clone(),
                model,
                language: self.options.spoken_language.clone(),
                // The only difference between the two Whisper providers.
                translate: self.options.provider.can_translate(),
                origin,
                input,
                spool,
                capture_cancel: cancel,
                abort: self.session.abort.clone(),
                failure: self.session.failure.clone(),
            })));
        Ok(())
    }

    /// Start whatever feeds one source's audio channel.
    fn spawn_producer(
        &mut self,
        origin: Origin,
        audio_tx: AudioSink,
        cancel: &CancellationToken,
    ) -> Result<()> {
        if self.options.provider == Provider::OnDevice {
            // The deterministic demo emits its own level/caption timeline and never opens a
            // capture device. Close the unused producer immediately.
            drop(audio_tx);
            return Ok(());
        }

        let app = self.app.clone();
        let mut capture_completion = audio_tx.completion_guard();
        let level_tx = self.level_tx.clone();
        let target_rate = self.target_rate;
        let cancel = cancel.clone();
        match self.options.rehearsal {
            // Rehearsal swaps the capture device for a bundled recording and changes nothing
            // else: same channel, same chunk shape, same engine below it.
            Some(language) => {
                self.session
                    .fixture_tasks
                    .push(tauri::async_runtime::spawn(async move {
                        let result = run_rehearsal(
                            &app,
                            language,
                            target_rate,
                            level_tx,
                            audio_tx,
                            cancel.clone(),
                        )
                        .await;
                        finish_producer(result, capture_completion.as_mut(), &app, origin, &cancel);
                    }));
            }
            None => {
                let capture = self.capture.clone();
                let handle = std::thread::Builder::new()
                    .name(format!("capture-{origin:?}"))
                    .spawn(move || {
                        let result = capture.run(origin, target_rate, level_tx, audio_tx, &cancel);
                        finish_producer(result, capture_completion.as_mut(), &app, origin, &cancel);
                    })
                    .context("failed to spawn capture thread")?;
                self.session.capture_threads.push(handle);
            }
        }
        Ok(())
    }
}

/// Settle how a producer — capture thread or rehearsal playback — ended. A local source
/// records the outcome on its spool, where the transcriber picks it up and reports it, so a
/// failure only has to stop that source's capture here. A realtime source has no such reader,
/// so its failure goes to the operator directly. The caller keeps the completion guard, so the
/// local input closes only after this has run.
fn finish_producer(
    result: Result<()>,
    completion: Option<&mut CaptureCompletion>,
    app: &AppHandle,
    origin: Origin,
    cancel: &CancellationToken,
) {
    let local = completion.is_some();
    if let Some(completion) = completion {
        completion.finish(result.as_ref().err().map(|e| format!("{e:#}")));
    }
    if let Err(error) = result {
        if local {
            cancel.cancel();
        } else {
            report_source_failure(app, origin, &error, cancel);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    fn chunk(tag: u8) -> AudioChunk {
        AudioChunk { pcm_le: vec![tag] }
    }

    #[tokio::test]
    async fn the_relay_copies_each_chunk_to_both_languages_and_outlives_one_of_them() {
        let (input_tx, input_rx) = channel(8);
        let (first_tx, mut first) = channel(8);
        let (second_tx, second) = channel(8);
        let source = CancellationToken::new();
        let relay = tokio::spawn(relay_audio(
            input_rx,
            vec![first_tx, second_tx],
            source.clone(),
        ));

        input_tx.send(chunk(1)).await.unwrap();
        drop(second);
        input_tx.send(chunk(2)).await.unwrap();
        assert_eq!(first.recv().await.unwrap().pcm_le, [1]);
        assert_eq!(first.recv().await.unwrap().pcm_le, [2]);
        assert!(!source.is_cancelled(), "one language is still captioning");

        // The last client gone: the relay ends and stops the capture.
        drop(first);
        input_tx.send(chunk(3)).await.unwrap();
        tokio::time::timeout(Duration::from_secs(1), relay)
            .await
            .unwrap()
            .unwrap();
        assert!(source.is_cancelled());
    }

    #[tokio::test]
    async fn the_relay_ends_when_its_source_is_stopped_even_if_capture_has_not() {
        let (_wedged_capture, input_rx) = channel(8);
        let (lane_tx, _lane) = channel(8);
        let source = CancellationToken::new();
        let relay = tokio::spawn(relay_audio(input_rx, vec![lane_tx], source.clone()));
        source.cancel();
        tokio::time::timeout(Duration::from_secs(1), relay)
            .await
            .expect("Stop waited on the capture thread")
            .unwrap();
    }
}
