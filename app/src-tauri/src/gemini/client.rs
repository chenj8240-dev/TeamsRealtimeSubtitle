//! Gemini Live protocol: connection details and server-message handling for the shared
//! realtime session runner (`crate::realtime`). Sends 16 kHz PCM chunks and turns the
//! returned transcriptions into caption events.

use anyhow::Result;
use tokio_tungstenite::tungstenite::handshake::client::Request;

use super::gemini_request;
use super::protocol::{RealtimeInputMessage, ServerMessage, SetupMessage, AUDIO_STREAM_END};
use crate::realtime::{
    parse_or_log, CaptionUpdate, MessageOutcome, RealtimeProtocol, TurnAccumulator,
};
use crate::types::Origin;

/// Dedicated speech-to-speech translate model; audio output is discarded after its
/// transcription sidecar is extracted.
pub const DEFAULT_TRANSLATE_MODEL: &str = "gemini-3.5-live-translate-preview";
pub const DEFAULT_HOST: &str = "generativelanguage.googleapis.com";

#[derive(Clone)]
pub struct GeminiConfig {
    pub api_key: String,
    pub model: String,
    pub host: String,
    pub target_language_code: String,
    pub origin: Origin,
}

impl RealtimeProtocol for GeminiConfig {
    const NAME: &'static str = "Gemini";

    fn origin(&self) -> Origin {
        self.origin
    }

    fn connect_request(&self) -> Result<Request> {
        gemini_request(Self::NAME, &self.host, &self.api_key)
    }

    fn setup_json(&self) -> Result<String> {
        let setup = SetupMessage::live_translate(&self.model, &self.target_language_code);
        Ok(serde_json::to_string(&setup)?)
    }

    fn audio_json(&self, base64_pcm: String) -> Result<String> {
        Ok(serde_json::to_string(&RealtimeInputMessage::pcm16(
            base64_pcm,
        ))?)
    }

    fn wait_for_setup_complete(&self) -> bool {
        true
    }

    /// Without it, closing at once loses the translation of the last one to three seconds of
    /// speech on every Pause and Stop. The guide documents `audioStreamEnd` for the Live API
    /// generally, not for Live Translate in particular, so a live check is still pending; if
    /// the server rejects it, the runner ends the drain quietly and keeps the turn so far.
    fn closing_json(&self) -> Result<Vec<String>> {
        Ok(vec![AUDIO_STREAM_END.to_string()])
    }

    /// The model finishes its turn once the stream end has flushed the speech it was given.
    fn drain_complete(&self, outcome: &MessageOutcome) -> bool {
        outcome.caption == CaptionUpdate::Final
    }

