//! Mistral Voxtral Mini realtime transcription. Unlike the translation providers, its
//! transcript is the audience caption itself: it goes in the accumulator's `text`, where a
//! translation would, and is exported through the existing caption/transcript path.

use std::time::Duration;

use anyhow::Result;
use tokio_tungstenite::tungstenite::handshake::client::Request;

use super::protocol::{InputAudioAppend, ServerEvent, SessionUpdate};
use crate::realtime::{
    bearer_request, parse_or_log, CaptionUpdate, MessageControl, MessageOutcome, RealtimeProtocol,
    TurnAccumulator,
};
use crate::types::Origin;

pub const DEFAULT_MISTRAL_MODEL: &str = "voxtral-mini-transcribe-realtime-2602";
pub const DEFAULT_MISTRAL_HOST: &str = "api.mistral.ai";
/// A small context window keeps subtitles responsive while improving recognition quality.
pub const DEFAULT_TARGET_STREAMING_DELAY_MS: u32 = 480;
const FINALIZE_AFTER: Duration = Duration::from_millis(900);

#[derive(Clone)]
pub struct MistralConfig {
    pub api_key: String,
    pub model: String,
    pub host: String,
    pub target_streaming_delay_ms: u32,
    pub origin: Origin,
}

impl MistralConfig {
    /// The protocol the realtime runner drives for this source, with nothing heard yet.
    pub fn into_client(self) -> MistralClient {
        MistralClient {
            config: self,
            received_delta: false,
        }
    }

    fn ws_url(&self) -> String {
        format!(
            "wss://{}/v1/audio/transcriptions/realtime?model={}",
            self.host, self.model
        )
    }
}

/// One Mistral source: its configuration, plus what the provider has sent on the current
/// connection that a later event depends on. That part is the protocol's own business, so it
/// lives here rather than in a configuration the session has to fill in.
pub struct MistralClient {
    config: MistralConfig,
    /// Whether the provider's current session has streamed any transcript delta. Cleared by
    /// the `session.created` that opens each connection.
    received_delta: bool,
}

impl RealtimeProtocol for MistralClient {
    const NAME: &'static str = "Mistral";

    fn origin(&self) -> Origin {
        self.config.origin
    }

    fn connect_request(&self) -> Result<Request> {
        bearer_request(Self::NAME, &self.config.ws_url(), &self.config.api_key)
    }

    fn setup_json(&self) -> Result<String> {
        Ok(serde_json::to_string(&SessionUpdate::pcm16(
            self.config.target_streaming_delay_ms,
        ))?)
    }

    fn audio_json(&self, base64_pcm: String) -> Result<String> {
        Ok(serde_json::to_string(&InputAudioAppend::pcm16(base64_pcm))?)
    }

    fn closing_json(&self) -> Result<Vec<String>> {
        Ok(vec![
            r#"{"type":"input_audio.flush"}"#.to_string(),
            r#"{"type":"input_audio.end"}"#.to_string(),
        ])
    }

    fn handle_message(&mut self, text: &str, acc: &mut TurnAccumulator) -> MessageOutcome {
        let Some(event) = parse_or_log::<ServerEvent>(Self::NAME, text) else {
            return MessageOutcome::default();
        };

        match event.kind.as_str() {
            "session.created" | "session.updated" => {
                self.received_delta = false;
                tracing::debug!(origin = ?self.config.origin, event = %event.kind, "Mistral session ready");
            }
            "transcription.text.delta" => {
                if let Some(delta) = event.text.as_deref().filter(|delta| !delta.is_empty()) {
                    self.received_delta = true;
                    acc.text.push_str(delta);
                    return MessageOutcome::activity(CaptionUpdate::Interim);
                }
            }
            // The drain's end after `input_audio.end`. Mid-stream the final caption still goes
            // out, and the runner moves to a new session rather than ending the source.
            "transcription.done" => {
                // `done.text` contains the full session transcript. Only use it when the
                // server sent no deltas; otherwise idle-finalized turns would be duplicated.
                if !self.received_delta && acc.text.is_empty() {
                    if let Some(full_text) = event.text {
                        acc.text = full_text;
                    }
                }
                let caption = if acc.is_empty() {
                    CaptionUpdate::None
                } else {
                    CaptionUpdate::Final
                };
                return MessageOutcome {
                    caption,
                    control: MessageControl::Closed,
                    ..MessageOutcome::default()
                };
            }
            "error" => {
                if event.error.as_ref().is_some_and(recoverable) {
                    tracing::warn!(
                        origin = ?self.config.origin,
                        error = ?event.error,
                        "Mistral reported a transient error; reconnecting"
                    );
                    return MessageOutcome::control(MessageControl::Reconnect);
                }
                return MessageOutcome::control(MessageControl::Fatal(
                    event
                        .error
                        .map(|error| error.to_string())
                        .unwrap_or_else(|| "Mistral realtime transcription error".to_string()),
                ));
            }
            _ => {}
        }

        MessageOutcome::default()
    }

