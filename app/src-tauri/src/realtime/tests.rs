//! The runner's state machine end to end: `run_session` against a loopback WebSocket server
//! and a scripted protocol, recording what it reports through `Events`.
//!
//! The clock is paused. Tokio advances a paused clock to the next timer whenever the runtime
//! parks — even with loopback I/O still in flight — so `tick_clock` keeps a 1 ms timer always
//! pending: each park then moves the clock by a millisecond at most, and the multi-second
//! timeouts under test are only ever crossed on purpose. That holds only while I/O completes
//! within a few parks, so both ends run with Nagle off: on Linux, a small frame held for an
//! acknowledgement waits out the ~40 ms delayed-ACK timer, thousands of parks in which the
//! paused clock would race through a test's listening window.

use std::time::Duration;

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout, timeout_at, Instant};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_tungstenite::tungstenite::{self, Message};
use tokio_tungstenite::{accept_async, WebSocketStream};
use tokio_util::sync::CancellationToken;

use super::policy::{INITIAL_BACKOFF, STABLE_CONNECTION};
use super::socket::{CLOSE_DRAIN_TIMEOUT, INBOUND_TIMEOUT, QUIET_BEFORE_CLOSE, SETUP_TIMEOUT};
use super::*;

/// Long enough for any step of any test, short enough that a hang fails in seconds.
const GUARD: Duration = Duration::from_secs(120);

fn tick_clock() {
    tokio::spawn(async {
        loop {
            sleep(Duration::from_millis(1)).await;
        }
    });
}

#[derive(Debug, PartialEq, Eq)]
enum Event {
    Status(SessionState, Option<&'static str>),
    Caption { text: String, final_: bool },
}

fn status(state: SessionState) -> Event {
    Event::Status(state, None)
}

fn interim(text: &str) -> Event {
    Event::Caption {
        text: text.into(),
        final_: false,
    }
}

fn final_(text: &str) -> Event {
    Event::Caption {
        text: text.into(),
        final_: true,
    }
}

struct Recorder(mpsc::UnboundedSender<(Instant, Event)>);

impl Events for Recorder {
    fn caption(&self, caption: Caption<'_>) {
        let event = Event::Caption {
            text: caption.text.to_string(),
            final_: caption.final_,
        };
        let _ = self.0.send((Instant::now(), event));
    }

    fn status(&self, update: StatusUpdate) {
        let event = Event::Status(update.state, update.message.map(|message| message.id));
        let _ = self.0.send((Instant::now(), event));
    }
}

/// A provider reduced to its control flow. The server speaks in bare words: `ready` confirms
/// setup, `text:…` revises the turn, `final` completes it, `goaway`/`closed`/`fatal` steer the
/// connection. The client sends `setup`, `audio:<base64>`, and `end` to start a close drain,
/// which completes on the next final.
struct Fake {
    url: String,
}

impl RealtimeProtocol for Fake {
    const NAME: &'static str = "Fake";

    fn origin(&self) -> Origin {
        Origin::Microphone
    }

    fn connect_request(&self) -> anyhow::Result<Request> {
        Ok(self.url.as_str().into_client_request()?)
    }

    fn setup_json(&self) -> anyhow::Result<String> {
        Ok("setup".into())
    }

    fn audio_json(&self, base64_pcm: String) -> anyhow::Result<String> {
        Ok(format!("audio:{base64_pcm}"))
    }

    fn wait_for_setup_complete(&self) -> bool {
        true
    }

    fn closing_json(&self) -> anyhow::Result<Vec<String>> {
        Ok(vec!["end".into()])
    }

    fn drain_complete(&self, outcome: &MessageOutcome) -> bool {
        outcome.caption == CaptionUpdate::Final
    }

