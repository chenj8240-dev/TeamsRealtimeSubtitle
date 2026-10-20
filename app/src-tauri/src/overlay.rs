//! Caption-overlay window behaviour: z-order and activation.
//!
//! `alwaysOnTop` only places the overlay in the OS "topmost" band — it does not win that
//! band. Any other topmost window (Zoom's meeting controls, a Teams call, a PowerPoint
//! slideshow, a browser in presentation mode) is drawn above the overlay as soon as it is
//! activated, which is exactly when captions matter most. So the overlay is re-raised to the
//! top of the topmost band on a short timer while it is visible.
//!
//! On Windows the overlay is also marked no-activate while it is click-through, so raising
//! it can never pull focus away from the presenter's application. That flag is cleared in
//! "Move overlay" mode, where the window has to be focusable to be dragged and resized.

use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};

pub const OVERLAY_LABEL: &str = "overlay";

/// How often the overlay is re-raised within the topmost band. Short enough that a newly
/// activated topmost window never covers the captions for a noticeable time, and cheap
/// enough to run for the whole session (a z-order-only `SetWindowPos`).
const RAISE_INTERVAL: Duration = Duration::from_millis(500);

/// Raise the overlay to the top of the always-on-top band without activating it.
pub fn raise(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER,
            SWP_NOSENDCHANGING, SWP_NOSIZE,
        };

        if let Ok(hwnd) = window.hwnd() {
            // SAFETY: `hwnd` is a live handle to a window owned by this process. The call
            // only reorders it (NOMOVE | NOSIZE) and never activates it (NOACTIVATE), so it
            // cannot steal focus from the slides.
            unsafe {
                SetWindowPos(
                    hwnd.0 as _,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE
                        | SWP_NOSIZE
                        | SWP_NOACTIVATE
                        | SWP_NOOWNERZORDER
                        | SWP_NOSENDCHANGING,
                );
            }
            return;
        }
    }

    // Other platforms — and Windows if the handle is unavailable: re-assert the Tauri flag.
    let _ = window.set_always_on_top(true);
}

/// Keep the overlay out of the activation chain (Windows `WS_EX_NOACTIVATE`).
///
/// Enabled together with click-through so the repeated raises stay invisible to the user;
/// disabled in move mode so the window can take focus to be dragged.
pub fn set_no_activate(window: &WebviewWindow, enabled: bool) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
        };

        if let Ok(hwnd) = window.hwnd() {
            // SAFETY: `hwnd` is a live handle to a window owned by this process; only the
            // extended-style bit for activation is flipped, everything else is preserved.
            unsafe {
                let hwnd = hwnd.0 as _;
                let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                #[expect(
                    clippy::cast_possible_wrap,
                    reason = "0x0800_0000 is clear of the sign bit"
                )]
                let bit = WS_EX_NOACTIVATE as isize;
                let next = if enabled {
                    current | bit
                } else {
                    current & !bit
                };
                if next != current {
                    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (window, enabled);
    }
}

/// Start the background loop that keeps the overlay on top of every other window.
///
/// Runs for the lifetime of the app and stops if the overlay window is destroyed. Raising
/// happens on the main thread, where window handles are safe to touch.
pub fn spawn_topmost_keeper(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(RAISE_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let Some(window) = app.get_webview_window(OVERLAY_LABEL) else {
                break;
            };
            // One hop to the main thread per tick. The visibility check runs there too, where
            // Tauri answers it inline instead of with a second blocking round trip. A hidden
            // overlay has nothing to cover, so it skips the raise.
            let _ = app.run_on_main_thread(move || {
                if window.is_visible().unwrap_or(false) {
                    raise(&window);
                }
            });
        }
    });
}
