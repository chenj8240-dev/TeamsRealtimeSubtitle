//! Types shared with the front-end. These mirror `src/lib/types.ts` — keep them in sync.

use serde::{Deserialize, Serialize};

use crate::errors::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioSource {
    Microphone,
    System,
    Both,
}

impl AudioSource {
    pub fn wants_mic(self) -> bool {
        matches!(self, AudioSource::Microphone | AudioSource::Both)
    }
    pub fn wants_system(self) -> bool {
        matches!(self, AudioSource::System | AudioSource::Both)
    }
}

/// A single capture source, used as the `origin` on captions/levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Microphone,
    System,
}

include!("language_codes.rs");

#[cfg(test)]
mod language_tests {
    use super::*;

    #[test]
    fn all_catalog_codes_round_trip_and_match_provider_support() {
        let catalog: serde_json::Value =
            serde_json::from_str(include_str!("../../src/lib/languages.json")).unwrap();
        for row in catalog["languages"].as_array().unwrap() {
            let language: TargetLanguage = serde_json::from_value(row["code"].clone()).unwrap();
            assert_eq!(language.bcp47(), row["code"].as_str().unwrap());
            assert_eq!(serde_json::to_value(language).unwrap(), row["code"]);
            for (name, provider) in [
                ("gemini", Provider::Gemini),
                ("openai", Provider::OpenAi),
                ("ondevice", Provider::OnDevice),
                ("whisper-translate", Provider::WhisperTranslate),
            ] {
                assert_eq!(
                    language.supported_by(provider),
                    row["providers"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|p| p == name)
                );
            }
        }
        assert!(serde_json::from_str::<TargetLanguage>("\"invalid\"").is_err());
        assert!(serde_json::from_str::<DemoLanguage>("\"de\"").is_err());
        assert!(DemoLanguage::try_from(TargetLanguage::Ja).is_err());
    }
}

/// Only languages with reviewed bundled scripts and packaged rehearsal audio.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DemoLanguage {
    En,
    Fr,
}

impl DemoLanguage {
    #[cfg(test)]
    pub const ALL: [Self; 2] = [Self::En, Self::Fr];

    pub fn fixture_file(self) -> &'static str {
        match self {
            Self::En => "rehearsal-en.wav",
            Self::Fr => "rehearsal-fr.wav",
        }
    }
}

impl TryFrom<TargetLanguage> for DemoLanguage {
    type Error = anyhow::Error;
    fn try_from(language: TargetLanguage) -> Result<Self, Self::Error> {
        match language {
            TargetLanguage::En => Ok(Self::En),
            TargetLanguage::Fr => Ok(Self::Fr),
            _ => anyhow::bail!("The built-in demo only supports English and French"),
        }
    }
}

/// Caption backend. The cloud providers each have their own realtime API, audio rate and
/// key; `OnDevice` is the credential-free bundled product demonstration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Gemini,
    /// Gemini 3.5 Transcribe Live — subtitles, not translation. Shares Gemini's endpoint
    /// and API key; a separate variant because the wire format, the rate and the mode it
    /// serves are all different.
    #[serde(rename = "gemini-transcribe")]
    GeminiTranscribe,
    OpenAi,
    Mistral,
    /// Bundled deterministic demonstration. Keyless, offline, same-language only.
    OnDevice,
    Whisper,
    /// Local Whisper with its translate task: the same pipeline, model and download, writing
    /// English whatever is spoken. A separate variant for the reason the Gemini pair is: it
    /// serves the other mode, so `can_translate` stays a plain function of the provider.
    #[serde(rename = "whisper-translate")]
    WhisperTranslate,
}

impl Provider {
    /// Sample rate the backend expects on input, in Hz.
    pub fn input_sample_rate(self) -> u32 {
        // Listed rather than `_`, so a new provider has to state its rate.
        match self {
            Provider::OpenAi => 24_000,
            Provider::Gemini
            | Provider::GeminiTranscribe
            | Provider::Mistral
            | Provider::OnDevice
            | Provider::Whisper
            | Provider::WhisperTranslate => 16_000,
        }
    }

    /// Whether a provider API key must be present before a session can start. The built-in
    /// demonstration and local Whisper work with no credential — which is what keeps provider
    /// keys out of the app's *primary* functionality.
    pub fn requires_api_key(self) -> bool {
        !(self == Provider::OnDevice || self.is_local_whisper())
    }

