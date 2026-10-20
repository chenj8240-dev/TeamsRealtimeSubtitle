//! What each recognised segment adds to the transcript. Pure: no model, no audio, so the
//! decisions at window boundaries can be tested directly.

/// One segment as whisper.cpp reported it, before the app decides whether to caption it.
pub struct RawSegment {
    /// Decoded leniently: a token split mid-character must not end the source.
    pub text: String,
    /// Centiseconds from the start of the window, as whisper.cpp counts them.
    pub start_cs: i64,
    pub end_cs: i64,
    /// One value for the whole window: whisper.cpp asks once, before decoding.
    pub no_speech: f32,
    /// Mean log-probability of the segment's tokens.
    pub mean_logprob: f32,
}

/// A caption ready for the transcript.
#[derive(Debug, PartialEq)]
pub struct Line {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub turn: u64,
}

// whisper.cpp's own defaults (`no_speech_thold` 0.6, `logprob_thold` -1.0, as in OpenAI's
// reference implementation). whisper.cpp applies them to a whole decoding pass, averaging the
// log-probability over every token in the window, so one confident sentence can carry a weak
// trailing segment past it — the "Thank you." that Whisper invents over room noise. Applying the
// same pair to each segment drops that tail and nothing else: confident speech has a mean
// log-probability well above -1 however noisy the window is judged to be, so the window's
// no-speech score alone (the filter this replaces) can no longer drop it.
const NO_SPEECH_THRESHOLD: f32 = 0.6;
const LOGPROB_THRESHOLD: f32 = -1.0;

fn is_silence(segment: &RawSegment) -> bool {
    segment.no_speech > NO_SPEECH_THRESHOLD && segment.mean_logprob < LOGPROB_THRESHOLD
}

/// Carries the last caption across windows, so the second of overlap between two windows is
/// captioned once and caption times only ever move forward.
#[derive(Default)]
pub struct Reconciler {
    turn: u64,
    previous_text: String,
    previous_end: u64,
}

impl Reconciler {
    /// `window_start_ms` is the window's capture time and `duration_ms` its real length; Whisper
    /// sees short windows padded, and timestamps in the padding are clamped back to the audio.
    pub fn accept(
        &mut self,
        window_start_ms: u64,
        duration_ms: u64,
        segment: &RawSegment,
    ) -> Option<Line> {
        if is_silence(segment) {
            return None;
        }
        // A negative timestamp counts as the window's start.
        let at = |cs: i64| {
            let ms = u64::try_from(cs).unwrap_or(0).saturating_mul(10);
            window_start_ms + ms.min(duration_ms)
        };
        let (start, end) = (at(segment.start_cs), at(segment.end_cs));
        if end <= self.previous_end {
            return None;
        }
        // U+FFFD is what lossy decoding leaves of a broken byte sequence: nothing to read.
        let cleaned = segment.text.replace('\u{FFFD}', "");
        let text = trim_overlap(
            &self.previous_text,
            cleaned.trim(),
            start < self.previous_end,
        );
        if text.is_empty() {
            return None;
        }
        self.turn += 1;
        let start = start.max(self.previous_end);
        let line = Line {
            text: text.to_owned(),
            start_ms: start,
            end_ms: end.max(start),
            turn: self.turn,
        };
        self.previous_text = line.text.clone();
        self.previous_end = end;
        Some(line)
    }
}

/// Scripts written without spaces between words, where the only boundaries to compare on are
/// characters: Chinese, Japanese, Thai, Lao, Khmer, Myanmar and Tibetan. Korean uses spaces.
fn unspaced(c: char) -> bool {
    matches!(c,
        '\u{0E00}'..='\u{0EFF}' // Thai, Lao
        | '\u{0F00}'..='\u{0FFF}' // Tibetan
        | '\u{1000}'..='\u{109F}' // Myanmar
        | '\u{1780}'..='\u{17FF}' // Khmer
        | '\u{3000}'..='\u{30FF}' // CJK punctuation, Hiragana, Katakana
        | '\u{3100}'..='\u{312F}' // Bopomofo
        | '\u{31F0}'..='\u{31FF}' // Katakana extensions
        | '\u{3400}'..='\u{4DBF}' // CJK extension A
        | '\u{4E00}'..='\u{9FFF}' // CJK unified ideographs
        | '\u{F900}'..='\u{FAFF}' // CJK compatibility ideographs
        | '\u{FF66}'..='\u{FF9F}' // Half-width Katakana
        | '\u{20000}'..='\u{2FA1F}' // CJK extensions B onwards
    )
}

