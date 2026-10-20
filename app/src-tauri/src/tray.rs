//! System tray (issue #22).
//!
//! An operator running a hybrid room needs the window out of the way — slides, a meeting
//! app, notes — without losing the ability to see that captions are live and to stop them.
//! The tray is that handle: while the app is running it is always there, and it is the only
//! surface that can end a session once the window is hidden.
//!
//! The menu holds no state of its own. Session and overlay state live in the front-end, are
//! pushed here through `set_tray_state`, and are written straight onto the menu items — so a
//! menu that says *Stop session* is a session that is actually running.
//!
//! Every entry that needs to know anything about the session is answered by the front-end
//! over `TRAY_COMMAND`, for the same reason: `Quit` from here has to run the identical stop,
//! drain, and save-or-discard path as clicking the window's X, and that sequence lives in
//! `src/lib/quit.ts`.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::lifecycle::{show_operator_window, CloseGuard, ACK_TIMEOUT};
use crate::types::events;

const ID_OPEN: &str = "tray-open";
const ID_OVERLAY: &str = "tray-overlay";
const ID_STOP: &str = "tray-stop";
const ID_QUIT: &str = "tray-quit";

/// What the front-end is being asked to do. `Open` is absent on purpose: showing a window
/// needs nothing from the renderer, so the core does it itself and the menu stays responsive
/// even if the front-end is wedged.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrayCommand {
    ToggleOverlay,
    StopSession,
    Quit,
}

/// Menu items whose label or enabled state tracks the session. Held so an update is a write
/// to the live item rather than a rebuild of the menu, which on Windows would close it out
/// from under a pointer.
#[derive(Default)]
pub struct TrayMenu {
    items: Mutex<Option<Items>>,
}

#[derive(Debug, Deserialize)]
pub struct TrayLabels {
    open: String,
    quit: String,
    stop: String,
    show: String,
    hide: String,
    status: String,
}

struct Items {
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
    status: MenuItem<Wry>,
    overlay: MenuItem<Wry>,
    stop: MenuItem<Wry>,
    written: Written,
}

/// What was last written onto each item. While a session runs the front-end pushes every
/// second, because the status line carries the elapsed time, but the other labels have not
/// changed; each write is a native menu call, so only the ones that differ are made.
#[derive(Default)]
struct Written {
    open: String,
    quit: String,
    stop: String,
    status: String,
    overlay: String,
    stop_enabled: Option<bool>,
}

fn write_text(item: &MenuItem<Wry>, written: &mut String, text: &str) {
    if written != text && item.set_text(text).is_ok() {
        *written = text.to_string();
    }
}

impl TrayMenu {
    fn store(&self, items: Items) {
        *self.items.lock().unwrap_or_else(|e| e.into_inner()) = Some(items);
    }

    /// Write the front-end's view of the world onto the menu.
    fn apply(&self, session_active: bool, overlay_visible: bool, labels: Option<TrayLabels>) {
        let mut guard = self.items.lock().unwrap_or_else(|e| e.into_inner());
        let Some(items) = guard.as_mut() else {
            return;
        };
        let written = &mut items.written;
        if let Some(labels) = labels {
            write_text(&items.open, &mut written.open, &labels.open);
            write_text(&items.quit, &mut written.quit, &labels.quit);
            write_text(&items.stop, &mut written.stop, &labels.stop);
            write_text(&items.status, &mut written.status, &labels.status);
            let overlay = if overlay_visible {
                labels.hide
            } else {
                labels.show
            };
            write_text(&items.overlay, &mut written.overlay, &overlay);
        } else {
            let overlay = if overlay_visible {
                "Hide caption overlay"
            } else {
                "Show caption overlay"
            };
            write_text(&items.overlay, &mut written.overlay, overlay);
        }
        // Disabled rather than hidden: an operator glancing at the menu should be able to
        // tell "no session running" from "this build has no Stop".
        if written.stop_enabled != Some(session_active)
            && items.stop.set_enabled(session_active).is_ok()
        {
            written.stop_enabled = Some(session_active);
        }
    }
}

/// Build the tray icon and its menu. Called once from `setup`.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, ID_OPEN, "Open window", true, None::<&str>)?;
    let overlay = MenuItem::with_id(app, ID_OVERLAY, "Hide caption overlay", true, None::<&str>)?;
    // Starts disabled: nothing is running a moment after launch, and the front-end pushes
    // the truth as soon as that changes.
    let stop = MenuItem::with_id(app, ID_STOP, "Stop session", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, ID_QUIT, "Quit", true, None::<&str>)?;

    let status = MenuItem::with_id(app, "tray-status", "Idle", false, None::<&str>)?;
    let menu = Menu::with_items(app, &[&status, &open, &overlay, &stop, &separator, &quit])?;

    app.state::<TrayMenu>().store(Items {
        open: open.clone(),
        quit: quit.clone(),
        status: status.clone(),
        overlay: overlay.clone(),
        stop: stop.clone(),
        written: Written::default(),
    });

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        // Left click opens the window, as Windows users expect; the menu is the right-click
        // gesture. Without this the left click would open the menu instead.
        .show_menu_on_left_click(false)
        .tooltip("Live Translation & Subtitles")
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            // Both gestures, because Windows tray apps are split on which one opens: a
            // single left click here, a double click there. Showing a window is idempotent,
            // so a double click arriving as two clicks plus a DoubleClick costs nothing.
            let opens = matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            );
            if opens {
                show_operator_window(tray.app_handle());
            }
        });

    // The bundle icon, so the tray matches the taskbar and the Store listing. Absent only in
    // an unbundled build; a tray with no icon is worse than none, so that case is skipped.
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

fn on_menu_event(app: &AppHandle, id: &str) {
    match id {
        ID_OPEN => show_operator_window(app),
        ID_OVERLAY => emit(app, TrayCommand::ToggleOverlay),
        ID_STOP => emit(app, TrayCommand::StopSession),
        ID_QUIT => request_quit(app),
        other => tracing::warn!("unknown tray menu id: {other}"),
    }
}

fn emit(app: &AppHandle, command: TrayCommand) {
    if let Err(error) = app.emit(events::TRAY_COMMAND, command) {
        tracing::warn!("could not deliver tray command {command:?}: {error}");
    }
}

/// Quit from the tray runs the front-end's shutdown — stop, drain, finalize, ask — because
/// that is where the transcript and the session state are. The watchdog is what makes it
/// safe to depend on that: if nothing claims the request, the app leaves anyway rather than
/// stranding an operator whose only remaining handle is this menu.
fn request_quit(app: &AppHandle) {
    let attempt = app.state::<CloseGuard>().begin_attempt();
    emit(app, TrayCommand::Quit);

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(ACK_TIMEOUT).await;
        if app.state::<CloseGuard>().acknowledged(attempt) {
            return;
        }
        tracing::warn!("front-end did not acknowledge tray quit {attempt}; exiting anyway");
        app.state::<CloseGuard>().release();
        app.exit(0);
    });
}

/// Push the front-end's session and overlay state onto the menu. Called whenever either
/// changes, and once on mount, so the menu cannot describe a state the app has left.
///
/// Synchronous on purpose: Tauri runs sync commands on the main thread, which is where menu
/// items live, so each write is made directly rather than as a blocking round trip from a
/// worker thread.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive their arguments by value"
)]
pub fn set_tray_state(
    tray: tauri::State<'_, TrayMenu>,
    session_active: bool,
    overlay_visible: bool,
    labels: Option<TrayLabels>,
) {
    tray.apply(session_active, overlay_visible, labels);
}
