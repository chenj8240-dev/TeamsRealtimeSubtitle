//! Shared realtime WebSocket runner for translation and transcription providers.
//! It owns bounded audio consumption, connection timeouts, graceful shutdown, transcript
//! turn bookkeeping, and reconnect backoff so provider modules only describe their wire format.
//!
//! `run_session` is the loop; `policy` decides what follows each connection (pure, so pause,
//! handover and backoff are unit-tested), and `socket` opens, pumps and closes one connection.
//! `wire` is for the providers: the pieces of a protocol more than one of them speaks.

mod policy;
mod socket;
#[cfg(test)]
mod tests;
mod wire;

use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::Receiver;
use tokio::sync::watch;
use tokio::time::Instant;
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_util::sync::CancellationToken;

use crate::audio::AudioChunk;
use crate::errors::{id, AppError};
use crate::timing::SessionClock;
use crate::types::{events, Caption, Origin, SessionState, StatusUpdate};
use policy::{After, Reconnect, RunEnd};
use socket::SocketIo;
pub use wire::{bearer_request, parse_or_log};

/// Whether the operator has paused the session. One sender per session, a receiver per client.
pub type PauseRx = watch::Receiver<bool>;

/// Where a client's captions and statuses go. The app's `AppHandle` in production; the runner
/// tests record them instead, so the state machine runs without Tauri. The demonstration and
/// Whisper report their statuses through it too, so a status is emitted in one place.
pub trait Events: Send + Sync {
    fn caption(&self, caption: Caption<'_>);
    fn status(&self, update: StatusUpdate);
}

impl Events for AppHandle {
    fn caption(&self, caption: Caption<'_>) {
        let _ = self.emit(events::CAPTION, caption);
    }

    fn status(&self, update: StatusUpdate) {
        let _ = self.emit(events::STATUS, update);
    }
}

/// Wait until the session is no longer paused. False when it ends first — stopped, or its
/// pause sender dropped with the session.
pub async fn wait_for_resume(pause: &mut PauseRx, cancel: &CancellationToken) -> bool {
    loop {
        if !*pause.borrow_and_update() {
            return true;
        }
        tokio::select! {
            _ = cancel.cancelled() => return false,
            changed = pause.changed() => if changed.is_err() { return false; },
        }
    }
}

pub struct TurnAccumulator {
    pub id: u64,
    /// The caption language this accumulator's captions are in; see `Caption::lane`. Fixed
    /// for its life: a client produces one lane.
    lane: u8,
    /// Source-language text for the operator's monitor, from providers that send it.
    pub source: String,
    /// The caption itself, whatever the provider makes: a translation from Live Translate and
    /// OpenAI, a same-language transcript from Transcribe Live and Mistral.
    pub text: String,
    /// Shared with every other source in this session, so their captions land on one
    /// timeline. Lives here because the accumulator is the thing that outlives a reconnect.
    clock: SessionClock,
    /// When this turn first had any text, in ms since the session started. `None` until the
    /// first caption is emitted for it — see `emit_caption`.
    started_ms: Option<u64>,
}

impl TurnAccumulator {
    pub fn new(clock: SessionClock, lane: u8) -> Self {
        Self {
            id: 0,
            lane,
            source: String::new(),
            text: String::new(),
            clock,
            started_ms: None,
        }
    }

    pub fn next_turn(&mut self) {
        self.id += 1;
        self.source.clear();
        self.text.clear();
        self.started_ms = None;
    }

    pub fn is_empty(&self) -> bool {
        self.source.is_empty() && self.text.is_empty()
    }
}

#[derive(Debug, Default)]
pub enum MessageControl {
    #[default]
    Continue,
    Reconnect,
    /// The provider announced that it is about to close a healthy connection (Gemini's
    /// `goAway` ahead of its session cap). A planned move rather than a failure: reconnect at
    /// once, without backoff, and send the audio that queued up while the new socket opened.
    Handover,
    Fatal(String),
    /// The provider has finished with this session. During a close drain that is the end of
    /// the drain; mid-stream the runner treats it as a `Handover`, because only the operator's
    /// Stop ends a source.
    Closed,
}

/// What a provider message did to the current turn. The runner turns this into a caption
/// event, so handlers only update the accumulator and never need an `AppHandle`.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum CaptionUpdate {
    #[default]
    None,
    /// The turn changed and is still open.
    Interim,
    /// The turn is complete: emit it as final, then start the next one.
    Final,
}