/// A word as compared across the boundary: case-folded, punctuation dropped, so "We," at the
/// start of one window matches "we" at the end of the last.
fn normalise(word: &str) -> String {
    word.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// Remove from the start of `current` what `previous` already ended with. Only reconciles an
/// actual time overlap; a repeated phrase later in a meeting is valid.
pub fn trim_overlap<'a>(previous: &str, current: &'a str, overlaps: bool) -> &'a str {
    if !overlaps {
        return current;
    }
    if current.chars().next().is_some_and(unspaced) {
        trim_characters(previous, current)
    } else {
        trim_words(previous, current)
    }
}

fn trim_words<'a>(previous: &str, current: &'a str) -> &'a str {
    let before: Vec<String> = previous
        .split_whitespace()
        .map(normalise)
        .filter(|w| !w.is_empty())
        .collect();
    // Each comparable word of `current` with the byte offset just past it; pure punctuation
    // ("—", "…") has nothing to compare and is skipped.
    let mut words = Vec::new();
    let mut rest = current;
    while let Some(start) = rest.find(|c: char| !c.is_whitespace()) {
        let word_len = rest[start..]
            .find(char::is_whitespace)
            .unwrap_or(rest.len() - start);
        let end = start + word_len;
        let word = normalise(&rest[start..end]);
        let offset = current.len() - rest.len() + end;
        if !word.is_empty() {
            words.push((word, offset));
        }
        rest = &rest[end..];
    }
    // Longest match first: with "yes yes" on both sides a one-word match would leave a "yes".
    for k in (1..=before.len().min(words.len())).rev() {
        let suffix = &before[before.len() - k..];
        if words[..k].iter().map(|(w, _)| w).eq(suffix.iter()) {
            let remainder = &current[words[k - 1].1..];
            // Drop punctuation left dangling at the cut: ", and then" reads as "and then".
            return remainder
                .trim_start_matches(|c: char| c.is_whitespace() || !c.is_alphanumeric());
        }
    }
    current
}

