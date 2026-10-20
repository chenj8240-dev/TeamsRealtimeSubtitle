//! Deterministic, keyless product demonstration.
//!
//! The `ondevice` provider identifier is retained for settings compatibility, but this path
//! deliberately performs no speech recognition. It plays a bundled demonstration timeline
//! that exercises the same caption, overlay, level-meter, elapsed-time, and export paths as
//! a live provider. That makes first launch useful and testable on every supported Windows
//! architecture without a microphone, language pack, network connection, or API key.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::Receiver;
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

use crate::audio::AudioChunk;
use crate::realtime::{emit_caption, wait_for_resume, Events, PauseRx, TurnAccumulator};
use crate::timing::SessionClock;
use crate::types::{events, AudioLevel, DemoLanguage, Origin, SessionState, StatusUpdate};

pub struct OnDeviceConfig {
    pub origin: Origin,
    pub language: DemoLanguage,
}

/// `state` names the situation; the interface catalog words it. This used to carry a `detail`
/// sentence written here, which reached the French interface in English because nothing on the
/// way to the screen could translate a finished string. Same bargain as `AppError`: the core
/// names, the catalog words.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnDeviceReadiness {
    pub ready: bool,
    pub engine: String,
    pub state: String,
    pub can_prepare: bool,
}

pub fn readiness(_app: &AppHandle) -> OnDeviceReadiness {
    OnDeviceReadiness {
        ready: true,
        engine: "built-in-demo".into(),
        state: "ready".into(),
        can_prepare: false,
    }
}

#[derive(Clone, Copy)]
struct DemoLine {
    partial: &'static str,
    final_text: &'static str,
}

const ENGLISH_SCRIPT: &[DemoLine] = &[
    DemoLine {
        partial: "This is a built-in demonstration",
        final_text: "This is a built-in demonstration of the live caption display.",
    },
    DemoLine {
        partial: "Captions appear in the operator window",
        final_text: "Captions appear in the operator window and in the presentation overlay.",
    },
    DemoLine {
        partial: "The elapsed time and audio level",
        final_text: "The elapsed time and audio level continue to update while the demo runs.",
    },
    DemoLine {
        partial: "You can stop and save",
        final_text: "You can stop the demonstration and save this transcript at any time.",
    },
];

const FRENCH_SCRIPT: &[DemoLine] = &[
    DemoLine {
        partial: "Ceci est une démonstration intégrée",
        final_text: "Ceci est une démonstration intégrée de l’affichage des sous-titres.",
    },
    DemoLine {
        partial: "Les sous-titres apparaissent dans la fenêtre",
        final_text:
            "Les sous-titres apparaissent dans la fenêtre de contrôle et dans la surimpression.",
    },
    DemoLine {
        partial: "Le temps écoulé et le niveau audio",
        final_text:
            "Le temps écoulé et le niveau audio continuent d’avancer pendant la démonstration.",
    },
    DemoLine {
        partial: "Vous pouvez arrêter et enregistrer",
        final_text:
            "Vous pouvez arrêter la démonstration et enregistrer cette transcription à tout moment.",
    },
];

fn script(language: DemoLanguage) -> &'static [DemoLine] {
    match language {
        DemoLanguage::En => ENGLISH_SCRIPT,
        DemoLanguage::Fr => FRENCH_SCRIPT,
    }
}

