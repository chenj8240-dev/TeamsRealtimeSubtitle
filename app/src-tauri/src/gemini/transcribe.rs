//! Gemini 3.5 Transcribe Live: same-language subtitles over the same `BidiGenerateContent`
//! socket the translate client uses, with the same 16 kHz PCM frame and the same API key.
//!
//! Unlike Live Translate, the transcript *is* the audience caption, so it goes in the
//! accumulator's `text`, where Live Translate puts its translation, and reaches the export
//! through the ordinary caption path — the arrangement Mistral already uses.

use std::time::Duration;

use anyhow::Result;
use tokio_tungstenite::tungstenite::handshake::client::Request;

use super::gemini_request;
use super::protocol::{
    RealtimeInputMessage, ServerMessage, TranscribeSetupMessage, AUDIO_STREAM_END,
};
use crate::realtime::{
    parse_or_log, CaptionUpdate, MessageOutcome, RealtimeProtocol, TurnAccumulator,
};
use crate::types::Origin;

pub const DEFAULT_TRANSCRIBE_MODEL: &str = "gemini-3.5-transcribe-live";

/// Safety net, not the normal path: the server finalizes a segment when the speaker pauses,
/// and this only fires if an interim hypothesis is left stranded with no final behind it.
/// Deliberately longer than Mistral's 900 ms so it never races the server's own
/// finalization and splits one utterance across two transcript lines.
const FINALIZE_AFTER: Duration = Duration::from_secs(3);

#[derive(Clone)]
pub struct GeminiTranscribeConfig {
    pub api_key: String,
    pub model: String,
    pub host: String,
    pub origin: Origin,
}

impl RealtimeProtocol for GeminiTranscribeConfig {
    const NAME: &'static str = "Gemini Transcribe";

    fn origin(&self) -> Origin {
        self.origin
    }

    fn connect_request(&self) -> Result<Request> {
        gemini_request(Self::NAME, &self.host, &self.api_key)
    }

    fn setup_json(&self) -> Result<String> {
        Ok(serde_json::to_string(
            &TranscribeSetupMessage::live_transcribe(&self.model),
        )?)
    }

    fn audio_json(&self, base64_pcm: String) -> Result<String> {
        Ok(serde_json::to_string(&RealtimeInputMessage::pcm16(
            base64_pcm,
        ))?)
    }

    fn wait_for_setup_complete(&self) -> bool {
        true
    }

    fn closing_json(&self) -> Result<Vec<String>> {
        Ok(vec![AUDIO_STREAM_END.to_string()])
    }

    /// The authoritative final that follows `audioStreamEnd` is the flush it asked for. Waiting
    /// on past it held every Pause and Stop for the runner's whole safety timeout.
    fn drain_complete(&self, outcome: &MessageOutcome) -> bool {
        outcome.caption == CaptionUpdate::Final
    }

    fn handle_message(&mut self, text: &str, acc: &mut TurnAccumulator) -> MessageOutcome {
        let Some(msg) = parse_or_log::<ServerMessage>(Self::NAME, text) else {
            return MessageOutcome::default();
        };

        if let Some(outcome) = msg.control(self, "Gemini Transcribe error") {
            return outcome;
        }

        let Some(content) = msg.server_content else {
            return MessageOutcome::default();
        };

        // Empty finalized captions retract speculative text in both windows and the pending
        // transcript. Never archive an all-filler interim as confirmed speech.
        match apply_transcription(&content, acc) {
            Some(true) => MessageOutcome::activity(CaptionUpdate::Final),
            Some(false) => MessageOutcome::activity(CaptionUpdate::Interim),
            None => MessageOutcome::default(),
        }
    }

    fn finalize_after(&self) -> Option<Duration> {
        Some(FINALIZE_AFTER)
    }
}

