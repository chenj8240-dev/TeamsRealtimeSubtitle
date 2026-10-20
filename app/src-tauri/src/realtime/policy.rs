//! The reconnect state machine as pure decisions: what to report before a connection, whether
//! to drop or replay the audio that queued meanwhile, and how long to wait once one ends. It
//! owns no socket and reads no clock — the runner passes how long each connection lasted — so
//! pause, handover and backoff are unit-tested directly.

use std::time::Duration;

use tokio_tungstenite::tungstenite;

use crate::types::{Origin, SessionState};

pub(super) const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(16);
pub(super) const STABLE_CONNECTION: Duration = Duration::from_secs(30);

/// How one connection ended.
#[derive(Debug)]
pub(super) enum RunEnd {
    /// Stop, or the producer finished: the source is over.
    Stopped,
    /// The connection was lost, or the provider reported a failure a new one can recover from.
    Reconnect,
    /// The provider is ending a healthy connection: Gemini's `goAway` ahead of its session cap,
    /// or a session that ended mid-stream.
    Handover,
    /// The operator paused: the connection was closed gracefully, its last turn flushed.
    Paused,
    /// The provider stopped the session for a reason a reconnect cannot fix.
    Fatal(String),
    /// The handshake was refused with an HTTP status that will not improve on retry.
    Rejected(u16),
    /// A connect, read or send failed. Retried with backoff, and shown to the operator.
    Failed(anyhow::Error),
}

impl From<anyhow::Error> for RunEnd {
    fn from(error: anyhow::Error) -> Self {
        match fatal_handshake_rejection(&error) {
            Some(status) => Self::Rejected(status),
            None => Self::Failed(error),
        }
    }
}

/// Permanent client errors will not improve on retry. Rate limits and timeouts remain
/// retryable and use the normal exponential backoff path.
fn fatal_handshake_rejection(error: &anyhow::Error) -> Option<u16> {
    error.chain().find_map(|cause| {
        let tungstenite::Error::Http(response) = cause.downcast_ref::<tungstenite::Error>()? else {
            return None;
        };
        let status = response.status().as_u16();
        matches!(status, 400 | 401 | 403 | 404 | 405 | 410 | 422).then_some(status)
    })
}

/// What the runner does once a connection has ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum After {
    /// End the source.
    Stop,
    /// Connect again at once (the top of the loop still holds a paused source).
    Now,
    /// Connect again after this long, unless a pause or Stop comes first.
    Backoff(Duration),
}

/// How the runner opens the next connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Connect {
    /// What to report first. `None` keeps the source Running through a planned handover.
    pub status: Option<SessionState>,
    /// Drop the audio that queued while disconnected: after a failure it is a stall's backlog.
    pub drain_stale: bool,
    /// Replay that audio in order instead, buffering more while the new socket opens: after a
    /// planned handover it is live speech from the gap.
    pub catch_up: bool,
}

pub(super) struct Reconnect {
    backoff: Duration,
    /// A small per-source offset prevents two failed "Both" sessions from reconnecting in
    /// lock-step and producing synchronized request spikes.
    jitter: Duration,
    /// No connection has been made yet, or the last one closed for a pause: the next is a
    /// fresh start (Connecting, no backoff) rather than a recovery (Reconnecting).
    fresh: bool,
    /// The last connection ended in a planned handover.
    handover: bool,
}

impl Reconnect {
    pub fn new(origin: Origin) -> Self {
        Self {
            backoff: INITIAL_BACKOFF,
            jitter: match origin {
                Origin::Microphone => Duration::ZERO,
                Origin::System => Duration::from_millis(173),
            },
            fresh: true,
            handover: false,
        }
    }

    /// The operator resumed a paused source. Whatever queued before is not a handover's gap.
    pub fn resumed(&mut self) {
        self.fresh = true;
        self.handover = false;
    }

    pub fn connect(&mut self) -> Connect {
        if std::mem::take(&mut self.handover) {
            return Connect {
                status: None,
                drain_stale: false,
                catch_up: true,
            };
        }
        Connect {
            status: Some(if std::mem::take(&mut self.fresh) {
                SessionState::Connecting
            } else {
                SessionState::Reconnecting
            }),
            drain_stale: true,
            catch_up: false,
        }
    }

    /// Decide what follows a connection that ended as `end` after `uptime`.
    pub fn after(&mut self, end: &RunEnd, uptime: Duration) -> After {
        if uptime >= STABLE_CONNECTION {
            self.backoff = INITIAL_BACKOFF;
        }
        match end {
            RunEnd::Stopped | RunEnd::Fatal(_) | RunEnd::Rejected(_) => After::Stop,
            RunEnd::Paused => {
                // Also covers a resume that arrived while the close was draining.
                self.fresh = true;
                After::Now
            }
            RunEnd::Handover if planned_handover(uptime) => {
                self.handover = true;
                After::Now
            }
            RunEnd::Handover | RunEnd::Reconnect | RunEnd::Failed(_) => {
                let wait = self.backoff + self.jitter;
                self.backoff = (self.backoff * 2).min(MAX_BACKOFF);
                After::Backoff(wait)
            }
        }
    }
}

