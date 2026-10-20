//! What a start request may ask for, and which sources and caption languages it runs.

use anyhow::Result;

use crate::types::{AudioSource, Origin, OutputMode, Provider, StartOptions, TargetLanguage};
use crate::whisper;

fn validate_provider(mode: OutputMode, provider: Provider) -> Result<()> {
    anyhow::ensure!(
        provider.can_translate() == (mode == OutputMode::Translate),
        "The selected provider does not support this output mode"
    );
    Ok(())
}

pub(super) fn validate_start(options: &StartOptions) -> Result<()> {
    validate_provider(options.mode, options.provider)?;
    // Both tasks take the spoken language: translating, it is the one Whisper translates from.
    if options.provider.is_local_whisper() {
        whisper::validate_language(options.spoken_language.as_deref())?;
    }
    anyhow::ensure!(
        options.target_language.supported_by(options.provider),
        "{:?} does not support caption language {}",
        options.provider,
        options.target_language.bcp47()
    );
    if options.rehearsal.is_none()
        && options.provider != Provider::OnDevice
        && options.source != AudioSource::Microphone
    {
        crate::audio::applications::validate(&options.system_capture)?;
    }
    if options.provider == Provider::OnDevice && options.source != AudioSource::Microphone {
        anyhow::bail!("The built-in demonstration uses its bundled sample; select Demo audio")
    }
    if options.provider == Provider::OnDevice && options.rehearsal.is_some() {
        anyhow::bail!("The built-in demonstration already uses bundled content")
    }
    if let Some(second) = options.second_target_language {
        anyhow::ensure!(
            options.mode == OutputMode::Translate,
            "A second caption language needs translation mode"
        );
        // The local pipeline runs one transcriber per source, with no lanes to relay to, and
        // Whisper's translate task writes English only.
        anyhow::ensure!(
            !options.provider.is_local_whisper(),
            "Whisper translates into English only; it has no second caption language"
        );
        anyhow::ensure!(
            second != options.target_language,
            "The second caption language is the same as the first"
        );
        anyhow::ensure!(
            second.supported_by(options.provider),
            "{:?} does not support caption language {}",
            options.provider,
            second.bcp47()
        );
    }
    Ok(())
}

/// The languages a session captions in, lane order: the target, then the second one if any.
pub(super) fn caption_languages(options: &StartOptions) -> Vec<TargetLanguage> {
    std::iter::once(options.target_language)
        .chain(options.second_target_language)
        .collect()
}

/// The capture devices a source selection opens, in a stable order.
pub(super) fn live_origins(source: AudioSource) -> Vec<Origin> {
    let mut origins = Vec::new();
    if source.wants_mic() {
        origins.push(Origin::Microphone);
    }
    if source.wants_system() {
        origins.push(Origin::System);
    }
    origins
}

/// The sources a session runs. A rehearsal runs exactly one origin, System, off the bundled
/// fixture: `source` and the microphone selection are deliberately ignored, because the point
/// of the mode is to exercise the pipeline with no audio hardware involved at all.
pub(super) fn session_origins(options: &StartOptions) -> Vec<Origin> {
    if options.rehearsal.is_some() {
        vec![Origin::System]
    } else {
        live_origins(options.source)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::tests::options;

    #[test]
    fn every_provider_is_rejected_in_the_wrong_mode() {
        for (provider, translates) in [
            (Provider::Gemini, true),
            (Provider::OpenAi, true),
            (Provider::GeminiTranscribe, false),
            (Provider::Mistral, false),
            (Provider::OnDevice, false),
            (Provider::Whisper, false),
            (Provider::WhisperTranslate, true),
        ] {
            assert_eq!(
                validate_provider(OutputMode::Translate, provider).is_ok(),
                translates
            );
            assert_eq!(
                validate_provider(OutputMode::Transcribe, provider).is_ok(),
                !translates
            );
        }
    }

    fn with_second(provider: &str, mode: &str, second: &str) -> StartOptions {
        serde_json::from_value(serde_json::json!({
            "source": "microphone",
            "targetLanguage": "fr",
            "provider": provider,
            "mode": mode,
            "secondTargetLanguage": second,
        }))
        .unwrap()
    }

    #[test]
    fn a_second_caption_language_is_a_second_lane_after_the_first() {
        assert_eq!(
            caption_languages(&options("microphone", None)),
            [TargetLanguage::Fr]
        );
        let dual = with_second("gemini", "translate", "en");
        assert_eq!(
            caption_languages(&dual),
            [TargetLanguage::Fr, TargetLanguage::En]
        );
        assert!(validate_start(&dual).is_ok());
    }

    #[test]
    fn a_second_caption_language_must_be_a_different_supported_translation() {
        assert!(validate_start(&with_second("gemini", "translate", "fr")).is_err());
        assert!(validate_start(&with_second("mistral", "transcribe", "en")).is_err());
        // Gemini offers Akan; OpenAI's thirteen targets do not include it.
        assert!(validate_start(&with_second("gemini", "translate", "ak")).is_ok());
        assert!(validate_start(&with_second("openai", "translate", "ak")).is_err());
    }

    fn local(provider: &str, mode: &str, target: &str) -> StartOptions {
        serde_json::from_value(serde_json::json!({
            "source": "microphone",
            "targetLanguage": target,
            "provider": provider,
            "mode": mode,
            "spokenLanguage": "fr",
        }))
        .unwrap()
    }

    #[test]
    fn whisper_translates_into_english_only_and_only_in_translation_mode() {
        assert!(validate_start(&local("whisper-translate", "translate", "en")).is_ok());
        for target in ["fr", "de", "ja"] {
            assert!(validate_start(&local("whisper-translate", "translate", target)).is_err());
        }
        assert!(validate_start(&local("whisper-translate", "transcribe", "en")).is_err());
        // The spoken language is still checked: it is what Whisper translates from.
        let mut options = local("whisper-translate", "translate", "en");
        options.spoken_language = Some("fake".into());
        assert!(validate_start(&options).is_err());
    }

    #[test]
    fn whisper_translation_has_no_second_caption_language() {
        for second in [TargetLanguage::Fr, TargetLanguage::De, TargetLanguage::En] {
            let mut options = local("whisper-translate", "translate", "en");
            options.second_target_language = Some(second);
            let error = validate_start(&options).unwrap_err().to_string();
            assert!(error.contains("English only"), "{error}");
        }
    }

    #[test]
    fn whisper_subtitles_are_unchanged() {
        // Subtitles ignore the caption language, whichever one the saved setup holds.
        for target in ["en", "fr", "ja"] {
            assert!(validate_start(&local("whisper", "transcribe", target)).is_ok());
        }
        assert!(validate_start(&local("whisper", "translate", "en")).is_err());
    }

    #[test]
    fn a_session_opens_the_selected_sources_in_order() {
        assert_eq!(
            session_origins(&options("both", None)),
            [Origin::Microphone, Origin::System]
        );
        assert_eq!(
            session_origins(&options("microphone", None)),
            [Origin::Microphone]
        );
        assert_eq!(session_origins(&options("system", None)), [Origin::System]);
    }

    #[test]
    fn a_rehearsal_plays_one_system_source_whatever_is_selected() {
        for source in ["microphone", "system", "both"] {
            assert_eq!(
                session_origins(&options(source, Some("en"))),
                [Origin::System]
            );
        }
    }
}
