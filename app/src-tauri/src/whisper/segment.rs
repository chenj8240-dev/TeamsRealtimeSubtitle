//! Cuts the spooled audio into the windows Whisper transcribes.
use super::spool::TimedChunk;

const RATE: usize = 16_000;
const SAMPLES_PER_MS: u64 = 16;
/// Captions arrive within a few seconds of speech at this length.
const WINDOW: usize = 10 * RATE;
/// Whisper encodes a 30-second frame whatever it is given, so a 10-second window pays for three
/// times the audio it carries. Once a backlog has built up, latency no longer matters and the
/// longest window that still fits in one frame clears it fastest: 28 seconds, plus at most one
/// chunk (a second) of overshoot.
const LONG_WINDOW: usize = 28 * RATE;
const OVERLAP: usize = RATE;
const SILENCE: usize = RATE * 8 / 10;
/// A chunk starting further than this beyond the end of what is held follows a pause or a
/// device gap, not capture jitter.
const GAP_MS: u64 = 250;

pub struct Window {
    pub samples: Vec<f32>,
    pub start_ms: u64,
    pub consumed: usize,
    pub speech: bool,
}

#[derive(Default)]
pub struct Segmenter {
    samples: Vec<f32>,
    start_ms: u64,
    /// Where each held chunk begins in `samples`, with its capture timestamp. Window times are
    /// read from these rather than counted in samples, so a capture clock that runs slightly
    /// fast or slow against the session clock cannot drift the captions over a long meeting.
    anchors: Vec<(usize, u64)>,
    /// Samples no window has covered yet. The overlap carried into the next window has been
    /// transcribed already, so a window made of nothing else needs no inference.
    fresh: usize,
    silent: usize,
    speech: bool,
    long: bool,
}

fn is_active(sample: f32) -> bool {
    // Conservative silence gate (~-80 dBFS). Quiet speech still reaches Whisper's own
    // no-speech classifier. Endpointing is an optimization, not an audio-loss policy.
    sample.abs() > 0.0001
}

impl Segmenter {
    /// Cut long windows while inference is behind; see `LONG_WINDOW`.
    pub fn set_long_windows(&mut self, long: bool) {
        self.long = long;
    }

    /// The capture time of the sample at `index` in `samples`.
    fn time_at(&self, index: usize) -> u64 {
        match self
            .anchors
            .iter()
            .rev()
            .find(|(offset, _)| *offset <= index)
        {
            Some(&(offset, ms)) => ms + (index - offset) as u64 / SAMPLES_PER_MS,
            None => self.start_ms + index as u64 / SAMPLES_PER_MS,
        }
    }

    pub fn push(&mut self, chunk: &TimedChunk) -> Vec<Window> {
        let mut ready = Vec::new();
        // A pause/device gap must not collapse the transcript's time axis. A chunk that starts
        // early (capture delivers in bursts) is jitter, not a gap.
        if !self.samples.is_empty() && chunk.start_ms > self.time_at(self.samples.len()) + GAP_MS {
            if let Some(window) = self.finish() {
                ready.push(window);
            }
        }
        if self.samples.is_empty() {
            self.start_ms = chunk.start_ms;
            self.anchors.clear();
        }
        let samples: Vec<f32> = chunk
            .pcm
            .as_chunks::<2>()
            .0
            .iter()
            .map(|b| f32::from(i16::from_le_bytes(*b)) / 32768.0)
            .collect();
        let active = samples.iter().copied().any(is_active);
        self.silent = if active {
            0
        } else {
            self.silent + samples.len()
        };
        self.speech |= active;
        self.anchors.push((self.samples.len(), chunk.start_ms));
        self.fresh += samples.len();
        self.samples.extend(samples);
        let window = if self.long { LONG_WINDOW } else { WINDOW };
        if self.silent >= SILENCE && self.samples.len() >= RATE {
            if let Some(window) = self.finish() {
                ready.push(window);
            }
        } else if self.samples.len() >= window {
            ready.push(self.take(OVERLAP));
        }
        ready
    }

    fn take(&mut self, keep: usize) -> Window {
        let consumed = self.samples.len() - keep;
        // Re-anchor on the timestamp of the chunk the cut falls in, but never move backwards:
        // captions stay in order even when capture timestamps jitter.
        let next_start = self.time_at(consumed).max(self.start_ms);
        let samples = std::mem::take(&mut self.samples);
        self.samples = samples[consumed..].to_vec();
        let start_ms = self.start_ms;
        self.start_ms = next_start;
        self.anchors = std::iter::once((0, next_start))
            .chain(
                self.anchors
                    .iter()
                    .filter(|(offset, _)| *offset > consumed)
                    .map(|&(offset, ms)| (offset - consumed, ms)),
            )
            .collect();
        let speech = self.speech && self.fresh > 0;
        self.speech = self.samples.iter().copied().any(is_active);
        self.fresh = 0;
        self.silent = 0;
        Window {
            samples,
            start_ms,
            consumed,
            speech,
        }
    }