    fn handle_message(&mut self, text: &str, acc: &mut TurnAccumulator) -> MessageOutcome {
        match text {
            "ready" => MessageOutcome::setup_complete(),
            "final" => MessageOutcome::caption(CaptionUpdate::Final),
            "goaway" => MessageOutcome::control(MessageControl::Handover),
            "closed" => MessageOutcome::control(MessageControl::Closed),
            "fatal" => MessageOutcome::control(MessageControl::Fatal("refused".into())),
            _ => match text.strip_prefix("text:") {
                Some(text) => {
                    acc.text = text.into();
                    MessageOutcome::caption(CaptionUpdate::Interim)
                }
                None => MessageOutcome::default(),
            },
        }
    }
}

/// One source's client, driven the way `SessionBuilder` drives it.
struct Client {
    events: mpsc::UnboundedReceiver<(Instant, Event)>,
    audio: mpsc::Sender<AudioChunk>,
    pause: watch::Sender<bool>,
    cancel: CancellationToken,
    task: JoinHandle<()>,
}

impl Client {
    fn start(url: &str) -> Self {
        let (recorder, events) = mpsc::unbounded_channel();
        // The producer queue's real size: what a handover can hold without the runner's help.
        let (audio, audio_rx) = mpsc::channel(5);
        let (pause, pause_rx) = watch::channel(false);
        let cancel = CancellationToken::new();
        let task = tokio::spawn(run_session(
            Recorder(recorder),
            Fake { url: url.into() },
            audio_rx,
            cancel.clone(),
            SessionClock::start(),
            pause_rx,
            0,
        ));
        Self {
            events,
            audio,
            pause,
            cancel,
            task,
        }
    }

    /// The next event, which must be `expected`; returns when it was reported.
    async fn expect(&mut self, expected: Event) -> Instant {
        let (at, event) = timeout(GUARD, self.events.recv())
            .await
            .unwrap_or_else(|_| panic!("still waiting for {expected:?}"))
            .unwrap_or_else(|| panic!("the runner ended before {expected:?}"));
        assert_eq!(event, expected);
        at
    }

    /// One 100 ms chunk from the producer, tagged so the server can tell them apart.
    fn speak(&self, tag: u8) {
        self.audio
            .try_send(AudioChunk { pcm_le: vec![tag] })
            .expect("the producer queue overflowed");
    }