/// What else a provider message told the runner, besides its caption and control. One message
/// never says both: a setup acknowledgement carries no text.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum Signal {
    #[default]
    None,
    /// The provider accepted the session setup, so audio may follow. Read only while the
    /// runner waits for it; see `RealtimeProtocol::wait_for_setup_complete`.
    SetupComplete,
    /// New target-language text, which restarts the provider's idle-finalize timer (see
    /// `RealtimeProtocol::finalize_after`). Source text alone does not count: it can lead the
    /// translation by seconds, and would finalize a turn before its translation arrived.
    TranscriptActivity,
}

#[derive(Debug, Default)]
pub struct MessageOutcome {
    pub caption: CaptionUpdate,
    pub signal: Signal,
    pub control: MessageControl,
}

impl MessageOutcome {
    pub fn caption(caption: CaptionUpdate) -> Self {
        Self {
            caption,
            ..Self::default()
        }
    }

    /// A caption update that also counts as target-text activity, which restarts the
    /// provider's idle-finalize timer.
    pub fn activity(caption: CaptionUpdate) -> Self {
        Self {
            caption,
            signal: Signal::TranscriptActivity,
            ..Self::default()
        }
    }

    pub fn setup_complete() -> Self {
        Self {
            signal: Signal::SetupComplete,
            ..Self::default()
        }
    }

    pub fn control(control: MessageControl) -> Self {
        Self {
            control,
            ..Self::default()
        }
    }
}

pub trait RealtimeProtocol {
    const NAME: &'static str;

    fn origin(&self) -> Origin;
    fn connect_request(&self) -> anyhow::Result<Request>;
    fn setup_json(&self) -> anyhow::Result<String>;
    fn audio_json(&self, base64_pcm: String) -> anyhow::Result<String>;

    /// Whether this provider requires an explicit setup acknowledgement before accepting
    /// audio. Gemini's Live API contract requires clients to wait for `setupComplete`.
    fn wait_for_setup_complete(&self) -> bool {
        false
    }

    /// Provider frames used to flush pending audio before the socket is closed.
    fn closing_json(&self) -> anyhow::Result<Vec<String>> {
        Ok(Vec::new())
    }

    /// Whether this message, read during a close drain, is the provider's own signal that it
    /// has flushed everything the closing frames asked for. Without one the drain lasts until
    /// the provider closes or the safety timeout, so every Pause and Stop would wait it out.
    fn drain_complete(&self, _outcome: &MessageOutcome) -> bool {
        false
    }

    /// Parse one server message into `acc`. Pure: the runner emits whatever caption the
    /// returned outcome asks for, and advances the turn after a final one.
    fn handle_message(&mut self, text: &str, acc: &mut TurnAccumulator) -> MessageOutcome;

    fn finalize_after(&self) -> Option<Duration> {
        None
    }
}