    /// Whether the backend can produce translated captions. The built-in demonstration is
    /// same-language only, and Whisper's translate task writes English only.
    pub fn can_translate(self) -> bool {
        matches!(
            self,
            Provider::Gemini | Provider::OpenAi | Provider::WhisperTranslate
        )
    }

    /// Whether the session runs the local Whisper pipeline — model, CPU gate, spool, pending
    /// audio — rather than a realtime client. Both Whisper tasks do; only the task differs.
    pub fn is_local_whisper(self) -> bool {
        matches!(self, Provider::Whisper | Provider::WhisperTranslate)
    }
}

#[cfg(test)]
mod provider_tests {
    use super::*;

    #[test]
    fn both_whisper_tasks_run_locally_without_a_key_and_only_one_translates() {
        for (provider, name) in [
            (Provider::Whisper, "\"whisper\""),
            (Provider::WhisperTranslate, "\"whisper-translate\""),
        ] {
            assert_eq!(serde_json::to_string(&provider).unwrap(), name);
            assert_eq!(serde_json::from_str::<Provider>(name).unwrap(), provider);
            assert!(provider.is_local_whisper());
            assert!(!provider.requires_api_key());
            assert_eq!(provider.input_sample_rate(), 16_000);
        }
        assert!(Provider::WhisperTranslate.can_translate());
        assert!(!Provider::Whisper.can_translate());
        assert!(!Provider::Gemini.is_local_whisper() && !Provider::OnDevice.is_local_whisper());
    }
}

/// What the audience should see. Mistral Voxtral and Gemini Transcribe power same-language
/// subtitles; Gemini Live Translate and OpenAI power translated captions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputMode {
    #[default]
    Translate,
    Transcribe,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    pub source: AudioSource,
    pub target_language: TargetLanguage,
    /// Output behavior. Defaults to translation for older front-ends that omit it.
    #[serde(default)]
    pub mode: OutputMode,
    /// Realtime backend. Defaults to Gemini for older front-ends that omit it.
    #[serde(default)]
    pub provider: Provider,
    #[serde(default)]
    pub mic_device_name: Option<String>,
    #[serde(default)]
    pub mic_device_id: Option<String>,
    #[serde(default)]
    pub system_device_id: Option<String>,
    #[serde(default)]
    pub system_capture: crate::audio::applications::SystemCapture,
    /// Rehearsal mode: play the bundled speech fixture for this language through the whole
    /// pipeline instead of capturing audio, so the overlay, move mode and the export can be
    /// exercised with no microphone and no sound in the room. Absent — the normal case — runs
    /// a live session. `source` and `mic_device_name` are ignored while it is set.
    /// See gate 2 in `docs/microsoft-store.md`.
    #[serde(default)]
    pub rehearsal: Option<DemoLanguage>,
    /// Caption every source in a second language as well, from a second translation client
    /// fed by the same capture — lane 1, beside `target_language` on lane 0. Translation only.
    #[serde(default)]
    pub second_target_language: Option<TargetLanguage>,
    #[serde(default)]
    pub whisper_model: crate::whisper::models::ModelId,
    #[serde(default)]
    pub spoken_language: Option<String>,
}