    /// Wait for the runner to end, then check it reported nothing more.
    async fn finished(mut self) {
        timeout(GUARD, self.task)
            .await
            .expect("the runner did not end")
            .unwrap();
        if let Ok((_, event)) = self.events.try_recv() {
            panic!("unexpected {event:?}");
        }
    }
}

struct Server {
    listener: TcpListener,
    url: String,
}

impl Server {
    async fn bind() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}", listener.local_addr().unwrap());
        Self { listener, url }
    }

    /// The next connection that completes a WebSocket handshake and sends its setup. One the
    /// client abandoned mid-handshake is still in the listen backlog, and is skipped.
    async fn accept(&self) -> Peer {
        loop {
            let (stream, _) = timeout(GUARD, self.listener.accept())
                .await
                .expect("the client did not connect")
                .unwrap();
            // As the client does: a frame Nagle held back would wait out Linux's delayed-ACK
            // timer in real time, and the paused clock would race through it (see above).
            stream.set_nodelay(true).unwrap();
            let Ok(ws) = accept_async(stream).await else {
                continue;
            };
            let mut peer = Peer(ws);
            if peer.recv().await == Frame::Text("setup".into()) {
                return peer;
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Frame {
    Text(String),
    Audio(u8),
    Close,
    Gone,
}

struct Peer(WebSocketStream<TcpStream>);

fn frame(message: Option<Result<Message, tungstenite::Error>>) -> Option<Frame> {
    Some(match message {
        Some(Ok(Message::Text(text))) => match text.strip_prefix("audio:") {
            Some(data) => Frame::Audio(
                base64::engine::general_purpose::STANDARD
                    .decode(data)
                    .unwrap()[0],
            ),
            None => Frame::Text(text.to_string()),
        },
        Some(Ok(Message::Close(_))) => Frame::Close,
        // Reading a ping is what queues tungstenite's pong; the next read sends it.
        Some(Ok(_)) => return None,
        Some(Err(_)) | None => Frame::Gone,
    })
}

impl Peer {
    /// The next frame the client sent, answering its pings on the way.
    async fn recv(&mut self) -> Frame {
        loop {
            let message = timeout(GUARD, self.0.next())
                .await
                .expect("the client sent nothing");
            if let Some(frame) = frame(message) {
                return frame;
            }
        }
    }

    async fn send(&mut self, text: &str) {
        self.0.send(Message::text(text)).await.unwrap();
    }

    async fn ready(&mut self) {
        self.send("ready").await;
    }

    /// Keep reading — and so answering pings — for `duration`; the audio heard meanwhile.
    async fn listen_for(&mut self, duration: Duration) -> Vec<u8> {
        let until = Instant::now() + duration;
        let mut heard = Vec::new();
        while let Ok(message) = timeout_at(until, self.0.next()).await {
            match frame(message) {
                Some(Frame::Audio(tag)) => heard.push(tag),
                Some(other) => panic!("unexpected {other:?}"),
                None => {}
            }
        }
        heard
    }
}

/// Connect, accept setup and report Running: the start every scenario shares.
async fn running(server: &Server) -> (Client, Peer, Instant) {
    let mut client = Client::start(&server.url);
    client.expect(status(SessionState::Connecting)).await;
    let mut peer = server.accept().await;
    peer.ready().await;
    let at = client.expect(status(SessionState::Running)).await;
    (client, peer, at)
}

#[tokio::test(start_paused = true)]
async fn pause_flushes_the_turn_and_resume_starts_afresh() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    client.speak(1);
    assert_eq!(peer.recv().await, Frame::Audio(1));
    peer.send("text:hello").await;
    client.expect(interim("hello")).await;

    let paused_at = Instant::now();
    client.pause.send_replace(true);
    // The closing frame goes out, and the provider's answer to it is still captioned.
    assert_eq!(peer.recv().await, Frame::Text("end".into()));
    peer.send("final").await;
    client.expect(final_("hello")).await;
    assert_eq!(peer.recv().await, Frame::Close);
    let at = client.expect(status(SessionState::Paused)).await;
    assert!(
        at - paused_at < CLOSE_DRAIN_TIMEOUT,
        "the drain ended on the provider's signal, not its timeout"
    );

    // A resume is a fresh start, not a recovery: Connecting, and no backoff.
    let resumed_at = Instant::now();
    client.pause.send_replace(false);
    client.expect(status(SessionState::Connecting)).await;
    let mut peer = server.accept().await;
    assert!(Instant::now() - resumed_at < INITIAL_BACKOFF);
    peer.ready().await;
    client.expect(status(SessionState::Running)).await;

    client.cancel.cancel();
    assert_eq!(peer.recv().await, Frame::Text("end".into()));
    drop(peer);
    client.finished().await;
}

/// Nothing captioned for a while and nothing pending: the closing frame still goes out, but a
/// Pause in a quiet room must not wait out the drain.
#[tokio::test(start_paused = true)]
async fn pause_after_a_quiet_spell_closes_without_waiting() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    peer.send("text:earlier").await;
    peer.send("final").await;
    client.expect(interim("earlier")).await;
    client.expect(final_("earlier")).await;
    peer.listen_for(QUIET_BEFORE_CLOSE).await;

    let paused_at = Instant::now();
    client.pause.send_replace(true);
    assert_eq!(peer.recv().await, Frame::Text("end".into()));
    assert_eq!(peer.recv().await, Frame::Close);
    let at = client.expect(status(SessionState::Paused)).await;
    assert!(
        at - paused_at < Duration::from_millis(500),
        "waited {:?}",
        at - paused_at
    );

    client.cancel.cancel();
    client.finished().await;
}

/// The turn was finalized a moment ago, so nothing is pending, but the provider may still be
/// working on the speech that followed it: the drain runs, here to its deadline.
#[tokio::test(start_paused = true)]
async fn pause_straight_after_a_caption_still_drains() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    peer.listen_for(QUIET_BEFORE_CLOSE).await;
    peer.send("text:just said").await;
    peer.send("final").await;
    client.expect(interim("just said")).await;
    client.expect(final_("just said")).await;

    let paused_at = Instant::now();
    client.pause.send_replace(true);
    assert_eq!(peer.recv().await, Frame::Text("end".into()));
    assert_eq!(peer.recv().await, Frame::Close);
    let at = client.expect(status(SessionState::Paused)).await;
    assert!(at - paused_at >= CLOSE_DRAIN_TIMEOUT);

    client.cancel.cancel();
    client.finished().await;
}

