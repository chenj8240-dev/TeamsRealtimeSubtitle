//! Which spoken language each window is transcribed in.
//!
//! Detection stays per window on purpose. This app's rooms are often bilingual, French and
//! English, and a language locked for the session would mis-transcribe the other one for as
//! long as it was spoken. What does not work is guessing from a second or two of audio: a
//! short window — a reply, a name, the tail before Pause — is where Whisper's guess is least
//! reliable and where a wrong one turns a phrase into the other language. So a short window
//! reuses the language of the last window long enough to judge, and skips the detection pass.

/// Below this, a window reuses the last confident detection when there is one.
const SHORT_WINDOW_MS: u64 = 3_000;

pub struct Languages<'a> {
    /// The operator's choice, which always wins.
    chosen: Option<&'a str>,
    /// The language detected on the last window of at least `SHORT_WINDOW_MS` that produced a
    /// caption.
    detected: Option<&'a str>,
}

impl<'a> Languages<'a> {
    pub fn new(chosen: Option<&'a str>) -> Self {
        Self {
            chosen,
            detected: None,
        }
    }

    /// The language to pass for a window of `duration_ms`; `None` asks Whisper to detect it.
    pub fn for_window(&self, duration_ms: u64) -> Option<&'a str> {
        self.chosen.or(if duration_ms < SHORT_WINDOW_MS {
            self.detected
        } else {
            None
        })
    }

    /// Remember what Whisper detected, when it was asked to and the window was long enough and
    /// held speech. `detected` must be one of the advertised languages.
    pub fn observe(
        &mut self,
        duration_ms: u64,
        asked: Option<&str>,
        captioned: bool,
        detected: Option<&'a str>,
    ) {
        if self.chosen.is_none()
            && asked.is_none()
            && captioned
            && duration_ms >= SHORT_WINDOW_MS
            && detected.is_some()
        {
            self.detected = detected;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_chosen_language_is_used_for_every_window_and_never_replaced() {
        let mut languages = Languages::new(Some("fr"));
        assert_eq!(languages.for_window(500), Some("fr"));
        assert_eq!(languages.for_window(10_000), Some("fr"));
        languages.observe(10_000, None, true, Some("en"));
        assert_eq!(languages.for_window(500), Some("fr"));
    }

    #[test]
    fn long_windows_always_detect_so_a_bilingual_room_can_switch() {
        let mut languages = Languages::new(None);
        assert_eq!(languages.for_window(3_000), None);
        languages.observe(8_000, None, true, Some("fr"));
        assert_eq!(languages.for_window(10_000), None);
        languages.observe(10_000, None, true, Some("en"));
        assert_eq!(languages.for_window(1_200), Some("en"));
    }

    #[test]
    fn short_windows_reuse_the_last_confident_detection() {
        let mut languages = Languages::new(None);
        // Nothing to reuse yet: a short opening window still detects…
        assert_eq!(languages.for_window(1_500), None);
        // …but its guess is not trusted for the next one.
        languages.observe(1_500, None, true, Some("en"));
        assert_eq!(languages.for_window(1_500), None);

        languages.observe(9_000, None, true, Some("fr"));
        assert_eq!(languages.for_window(2_999), Some("fr"));
        // A window that was given the language did not detect anything.
        languages.observe(2_000, Some("fr"), true, Some("fr"));
        languages.observe(9_000, Some("fr"), true, Some("en"));
        assert_eq!(languages.for_window(1_000), Some("fr"));
    }

    #[test]
    fn a_window_without_captions_or_without_an_answer_is_not_remembered() {
        let mut languages = Languages::new(None);
        languages.observe(10_000, None, true, Some("de"));
        languages.observe(10_000, None, false, Some("ja"));
        languages.observe(10_000, None, true, None);
        assert_eq!(languages.for_window(800), Some("de"));
    }
}