/// Whether a handover request is the planned move it claims to be. A provider that asks to
/// move straight after accepting a connection is refusing it, and reconnecting at once would
/// hammer it; that case keeps the ordinary backoff.
fn planned_handover(uptime: Duration) -> bool {
    uptime >= STABLE_CONNECTION
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHORT: Duration = Duration::from_secs(2);
    const LONG: Duration = Duration::from_secs(600);

    fn connecting() -> Connect {
        Connect {
            status: Some(SessionState::Connecting),
            drain_stale: true,
            catch_up: false,
        }
    }

    fn reconnecting() -> Connect {
        Connect {
            status: Some(SessionState::Reconnecting),
            ..connecting()
        }
    }

    #[test]
    fn the_first_connection_is_a_fresh_start_and_later_ones_are_recoveries() {
        let mut policy = Reconnect::new(Origin::Microphone);
        assert_eq!(policy.connect(), connecting());
        assert_eq!(
            policy.after(&RunEnd::Reconnect, SHORT),
            After::Backoff(INITIAL_BACKOFF)
        );
        assert_eq!(policy.connect(), reconnecting());
    }

    #[test]
    fn failures_back_off_exponentially_up_to_a_cap_and_a_stable_connection_resets_it() {
        let mut policy = Reconnect::new(Origin::Microphone);
        policy.connect();
        let waits: Vec<_> = (0..7)
            .map(|_| policy.after(&RunEnd::Reconnect, SHORT))
            .collect();
        let secs = |s| After::Backoff(Duration::from_secs(s));
        assert_eq!(
            waits,
            [
                secs(1),
                secs(2),
                secs(4),
                secs(8),
                secs(16),
                secs(16),
                secs(16)
            ]
        );
        // A connection error is retried the same way.
        let failed = RunEnd::Failed(anyhow::anyhow!("connect failed"));
        assert_eq!(policy.after(&failed, LONG), secs(1));
    }

    #[test]
    fn the_system_source_reconnects_slightly_after_the_microphone() {
        let mut policy = Reconnect::new(Origin::System);
        assert_eq!(
            policy.after(&RunEnd::Reconnect, SHORT),
            After::Backoff(INITIAL_BACKOFF + Duration::from_millis(173))
        );
    }

    #[test]
    fn a_planned_handover_reconnects_at_once_and_replays_the_gap() {
        let mut policy = Reconnect::new(Origin::Microphone);
        policy.connect();
        assert_eq!(
            policy.after(&RunEnd::Handover, STABLE_CONNECTION),
            After::Now
        );
        assert_eq!(
            policy.connect(),
            Connect {
                status: None,
                drain_stale: false,
                catch_up: true,
            }
        );
        // Only the connection straight after the handover catches up.
        policy.after(&RunEnd::Reconnect, SHORT);
        assert_eq!(policy.connect(), reconnecting());
    }

    #[test]
    fn a_handover_straight_after_connecting_backs_off_like_a_failure() {
        let mut policy = Reconnect::new(Origin::Microphone);
        policy.connect();
        assert_eq!(
            policy.after(&RunEnd::Handover, SHORT),
            After::Backoff(INITIAL_BACKOFF)
        );
        assert_eq!(policy.connect(), reconnecting());
    }

    #[test]
    fn a_pause_resumes_as_a_fresh_start_without_backoff() {
        let mut policy = Reconnect::new(Origin::Microphone);
        policy.connect();
        policy.after(&RunEnd::Reconnect, SHORT);
        policy.connect();
        assert_eq!(policy.after(&RunEnd::Paused, SHORT), After::Now);
        policy.resumed();
        assert_eq!(policy.connect(), connecting());
    }

    #[test]
    fn a_resume_cancels_a_pending_handover_replay() {
        let mut policy = Reconnect::new(Origin::Microphone);
        policy.connect();
        policy.after(&RunEnd::Handover, LONG);
        // Paused before the replacement connection opened: the queued audio is now stale.
        policy.resumed();
        assert_eq!(policy.connect(), connecting());
    }

    #[test]
    fn stop_and_unrecoverable_ends_finish_the_source() {
        let mut policy = Reconnect::new(Origin::Microphone);
        for end in [
            RunEnd::Stopped,
            RunEnd::Fatal("bad request".into()),
            RunEnd::Rejected(401),
        ] {
            assert_eq!(policy.after(&end, LONG), After::Stop);
        }
    }

    #[test]
    fn authentication_rejections_are_terminal_but_rate_limits_are_retryable() {
        for (status, fatal) in [(401, true), (403, true), (429, false), (503, false)] {
            let response = tungstenite::http::Response::builder()
                .status(status)
                .body(None)
                .unwrap();
            let error = anyhow::Error::from(tungstenite::Error::Http(Box::new(response)))
                .context("WebSocket connect failed");
            assert_eq!(fatal_handshake_rejection(&error), fatal.then_some(status));
            match RunEnd::from(error) {
                RunEnd::Rejected(rejected) => assert!(fatal && rejected == status),
                RunEnd::Failed(_) => assert!(!fatal),
                other => panic!("unexpected {other:?}"),
            }
        }
    }
}