    fn handle_message(&mut self, text: &str, acc: &mut TurnAccumulator) -> MessageOutcome {
        let Some(msg) = parse_or_log::<ServerMessage>(Self::NAME, text) else {
            return MessageOutcome::default();
        };

        if let Some(outcome) = msg.control(self, "Gemini realtime error") {
            return outcome;
        }

        let Some(content) = msg.server_content else {
            return MessageOutcome::default();
        };

        // Source text (operator monitor) comes from the input transcription; the
        // translated text from the output-audio transcription sidecar.
        if let Some(t) = &content.input_transcription {
            acc.source.push_str(&t.text);
        }
        let translated_delta = content
            .output_transcription
            .as_ref()
            .map(|t| t.text.as_str());
        let got_translation = translated_delta.is_some_and(|s| !s.is_empty());
        if let Some(delta) = translated_delta {
            acc.text.push_str(delta);
        }

        // Emit whenever we have new text, or to mark the turn final.
        if content.turn_complete.unwrap_or(false) {
            MessageOutcome::caption(CaptionUpdate::Final)
        } else if got_translation || content.input_transcription.is_some() {
            MessageOutcome::caption(CaptionUpdate::Interim)
        } else {
            MessageOutcome::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::realtime::test_support::{handshake, Emitted, Harness};
    use crate::realtime::{MessageControl, Signal};

    fn config(api_key: &str) -> GeminiConfig {
        GeminiConfig {
            api_key: api_key.to_string(),
            model: DEFAULT_TRANSLATE_MODEL.to_string(),
            host: DEFAULT_HOST.to_string(),
            target_language_code: "fr".to_string(),
            origin: Origin::Microphone,
        }
    }

    fn harness() -> Harness<GeminiConfig> {
        Harness::new(config(""))
    }

    /// The Live API takes its key as a query parameter; the model goes in the setup message.
    #[test]
    fn the_handshake_carries_the_key_in_the_query() {
        let request = config("gemini-test").connect_request().unwrap();
        assert_eq!(
            handshake(request),
            "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=gemini-test\n\
             GET /ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=gemini-test HTTP/1.1\r\n\
             Host: generativelanguage.googleapis.com\r\n\
             Connection: Upgrade\r\n\
             Upgrade: websocket\r\n\
             Sec-WebSocket-Version: 13\r\n\
             Sec-WebSocket-Key: <key>\r\n\
             \r\n"
        );
    }

    /// The operator reads this as the reconnecting status's detail.
    #[test]
    fn a_request_that_cannot_be_built_names_the_provider() {
        let mut config = config("gemini-test");
        config.host = "not a host".to_string();
        let error = config.connect_request().unwrap_err();
        assert_eq!(error.to_string(), "failed to build Gemini request");
    }

    #[test]
    fn source_and_translation_accumulate_until_the_turn_completes() {
        let mut h = harness();
        h.send(r#"{"serverContent":{"inputTranscription":{"text":"Good "}}}"#);
        h.send(r#"{"serverContent":{"inputTranscription":{"text":"morning"},"outputTranscription":{"text":"Bonjour"}}}"#);
        h.send(r#"{"serverContent":{"turnComplete":true}}"#);
        h.send(r#"{"serverContent":{"outputTranscription":{"text":"Merci"}}}"#);
        assert_eq!(
            h.captions,
            [
                Emitted::interim(0, "", "Good "),
                Emitted::interim(0, "Bonjour", "Good morning"),
                Emitted::final_(0, "Bonjour", "Good morning"),
                Emitted::interim(1, "Merci", ""),
            ]
        );
    }

    #[test]
    fn an_empty_translation_delta_alone_emits_nothing() {
        let mut h = harness();
        h.send(r#"{"serverContent":{"outputTranscription":{"text":""}}}"#);
        h.send(r#"{"serverContent":{"modelTurn":{}}}"#);
        assert!(h.captions.is_empty());
    }

    #[test]
    fn closing_ends_the_audio_stream_and_the_drain_ends_on_turn_complete() {
        let mut h = harness();
        assert_eq!(h.proto.closing_json().unwrap(), [AUDIO_STREAM_END]);
        let interim = h.send(r#"{"serverContent":{"outputTranscription":{"text":"Merci"}}}"#);
        assert!(!h.proto.drain_complete(&interim));
        let done = h.send(r#"{"serverContent":{"turnComplete":true}}"#);
        assert!(h.proto.drain_complete(&done));
        assert_eq!(h.captions.last(), Some(&Emitted::final_(0, "Merci", "")));
    }

    #[test]
    fn setup_go_away_and_errors_steer_the_connection() {
        let mut h = harness();
        assert_eq!(
            h.send(r#"{"setupComplete":{}}"#).signal,
            Signal::SetupComplete
        );
        assert!(matches!(
            h.send(r#"{"goAway":{"timeLeft":"10s"}}"#).control,
            MessageControl::Handover
        ));
        assert!(matches!(
            h.send(r#"{"error":{"code":400,"message":"bad"}}"#).control,
            MessageControl::Fatal(_)
        ));
        assert!(h.captions.is_empty());
    }
}