pub async fn run_session<P: RealtimeProtocol, E: Events>(
    events: E,
    mut proto: P,
    mut audio_rx: Receiver<AudioChunk>,
    cancel: CancellationToken,
    clock: SessionClock,
    mut pause: PauseRx,
    lane: u8,
) {
    // Aborting a client task must release its producer too. Normal terminal exits below
    // also finalize text before reporting that the source has ended.
    let _capture_guard = cancel.clone().drop_guard();
    let origin = proto.origin();
    let mut policy = Reconnect::new(origin);
    // Outside the connect loop, so turn ids and turn start times both survive a reconnect.
    let mut acc = TurnAccumulator::new(clock, lane);
    let mut terminal_error = None;

    while !cancel.is_cancelled() {
        // Paused before connecting: at the start, or after a connection closed for it.
        if *pause.borrow() {
            events.status(StatusUpdate::lane(origin, lane, SessionState::Paused, None));
            if !wait_for_resume(&mut pause, &cancel).await {
                break;
            }
            policy.resumed();
        }
        let plan = policy.connect();
        if let Some(state) = plan.status {
            events.status(StatusUpdate::lane(origin, lane, state, None));
        }
        if plan.drain_stale {
            drop_stale_audio(&mut audio_rx, origin);
        }

        let connected_at = Instant::now();
        let io = SocketIo {
            events: &events,
            audio_rx: &mut audio_rx,
            cancel: &cancel,
            pause: &mut pause,
        };
        let end = socket::connect_and_run(io, &mut proto, &mut acc, plan.catch_up).await;
        let next = policy.after(&end, connected_at.elapsed());
        match end {
            RunEnd::Stopped => {}
            RunEnd::Paused => {
                tracing::info!(?origin, "{} paused; connection closed", P::NAME);
            }
            RunEnd::Fatal(message) => {
                tracing::error!(?origin, provider = P::NAME, %message, "provider stopped the session");
                // The provider's own wording, which is not ours to translate; the interface
                // frames it and prints it verbatim.
                let detail = format!("{} — {message}", P::NAME);
                terminal_error = Some(AppError::with(id::PROVIDER_STOPPED, detail));
            }
            RunEnd::Rejected(status) => {
                terminal_error = Some(AppError::with(
                    id::PROVIDER_REJECTED,
                    format!("{} — HTTP {status}", P::NAME),
                ));
            }
            RunEnd::Reconnect => {
                tracing::warn!(?origin, "{} stream closed; reconnecting", P::NAME);
            }
            RunEnd::Handover => {
                tracing::info!(
                    ?origin,
                    planned = next == After::Now,
                    "{} asked to move the session; reconnecting",
                    P::NAME
                );
            }
            RunEnd::Failed(error) => {
                tracing::error!(?origin, "{} stream error: {error:#}", P::NAME);
                events.status(StatusUpdate::lane(
                    origin,
                    lane,
                    SessionState::Reconnecting,
                    Some(AppError::with(id::PROVIDER_RECONNECTING, error)),
                ));
            }
        }
        if next == After::Stop {
            break;
        }

        finalize_accumulator(&events, origin, &mut acc);
        if cancel.is_cancelled() {
            break;
        }
        // Waiting out a backoff after a handover is what used to turn Gemini's ten-minute cap
        // into a caption gap: every second of it was speech dropped before the next connect.
        if let After::Backoff(wait) = next {
            // A pause during the backoff ends the wait; the top of the loop then holds the
            // source until it resumes, rather than reconnecting only to close again.
            tokio::select! {
                _ = cancel.cancelled() => break,
                _ = tokio::time::sleep(wait) => {}
                Ok(()) = pause.changed() => {}
            }
        }
    }

    // A cancellation originating in capture already carries its own error. Do not
    // overwrite it with Idle; whole-session Stop publishes Idle after the drain.
    let report_idle = !cancel.is_cancelled();
    finish_source(
        &cancel,
        || finalize_accumulator(&events, origin, &mut acc),
        || {
            if let Some(error) = terminal_error {
                events.status(StatusUpdate::lane(
                    origin,
                    lane,
                    SessionState::Error,
                    Some(error),
                ));
            } else if report_idle {
                events.status(StatusUpdate::lane(origin, lane, SessionState::Idle, None));
            }
        },
    );
    tracing::info!(?origin, "{} session loop ended", P::NAME);
}

/// Audio queued while disconnected after a failure is a stall's backlog, not speech worth
/// replaying late: start the new connection from live audio.
fn drop_stale_audio(audio_rx: &mut Receiver<AudioChunk>, origin: Origin) {
    let mut dropped = 0usize;
    while audio_rx.try_recv().is_ok() {
        dropped += 1;
    }
    if dropped > 0 {
        tracing::info!(
            ?origin,
            dropped,
            "dropped stale audio chunks before connect"
        );
    }
}