    /// Everything held, as a final window: at end of input, after a gap, or when input has gone
    /// quiet (Pause, or system audio with nothing playing) so the last words are not left
    /// waiting for more audio that may not come.
    pub fn finish(&mut self) -> Option<Window> {
        if self.samples.is_empty() {
            None
        } else {
            Some(self.take(0))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn frame(start_ms: u64, sample: i16) -> TimedChunk {
        TimedChunk {
            start_ms,
            pcm: sample.to_le_bytes().repeat(1600),
        }
    }
    #[test]
    fn windows_preserve_every_sample_including_short_final_tail() {
        let mut segmenter = Segmenter::default();
        let mut consumed = 0;
        let mut starts = Vec::new();
        for i in 0..205 {
            for window in segmenter.push(&frame(i * 100, 100)) {
                consumed += window.consumed;
                starts.push(window.start_ms);
            }
        }
        consumed += segmenter.finish().unwrap().consumed;
        assert_eq!(consumed, 205 * 1600);
        assert_eq!(starts, vec![0, 9000]);
    }
    #[test]
    fn pause_gap_keeps_elapsed_timestamps_and_silence_does_not_infer() {
        let mut segmenter = Segmenter::default();
        segmenter.push(&frame(1000, 100));
        let windows = segmenter.push(&frame(5000, 0));
        assert_eq!(windows[0].start_ms, 1000);
        let tail = segmenter.finish().unwrap();
        assert_eq!(tail.start_ms, 5000);
        assert!(!tail.speech);
    }

    #[test]
    fn a_gap_is_more_than_250_ms_beyond_the_held_audio() {
        // The first frame ends at 100 ms, so 350 ms is exactly 250 ms late: still contiguous.
        let mut segmenter = Segmenter::default();
        segmenter.push(&frame(0, 100));
        assert!(segmenter.push(&frame(350, 100)).is_empty());
        assert_eq!(segmenter.finish().unwrap().consumed, 3200);

        let mut segmenter = Segmenter::default();
        segmenter.push(&frame(0, 100));
        let windows = segmenter.push(&frame(351, 100));
        assert_eq!(windows.len(), 1);
        assert_eq!((windows[0].start_ms, windows[0].consumed), (0, 1600));
        assert_eq!(segmenter.finish().unwrap().start_ms, 351);
    }

    #[test]
    fn backwards_timestamps_are_jitter_and_window_starts_never_go_backwards() {
        let mut segmenter = Segmenter::default();
        let mut starts = Vec::new();
        let mut consumed = 0;
        // Bursty delivery: every other chunk is stamped 80 ms earlier than contiguous.
        for i in 0..120u64 {
            let start = i * 100 - if i % 2 == 1 { 80 } else { 0 };
            for window in segmenter.push(&frame(start, 100)) {
                starts.push(window.start_ms);
                consumed += window.consumed;
            }
        }
        let tail = segmenter.finish().unwrap();
        starts.push(tail.start_ms);
        consumed += tail.consumed;
        assert_eq!(consumed, 120 * 1600, "jitter must not split or drop audio");
        assert!(
            starts.windows(2).all(|pair| pair[0] <= pair[1]),
            "{starts:?}"
        );
        assert_eq!(starts.len(), 2);
    }

    #[test]
    fn window_times_follow_capture_timestamps_rather_than_sample_counts() {
        // The capture clock runs 1% slow against the session clock: each 100 ms chunk is
        // stamped 101 ms after the last. Counting samples would put the second window at
        // 9000 ms; the chunk it starts in says 9090.
        let mut segmenter = Segmenter::default();
        let mut starts = Vec::new();
        for i in 0..200u64 {
            for window in segmenter.push(&frame(i * 101, 100)) {
                starts.push(window.start_ms);
            }
        }
        assert_eq!(starts, [0, 9090]);
        assert_eq!(segmenter.finish().unwrap().start_ms, 18180);
    }

    #[test]
    fn a_backlog_switches_to_long_windows_with_exact_times() {
        let mut segmenter = Segmenter::default();
        segmenter.set_long_windows(true);
        let mut windows = Vec::new();
        for i in 0..600u64 {
            windows.extend(segmenter.push(&frame(i * 100, 100)));
        }
        let cuts: Vec<(u64, usize)> = windows
            .iter()
            .map(|w| (w.start_ms, w.samples.len()))
            .collect();
        assert_eq!(cuts, [(0, LONG_WINDOW), (27_000, LONG_WINDOW)]);
        // Back to normal once the backlog has gone.
        segmenter.set_long_windows(false);
        let mut next = Vec::new();
        for i in 600..700u64 {
            next.extend(segmenter.push(&frame(i * 100, 100)));
        }
        assert_eq!((next[0].start_ms, next[0].samples.len()), (54_000, WINDOW));
    }

    #[test]
    fn a_final_window_holding_only_transcribed_overlap_needs_no_inference() {
        let mut segmenter = Segmenter::default();
        let mut windows = Vec::new();
        for i in 0..100u64 {
            windows.extend(segmenter.push(&frame(i * 100, 100)));
        }
        assert!(windows.pop().unwrap().speech);
        // Input went quiet right after a cut: the held second was in that window already.
        let idle = segmenter.finish().unwrap();
        assert_eq!((idle.start_ms, idle.consumed), (9000, OVERLAP));
        assert!(!idle.speech);
        assert!(segmenter.finish().is_none());
    }

    #[test]
    fn going_quiet_mid_window_releases_the_held_speech() {
        let mut segmenter = Segmenter::default();
        for i in 0..25u64 {
            assert!(segmenter.push(&frame(i * 100, 100)).is_empty());
        }
        let window = segmenter.finish().unwrap();
        assert!(window.speech);
        assert_eq!((window.start_ms, window.consumed), (0, 25 * 1600));
    }
}