fn trim_characters<'a>(previous: &str, current: &'a str) -> &'a str {
    // Prefer a complete match before shorter prefixes: repeated characters such as "你好你好"
    // otherwise leave an extra "你好" at the next window boundary. Two characters is a word in
    // these scripts; one is too often a coincidence.
    if current.chars().count() >= 2 && previous.ends_with(current) {
        return "";
    }
    for (index, _) in current.char_indices().rev() {
        let prefix = &current[..index];
        if prefix.chars().count() >= 2 && previous.ends_with(prefix) {
            return current[index..].trim_start();
        }
    }
    current
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(text: &str, start_cs: i64, end_cs: i64) -> RawSegment {
        RawSegment {
            text: text.to_owned(),
            start_cs,
            end_cs,
            no_speech: 0.1,
            mean_logprob: -0.3,
        }
    }

    #[test]
    fn overlap_is_unicode_safe_and_does_not_remove_later_repetitions() {
        assert_eq!(
            trim_overlap("bonjour tout le monde", "tout le monde et bienvenue", true),
            "et bienvenue"
        );
        assert_eq!(trim_overlap("你好世界朋友", "世界朋友再见", true), "再见");
        assert_eq!(trim_overlap("yes yes", "yes yes", false), "yes yes");
    }

    #[test]
    fn complete_overlap_wins_over_a_repeated_partial_suffix() {
        assert_eq!(trim_overlap("yes yes", "yes yes", true), "");
        assert_eq!(trim_overlap("il dit oui oui", "oui oui", true), "");
        assert_eq!(trim_overlap("你好你好你好", "你好你好", true), "");
    }

    #[test]
    fn overlap_matches_whole_words_not_fragments_of_them() {
        // Matching characters turned this into "we go": "here" is the end of "there".
        assert_eq!(
            trim_overlap("and then we went there", "here we go", true),
            "here we go"
        );
        assert_eq!(
            trim_overlap("a seaside", "side by side", true),
            "side by side"
        );
    }

    #[test]
    fn overlap_ignores_case_and_punctuation() {
        assert_eq!(
            trim_overlap("and so we", "We will start now.", true),
            "will start now."
        );
        assert_eq!(
            trim_overlap("bonjour tout le monde.", "Monde, et bienvenue", true),
            "et bienvenue"
        );
        assert_eq!(
            trim_overlap("C'est l'heure.", "l’heure — on commence", true),
            "on commence"
        );
        assert_eq!(trim_overlap("Thanks, everyone!", "Everyone.", true), "");
    }

    #[test]
    fn scripts_without_spaces_fall_back_to_characters() {
        assert_eq!(
            trim_overlap("今日はいい天気", "いい天気ですね", true),
            "ですね"
        );
        assert_eq!(trim_overlap("สวัสดีครับ", "ครับวันนี้", true), "วันนี้");
        // One shared character is not enough to call it a repeat.
        assert_eq!(trim_overlap("我们", "们好", true), "们好");
    }

    #[test]
    fn segment_times_are_clamped_to_the_audio_and_never_go_backwards() {
        let mut reconciler = Reconciler::default();
        // Padding: a 600 ms window reports a segment running to 1 s.
        let line = reconciler
            .accept(5_000, 600, &segment("short phrase", 0, 100))
            .unwrap();
        assert_eq!((line.start_ms, line.end_ms, line.turn), (5_000, 5_600, 1));
        // Negative timestamps are read as the window start.
        let line = reconciler
            .accept(6_000, 10_000, &segment("next", -5, 200))
            .unwrap();
        assert_eq!((line.start_ms, line.end_ms, line.turn), (6_000, 8_000, 2));
        // A segment ending before the last caption ended adds nothing.
        assert!(reconciler
            .accept(6_500, 10_000, &segment("old", 0, 100))
            .is_none());
        // One that starts inside the last caption is moved to its end.
        let line = reconciler
            .accept(7_000, 10_000, &segment("later", 50, 300))
            .unwrap();
        assert_eq!((line.start_ms, line.end_ms), (8_000, 10_000));
    }

    #[test]
    fn the_second_of_overlap_between_windows_is_captioned_once() {
        let mut reconciler = Reconciler::default();
        reconciler
            .accept(0, 10_000, &segment(" and then we went there", 600, 1_000))
            .unwrap();
        // The next window starts a second earlier and hears the same last words.
        let line = reconciler
            .accept(
                9_000,
                10_000,
                &segment(" We went there, and here we go", 0, 300),
            )
            .unwrap();
        assert_eq!(line.text, "and here we go");
        assert_eq!(line.start_ms, 10_000);
        // A segment that is nothing but the overlap is dropped without advancing the turn.
        let mut reconciler = Reconciler::default();
        reconciler.accept(0, 10_000, &segment("yes yes", 800, 1_000));
        assert!(reconciler
            .accept(9_000, 10_000, &segment("Yes, yes.", 0, 150))
            .is_none());
        let line = reconciler
            .accept(9_000, 10_000, &segment("no", 150, 200))
            .unwrap();
        assert_eq!(line.turn, 2);
    }

    #[test]
    fn invalid_utf8_leaves_readable_text_and_never_an_empty_caption() {
        let mut reconciler = Reconciler::default();
        let line = reconciler
            .accept(0, 5_000, &segment("caf\u{FFFD} au lait", 0, 100))
            .unwrap();
        assert_eq!(line.text, "caf au lait");
        assert!(reconciler
            .accept(0, 5_000, &segment(" \u{FFFD}\u{FFFD} ", 100, 200))
            .is_none());
    }

    #[test]
    fn only_unlikely_text_in_a_window_judged_silent_is_dropped() {
        let mut reconciler = Reconciler::default();
        let judged = |text: &str, no_speech: f32, mean_logprob: f32| RawSegment {
            no_speech,
            mean_logprob,
            ..segment(text, 0, 100)
        };
        // The window looks like noise and the model was unsure: a hallucination.
        assert!(reconciler
            .accept(0, 5_000, &judged("Thank you.", 0.9, -1.4))
            .is_none());
        // The same window score with confident text is speech, and kept.
        assert!(reconciler
            .accept(0, 5_000, &judged("Merci à tous", 0.9, -0.2))
            .is_some());
        // Unsure text in a window that clearly holds speech is kept too.
        assert!(reconciler
            .accept(1_000, 5_000, &judged("mumbled", 0.2, -1.6))
            .is_some());
    }
}