fn finish_source(cancel: &CancellationToken, finalize: impl FnOnce(), report: impl FnOnce()) {
    cancel.cancel();
    finalize();
    report();
}

/// Emit what a handler asked for, then advance past a final turn. Split out from the socket
/// path so tests can drive handlers through exactly the sequence the runner uses.
fn apply_caption(
    update: CaptionUpdate,
    acc: &mut TurnAccumulator,
    emit: impl FnOnce(&mut TurnAccumulator, bool),
) {
    match update {
        CaptionUpdate::None => {}
        CaptionUpdate::Interim => emit(acc, false),
        CaptionUpdate::Final => {
            emit(acc, true);
            acc.next_turn();
        }
    }
}

fn finalize_accumulator(events: &impl Events, origin: Origin, acc: &mut TurnAccumulator) {
    if !acc.is_empty() {
        emit_caption(events, origin, acc, true);
        acc.next_turn();
    }
}

/// Emit a caption, timed against the session clock.
///
/// A turn starts at its *first* caption, not when the previous turn ended: the silence
/// between two people speaking belongs to neither subtitle. A turn that arrives complete in
/// one message therefore has `start_ms == end_ms`, which is the truth about that caption —
/// giving a cue a minimum on-screen duration is a decision for whatever renders it, not
/// something to bury in the timestamp. Public for the built-in demo, which scripts its own
/// timeline rather than parsing a provider.
pub fn emit_caption(events: &impl Events, origin: Origin, acc: &mut TurnAccumulator, final_: bool) {
    let end_ms = acc.clock.elapsed_ms();
    let start_ms = *acc.started_ms.get_or_insert(end_ms);
    events.caption(Caption {
        turn_id: acc.id,
        text: &acc.text,
        source_text: &acc.source,
        final_,
        origin,
        lane: acc.lane,
        start_ms,
        end_ms,
    });
}

/// Drives a provider's `handle_message` the way the runner does, recording captions instead
/// of emitting them, so each wire format can be tested without an `AppHandle` or a socket.
#[cfg(test)]
pub(crate) mod test_support {
    use tokio_tungstenite::tungstenite::handshake::client::generate_request;

    use super::*;

    /// A provider's handshake as its server receives it: the URI the client dials, then the
    /// request byte for byte, with the per-connection random `Sec-WebSocket-Key` masked. The
    /// providers pin theirs with it, so a request builder they share cannot change what any one
    /// of them sends.
    pub fn handshake(request: Request) -> String {
        let uri = request.uri().to_string();
        let (bytes, key) = generate_request(request).expect("a well-formed handshake");
        let wire = String::from_utf8(bytes).expect("an ASCII handshake");
        format!("{uri}\n{}", wire.replace(&key, "<key>"))
    }

    /// One caption event as the runner would have emitted it.
    #[derive(Debug, PartialEq, Eq)]
    pub struct Emitted {
        pub turn_id: u64,
        pub text: String,
        pub source_text: String,
        pub final_: bool,
    }

    impl Emitted {
        pub fn interim(turn_id: u64, text: &str, source_text: &str) -> Self {
            Self::new(turn_id, text, source_text, false)
        }

        pub fn final_(turn_id: u64, text: &str, source_text: &str) -> Self {
            Self::new(turn_id, text, source_text, true)
        }

        fn new(turn_id: u64, text: &str, source_text: &str, final_: bool) -> Self {
            Self {
                turn_id,
                text: text.to_string(),
                source_text: source_text.to_string(),
                final_,
            }
        }

        fn of(acc: &TurnAccumulator, final_: bool) -> Self {
            Self::new(acc.id, &acc.text, &acc.source, final_)
        }
    }

    pub struct Harness<P> {
        pub proto: P,
        pub acc: TurnAccumulator,
        pub captions: Vec<Emitted>,
    }

