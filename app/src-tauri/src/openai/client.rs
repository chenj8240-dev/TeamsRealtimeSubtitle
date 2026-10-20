//! OpenAI Realtime *translations* protocol: connection details and event handling for the
//! shared realtime session runner (`crate::realtime`). Streams 24 kHz PCM chunks and turns
//! the transcript-delta stream into caption events.
//!
//! Two things differ from Gemini: authentication is an `Authorization: Bearer` header (not
//! a query param), and the translate stream has **no turn-complete event** — so a caption
//! is finalized after a short idle gap with no new translated text (`FINALIZE_AFTER`, run
//! by the shared runner's idle timer). See `docs/openai-realtime-api.md`.

use std::time::Duration;

use anyhow::Result;
use tokio_tungstenite::tungstenite::handshake::client::Request;

use super::protocol::{InputAudioAppend, ServerEvent, SessionUpdate};
use crate::realtime::{
    bearer_request, parse_or_log, CaptionUpdate, MessageControl, MessageOutcome, RealtimeProtocol,
    TurnAccumulator,
};
use crate::types::Origin;

/// Dedicated speech-to-speech translate model (captions come from its transcript sidecar).
pub const DEFAULT_OPENAI_TRANSLATE_MODEL: &str = "gpt-realtime-translate";
/// Streaming STT model used for the source-language transcription (operator monitor).
pub const DEFAULT_OPENAI_TRANSCRIBE_MODEL: &str = "gpt-realtime-whisper";
pub const DEFAULT_OPENAI_HOST: &str = "api.openai.com";

/// The translate stream has no turn lifecycle: finalize a caption once this much time
/// passes with no new transcript text.
const FINALIZE_AFTER: Duration = Duration::from_millis(900);

#[derive(Clone)]
pub struct OpenAiConfig {
    pub api_key: String,
    pub model: String,
    pub transcribe_model: String,
    pub host: String,
    pub target_language_code: String,
    pub origin: Origin,
}

impl OpenAiConfig {
    fn ws_url(&self) -> String {
        format!(
            "wss://{}/v1/realtime/translations?model={}",
            self.host, self.model
        )
    }
}

impl RealtimeProtocol for OpenAiConfig {
    const NAME: &'static str = "OpenAI";

    fn origin(&self) -> Origin {
        self.origin
    }

    fn connect_request(&self) -> Result<Request> {
        // OpenAI authenticates the WebSocket with an Authorization header, not a query param.
        bearer_request(Self::NAME, &self.ws_url(), &self.api_key)
    }

    fn setup_json(&self) -> Result<String> {
        let setup = SessionUpdate::translate(&self.target_language_code, &self.transcribe_model);
        Ok(serde_json::to_string(&setup)?)
    }

    fn audio_json(&self, base64_pcm: String) -> Result<String> {
        Ok(serde_json::to_string(&InputAudioAppend::pcm16(base64_pcm))?)
    }