/// An interim left open is speech the provider has not finished with, however long ago it
/// last changed: the drain waits for its final.
#[tokio::test(start_paused = true)]
async fn pause_with_a_turn_still_open_drains_until_its_final() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    peer.send("text:still open").await;
    client.expect(interim("still open")).await;
    peer.listen_for(QUIET_BEFORE_CLOSE).await;

    let paused_at = Instant::now();
    client.pause.send_replace(true);
    assert_eq!(peer.recv().await, Frame::Text("end".into()));
    sleep(Duration::from_secs(1)).await;
    peer.send("final").await;
    client.expect(final_("still open")).await;
    assert_eq!(peer.recv().await, Frame::Close);
    let at = client.expect(status(SessionState::Paused)).await;
    assert!(
        at - paused_at >= Duration::from_secs(1),
        "closed before the provider's final"
    );

    client.cancel.cancel();
    client.finished().await;
}

#[tokio::test(start_paused = true)]
async fn a_planned_handover_reconnects_at_once_and_replays_the_gap_in_order() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    client.speak(1);
    client.speak(2);
    assert_eq!(peer.listen_for(STABLE_CONNECTION).await, [1, 2]);
    peer.send("text:before the move").await;
    client.expect(interim("before the move")).await;

    let moved_at = Instant::now();
    peer.send("goaway").await;
    client.expect(final_("before the move")).await;
    let mut next = server.accept().await;
    assert!(Instant::now() - moved_at < INITIAL_BACKOFF, "no backoff");

    // A second of speech while the new session sets up: twice what the producer queue holds.
    for tag in 3..=12 {
        client.speak(tag);
        sleep(Duration::from_millis(100)).await;
    }
    next.send("ready").await;
    // The source stayed Running throughout: no Reconnecting before this.
    client.expect(status(SessionState::Running)).await;
    client.speak(13);
    assert_eq!(
        next.listen_for(Duration::from_secs(1)).await,
        (3..=13).collect::<Vec<u8>>()
    );

    drop(next);
    client.cancel.cancel();
    client.finished().await;
}

#[tokio::test(start_paused = true)]
async fn a_handover_straight_after_connecting_backs_off() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    peer.listen_for(Duration::from_secs(2)).await;

    let moved_at = Instant::now();
    peer.send("goaway").await;
    client.expect(status(SessionState::Reconnecting)).await;
    let _next = server.accept().await;
    assert!(Instant::now() - moved_at >= INITIAL_BACKOFF);

    client.cancel.cancel();
    client.finished().await;
}

/// OpenAI's `session.closed` and Mistral's `transcription.done` mid-session used to end the
/// source for good, with Idle and capture cancelled.
#[tokio::test(start_paused = true)]
async fn a_provider_ending_its_session_mid_stream_moves_to_a_new_one() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    peer.listen_for(STABLE_CONNECTION).await;
    peer.send("text:last words").await;
    client.expect(interim("last words")).await;

    peer.send("closed").await;
    client.expect(final_("last words")).await;
    let mut next = server.accept().await;
    next.ready().await;
    client.expect(status(SessionState::Running)).await;

    drop(next);
    client.cancel.cancel();
    client.finished().await;
}

#[tokio::test(start_paused = true)]
async fn a_server_close_mid_stream_reconnects() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    peer.0.close(None).await.unwrap();

    client.expect(status(SessionState::Reconnecting)).await;
    let mut next = server.accept().await;
    next.ready().await;
    client.expect(status(SessionState::Running)).await;

    drop(next);
    client.cancel.cancel();
    client.finished().await;
}

#[tokio::test(start_paused = true)]
async fn a_setup_that_is_never_confirmed_ends_the_source_with_an_error() {
    tick_clock();
    let server = Server::bind().await;
    let mut client = Client::start(&server.url);
    let started = client.expect(status(SessionState::Connecting)).await;
    // Held open and never answered.
    let _peer = server.accept().await;

    let failed = client
        .expect(Event::Status(
            SessionState::Error,
            Some(id::PROVIDER_STOPPED),
        ))
        .await;
    assert!(failed - started >= SETUP_TIMEOUT);
    client.finished().await;
}

