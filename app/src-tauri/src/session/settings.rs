//! Which provider a session speaks to and how: its endpoint and model, and the client each
//! caption lane gets.

use anyhow::{Context, Result};
use tauri::async_runtime::JoinHandle as AsyncJoinHandle;

use super::builder::ClientIo;
use crate::gemini::{
    GeminiConfig, GeminiTranscribeConfig, DEFAULT_HOST, DEFAULT_TRANSCRIBE_MODEL,
    DEFAULT_TRANSLATE_MODEL,
};
use crate::mistral::{
    MistralConfig, DEFAULT_MISTRAL_HOST, DEFAULT_MISTRAL_MODEL, DEFAULT_TARGET_STREAMING_DELAY_MS,
};
use crate::ondevice::{self, OnDeviceConfig};
use crate::openai::{
    OpenAiConfig, DEFAULT_OPENAI_HOST, DEFAULT_OPENAI_TRANSCRIBE_MODEL,
    DEFAULT_OPENAI_TRANSLATE_MODEL,
};
use crate::types::{Provider, TargetLanguage};

/// The selected provider's endpoint and model, with any environment overrides applied.
///
/// Only the selected provider's variables are read, so a malformed override for one backend
/// (say `MISTRAL_TARGET_STREAMING_DELAY_MS`) cannot stop another from starting.
#[derive(Debug, PartialEq)]
pub(super) enum ProviderSettings {
    Gemini {
        host: String,
        model: String,
    },
    GeminiTranscribe {
        host: String,
        model: String,
    },
    OpenAi {
        host: String,
        model: String,
        transcribe_model: String,
    },
    Mistral {
        host: String,
        model: String,
        delay_ms: u32,
    },
    OnDevice,
    Whisper,
}

impl ProviderSettings {
    pub(super) fn resolve(provider: Provider) -> Result<Self> {
        Self::resolve_with(provider, |name| std::env::var(name).ok())
    }

    fn resolve_with(provider: Provider, var: impl Fn(&str) -> Option<String>) -> Result<Self> {
        let value = |name: &str, default: &str| var(name).unwrap_or_else(|| default.to_string());
        // Pointing a client at another server is a development tool. In a release build a
        // stray variable, or a `.env` in some parent directory, would otherwise be enough to
        // send the operator's API key somewhere else.
        let host = |name: &str, default: &str| {
            if cfg!(debug_assertions) {
                value(name, default)
            } else {
                default.to_string()
            }
        };
        Ok(match provider {
            Provider::Gemini => Self::Gemini {
                host: host("GEMINI_WS_HOST", DEFAULT_HOST),
                model: value("GEMINI_TRANSLATE_MODEL", DEFAULT_TRANSLATE_MODEL),
            },
            Provider::GeminiTranscribe => Self::GeminiTranscribe {
                host: host("GEMINI_WS_HOST", DEFAULT_HOST),
                model: value("GEMINI_TRANSCRIBE_MODEL", DEFAULT_TRANSCRIBE_MODEL),
            },
            Provider::OpenAi => Self::OpenAi {
                host: host("OPENAI_WS_HOST", DEFAULT_OPENAI_HOST),
                model: value("OPENAI_TRANSLATE_MODEL", DEFAULT_OPENAI_TRANSLATE_MODEL),
                transcribe_model: value("OPENAI_TRANSCRIBE_MODEL", DEFAULT_OPENAI_TRANSCRIBE_MODEL),
            },
            Provider::Mistral => Self::Mistral {
                host: host("MISTRAL_WS_HOST", DEFAULT_MISTRAL_HOST),
                model: value("MISTRAL_TRANSCRIBE_MODEL", DEFAULT_MISTRAL_MODEL),
                delay_ms: var("MISTRAL_TARGET_STREAMING_DELAY_MS")
                    .map(|v| v.parse::<u32>())
                    .transpose()
                    .context("MISTRAL_TARGET_STREAMING_DELAY_MS must be an integer")?
                    .unwrap_or(DEFAULT_TARGET_STREAMING_DELAY_MS),
            },
            Provider::OnDevice => Self::OnDevice,
            Provider::Whisper | Provider::WhisperTranslate => Self::Whisper,
        })
    }

    pub(super) fn spawn_client(
        &self,
        io: ClientIo,
        api_key: &str,
        target: TargetLanguage,
    ) -> Result<AsyncJoinHandle<()>> {
        let origin = io.origin;
        let api_key = api_key.to_string();
        let target_language_code = target.bcp47().to_string();
        Ok(match self {
            Self::Gemini { host, model } => io.spawn_realtime(GeminiConfig {
                api_key,
                model: model.clone(),
                host: host.clone(),
                target_language_code,
                origin,
            }),
            Self::GeminiTranscribe { host, model } => io.spawn_realtime(GeminiTranscribeConfig {
                api_key,
                model: model.clone(),
                host: host.clone(),
                origin,
            }),
            Self::OpenAi {
                host,
                model,
                transcribe_model,
            } => io.spawn_realtime(OpenAiConfig {
                api_key,
                model: model.clone(),
                transcribe_model: transcribe_model.clone(),
                host: host.clone(),
                target_language_code,
                origin,
            }),
            Self::Mistral {
                host,
                model,
                delay_ms,
            } => io.spawn_realtime(
                MistralConfig {
                    api_key,
                    model: model.clone(),
                    host: host.clone(),
                    target_streaming_delay_ms: *delay_ms,
                    origin,
                }
                .into_client(),
            ),
            Self::OnDevice => {
                let config = OnDeviceConfig {
                    origin,
                    language: target.try_into()?,
                };
                tauri::async_runtime::spawn(ondevice::run_session(
                    io.app,
                    config,
                    io.audio_rx,
                    io.cancel,
                    io.clock,
                    io.pause,
                ))
            }
            Self::Whisper => anyhow::bail!("Whisper requires the local audio pipeline"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn another_providers_malformed_override_does_not_block_a_session() {
        let env =
            |name: &str| (name == "MISTRAL_TARGET_STREAMING_DELAY_MS").then(|| "soon".to_string());
        assert!(ProviderSettings::resolve_with(Provider::Gemini, env).is_ok());
        assert!(ProviderSettings::resolve_with(Provider::Mistral, env).is_err());
    }

    #[test]
    fn model_overrides_apply_and_defaults_fill_the_rest() {
        let env = |name: &str| (name == "OPENAI_TRANSLATE_MODEL").then(|| "pinned".to_string());
        let ProviderSettings::OpenAi {
            model,
            transcribe_model,
            ..
        } = ProviderSettings::resolve_with(Provider::OpenAi, env).unwrap()
        else {
            panic!("wrong provider settings")
        };
        assert_eq!(model, "pinned");
        assert_eq!(transcribe_model, DEFAULT_OPENAI_TRANSCRIBE_MODEL);
    }

    #[test]
    fn host_overrides_are_honoured_only_in_debug_builds() {
        let env = |name: &str| (name == "GEMINI_WS_HOST").then(|| "localhost:9000".to_string());
        let ProviderSettings::Gemini { host, .. } =
            ProviderSettings::resolve_with(Provider::Gemini, env).unwrap()
        else {
            panic!("wrong provider settings")
        };
        let expected = if cfg!(debug_assertions) {
            "localhost:9000"
        } else {
            DEFAULT_HOST
        };
        assert_eq!(host, expected);
    }
}
