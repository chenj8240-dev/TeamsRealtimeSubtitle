//! Window close and application quit.
//!
//! Everything that decides what clicking X, or Quit in the tray, actually does. It started
//! in `recovery.rs` as the guard that protected an unsaved transcript (issue #25); with a
//! tray in the picture (issue #22) closing can also mean *keep running*, and that decision
//! belongs next to the rest of it rather than inside the recovery spool.
//!
//! The invariant that matters: a live caption session is never ended, and unsaved captions
//! are never dropped, as a side effect of a window closing — while the window itself can
//! always still be closed, even if the front-end has stopped answering.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use crate::errors::{id, AppError};
use crate::session::SessionManager;

/// Label of the window the operator drives. The overlay is a caption surface with no
/// controls, so it is never the window an answer is wanted from.
pub const OPERATOR_LABEL: &str = "operator";

/// How long an intercepted close waits for the front-end to say it is on it. Generous next to
/// an event-loop round trip and short next to a person noticing a window that did not close.
pub const ACK_TIMEOUT: Duration = Duration::from_secs(3);

/// What a close should do, and whether one is currently being answered.
///
/// The front-end keeps `guard` and `close_to_tray` current. Two rules stop this from ever
/// producing a window that will not close: while both are false the close event is not
/// touched at all, and an interception the front-end does not acknowledge within
/// `ACK_TIMEOUT` is released — so a renderer that wedges while something was unsaved costs
/// the operator three seconds, not Task Manager.
#[derive(Default)]
pub struct CloseGuard {
    /// Something would be lost by quitting now: unsaved captions, or a live session.
    guard: AtomicBool,
    /// The operator asked for closing the window to leave the app running in the tray.
    close_to_tray: AtomicBool,
    confirmed: AtomicBool,
    /// Closes intercepted so far, and how many of them the front-end answered for. Counters
    /// rather than a flag so a second close attempt cannot be satisfied by the first ack.
    attempts: AtomicU64,
    acked: AtomicU64,
}

impl CloseGuard {
    pub fn set(&self, guard: bool) {
        self.guard.store(guard, Ordering::Relaxed);
    }

    pub fn set_close_to_tray(&self, enabled: bool) {
        self.close_to_tray.store(enabled, Ordering::Relaxed);
    }

    /// True while a close should be intercepted rather than allowed to destroy the window.
    /// Once the operator has answered, this stays false so the quit goes straight through.
    pub fn should_intercept(&self) -> bool {
        !self.confirmed.load(Ordering::Relaxed)
            && (self.guard.load(Ordering::Relaxed) || self.close_to_tray.load(Ordering::Relaxed))
    }