    impl<P: RealtimeProtocol> Harness<P> {
        pub fn new(proto: P) -> Self {
            Self {
                proto,
                acc: TurnAccumulator::new(SessionClock::start(), 0),
                captions: Vec::new(),
            }
        }

        /// One server frame, through the same caption path as `handle_socket_message`.
        pub fn send(&mut self, frame: &str) -> MessageOutcome {
            let outcome = self.proto.handle_message(frame, &mut self.acc);
            let captions = &mut self.captions;
            apply_caption(outcome.caption, &mut self.acc, |acc, final_| {
                captions.push(Emitted::of(acc, final_));
            });
            outcome
        }

        /// The runner's idle timer firing, as `finalize_accumulator` handles it.
        pub fn finalize_idle(&mut self) {
            if !self.acc.is_empty() {
                self.captions.push(Emitted::of(&self.acc, true));
                self.acc.next_turn();
            }
        }
    }
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[tokio::test]
    async fn terminal_exit_stops_its_capture_and_finalizes_before_reporting() {
        let session = CancellationToken::new();
        let source = session.child_token();
        let sibling = session.child_token();
        let capture = source.clone();
        let worker = tokio::spawn(async move { capture.cancelled().await });
        let events = std::cell::RefCell::new(Vec::new());
        finish_source(
            &source,
            || events.borrow_mut().push("caption-final"),
            || events.borrow_mut().push("provider-error"),
        );
        tokio::time::timeout(Duration::from_secs(1), worker)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(*events.borrow(), ["caption-final", "provider-error"]);
        assert!(!sibling.is_cancelled());
        assert!(!session.is_cancelled());
    }

    #[tokio::test]
    async fn a_paused_source_waits_for_resume_or_for_the_session_to_end() {
        let cancel = CancellationToken::new();

        let (tx, mut rx) = watch::channel(false);
        assert!(
            wait_for_resume(&mut rx, &cancel).await,
            "not paused: no wait"
        );

        tx.send_replace(true);
        let resume = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            tx.send_replace(false);
            tx
        });
        assert!(wait_for_resume(&mut rx, &cancel).await);
        let tx = resume.await.unwrap();

        // Stop while paused.
        tx.send_replace(true);
        cancel.cancel();
        assert!(!wait_for_resume(&mut rx, &cancel).await);

        // The session going away while paused ends the wait too.
        let (tx, mut rx) = watch::channel(true);
        drop(tx);
        assert!(!wait_for_resume(&mut rx, &CancellationToken::new()).await);
    }

    fn accumulator_at(elapsed_ms: u64) -> TurnAccumulator {
        TurnAccumulator::new(SessionClock::at(elapsed_ms), 0)
    }

    #[test]
    fn accumulator_advances_without_reusing_text() {
        let mut acc = accumulator_at(0);
        acc.id = 7;
        acc.source = "hello".into();
        acc.text = "bonjour".into();
        acc.next_turn();
        assert_eq!(acc.id, 8);
        assert!(acc.is_empty());
    }

    /// The whole point of `started_ms`: an interim caption and the final that replaces it are
    /// one cue, so they have to agree on where that cue begins. Emitting is what stamps it,
    /// because that is the first moment the turn is known to have any text.
    #[test]
    fn a_turn_keeps_the_start_time_of_its_first_caption() {
        let mut acc = accumulator_at(4_000);
        let first = *acc.started_ms.get_or_insert(acc.clock.elapsed_ms());
        assert!((4_000..5_000).contains(&first), "got {first}ms");

        // A later caption in the same turn must not move the start.
        let again = *acc.started_ms.get_or_insert(9_999);
        assert_eq!(again, first);
    }

    /// …and the next turn must not inherit it, or every cue after the first would claim to
    /// have started when the session did.
    #[test]
    fn the_next_turn_starts_its_own_clock() {
        let mut acc = accumulator_at(4_000);
        acc.started_ms = Some(4_000);
        acc.next_turn();
        assert_eq!(acc.started_ms, None);
    }
}