/// Run the built-in demonstration on the ordinary caption event path. The audio receiver is
/// intentionally unused: this provider owns a deterministic timeline and never opens a device.
pub async fn run_session(
    app: AppHandle,
    config: OnDeviceConfig,
    _audio_rx: Receiver<AudioChunk>,
    cancel: CancellationToken,
    clock: SessionClock,
    pause: PauseRx,
) {
    let origin = config.origin;
    app.status(StatusUpdate::source(origin, SessionState::Connecting, None));

    let mut pacer = Pacer {
        app: &app,
        origin,
        cancel: &cancel,
        pause,
    };
    if pacer.delay(Duration::from_millis(250)).await {
        return;
    }
    app.status(StatusUpdate::source(origin, SessionState::Running, None));

    // The demonstration captions in one language, so on the first lane.
    let mut acc = TurnAccumulator::new(clock, 0);
    let mut pulse_index = 0usize;

    'session: loop {
        for line in script(config.language) {
            // Make the input indicator visibly active before the first words appear.
            for _ in 0..5 {
                if emit_pulse(&mut pacer, pulse_index).await {
                    break 'session;
                }
                pulse_index += 1;
            }

            acc.text = line.partial.into();
            emit_caption(&app, origin, &mut acc, false);

            for _ in 0..7 {
                if emit_pulse(&mut pacer, pulse_index).await {
                    break 'session;
                }
                pulse_index += 1;
            }

            acc.text = line.final_text.into();
            emit_caption(&app, origin, &mut acc, true);
            acc.next_turn();

            if pacer.delay(Duration::from_millis(350)).await {
                break 'session;
            }
        }

        // Keep the feature alive until Stop is clicked and make repeated cycles obvious.
        if pacer.delay(Duration::from_millis(700)).await {
            break;
        }
    }

    let _ = app.emit(
        events::LEVEL,
        AudioLevel {
            source: origin,
            rms: 0.0,
            peak: 0.0,
        },
    );
}

async fn emit_pulse(pacer: &mut Pacer<'_>, pulse_index: usize) -> bool {
    const RMS: [f32; 8] = [0.08, 0.18, 0.31, 0.23, 0.42, 0.28, 0.15, 0.35];
    let rms = RMS[pulse_index % RMS.len()];
    pacer.level(rms);
    pacer.delay(Duration::from_millis(120)).await
}

/// The demonstration's clock: every step waits here, so Stop and Pause both take effect
/// between steps, exactly as they do for a live provider between messages.
struct Pacer<'a> {
    app: &'a AppHandle,
    origin: Origin,
    cancel: &'a CancellationToken,
    pause: PauseRx,
}

impl Pacer<'_> {
    fn level(&self, rms: f32) {
        let _ = self.app.emit(
            events::LEVEL,
            AudioLevel {
                source: self.origin,
                rms,
                peak: if rms > 0.0 {
                    (rms + 0.19).min(0.92)
                } else {
                    0.0
                },
            },
        );
    }

    /// Wait `duration`, holding first while paused. True when the session ended instead.
    async fn delay(&mut self, duration: Duration) -> bool {
        if *self.pause.borrow() {
            // A paused demonstration hears nothing, like a paused live source sends nothing.
            self.level(0.0);
            self.app.status(StatusUpdate::source(
                self.origin,
                SessionState::Paused,
                None,
            ));
            if !wait_for_resume(&mut self.pause, self.cancel).await {
                return true;
            }
            self.app.status(StatusUpdate::source(
                self.origin,
                SessionState::Running,
                None,
            ));
        }
        tokio::select! {
            _ = self.cancel.cancelled() => true,
            _ = sleep(duration) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_demo_languages_have_complete_non_empty_lines() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        assert_eq!(
            config["bundle"]["resources"]["resources/fixtures/*"],
            "fixtures/"
        );
        for language in DemoLanguage::ALL {
            let lines = script(language);
            assert!(lines.len() >= 3);
            assert!(lines
                .iter()
                .all(|line| !line.partial.is_empty() && !line.final_text.is_empty()));
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("resources/fixtures")
                .join(language.fixture_file());
            let samples =
                crate::audio::fixture::load_fixture(&path).expect("packaged demo fixture");
            assert!(!samples.is_empty());
        }
    }

    // The readiness payload is named, not worded: anything prose-like here would reach a
    // French interface in English, which is how the demo row used to regress.
    #[test]
    fn readiness_serializes_as_names_the_catalog_can_word() {
        let json = serde_json::to_string(&OnDeviceReadiness {
            ready: true,
            engine: "built-in-demo".into(),
            state: "ready".into(),
            can_prepare: false,
        })
        .expect("readiness serializes");
        assert_eq!(
            json,
            r#"{"ready":true,"engine":"built-in-demo","state":"ready","canPrepare":false}"#
        );
    }
}