#[tokio::test(start_paused = true)]
async fn stop_during_setup_closes_the_socket() {
    tick_clock();
    let server = Server::bind().await;
    let mut client = Client::start(&server.url);
    client.expect(status(SessionState::Connecting)).await;
    let mut peer = server.accept().await;

    client.cancel.cancel();
    assert_eq!(peer.recv().await, Frame::Close);
    // Stop reports nothing per source: the session publishes Idle once every client drained.
    client.finished().await;
}

#[tokio::test(start_paused = true)]
async fn pause_during_setup_closes_without_reporting_running() {
    tick_clock();
    let server = Server::bind().await;
    let mut client = Client::start(&server.url);
    client.expect(status(SessionState::Connecting)).await;
    let mut peer = server.accept().await;

    client.pause.send_replace(true);
    assert_eq!(peer.recv().await, Frame::Close);
    client.expect(status(SessionState::Paused)).await;

    client.cancel.cancel();
    client.finished().await;
}

/// The server's listener never accepts, so the WebSocket handshake hangs as it would on a
/// captive portal or a dead route.
#[tokio::test(start_paused = true)]
async fn pause_during_a_slow_connect_takes_effect_at_once() {
    tick_clock();
    let server = Server::bind().await;
    let mut client = Client::start(&server.url);
    client.expect(status(SessionState::Connecting)).await;
    sleep(Duration::from_secs(1)).await;

    let paused_at = Instant::now();
    client.pause.send_replace(true);
    let at = client.expect(status(SessionState::Paused)).await;
    assert!(at - paused_at < Duration::from_millis(100));

    client.pause.send_replace(false);
    client.expect(status(SessionState::Connecting)).await;
    let mut peer = server.accept().await;
    peer.ready().await;
    client.expect(status(SessionState::Running)).await;

    drop(peer);
    client.cancel.cancel();
    client.finished().await;
}

/// No reads, so no pongs: the path looks open to the operating system and is dead.
#[tokio::test(start_paused = true)]
async fn a_peer_that_goes_silent_is_abandoned_for_a_new_connection() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, _silent, running_at) = running(&server).await;

    let at = client.expect(status(SessionState::Reconnecting)).await;
    let waited = at - running_at;
    assert!(
        waited >= INBOUND_TIMEOUT && waited < INBOUND_TIMEOUT + Duration::from_secs(5),
        "reconnected after {waited:?}"
    );
    let mut next = server.accept().await;
    next.ready().await;
    client.expect(status(SessionState::Running)).await;

    drop(next);
    client.cancel.cancel();
    client.finished().await;
}

/// The peer stops reading, so once the socket buffers fill a send cannot complete. That has
/// to end in a reconnect well before the inbound-silence check would notice.
#[tokio::test(start_paused = true)]
async fn a_send_that_cannot_complete_reconnects() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, _stalled, running_at) = running(&server).await;
    let audio = client.audio.clone();
    tokio::spawn(async move {
        // At most 64 MB, more than any loopback socket buffers.
        for _ in 0..64 {
            let _ = audio.try_send(AudioChunk {
                pcm_le: vec![0; 1 << 20],
            });
            sleep(Duration::from_millis(100)).await;
        }
    });

    let at = client.expect(status(SessionState::Reconnecting)).await;
    assert!(
        at - running_at < INBOUND_TIMEOUT,
        "took {:?}",
        at - running_at
    );

    client.cancel.cancel();
    client.finished().await;
}

/// Gemini Translate may answer `audioStreamEnd` with an error or a close (a live check is
/// pending). Either must end the drain quietly, keeping the turn already accumulated.
#[tokio::test(start_paused = true)]
async fn a_provider_error_while_closing_keeps_the_caption_and_reports_nothing() {
    tick_clock();
    let server = Server::bind().await;
    let (mut client, mut peer, _) = running(&server).await;
    peer.send("text:almost done").await;
    client.expect(interim("almost done")).await;

    client.cancel.cancel();
    assert_eq!(peer.recv().await, Frame::Text("end".into()));
    peer.send("fatal").await;
    assert_eq!(peer.recv().await, Frame::Close);
    client.expect(final_("almost done")).await;
    client.finished().await;
}