    /// Record an interception and return its number, for the watchdog to check against.
    pub fn begin_attempt(&self) -> u64 {
        self.attempts.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// Whether the front-end took responsibility for attempt `attempt`.
    pub fn acknowledged(&self, attempt: u64) -> bool {
        self.acked.load(Ordering::Relaxed) >= attempt
    }

    fn ack(&self) {
        self.acked
            .store(self.attempts.load(Ordering::Relaxed), Ordering::Relaxed);
    }

    fn confirm(&self) {
        self.confirmed.store(true, Ordering::Relaxed);
    }

    /// Give up on an unanswered interception: the operator asked to close and nothing is
    /// listening, so holding the window shut protects nobody.
    pub fn release(&self) {
        self.confirm();
    }
}

/// Bring the operator window back and put it in front — from the tray, from a second launch,
/// or from the front-end itself when it is about to ask a question and cannot assume the
/// window is on screen.
pub fn show_operator_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(OPERATOR_LABEL) else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Sent the moment the front-end receives a close or quit request, before it starts stopping
/// the session. It only claims "something is handling this"; the answer follows separately.
#[tauri::command]
pub async fn ack_close(close_guard: State<'_, CloseGuard>) -> Result<(), AppError> {
    close_guard.ack();
    Ok(())
}

#[tauri::command]
pub async fn set_close_guard(
    close_guard: State<'_, CloseGuard>,
    guard: bool,
) -> Result<(), AppError> {
    close_guard.set(guard);
    Ok(())
}

/// Mirror the operator's "keep running in the tray" preference into the core, so the close
/// event knows to hold the window open for a hide rather than let it be destroyed.
#[tauri::command]
pub async fn set_close_to_tray(
    close_guard: State<'_, CloseGuard>,
    enabled: bool,
) -> Result<(), AppError> {
    close_guard.set_close_to_tray(enabled);
    Ok(())
}

/// Put the operator window away without ending anything. The session, the overlay and the
/// transcript all carry on; the tray is how they come back.
#[tauri::command]
pub async fn hide_to_tray(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(OPERATOR_LABEL) {
        window
            .hide()
            .map_err(|error| AppError::with(id::OPERATOR_WINDOW, error))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn show_operator(app: AppHandle) -> Result<(), AppError> {
    show_operator_window(&app);
    Ok(())
}

/// The operator answered and chose to leave.
///
/// Stopping the session again is intentional belt-and-braces: the front-end already awaited
/// a stop before it asked, so this is normally an immediate no-op, but it means the guarantee
/// that quitting releases the capture devices does not depend on the renderer having got
/// that far.
///
/// Local Whisper's Stop is different: it drains every second of audio still waiting, which
/// after a long backlog can take minutes, and the front-end stops waiting for it after a few
/// seconds. Whatever is still pending by now is discarded first — the quit prompt has already
/// said so — or this stop would queue behind that drain and the app would not close.
#[tauri::command]
pub async fn confirm_close(
    app: AppHandle,
    manager: State<'_, SessionManager>,
    close_guard: State<'_, CloseGuard>,
) -> Result<(), AppError> {
    close_guard.confirm();
    manager.discard_local_pending();
    manager.stop(&app).await;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaves_a_close_alone_when_there_is_nothing_to_lose() {
        assert!(!CloseGuard::default().should_intercept());
    }

    #[test]
    fn intercepts_while_the_front_end_reports_something_to_lose() {
        let guard = CloseGuard::default();
        guard.set(true);
        assert!(guard.should_intercept());

        guard.set(false);
        assert!(!guard.should_intercept());
    }

    /// With the tray preference on, closing means *keep running* — so the event has to be
    /// held even when quitting would cost nothing.
    #[test]
    fn intercepts_a_close_that_is_meant_to_hide_to_the_tray() {
        let guard = CloseGuard::default();
        guard.set_close_to_tray(true);
        assert!(guard.should_intercept());

        guard.set_close_to_tray(false);
        assert!(!guard.should_intercept());
    }

    #[test]
    fn lets_the_quit_through_once_the_operator_has_answered() {
        let guard = CloseGuard::default();
        guard.set(true);
        guard.set_close_to_tray(true);
        guard.confirm();
        assert!(!guard.should_intercept());
    }

    /// The watchdog exists for a renderer that wedged while something was unsaved: nothing
    /// acknowledges the interception, so the window has to be released rather than held shut
    /// until Task Manager.
    #[test]
    fn an_unacknowledged_attempt_can_be_released() {
        let guard = CloseGuard::default();
        guard.set(true);
        let attempt = guard.begin_attempt();

        assert!(!guard.acknowledged(attempt));
        guard.release();
        assert!(!guard.should_intercept());
    }

    /// A second click on the window's X while the prompt is already up must not be satisfied
    /// by the acknowledgement the first one got — its watchdog would then close the window
    /// out from under the prompt, taking the unsaved transcript with it.
    #[test]
    fn every_attempt_needs_its_own_acknowledgement() {
        let guard = CloseGuard::default();
        guard.set(true);

        let first = guard.begin_attempt();
        guard.ack();
        assert!(guard.acknowledged(first));

        let second = guard.begin_attempt();
        assert!(!guard.acknowledged(second));

        guard.ack();
        assert!(guard.acknowledged(second));
    }
}