/// Borrows the turn's text rather than owning it: a caption is serialized the moment it is
/// emitted, and an interim is emitted for every delta, so an owned copy of the whole turn so
/// far would be made and thrown away each time.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Caption<'a> {
    pub turn_id: u64,
    pub text: &'a str,
    pub source_text: &'a str,
    /// `final` is a Rust keyword; serde exposes it to JS under the real name.
    #[serde(rename = "final")]
    pub final_: bool,
    pub origin: Origin,
    /// Which of the session's caption languages this is: 0 for `target_language`, 1 for
    /// `second_target_language`. A source's two lanes are independent turn streams.
    pub lane: u8,
    /// When this turn first had text, in ms since the session started. Constant for every
    /// caption of a turn, so an interim and its final agree on where the cue begins.
    pub start_ms: u64,
    /// When *this* caption was emitted, same scale. On a final caption it is the end of the
    /// cue. See `timing::SessionClock` for why the core stamps these and the window does not.
    pub end_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevel {
    pub source: Origin,
    pub rms: f32,
    pub peak: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    Idle,
    Connecting,
    Running,
    Reconnecting,
    /// The operator paused the session: capture and meters carry on, but the provider
    /// connection is closed, so nothing is streamed or billed until it resumes.
    Paused,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusUpdate {
    pub state: SessionState,
    /// Why, when there is a why: an id the interface translates, plus the untranslated
    /// technical detail underneath it. See `errors::AppError`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<AppError>,
    /// Which source this update is about; `None` means the whole session (e.g. stop).
    /// The operator UI aggregates per-origin states so concurrent sources don't clobber
    /// each other.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<Origin>,
    /// Which caption language of that source; `None` means all of them — a capture failure
    /// ends every lane it feeds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane: Option<u8>,
}

/// One constructor per scope, so every status says what it is about the same way: the whole
/// session, one source, or one caption language of a source.
impl StatusUpdate {
    /// About the whole session, every source at once: the Idle that Stop publishes once every
    /// client has drained, with the failure that ended the session, if one did.
    pub(crate) fn session(state: SessionState, message: Option<AppError>) -> Self {
        Self {
            state,
            message,
            origin: None,
            lane: None,
        }
    }

    /// About one source and every caption language it feeds: a capture failure ends them all,
    /// a pause holds them all, and the demonstration and Whisper only ever have the one.
    pub(crate) fn source(origin: Origin, state: SessionState, message: Option<AppError>) -> Self {
        Self {
            state,
            message,
            origin: Some(origin),
            lane: None,
        }
    }

    /// About one caption language of one source: the realtime client that produces it, which
    /// connects, reconnects and fails independently of the source's other lane.
    pub(crate) fn lane(
        origin: Origin,
        lane: u8,
        state: SessionState,
        message: Option<AppError>,
    ) -> Self {
        Self {
            state,
            message,
            origin: Some(origin),
            lane: Some(lane),
        }
    }
}

#[cfg(test)]
mod status_tests {
    use super::*;
    use crate::errors::id;

    /// The interface tells the three scopes apart by which fields are present at all.
    #[test]
    fn each_scope_serializes_only_the_fields_that_address_it() {
        let json = |update: StatusUpdate| serde_json::to_string(&update).unwrap();
        assert_eq!(
            json(StatusUpdate::session(SessionState::Idle, None)),
            r#"{"state":"idle"}"#
        );
        assert_eq!(
            json(StatusUpdate::source(
                Origin::Microphone,
                SessionState::Error,
                Some(AppError::with(id::MIC_CAPTURE, "unplugged")),
            )),
            r#"{"state":"error","message":{"id":"error.micCapture","detail":"unplugged"},"origin":"microphone"}"#
        );
        assert_eq!(
            json(StatusUpdate::lane(
                Origin::System,
                1,
                SessionState::Running,
                None
            )),
            r#"{"state":"running","origin":"system","lane":1}"#
        );
    }
}

/// Level-only capture, started from the preflight so an operator can confirm the room
/// microphone or the loopback is actually producing sound *before* committing to a session.
/// It opens the same devices as a session, discards every sample, and never reaches a
/// provider, so it costs nothing and stores nothing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTestUpdate {
    pub active: bool,
    /// Present when the test stopped because a device failed, not because it was stopped.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<AppError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Event names emitted to the front-end. Mirror `EVT` in types.ts.
pub mod events {
    pub const WHISPER_PROGRESS: &str = "whisper-progress";
    pub const CAPTION: &str = "caption";
    pub const LEVEL: &str = "audio-level";
    pub const STATUS: &str = "status";
    /// Windows endpoint notifications; other platforms use manual device refresh.
    #[cfg(windows)]
    pub const AUDIO_DEVICES_CHANGED: &str = "audio-devices-changed";
    /// Deliberately separate from `STATUS`: a preflight audio test is not a session, and
    /// must never move the operator UI's session state machine.
    pub const AUDIO_TEST: &str = "audio-test";
    /// The operator tried to close the window while something was still unsaved or running,
    /// and the core held the window open for an answer. See `lifecycle::CloseGuard`.
    pub const CLOSE_REQUESTED: &str = "close-requested";
    /// A tray menu entry the front-end has to carry out, because it needs the session or
    /// transcript state the renderer owns. Payload is `tray::TrayCommand`.
    pub const TRAY_COMMAND: &str = "tray-command";
    /// The operator moved Windows' accessibility text-size slider. Payload is the clamped
    /// factor as a float; see `textscale`.
    pub const TEXT_SCALE: &str = "text-scale";
    /// The connected displays settled into a different arrangement, and the overlay has been
    /// brought back onto one of them if it was stranded. Payload is the new layout signature,
    /// as `display_layout` returns it; see `placement`.
    pub const DISPLAYS_CHANGED: &str = "displays-changed";
}
