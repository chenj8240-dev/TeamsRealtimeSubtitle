//! The clock a session's captions are timed against.
//!
//! Every caption carries an interval in milliseconds since the session started, stamped here
//! in the core. Three decisions are worth recording, because each had a plausible alternative.
//!
//! **Monotonic, not wall-clock.** `Instant`, not `SystemTime`. A session runs for the length
//! of an event, and an NTP correction or a daylight-saving change part-way through would make
//! a wall clock jump — backwards, in the worst case, which would produce a subtitle file whose
//! cues run out of order. `Instant` cannot go backwards.
//!
//! **Stamped in the core, not on arrival in the window.** The renderer already knows when a
//! caption reached it, and using that would have cost nothing. But arrival time carries the
//! IPC hop, the event queue and whatever the webview was doing at that moment, and none of
//! that is in the room the audience is sitting in. Issue #26 asks for "explicit monotonic
//! caption timing rather than display timestamps" for exactly this reason.
//!
//! **Elapsed session time, not the audio timeline.** The capture pipeline knows how many
//! samples it has sent, so it could time captions against the audio itself. It should not:
//! this app deliberately drops buffered audio before reconnecting, so an audio timeline
//! silently compresses every gap where the socket was down, and a transcript exported from it
//! would drift further from the event the longer the session ran. What a caption means is
//! "this was said, this many seconds into the session", and that is what a room, a recording
//! and a slide deck all agree on.

use std::time::Instant;

/// Shared by every source in one session, so the microphone and system timelines line up in
/// a transcript that interleaves them.
#[derive(Debug, Clone, Copy)]
pub struct SessionClock {
    started: Instant,
}

impl SessionClock {
    /// Start the clock. Called once per session, from `SessionManager::start`.
    pub fn start() -> Self {
        Self {
            started: Instant::now(),
        }
    }

    /// Milliseconds since the session started.
    ///
    /// Saturates rather than wrapping. `u128` → `u64` would need a session of 584 million
    /// years to overflow, but a silent wrap would put a cue at the beginning of the file.
    pub fn elapsed_ms(&self) -> u64 {
        u64::try_from(self.started.elapsed().as_millis()).unwrap_or(u64::MAX)
    }

    /// A clock reading a fixed number of milliseconds, for tests that need a known offset.
    #[cfg(test)]
    pub fn at(elapsed_ms: u64) -> Self {
        Self {
            started: Instant::now() - std::time::Duration::from_millis(elapsed_ms),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SessionClock;

    #[test]
    fn a_fresh_clock_starts_at_zero() {
        // Not `== 0`: some real time passes between the two lines, and a test that depends on
        // how much is a test that fails on a loaded CI runner.
        assert!(SessionClock::start().elapsed_ms() < 1_000);
    }

    #[test]
    fn elapsed_time_is_reported_from_the_start() {
        let clock = SessionClock::at(5_000);
        let elapsed = clock.elapsed_ms();
        assert!(
            (5_000..6_000).contains(&elapsed),
            "expected about 5s, got {elapsed}ms"
        );
    }

    /// Two sources in one session share a clock, which is what lets a transcript interleave
    /// microphone and system captions on one timeline.
    #[test]
    fn a_copy_of_a_clock_reads_the_same_time() {
        let clock = SessionClock::at(2_000);
        let copy = clock;
        assert!(copy.elapsed_ms().abs_diff(clock.elapsed_ms()) < 50);
    }
}