/// Final text wins even when a frame also carries an interim hypothesis.
fn apply_transcription(
    content: &super::protocol::ServerContent,
    acc: &mut TurnAccumulator,
) -> Option<bool> {
    if let Some(final_text) = &content.input_transcription {
        acc.text.clone_from(&final_text.text);
        return Some(true);
    }
    if content.generation_complete.unwrap_or(false) || content.turn_complete.unwrap_or(false) {
        if acc.is_empty() {
            return None;
        }
        acc.text.clear();
        acc.source.clear();
        return Some(true);
    }
    if let Some(interim) = &content.interim_input_transcription {
        acc.text.clone_from(&interim.text);
        return Some(false);
    }
    None
}

#[cfg(test)]
mod smart_tests {
    use super::*;
    use crate::realtime::{MessageControl, Signal};
    fn content(raw: &str) -> super::super::protocol::ServerContent {
        serde_json::from_str::<ServerMessage>(raw)
            .unwrap()
            .server_content
            .unwrap()
    }
    #[test]
    fn smart_final_replaces_interim_even_in_the_same_frame() {
        let mut acc = TurnAccumulator::new(crate::timing::SessionClock::start(), 0);
        let frame = content(
            r#"{"serverContent":{"interimInputTranscription":{"text":"Um, I, I mean hello"},"inputTranscription":{"text":"Hello."}}}"#,
        );
        assert_eq!(apply_transcription(&frame, &mut acc), Some(true));
        assert_eq!(acc.text, "Hello.");
    }
    #[test]
    fn empty_smart_final_and_bare_close_retract_fillers() {
        for raw in [
            r#"{"serverContent":{"inputTranscription":{"text":""}}}"#,
            r#"{"serverContent":{"generationComplete":true}}"#,
        ] {
            let mut acc = TurnAccumulator::new(crate::timing::SessionClock::start(), 0);
            acc.text = "Um, uh".into();
            assert_eq!(apply_transcription(&content(raw), &mut acc), Some(true));
            assert!(acc.is_empty());
        }
    }

