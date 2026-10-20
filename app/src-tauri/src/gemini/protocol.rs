//! Wire types for the two Gemini Live models this app speaks to over the one
//! `BidiGenerateContent` socket: Live Translate (translated captions) and Transcribe Live
//! (same-language subtitles). They share the endpoint, the audio frame and the server
//! envelope, and differ only in the setup message and which transcription fields come back.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct SetupMessage {
    pub setup: Setup,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Setup {
    pub model: String,
    pub generation_config: GenerationConfig,
    // Transcription sidecars are `BidiGenerateContentSetup` fields, not
    // `generationConfig` ones; the server rejects the whole setup if they are nested.
    pub input_audio_transcription: Empty,
    pub output_audio_transcription: Empty,
}

#[derive(Debug, Serialize)]
pub struct Empty {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationConfig {
    pub response_modalities: Vec<String>,
    pub translation_config: TranslationConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationConfig {
    pub target_language_code: String,
    pub echo_target_language: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeInputMessage {
    pub realtime_input: RealtimeInput,
}

#[derive(Debug, Serialize)]
pub struct RealtimeInput {
    pub audio: AudioBlob,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioBlob {
    pub mime_type: &'static str,
    pub data: String,
}

impl SetupMessage {
    pub fn live_translate(model: &str, target_language_code: &str) -> Self {
        Self {
            setup: Setup {
                model: format!("models/{model}"),
                generation_config: GenerationConfig {
                    // The current translate guide documents AUDIO output only. We discard
                    // audio payloads and use outputAudioTranscription for captions.
                    response_modalities: vec!["AUDIO".to_string()],
                    translation_config: TranslationConfig {
                        target_language_code: target_language_code.to_string(),
                        // Keep captions continuous in bilingual meetings: when speech is
                        // already in the target language, Gemini should transcribe it into
                        // the output sidecar instead of deliberately staying silent.
                        echo_target_language: true,
                    },
                },
                input_audio_transcription: Empty {},
                output_audio_transcription: Empty {},
            },
        }
    }
}

/// Setup for `gemini-3.5-transcribe-live`. Same socket as live translate, different shape:
/// TEXT out instead of AUDIO, no `translationConfig`, no output sidecar, and the input
/// sidecar carries configuration instead of being an empty marker.
#[derive(Debug, Serialize)]
pub struct TranscribeSetupMessage {
    pub setup: TranscribeSetup,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeSetup {
    pub model: String,
    pub generation_config: TranscribeGenerationConfig,
    // Same placement rule as live translate: a `BidiGenerateContentSetup` field, never a
    // `generationConfig` one.
    pub input_audio_transcription: AudioTranscriptionConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeGenerationConfig {
    pub response_modalities: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTranscriptionConfig {
    /// Empty enables automatic language identification across utterances, including
    /// code-switching — which is what a bilingual room needs.
    pub language_codes: Vec<String>,
    /// `VERBATIM` or `SMART`.
    pub mode: &'static str,
}

/// Cleaned-up transcription: fillers and false starts removed, self-corrections resolved,
/// punctuation and casing applied. Subtitles are read by an audience off an overlay, so
/// readability beats a faithful record of every "um".
pub const MODE_SMART: &str = "SMART";

impl TranscribeSetupMessage {
    pub fn live_transcribe(model: &str) -> Self {
        Self {
            setup: TranscribeSetup {
                model: format!("models/{model}"),
                generation_config: TranscribeGenerationConfig {
                    // Streaming text, not a speaking agent: the transcription model returns
                    // its transcript as TEXT and generates no audio to discard.
                    response_modalities: vec!["TEXT".to_string()],
                },
                input_audio_transcription: AudioTranscriptionConfig {
                    language_codes: Vec::new(),
                    mode: MODE_SMART,
                },
            },
        }
    }
}

/// Flushes audio the server has buffered but not yet transcribed, so a final segment can
/// still arrive during the shared runner's close drain.
pub const AUDIO_STREAM_END: &str = r#"{"realtimeInput":{"audioStreamEnd":true}}"#;

impl RealtimeInputMessage {
    pub fn pcm16(base64_data: String) -> Self {
        Self {
            realtime_input: RealtimeInput {
                audio: AudioBlob {
                    mime_type: "audio/pcm;rate=16000",
                    data: base64_data,
                },
            },
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerMessage {
    #[serde(default)]
    pub setup_complete: Option<serde_json::Value>,
    #[serde(default)]
    pub server_content: Option<ServerContent>,
    #[serde(default)]
    pub go_away: Option<serde_json::Value>,
    #[serde(default)]
    pub error: Option<serde_json::Value>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerContent {
    /// Live Translate: source-language monitor text, arriving as deltas to append.
    /// Transcribe Live: the *finalized* transcript for one speech segment, which replaces
    /// whatever interim hypothesis preceded it. The two clients read it accordingly.
    #[serde(default)]
    pub input_transcription: Option<Transcription>,
    /// Transcribe Live only: a speculative partial hypothesis, revised as the speaker
    /// talks. Each one supersedes the last rather than extending it.
    #[serde(default)]
    pub interim_input_transcription: Option<Transcription>,
    /// Transcribe Live's end-of-segment marker, and the counterpart to Live Translate's
    /// `turnComplete`. Undocumented — observed on the wire by `transcribe::live_probe`,
    /// which sees it after every finalized segment.
    #[serde(default)]
    pub generation_complete: Option<bool>,
    #[serde(default)]
    pub output_transcription: Option<Transcription>,
    #[serde(default)]
    pub turn_complete: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Transcription {
    #[serde(default)]
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_translate_setup_matches_current_documented_shape() {
        let value = serde_json::to_value(SetupMessage::live_translate(
            "gemini-3.5-live-translate-preview",
            "en",
        ))
        .unwrap();
        let setup = &value["setup"];
        let generation = &setup["generationConfig"];
        assert_eq!(generation["responseModalities"][0], "AUDIO");
        assert_eq!(generation["translationConfig"]["targetLanguageCode"], "en");
        assert_eq!(generation["translationConfig"]["echoTargetLanguage"], true);

        // The transcription sidecars sit on setup itself. Nesting them under
        // generationConfig makes the server reject setup with "Cannot find field".
        assert!(setup["inputAudioTranscription"].is_object());
        assert!(setup["outputAudioTranscription"].is_object());
        assert!(generation.get("inputAudioTranscription").is_none());
        assert!(generation.get("outputAudioTranscription").is_none());
    }

    #[test]
    fn live_transcribe_setup_matches_current_documented_shape() {
        let value = serde_json::to_value(TranscribeSetupMessage::live_transcribe(
            "gemini-3.5-transcribe-live",
        ))
        .unwrap();
        let setup = &value["setup"];
        assert_eq!(setup["model"], "models/gemini-3.5-transcribe-live");
        // Streaming text, not a speaking agent — the distinction the Live API draws between
        // a live agent and the live transcription pipeline.
        assert_eq!(setup["generationConfig"]["responseModalities"][0], "TEXT");

        // Same placement rule as live translate: the sidecar is a setup field.
        assert_eq!(setup["inputAudioTranscription"]["mode"], "SMART");
        assert!(setup["inputAudioTranscription"]["languageCodes"]
            .as_array()
            .is_some_and(|codes| codes.is_empty()));
        assert!(setup["generationConfig"]
            .get("inputAudioTranscription")
            .is_none());

        // Transcription has no translation target and generates no audio to transcribe back.
        assert!(setup["generationConfig"].get("translationConfig").is_none());
        assert!(setup.get("outputAudioTranscription").is_none());
    }

    #[test]
    fn parses_interim_and_final_transcriptions() {
        let message: ServerMessage = serde_json::from_str(
            r#"{"serverContent":{"interimInputTranscription":{"text":"the confe"}}}"#,
        )
        .unwrap();
        let content = message.server_content.unwrap();
        assert_eq!(
            content.interim_input_transcription.unwrap().text,
            "the confe"
        );
        assert!(content.input_transcription.is_none());
    }

    // Captured verbatim from `transcribe::live_probe`. Transcribe Live closes a segment with
    // `generationComplete`, not the `turnComplete` the translate path uses, and the guide
    // documents neither — so this frame is pinned from the wire rather than from the docs.
    #[test]
    fn parses_the_undocumented_segment_close() {
        let message: ServerMessage =
            serde_json::from_str(r#"{"serverContent":{"generationComplete":true}}"#).unwrap();
        let content = message.server_content.unwrap();
        assert_eq!(content.generation_complete, Some(true));
        assert!(content.turn_complete.is_none());
        assert!(content.input_transcription.is_none());
    }

    // Empty `serverContent` frames arrive between segments and must not be mistaken for a
    // close: acting on one would cut a caption in half mid-utterance.
    #[test]
    fn an_empty_server_content_frame_closes_nothing() {
        let message: ServerMessage = serde_json::from_str(r#"{"serverContent":{}}"#).unwrap();
        let content = message.server_content.unwrap();
        assert!(content.generation_complete.is_none());
        assert!(content.turn_complete.is_none());
        assert!(content.interim_input_transcription.is_none());
    }

    #[test]
    fn realtime_input_uses_current_audio_blob_shape() {
        let value = serde_json::to_value(RealtimeInputMessage::pcm16("AAA=".into())).unwrap();
        assert_eq!(
            value["realtimeInput"]["audio"]["mimeType"],
            "audio/pcm;rate=16000"
        );
        assert_eq!(value["realtimeInput"]["audio"]["data"], "AAA=");
    }

    #[test]
    fn parses_transcription_and_turn_complete() {
        let message: ServerMessage = serde_json::from_str(
            r#"{"serverContent":{"inputTranscription":{"text":"Hello"},"outputTranscription":{"text":"Bonjour"},"turnComplete":true}}"#,
        )
        .unwrap();
        let content = message.server_content.unwrap();
        assert_eq!(content.input_transcription.unwrap().text, "Hello");
        assert_eq!(content.output_transcription.unwrap().text, "Bonjour");
        assert_eq!(content.turn_complete, Some(true));
    }
}