    fn closing_json(&self) -> Result<Vec<String>> {
        Ok(vec![r#"{"type":"session.close"}"#.to_string()])
    }

    fn handle_message(&mut self, text: &str, acc: &mut TurnAccumulator) -> MessageOutcome {
        let Some(ev) = parse_or_log::<ServerEvent>(Self::NAME, text) else {
            return MessageOutcome::default();
        };

        if let Some(error) = ev.error {
            let control = error_control(&error);
            if !matches!(control, MessageControl::Fatal(_)) {
                tracing::warn!(
                    origin = ?self.origin,
                    %error,
                    "OpenAI ended the session; moving to a new one"
                );
            }
            return MessageOutcome::control(control);
        }

        let kind = ev.kind.as_str();

        // The drain's end after `session.close`; mid-stream the runner moves to a new session.
        if kind == "session.closed" {
            return MessageOutcome::control(MessageControl::Closed);
        }

        if kind.ends_with("input_transcript.delta") {
            if let Some(t) = ev.payload() {
                acc.source.push_str(t);
                // Source transcription may lead translated output by a noticeable amount;
                // only target-text activity should start the caption-finalize timer.
                return MessageOutcome::caption(CaptionUpdate::Interim);
            }
        } else if kind.ends_with("output_transcript.delta") {
            if let Some(t) = ev.payload() {
                acc.text.push_str(t);
                return MessageOutcome::activity(CaptionUpdate::Interim);
            }
        } else if kind.ends_with("output_transcript.done")
            || kind.ends_with("output_transcript.completed")
        {
            // Some preview builds send an explicit completion; finalize immediately.
            if !acc.is_empty() {
                if acc.text.is_empty() {
                    if let Some(t) = ev.transcript.as_deref() {
                        acc.text.push_str(t);
                    }
                }
                return MessageOutcome::caption(CaptionUpdate::Final);
            }
        }

        MessageOutcome::default()
    }

    fn finalize_after(&self) -> Option<Duration> {
        Some(FINALIZE_AFTER)
    }
}

/// How an `error` event steers the connection. Its `error` object carries a `type`
/// (`invalid_request_error`, `server_error`, …) and an optional `code`, and the code is read
/// first:
///
/// - `session_expired` is the 60-minute session cap. It arrives as an `invalid_request_error`
///   but is a planned end, so it hands over like Gemini's `goAway`: after a stable connection
///   the runner reconnects at once and replays the audio queued meanwhile.
/// - Server errors, rate limits and an overloaded service reconnect with backoff.
/// - Everything else is fatal — including an exhausted quota, which is reported like a rate
///   limit but which no reconnect refills — so a persistent bad request reports itself
///   instead of reconnecting in a loop.
fn error_control(error: &serde_json::Value) -> MessageControl {
    let field = |name: &str| error.get(name).and_then(serde_json::Value::as_str);
    let (kind, code) = (field("type").unwrap_or(""), field("code").unwrap_or(""));
    let exhausted = [kind, code]
        .iter()
        .any(|s| s.contains("quota") || s.contains("billing"));
    if code == "session_expired" {
        MessageControl::Handover
    } else if !exhausted
        && (matches!(
            code,
            "server_error"
                | "rate_limit_exceeded"
                | "overloaded"
                | "service_unavailable"
                | "timeout"
        ) || matches!(
            kind,
            "server_error" | "rate_limit_error" | "overloaded_error"
        ))
    {
        MessageControl::Reconnect
    } else {
        MessageControl::Fatal(format!("OpenAI realtime error: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::realtime::test_support::{handshake, Emitted, Harness};
    use crate::realtime::Signal;

    fn config(api_key: &str) -> OpenAiConfig {
        OpenAiConfig {
            api_key: api_key.to_string(),
            model: DEFAULT_OPENAI_TRANSLATE_MODEL.to_string(),
            transcribe_model: DEFAULT_OPENAI_TRANSCRIBE_MODEL.to_string(),
            host: DEFAULT_OPENAI_HOST.to_string(),
            target_language_code: "en".to_string(),
            origin: Origin::System,
        }
    }

    fn harness() -> Harness<OpenAiConfig> {
        Harness::new(config(""))
    }

    #[test]
    fn the_handshake_authenticates_with_a_bearer_header() {
        let request = config("sk-test").connect_request().unwrap();
        assert_eq!(
            handshake(request),
            "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate\n\
             GET /v1/realtime/translations?model=gpt-realtime-translate HTTP/1.1\r\n\
             Host: api.openai.com\r\n\
             Connection: Upgrade\r\n\
             Upgrade: websocket\r\n\
             Sec-WebSocket-Version: 13\r\n\
             Sec-WebSocket-Key: <key>\r\n\
             authorization: Bearer sk-test\r\n\
             \r\n"
        );
    }

    /// The operator reads these as the reconnecting status's detail.
    #[test]
    fn a_request_that_cannot_be_built_says_which_part_failed() {
        let error = config("sk-\ntest").connect_request().unwrap_err();
        assert_eq!(
            error.to_string(),
            "OpenAI API key is not a valid header value"
        );
        let mut config = config("sk-test");
        config.host = "not a host".to_string();
        let error = config.connect_request().unwrap_err();
        assert_eq!(error.to_string(), "failed to build OpenAI request");
    }

    #[test]
    fn only_translated_text_restarts_the_finalize_timer() {
        let mut h = harness();
        let source = h.send(r#"{"type":"session.input_transcript.delta","delta":"Bonjour"}"#);
        assert_eq!(source.caption, CaptionUpdate::Interim);
        assert_eq!(source.signal, Signal::None);

        let target = h.send(r#"{"type":"session.output_transcript.delta","delta":"Hello"}"#);
        assert_eq!(target.caption, CaptionUpdate::Interim);
        assert_eq!(target.signal, Signal::TranscriptActivity);

        assert_eq!(
            h.captions,
            [
                Emitted::interim(0, "", "Bonjour"),
                Emitted::interim(0, "Hello", "Bonjour"),
            ]
        );
    }

    #[test]
    fn an_explicit_done_finalizes_and_fills_a_missing_translation() {
        let mut h = harness();
        h.send(r#"{"type":"session.input_transcript.delta","delta":"Merci"}"#);
        h.send(r#"{"type":"session.output_transcript.done","transcript":"Thank you"}"#);
        h.send(r#"{"type":"session.output_transcript.delta","delta":"Next"}"#);
        assert_eq!(
            h.captions,
            [
                Emitted::interim(0, "", "Merci"),
                Emitted::final_(0, "Thank you", "Merci"),
                Emitted::interim(1, "Next", ""),
            ]
        );
    }

    #[test]
    fn done_keeps_streamed_text_and_ignores_an_empty_turn() {
        let mut h = harness();
        h.send(r#"{"type":"session.output_transcript.done","transcript":"stray"}"#);
        assert!(h.captions.is_empty(), "nothing to finalize yet");

        h.send(r#"{"type":"session.output_transcript.delta","delta":"Streamed"}"#);
        h.send(r#"{"type":"session.output_transcript.completed","transcript":"Different"}"#);
        assert_eq!(h.captions[1], Emitted::final_(0, "Streamed", ""));
    }

    #[test]
    fn session_closed_ends_the_session_and_unclassified_errors_are_fatal() {
        let mut h = harness();
        assert!(matches!(
            h.send(r#"{"type":"session.closed"}"#).control,
            MessageControl::Closed
        ));
        assert!(matches!(
            h.send(r#"{"type":"error","error":{"message":"quota"}}"#)
                .control,
            MessageControl::Fatal(_)
        ));
    }

    #[test]
    fn the_session_cap_hands_over_transient_errors_reconnect_and_the_rest_are_fatal() {
        let mut h = harness();
        for (error, expected) in [
            (
                r#"{"type":"invalid_request_error","code":"session_expired","message":"Your session hit the maximum duration of 60 minutes."}"#,
                "handover",
            ),
            (
                r#"{"type":"server_error","message":"The server had an error"}"#,
                "reconnect",
            ),
            (
                r#"{"type":"rate_limit_error","code":"rate_limit_exceeded"}"#,
                "reconnect",
            ),
            (
                r#"{"type":"server_error","code":"overloaded"}"#,
                "reconnect",
            ),
            (
                r#"{"type":"insufficient_quota","code":"insufficient_quota"}"#,
                "fatal",
            ),
            (
                r#"{"type":"rate_limit_error","code":"insufficient_quota"}"#,
                "fatal",
            ),
            (
                r#"{"type":"invalid_request_error","code":"invalid_api_key"}"#,
                "fatal",
            ),
            (r#"{"type":"authentication_error"}"#, "fatal"),
            (r#"{"type":"permission_error"}"#, "fatal"),
            (
                r#"{"type":"invalid_request_error","code":"model_not_found"}"#,
                "fatal",
            ),
            (
                r#"{"type":"invalid_request_error","code":"invalid_value","param":"session.audio.output.language"}"#,
                "fatal",
            ),
            (r#"{"type":"something_new"}"#, "fatal"),
            (r#""a bare string""#, "fatal"),
        ] {
            let frame = format!(r#"{{"type":"error","error":{error}}}"#);
            let control = h.send(&frame).control;
            let got = match control {
                MessageControl::Handover => "handover",
                MessageControl::Reconnect => "reconnect",
                MessageControl::Fatal(_) => "fatal",
                _ => "other",
            };
            assert_eq!(got, expected, "{error}");
        }
        assert!(h.captions.is_empty());
    }
}
