//! Wire types for OpenAI's Realtime *translations* WebSocket
//! (`/v1/realtime/translations`, model `gpt-realtime-translate`).
//! See `docs/openai-realtime-api.md` for the verified schema and references.

use serde::{Deserialize, Serialize};

// ---- Outgoing ------------------------------------------------------------

/// `session.update` — sent once after connect to set the target output language and turn on
/// source-language transcription. This is the translate model's only configuration knob; the
/// source language is auto-detected.
#[derive(Debug, Serialize)]
pub struct SessionUpdate {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub session: SessionConfig,
}

#[derive(Debug, Serialize)]
pub struct SessionConfig {
    pub audio: AudioConfig,
}

#[derive(Debug, Serialize)]
pub struct AudioConfig {
    pub input: AudioInput,
    pub output: AudioOutput,
}

#[derive(Debug, Serialize)]
pub struct AudioInput {
    /// Source-language transcription model — drives the operator monitor.
    pub transcription: TranscriptionModel,
    pub noise_reduction: NoiseReduction,
}

#[derive(Debug, Serialize)]
pub struct TranscriptionModel {
    pub model: String,
}

#[derive(Debug, Serialize)]
pub struct NoiseReduction {
    #[serde(rename = "type")]
    pub kind: &'static str,
}

#[derive(Debug, Serialize)]
pub struct AudioOutput {
    /// BCP-47 target language code; the model auto-detects the source.
    pub language: String,
}

impl SessionUpdate {
    pub fn translate(target_language_code: &str, transcription_model: &str) -> Self {
        SessionUpdate {
            kind: "session.update",
            session: SessionConfig {
                audio: AudioConfig {
                    input: AudioInput {
                        transcription: TranscriptionModel {
                            model: transcription_model.to_string(),
                        },
                        noise_reduction: NoiseReduction { kind: "near_field" },
                    },
                    output: AudioOutput {
                        language: target_language_code.to_string(),
                    },
                },
            },
        }
    }
}

/// `session.input_audio_buffer.append` — one base64 PCM-16 (24 kHz mono) chunk.
#[derive(Debug, Serialize)]
pub struct InputAudioAppend {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub audio: String,
}

impl InputAudioAppend {
    pub fn pcm16(base64_data: String) -> Self {
        InputAudioAppend {
            kind: "session.input_audio_buffer.append",
            audio: base64_data,
        }
    }
}

// ---- Incoming ------------------------------------------------------------

/// A server event. The translations stream has no turn lifecycle, so we read the transcript
/// deltas and finalize captions on a short idle gap (see the client). We match on the `type`
/// *suffix* to stay robust to the `session.`/`response.` prefix the preview API uses.
#[derive(Debug, Default, Deserialize)]
pub struct ServerEvent {
    #[serde(rename = "type", default)]
    pub kind: String,
    /// Incremental transcript text on `*output_transcript.delta` / `*input_transcript.delta`.
    #[serde(default)]
    pub delta: Option<String>,
    /// Full transcript on a `*.done` / `*.completed` event, if the server sends one.
    #[serde(default)]
    pub transcript: Option<String>,
    /// Some event variants carry the text as `text` rather than `delta`.
    #[serde(default)]
    pub text: Option<String>,
    /// Present on `error` events.
    #[serde(default)]
    pub error: Option<serde_json::Value>,
}

impl ServerEvent {
    /// Best-effort text payload (delta first, then text, then full transcript).
    pub fn payload(&self) -> Option<&str> {
        self.delta
            .as_deref()
            .or(self.text.as_deref())
            .or(self.transcript.as_deref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_update_sets_language_and_transcription() {
        let v =
            serde_json::to_value(SessionUpdate::translate("fr", "gpt-realtime-whisper")).unwrap();
        assert_eq!(v["type"], "session.update");
        assert_eq!(v["session"]["audio"]["output"]["language"], "fr");
        assert_eq!(
            v["session"]["audio"]["input"]["transcription"]["model"],
            "gpt-realtime-whisper"
        );
        assert_eq!(
            v["session"]["audio"]["input"]["noise_reduction"]["type"],
            "near_field"
        );
    }

    #[test]
    fn audio_append_carries_base64_and_type() {
        let v = serde_json::to_value(InputAudioAppend::pcm16("AAA=".into())).unwrap();
        assert_eq!(v["type"], "session.input_audio_buffer.append");
        assert_eq!(v["audio"], "AAA=");
    }

    #[test]
    fn parses_output_transcript_delta() {
        let raw = r#"{"type":"session.output_transcript.delta","delta":"Bonjour"}"#;
        let ev: ServerEvent = serde_json::from_str(raw).unwrap();
        assert!(ev.kind.ends_with("output_transcript.delta"));
        assert_eq!(ev.payload(), Some("Bonjour"));
    }

    #[test]
    fn payload_falls_back_to_transcript_on_done() {
        let raw = r#"{"type":"session.output_transcript.done","transcript":"Hello world"}"#;
        let ev: ServerEvent = serde_json::from_str(raw).unwrap();
        assert!(ev.kind.ends_with("output_transcript.done"));
        assert_eq!(ev.payload(), Some("Hello world"));
    }
}
