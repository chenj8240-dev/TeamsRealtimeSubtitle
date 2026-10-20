//! Wire types for Mistral's realtime transcription WebSocket.
//! The shapes mirror the official `mistralai` SDK's realtime connection implementation.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct SessionUpdate {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub session: SessionConfig,
}

#[derive(Debug, Serialize)]
pub struct SessionConfig {
    pub audio_format: AudioFormat,
    pub target_streaming_delay_ms: u32,
}

#[derive(Debug, Serialize)]
pub struct AudioFormat {
    pub encoding: &'static str,
    pub sample_rate: u32,
}

impl SessionUpdate {
    pub fn pcm16(target_streaming_delay_ms: u32) -> Self {
        Self {
            kind: "session.update",
            session: SessionConfig {
                audio_format: AudioFormat {
                    encoding: "pcm_s16le",
                    sample_rate: 16_000,
                },
                target_streaming_delay_ms,
            },
        }
    }
}

#[derive(Debug, Serialize)]
pub struct InputAudioAppend {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub audio: String,
}

impl InputAudioAppend {
    pub fn pcm16(audio: String) -> Self {
        Self {
            kind: "input_audio.append",
            audio,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ServerEvent {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub error: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_matches_official_realtime_schema() {
        let value = serde_json::to_value(SessionUpdate::pcm16(480)).unwrap();
        assert_eq!(value["type"], "session.update");
        assert_eq!(value["session"]["audio_format"]["encoding"], "pcm_s16le");
        assert_eq!(value["session"]["audio_format"]["sample_rate"], 16_000);
        assert_eq!(value["session"]["target_streaming_delay_ms"], 480);
    }

    #[test]
    fn audio_append_matches_official_realtime_schema() {
        let value = serde_json::to_value(InputAudioAppend::pcm16("AAA=".into())).unwrap();
        assert_eq!(value["type"], "input_audio.append");
        assert_eq!(value["audio"], "AAA=");
    }

    #[test]
    fn parses_text_delta() {
        let event: ServerEvent =
            serde_json::from_str(r#"{"type":"transcription.text.delta","text":"Bonjour"}"#)
                .unwrap();
        assert_eq!(event.kind, "transcription.text.delta");
        assert_eq!(event.text.as_deref(), Some("Bonjour"));
    }
}