    fn finalize_after(&self) -> Option<Duration> {
        Some(FINALIZE_AFTER)
    }
}

/// Wording that marks a failure inside Mistral's backend rather than in the request: gRPC's
/// UNAVAILABLE and DEADLINE_EXCEEDED, and a connection reset between its services. Seen live
/// on 7 October 2026 as code 3803, "gRPC connection error: <AioRpcError … StatusCode.UNAVAILABLE
/// … Connection reset by peer …>"; a new session reaches a backend that is up. Specific on
/// purpose: a bare "unavailable" could also describe a model the key cannot use.
const TRANSIENT_BACKEND: [&str; 5] = [
    "statuscode.unavailable",
    "grpc_status:14",
    "statuscode.deadline_exceeded",
    "grpc connection error",
    "connection reset by peer",
];

/// Whether an `error` event is one a new session can get past. The official SDK types it as
/// `{ message, code }`: `message` a string or an object, `code` an integer it calls an
/// internal code for debugging. Codes in HTTP's transient range (timeout, rate limit, server
/// errors) reconnect, as do the transient `type`/`code` names Mistral's HTTP API uses, should
/// `message` be such an object. Everything else — authentication, permission, a bad request
/// or model, an exhausted quota, an unknown code — stays fatal, so a persistent failure
/// reports itself instead of reconnecting in a loop. One exception by wording: Mistral's own
/// backend failing to reach an internal service, which it reports under an internal code with
/// the gRPC failure as the message (`TRANSIENT_BACKEND`).
fn recoverable(error: &serde_json::Value) -> bool {
    let code = error
        .get("code")
        .and_then(|code| code.as_u64().or_else(|| code.as_str()?.parse().ok()));
    let message = error.get("message");
    let names: Vec<&str> = [error, message.unwrap_or(&serde_json::Value::Null)]
        .into_iter()
        .flat_map(|value| ["type", "code"].map(|key| value.get(key)))
        .filter_map(|name| name?.as_str())
        .collect();
    let text = message.map(|message| message.to_string().to_lowercase());
    // A 429 is also how an exhausted quota or plan limit is reported; no reconnect fixes that.
    if text.as_deref().is_some_and(|text| {
        ["quota", "billing", "payment", "credit"]
            .iter()
            .any(|w| text.contains(w))
    }) {
        return false;
    }
    if text
        .as_deref()
        .is_some_and(|text| TRANSIENT_BACKEND.iter().any(|w| text.contains(w)))
    {
        return true;
    }
    matches!(code, Some(408 | 429 | 500 | 502 | 503 | 504))
        || names.iter().any(|name| {
            matches!(
                *name,
                "server_error"
                    | "rate_limit_error"
                    | "rate_limited"
                    | "timeout"
                    | "session_expired"
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::realtime::test_support::{handshake, Emitted, Harness};
    use crate::realtime::Signal;

    fn config(api_key: &str) -> MistralConfig {
        MistralConfig {
            api_key: api_key.to_string(),
            model: DEFAULT_MISTRAL_MODEL.to_string(),
            host: DEFAULT_MISTRAL_HOST.to_string(),
            target_streaming_delay_ms: DEFAULT_TARGET_STREAMING_DELAY_MS,
            origin: Origin::Microphone,
        }
    }

    fn harness() -> Harness<MistralClient> {
        Harness::new(config("").into_client())
    }

    #[test]
    fn the_handshake_authenticates_with_a_bearer_header() {
        let request = config("mistral-test")
            .into_client()
            .connect_request()
            .unwrap();
        assert_eq!(
            handshake(request),
            "wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-2602\n\
             GET /v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-2602 HTTP/1.1\r\n\
             Host: api.mistral.ai\r\n\
             Connection: Upgrade\r\n\
             Upgrade: websocket\r\n\
             Sec-WebSocket-Version: 13\r\n\
             Sec-WebSocket-Key: <key>\r\n\
             authorization: Bearer mistral-test\r\n\
             \r\n"
        );
    }

    /// The operator reads these as the reconnecting status's detail.
    #[test]
    fn a_request_that_cannot_be_built_says_which_part_failed() {
        let error = config("bad\nkey")
            .into_client()
            .connect_request()
            .unwrap_err();
        assert_eq!(
            error.to_string(),
            "Mistral API key is not a valid header value"
        );
        let mut config = config("mistral-test");
        config.host = "not a host".to_string();
        let error = config.into_client().connect_request().unwrap_err();
        assert_eq!(error.to_string(), "failed to build Mistral request");
    }

    #[test]
    fn deltas_are_interim_activity() {
        let mut h = harness();
        let outcome = h.send(r#"{"type":"transcription.text.delta","text":"Hello "}"#);
        assert_eq!(outcome.caption, CaptionUpdate::Interim);
        assert_eq!(outcome.signal, Signal::TranscriptActivity);
        h.send(r#"{"type":"transcription.text.delta","text":""}"#);
        h.send(r#"{"type":"transcription.text.delta","text":"world"}"#);
        assert_eq!(
            h.captions,
            [
                Emitted::interim(0, "Hello ", ""),
                Emitted::interim(0, "Hello world", ""),
            ]
        );
    }

    /// `done` repeats the whole session. After deltas, idle finalization has already
    /// committed those turns, so replaying `done.text` would print every line twice.
    #[test]
    fn done_after_deltas_does_not_replay_the_session() {
        let mut h = harness();
        h.send(r#"{"type":"transcription.text.delta","text":"First line."}"#);
        h.finalize_idle();
        let outcome = h.send(r#"{"type":"transcription.done","text":"First line."}"#);
        assert!(matches!(outcome.control, MessageControl::Closed));
        assert_eq!(
            h.captions,
            [
                Emitted::interim(0, "First line.", ""),
                Emitted::final_(0, "First line.", ""),
            ]
        );
    }

    #[test]
    fn done_without_deltas_supplies_the_whole_transcript() {
        let mut h = harness();
        h.send(r#"{"type":"session.created"}"#);
        h.send(r#"{"type":"transcription.done","text":"Only the summary."}"#);
        assert_eq!(h.captions, [Emitted::final_(0, "Only the summary.", "")]);
    }

    #[test]
    fn a_new_session_forgets_earlier_deltas() {
        let mut h = harness();
        h.send(r#"{"type":"transcription.text.delta","text":"Before reconnect"}"#);
        h.finalize_idle();
        h.send(r#"{"type":"session.updated"}"#);
        h.send(r#"{"type":"transcription.done","text":"After reconnect"}"#);
        assert_eq!(
            h.captions.last(),
            Some(&Emitted::final_(1, "After reconnect", ""))
        );
    }

    #[test]
    fn transient_errors_reconnect_and_the_rest_stop_the_source() {
        let mut h = harness();
        for (error, reconnects) in [
            (r#"{"message":"Internal server error","code":500}"#, true),
            (r#"{"message":"Service unavailable","code":503}"#, true),
            (r#"{"message":"Rate limit exceeded","code":429}"#, true),
            (
                r#"{"message":{"type":"server_error","detail":"retry"},"code":3000}"#,
                true,
            ),
            // As Mistral sent it on 7 October 2026, mid-session.
            (
                concat!(
                    r#"{"code":3803,"message":"gRPC connection error: <AioRpcError of RPC that "#,
                    r#"terminated with:\n\tstatus = StatusCode.UNAVAILABLE\n\tdetails = \"failed "#,
                    r#"to connect to all addresses; last error: UNAVAILABLE: "#,
                    r#"ipv4:10.235.138.223:50052: recvmsg:Connection reset by peer\"\n\t"#,
                    r#"debug_error_string = \"UNKNOWN:Error received from peer {grpc_status:14, "#,
                    r#"grpc_message:\"failed to connect to all addresses; last error: "#,
                    r#"UNAVAILABLE: ipv4:10.235.138.223:50052: recvmsg:Connection reset by "#,
                    r#"peer\"}\"\n>"}"#
                ),
                true,
            ),
            (
                r#"{"message":"Model voxtral-mini-transcribe is unavailable for this key","code":3001}"#,
                false,
            ),
            (r#"{"message":"Monthly quota exceeded","code":429}"#, false),
            (r#"{"message":"Unauthorized","code":401}"#, false),
            (r#"{"message":"Forbidden","code":403}"#, false),
            (
                r#"{"message":"Invalid model: voxtral-unknown","code":400}"#,
                false,
            ),
            (
                r#"{"message":{"detail":"something new"},"code":3001}"#,
                false,
            ),
            (r#"{"message":"invalid key"}"#, false),
        ] {
            let frame = format!(r#"{{"type":"error","error":{error}}}"#);
            let control = h.send(&frame).control;
            assert_eq!(
                matches!(control, MessageControl::Reconnect),
                reconnects,
                "{error} -> {control:?}"
            );
            if !reconnects {
                assert!(matches!(control, MessageControl::Fatal(_)), "{error}");
            }
        }
        assert!(matches!(
            h.send(r#"{"type":"error"}"#).control,
            MessageControl::Fatal(_)
        ));
    }
}