    #[test]
    fn interims_revise_the_segment_and_a_final_closes_it() {
        use crate::realtime::test_support::{Emitted, Harness};
        let mut h = Harness::new(GeminiTranscribeConfig {
            api_key: String::new(),
            model: DEFAULT_TRANSCRIBE_MODEL.to_string(),
            host: crate::gemini::DEFAULT_HOST.to_string(),
            origin: Origin::Microphone,
        });
        assert_eq!(
            h.send(r#"{"setupComplete":{}}"#).signal,
            Signal::SetupComplete
        );
        h.send(r#"{"serverContent":{"interimInputTranscription":{"text":"Hel"}}}"#);
        h.send(r#"{"serverContent":{"interimInputTranscription":{"text":"Hello there"}}}"#);
        let last = h.send(r#"{"serverContent":{"inputTranscription":{"text":"Hello there."}}}"#);
        assert_eq!(last.signal, Signal::TranscriptActivity);
        // A segment close with nothing pending is not a caption.
        h.send(r#"{"serverContent":{"generationComplete":true}}"#);
        assert_eq!(
            h.captions,
            [
                Emitted::interim(0, "Hel", ""),
                Emitted::interim(0, "Hello there", ""),
                Emitted::final_(0, "Hello there.", ""),
            ]
        );
        assert!(matches!(
            h.send(r#"{"goAway":{}}"#).control,
            MessageControl::Handover
        ));
    }

    /// The same endpoint and key as Live Translate; only the setup message tells them apart.
    #[test]
    fn the_handshake_matches_live_translate() {
        use crate::realtime::test_support::handshake;
        let mut config = GeminiTranscribeConfig {
            api_key: "gemini-test".to_string(),
            model: DEFAULT_TRANSCRIBE_MODEL.to_string(),
            host: crate::gemini::DEFAULT_HOST.to_string(),
            origin: Origin::Microphone,
        };
        let translate = crate::gemini::GeminiConfig {
            api_key: config.api_key.clone(),
            model: crate::gemini::DEFAULT_TRANSLATE_MODEL.to_string(),
            host: config.host.clone(),
            target_language_code: "fr".to_string(),
            origin: Origin::Microphone,
        };
        assert_eq!(
            handshake(config.connect_request().unwrap()),
            handshake(translate.connect_request().unwrap())
        );

        // The operator reads this as the reconnecting status's detail.
        config.host = "not a host".to_string();
        let error = config.connect_request().unwrap_err();
        assert_eq!(
            error.to_string(),
            "failed to build Gemini Transcribe request"
        );
    }

    #[test]
    fn the_close_drain_ends_on_the_final_after_the_stream_end() {
        use crate::realtime::test_support::Harness;
        let mut h = Harness::new(GeminiTranscribeConfig {
            api_key: String::new(),
            model: DEFAULT_TRANSCRIBE_MODEL.to_string(),
            host: crate::gemini::DEFAULT_HOST.to_string(),
            origin: Origin::Microphone,
        });
        let interim =
            h.send(r#"{"serverContent":{"interimInputTranscription":{"text":"And fin"}}}"#);
        assert!(!h.proto.drain_complete(&interim));
        let last = h.send(r#"{"serverContent":{"inputTranscription":{"text":"And finally."}}}"#);
        assert!(h.proto.drain_complete(&last));
    }
}

/// Opt-in probe against the real endpoint. Ignored by default, so CI never runs it and it
/// never bills anyone by accident:
///
/// ```text
/// GEMINI_API_KEY=... cargo test -p live-translation --lib live_probe -- --ignored --nocapture
/// ```
///
/// Serialization tests pin this client to the *documented* shape. They cannot tell us the
/// documentation is right — and it demonstrably is not everywhere, since the live translate
/// guide still shows the transcription sidecars nested under `generationConfig`, a placement
/// the server rejects outright. This closes that gap by putting the production setup message,
/// audio frame and response types in front of Google's servers with the bundled rehearsal
/// recording as input. Re-run it before an event, as `docs/gemini-live-api.md` asks.
#[cfg(test)]
mod live_probe {
    use std::time::Duration;

    use base64::Engine;
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    use super::*;
    use crate::audio::fixture::load_fixture;
    use crate::audio::{chunk_samples, resample::f32_to_pcm16_le};
    use crate::gemini::protocol::AUDIO_STREAM_END;
    use crate::gemini::DEFAULT_HOST;

    /// The Live API replies in **binary** frames carrying UTF-8 JSON, not text frames —
    /// undocumented, and the reason this probe reads them the way `realtime/socket.rs` does
    /// rather than matching on `Message::Text`. A text-only reader sees the socket go silent.
    fn frame_json(message: &Message) -> Option<String> {
        match message {
            Message::Text(text) => Some(text.to_string()),
            Message::Binary(bytes) => String::from_utf8(bytes.to_vec()).ok(),
            _ => None,
        }
    }

    const FIXTURE: &str = "resources/fixtures/rehearsal-en.wav";
    const RATE: u32 = 16_000;
    /// The recording is about twenty seconds; the rest is head-room for the closing drain.
    const DEADLINE: Duration = Duration::from_secs(60);

    #[tokio::test]
    #[ignore = "streams the bundled fixture to Google and bills the key; run with --ignored"]
    async fn the_documented_shape_is_the_shape_the_server_accepts() {
        let _ = dotenvy::dotenv();
        let api_key = std::env::var("GEMINI_API_KEY")
            .expect("set GEMINI_API_KEY, or copy .env.example to .env at the repo root");

        let config = GeminiTranscribeConfig {
            api_key,
            model: DEFAULT_TRANSCRIBE_MODEL.to_string(),
            host: DEFAULT_HOST.to_string(),
            origin: Origin::Microphone,
        };

        let samples = load_fixture(std::path::Path::new(FIXTURE))
            .expect("the bundled rehearsal fixture should load");
        let per_chunk = chunk_samples(RATE);
        println!(
            "probing {} with {:.1}s of bundled speech",
            config.model,
            samples.len() as f32 / RATE as f32
        );

        let (socket, _) = connect_async(config.connect_request().unwrap())
            .await
            .expect("the Live API should accept the connection");
        let (mut write, mut read) = socket.split();

        // Failure here is the one this probe exists for: a setup field in the wrong place
        // comes back as `Unknown name ... Cannot find field`, not as a bad transcript.
        write
            .send(Message::Text(config.setup_json().unwrap().into()))
            .await
            .unwrap();
        let deadline = tokio::time::Instant::now() + DEADLINE;
        loop {
            let message = tokio::time::timeout_at(deadline, read.next())
                .await
                .expect("timed out waiting for setupComplete")
                .expect("the server closed before confirming setup")
                .unwrap();
            if let Message::Close(frame) = &message {
                panic!("the server rejected setup: {frame:?}");
            }
            if let Some(json) = frame_json(&message) {
                let parsed: ServerMessage = serde_json::from_str(&json)
                    .unwrap_or_else(|e| panic!("unparsed setup reply: {e} :: {json}"));
                assert!(
                    parsed.error.is_none(),
                    "the server rejected setup: {:?}",
                    parsed.error
                );
                if parsed.setup_complete.is_some() {
                    println!("setup accepted");
                    break;
                }
            }
        }

        // Pace the fixture at wall-clock speed. Dumping twenty seconds of audio at once is a
        // different thing from a live room, and this probe is only worth what its realism is.
        let sender = tokio::spawn(async move {
            let mut pcm = Vec::new();
            for chunk in samples.chunks(per_chunk) {
                pcm.clear();
                f32_to_pcm16_le(chunk, &mut pcm);
                let data = base64::engine::general_purpose::STANDARD.encode(&pcm);
                if write
                    .send(Message::Text(config.audio_json(data).unwrap().into()))
                    .await
                    .is_err()
                {
                    return write;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            let _ = write.send(Message::Text(AUDIO_STREAM_END.into())).await;
            write
        });

        let mut interim = Vec::new();
        let mut finals: Vec<String> = Vec::new();
        let mut closes = 0usize;
        while let Ok(Some(Ok(message))) = tokio::time::timeout_at(deadline, read.next()).await {
            let Some(json) = frame_json(&message) else {
                continue;
            };
            let parsed: ServerMessage = serde_json::from_str(&json)
                .unwrap_or_else(|e| panic!("unparsed server message: {e} :: {json}"));
            assert!(parsed.error.is_none(), "provider error: {:?}", parsed.error);
            let Some(content) = parsed.server_content else {
                continue;
            };
            if let Some(t) = content.interim_input_transcription {
                println!("  interim: {}", t.text);
                interim.push(t.text);
            }
            if let Some(t) = content.input_transcription {
                println!("  FINAL:   {}", t.text);
                finals.push(t.text);
            }
            if content.generation_complete.unwrap_or(false) {
                println!("  [generationComplete]");
                closes += 1;
            }
            // The fixture is one short passage; one finalized segment is enough to prove the
            // field names, and waiting for the socket to close would only cost wall clock.
            if !finals.is_empty() && sender.is_finished() {
                break;
            }
        }

        assert!(
            !finals.iter().any(String::is_empty) && !finals.is_empty(),
            "expected at least one non-empty inputTranscription; interim seen: {}",
            interim.len()
        );
        assert!(
            closes > 0,
            "expected generationComplete to close a segment; the client relies on it to \
             finalize a segment that yields no transcript"
        );
        // Interim is a revision of the segment in progress, never an increment of it. If this
        // ever stops holding, the client's replace-don't-append rule is wrong.
        assert!(
            interim.len() > finals.len(),
            "expected many speculative updates per finalized segment, got {} and {}",
            interim.len(),
            finals.len()
        );
        println!(
            "ok — {} interim update(s), {} finalized segment(s), {} segment close(s)",
            interim.len(),
            finals.len(),
            closes
        );
    }
}
