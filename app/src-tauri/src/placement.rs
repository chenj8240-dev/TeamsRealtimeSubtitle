//! Where the caption overlay sits: read and set for meeting profiles and for the placement the
//! interface remembers per display layout, and brought back onto a connected display when the
//! one it was on goes away. Only the caption window is ever moved, never another application.
//!
//! Windows does not rescue the overlay on its own. Unplug the projector it sits on while the
//! app runs and the window keeps coordinates on a display that no longer exists: invisible to
//! the room, and still invisible after "Move overlay", because there is nothing on screen to
//! drag. So the core watches the displays (`spawn_display_watcher`), moves the overlay back
//! when its geometry no longer fits any of them, and tells the interface the layout changed so
//! it can restore the placement it remembers for the new one.
use std::time::Duration;

use crate::{
    errors::{id, AppError},
    overlay::OVERLAY_LABEL,
    types::events,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

fn fit(saved: &Placement, bounds: &Placement) -> Placement {
    let width = saved.width.clamp(320, 16384).min(bounds.width);
    let height = saved.height.clamp(160, 16384).min(bounds.height);
    // The far edge saturates: no position lies past `i32::MAX`, however far the area reaches.
    Placement {
        x: saved.x.clamp(
            bounds.x,
            bounds.x.saturating_add_unsigned(bounds.width - width),
        ),
        y: saved.y.clamp(
            bounds.y,
            bounds.y.saturating_add_unsigned(bounds.height - height),
        ),
        width,
        height,
    }
}

/// One display as a layout signature sees it: where it sits on the desktop, how many physical
/// pixels it has, and how far Windows scales them.
#[derive(Clone, Copy, Debug)]
struct Display {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
}

impl Display {
    fn of(monitor: &Monitor) -> Self {
        Self {
            x: monitor.position().x,
            y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
            scale: monitor.scale_factor(),
        }
    }

    /// The whole display, taskbar included.
    fn bounds(&self) -> Placement {
        Placement {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }

    /// The display as `layout_signature` names it.
    fn signature(&self) -> String {
        let (x, y, width, height) = (self.x, self.y, self.width, self.height);
        let percent = self.scale * 100.0;
        format!("{x},{y} {width}x{height} {percent:.0}%")
    }
}

/// One display as the rescue sees it: the display itself, the part of it Windows leaves to
/// windows (the work area, without the taskbar), and whether it is the primary one.
#[derive(Clone, Copy, Debug)]
struct Screen {
    display: Display,
    work_area: Placement,
    primary: bool,
}

impl Screen {
    fn of(monitor: &Monitor, primary: Option<&Monitor>) -> Self {
        let area = monitor.work_area();
        Self {
            display: Display::of(monitor),
            work_area: Placement {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            },
            // A monitor handle carries no identity to compare, but two displays never share
            // both an origin and a size on one desktop.
            primary: primary
                .is_some_and(|p| p.position() == monitor.position() && p.size() == monitor.size()),
        }
    }
}

/// A name for the arrangement of displays, so a remembered overlay placement belongs to the
/// layout it was made on: plugging the projector back in brings back the projector placement,
/// and the laptop on its own keeps its own.
///
/// Sorted, because the order the system lists monitors in is not part of the layout. The
/// scale is a whole percentage, as Windows offers it, so a factor that arrives a rounding
/// error away still names the same layout. The work area is left out: moving the taskbar does
/// not make it a different room, and a restore is clamped to the work area anyway.
fn layout_signature(displays: &[Display]) -> String {
    let mut parts: Vec<String> = displays.iter().map(Display::signature).collect();
    parts.sort_unstable();
    parts.join("; ")
}

/// What the display watcher compares from one poll to the next: everything in
/// `layout_signature` and the work area as well. Unlike a remembered placement, a rescue does
/// care about the taskbar: a work area that shrank or moved can leave the overlay where it no
/// longer fits, and switching Windows' projection mode or a display's resolution shows up here
/// whether or not it names a new layout.
fn change_signature(screens: &[Screen]) -> String {
    let mut parts: Vec<String> = screens
        .iter()
        .map(|s| {
            let area = &s.work_area;
            let (x, y, width, height) = (area.x, area.y, area.width, area.height);
            format!("{} work {x},{y} {width}x{height}", s.display.signature())
        })
        .collect();
    parts.sort_unstable();
    parts.join("; ")
}

/// The centre of a rectangle, in `i64` so no width or position can overflow it.
fn centre(rect: &Placement) -> (i64, i64) {
    (
        i64::from(rect.x) + i64::from(rect.width) / 2,
        i64::from(rect.y) + i64::from(rect.height) / 2,
    )
}

/// How far a point lies from a rectangle, squared: zero inside it, otherwise the distance to
/// its nearest edge. Squared to stay in whole numbers; `i128` because the square of a distance
/// across the whole `i32` desktop does not fit in an `i64`.
fn distance_squared((x, y): (i64, i64), rect: &Placement) -> i128 {
    // Half-open, like a monitor's pixels: the last column is `x + width - 1`.
    let axis = |point: i64, start: i32, length: u32| {
        let start = i64::from(start);
        let end = start + i64::from(length);
        if point < start {
            start - point
        } else if point >= end {
            point - end + 1
        } else {
            0
        }
    };
    let dx = i128::from(axis(x, rect.x, rect.width));
    let dy = i128::from(axis(y, rect.y, rect.height));
    dx * dx + dy * dy
}

/// Whether the room can see the overlay where it is: its centre lies on some display, and the
/// displays together are large enough to hold it whole. Deliberately generous. A placement the
/// operator chose stays put even if it overlaps the taskbar, runs a little off an edge or is
/// stretched across two displays on purpose; the rescue is for a window nobody can see or
/// reach, not a second opinion on one they placed. What it does catch is a window from a
/// larger desktop than the one left: stretched across a projector that has gone, or sized for
/// a resolution the display no longer has.
fn usable(window: &Placement, screens: &[Screen]) -> bool {
    let point = centre(window);
    let on_a_display = screens
        .iter()
        .any(|s| distance_squared(point, &s.display.bounds()) == 0);
    // The extent of the whole desktop, in i64 so displays far from the origin cannot overflow.
    let extent = |start: fn(&Placement) -> i64, end: fn(&Placement) -> i64| {
        let starts = screens.iter().map(|s| start(&s.display.bounds())).min();
        let ends = screens.iter().map(|s| end(&s.display.bounds())).max();
        starts.zip(ends).map_or(0, |(start, end)| end - start)
    };
    let desktop_width = extent(|b| i64::from(b.x), |b| i64::from(b.x) + i64::from(b.width));
    let desktop_height = extent(|b| i64::from(b.y), |b| i64::from(b.y) + i64::from(b.height));
    on_a_display
        && i64::from(window.width) <= desktop_width
        && i64::from(window.height) <= desktop_height
}

/// Where the overlay has to go so the room can see it again, or `None` when it can stay where
/// it is (or there is no display to put it on).
///
/// The display that holds its centre if one does, as when a display shrank under a window that
/// no longer fits; otherwise the nearest one, so captions left of a vanished projector come
/// back on the left. Ties go to the primary display, then to the first listed. The window keeps
/// as much of its size and position as that display's work area allows.
fn rescue(window: &Placement, screens: &[Screen]) -> Option<Placement> {
    if usable(window, screens) {
        return None;
    }
    let point = centre(window);
    // `min_by_key` keeps the first of equal keys, which is the first listed.
    let target = screens
        .iter()
        .min_by_key(|s| (distance_squared(point, &s.display.bounds()), !s.primary))?;
    let safe = fit(window, &target.work_area);
    (safe != *window).then_some(safe)
}

/// The current display layout's signature; see `layout_signature`. The interface keeps the
/// remembered placements and asks for this when it saves one and when it restores at launch.
#[tauri::command]
pub async fn display_layout(app: AppHandle) -> Result<String, AppError> {
    let monitors = app
        .available_monitors()
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    let displays: Vec<Display> = monitors.iter().map(Display::of).collect();
    Ok(layout_signature(&displays))
}

fn overlay_window(app: &AppHandle) -> Result<WebviewWindow, AppError> {
    app.get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| AppError::with(id::OVERLAY_WINDOW, "Overlay unavailable"))
}

/// The overlay's geometry in physical pixels: the outer position, so a placement that is set
/// again lands where it was read, and the inner size, which is what `set_size` sets.
fn current_placement(win: &WebviewWindow) -> Result<Placement, AppError> {
    let pos = win
        .outer_position()
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    let size = win
        .inner_size()
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    Ok(Placement {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    })
}

/// Every connected display, with its work area and which one is primary.
fn screens(app: &AppHandle) -> Result<Vec<Screen>, AppError> {
    let monitors = app
        .available_monitors()
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    let primary = app
        .primary_monitor()
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    Ok(monitors
        .iter()
        .map(|m| Screen::of(m, primary.as_ref()))
        .collect())
}

/// Put the overlay at a placement that is already known to be safe.
fn apply(win: &WebviewWindow, safe: &Placement) -> Result<(), AppError> {
    // Moved before it is sized. A window that lands on a display with another scale factor is
    // rescaled by Windows to keep its logical size (WM_DPICHANGED), which would undo a size
    // set beforehand — and a laptop at 150% beside a projector at 100% is the usual room. The
    // rescale can shift the window as well, so it is placed again once it has its size.
    let position = PhysicalPosition::new(safe.x, safe.y);
    win.set_position(position)
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    win.set_size(PhysicalSize::new(safe.width, safe.height))
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    win.set_position(position)
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    Ok(())
}

/// Move the overlay onto one of `screens` if the room could not see it where it is; whether
/// it was moved. Only the geometry changes: a hidden overlay stays hidden, and click-through,
/// focus and the no-activate flag are left as they were.
fn recover(win: &WebviewWindow, screens: &[Screen]) -> Result<bool, AppError> {
    // A minimised window reports Windows' parking spot (-32000, -32000), not where it will
    // come back to, and moving that would be a rescue of nothing.
    if win.is_minimized().unwrap_or(false) {
        return Ok(false);
    }
    let current = current_placement(win)?;
    let Some(safe) = rescue(&current, screens) else {
        return Ok(false);
    };
    apply(win, &safe)?;
    Ok(true)
}

#[tauri::command]
pub async fn get_overlay_placement(app: AppHandle) -> Result<Placement, AppError> {
    current_placement(&overlay_window(&app)?)
}

#[tauri::command]
pub async fn set_overlay_placement(app: AppHandle, placement: Placement) -> Result<(), AppError> {
    let win = overlay_window(&app)?;
    let monitors = win
        .available_monitors()
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    // A disconnected projector must not leave captions outside every display.
    let within = |value: i32, start: i32, length: u32| {
        (i64::from(start)..i64::from(start) + i64::from(length)).contains(&i64::from(value))
    };
    let monitor = monitors.iter().find(|m| {
        let p = m.position();
        let s = m.size();
        within(placement.x, p.x, s.width) && within(placement.y, p.y, s.height)
    });
    let primary = win
        .primary_monitor()
        .map_err(|e| AppError::with(id::OVERLAY_WINDOW, e))?;
    let monitor = monitor
        .or(primary.as_ref())
        .or(monitors.first())
        .ok_or_else(|| AppError::with(id::OVERLAY_WINDOW, "No display available"))?;
    let area = monitor.work_area();
    let safe = fit(
        &placement,
        &Placement {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
        },
    );
    apply(&win, &safe)
}

/// Bring the overlay back onto a connected display if it is somewhere the room cannot see it;
/// whether it was moved. For the interface, when it needs the captions where the room can see
/// them without waiting for the display watcher — before "Move overlay", for one, which is no
/// use on a window nobody can find.
#[tauri::command]
pub async fn recover_overlay_placement(app: AppHandle) -> Result<bool, AppError> {
    let win = overlay_window(&app)?;
    recover(&win, &screens(&app)?)
}

/// How often the display watcher looks at the connected displays. Windows has no display-change
/// notification that reaches a Tauri app without a window procedure of its own, and once a
/// second is soon enough for an operator who has just pulled a cable and costs one monitor
/// enumeration.
const DISPLAY_POLL: Duration = Duration::from_secs(1);

/// Decides when a display change has settled enough to act on.
///
/// Plugging a display in or out, or switching Windows' projection mode, passes through
/// several arrangements in a second or two: displays appear before their work area does, a
/// resolution is tried and changed. Acting on each would move the overlay more than once and
/// tell the interface about layouts that never really existed. So a new signature has to be
/// seen on two polls in a row before it counts.
#[derive(Debug, Default)]
struct Settle {
    /// The arrangement last acted on; the first poll's, until something changes.
    acted: Option<String>,
    /// A different arrangement seen on the previous poll, waiting for a second sighting.
    candidate: Option<String>,
}

impl Settle {
    /// Record one poll; whether it completes a change worth acting on. The first poll only
    /// records where the app started: the interface restores its own placement at launch.
    fn observe(&mut self, signature: String) -> bool {
        let Some(acted) = &self.acted else {
            self.acted = Some(signature);
            return false;
        };
        if *acted == signature {
            // Back to where it was: whatever flickered past is forgotten.
            self.candidate = None;
            return false;
        }
        if self.candidate.as_ref() == Some(&signature) {
            self.acted = Some(signature);
            self.candidate = None;
            return true;
        }
        self.candidate = Some(signature);
        false
    }
}

/// Start the background loop that follows display changes for the lifetime of the app.
///
/// When the displays settle into a new arrangement, the overlay is first brought back onto
/// one of them if it was stranded, and then `events::DISPLAYS_CHANGED` carries the new layout
/// signature to the interface, which can restore the placement it remembers for that layout.
/// Stops if the overlay window is destroyed. A failed poll or rescue is logged and the loop
/// carries on: losing the watcher would only bring back the problem it exists for.
pub fn spawn_display_watcher(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(DISPLAY_POLL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut settle = Settle::default();
        // A failure that repeats every second is reported once, not once a second.
        let mut failing = false;
        loop {
            ticker.tick().await;
            let Some(window) = app.get_webview_window(OVERLAY_LABEL) else {
                break;
            };
            let screens = match screens(&app) {
                Ok(screens) => {
                    failing = false;
                    screens
                }
                Err(error) => {
                    if failing {
                        tracing::debug!("displays could not be read: {error}");
                    } else {
                        tracing::warn!("displays could not be read: {error}");
                    }
                    failing = true;
                    continue;
                }
            };
            // Mid-switch, Windows can briefly report no display at all. That is not a layout
            // anyone can place captions on, so it is neither acted on nor remembered.
            if screens.is_empty() {
                continue;
            }
            if !settle.observe(change_signature(&screens)) {
                continue;
            }
            match recover(&window, &screens) {
                Ok(true) => {
                    tracing::info!("displays changed; caption overlay moved back on screen")
                }
                Ok(false) => tracing::debug!("displays changed; caption overlay still on screen"),
                Err(error) => tracing::warn!("caption overlay could not be moved back: {error}"),
            }
            let displays: Vec<Display> = screens.iter().map(|s| s.display).collect();
            // Broadcast, like every other core event; see the comment in `lib.rs`.
            if let Err(error) = app.emit(events::DISPLAYS_CHANGED, layout_signature(&displays)) {
                tracing::warn!("display change could not be announced: {error}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_monitor_and_extreme_sizes_stay_in_work_area() {
        let bounds = Placement {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1040,
        };
        let safe = fit(
            &Placement {
                x: i32::MAX,
                y: i32::MIN,
                width: u32::MAX,
                height: 0,
            },
            &bounds,
        );
        assert_eq!(
            (safe.x, safe.y, safe.width, safe.height),
            (-1920, 0, 1920, 160)
        );
    }

    const LAPTOP: Display = Display {
        x: 0,
        y: 0,
        width: 2560,
        height: 1600,
        scale: 1.5,
    };
    const PROJECTOR: Display = Display {
        x: 2560,
        y: 0,
        width: 1920,
        height: 1080,
        scale: 1.0,
    };

    #[test]
    fn the_layout_signature_ignores_the_order_monitors_are_listed_in() {
        assert_eq!(
            layout_signature(&[LAPTOP, PROJECTOR]),
            layout_signature(&[PROJECTOR, LAPTOP])
        );
        assert_eq!(
            layout_signature(&[PROJECTOR, LAPTOP]),
            "0,0 2560x1600 150%; 2560,0 1920x1080 100%"
        );
    }

    #[test]
    fn the_layout_signature_changes_with_a_display_position_size_or_scale() {
        let base = layout_signature(&[LAPTOP, PROJECTOR]);
        let moved = Display {
            x: -1920,
            ..PROJECTOR
        };
        let resized = Display {
            width: 1280,
            height: 720,
            ..PROJECTOR
        };
        let rescaled = Display {
            scale: 1.25,
            ..PROJECTOR
        };
        let variants = [
            layout_signature(&[LAPTOP]),
            layout_signature(&[LAPTOP, moved]),
            layout_signature(&[LAPTOP, resized]),
            layout_signature(&[LAPTOP, rescaled]),
        ];
        for variant in &variants {
            assert_ne!(variant, &base);
        }
        // …and from each other: no two of these layouts share a remembered placement.
        let mut distinct = variants.to_vec();
        distinct.sort_unstable();
        distinct.dedup();
        assert_eq!(distinct.len(), variants.len());
    }

    #[test]
    fn a_scale_factor_a_rounding_error_away_names_the_same_layout() {
        let drifted = Display {
            scale: 120.0 / 96.0 + 1e-9,
            ..PROJECTOR
        };
        let exact = Display {
            scale: 1.25,
            ..PROJECTOR
        };
        assert_eq!(layout_signature(&[drifted]), layout_signature(&[exact]));
    }

    /// The laptop on its own, as the room has it once the projector cable is out: primary,
    /// with an 80-pixel taskbar along the bottom.
    const LAPTOP_SCREEN: Screen = Screen {
        display: LAPTOP,
        work_area: Placement {
            x: 0,
            y: 0,
            width: 2560,
            height: 1520,
        },
        primary: true,
    };
    const PROJECTOR_SCREEN: Screen = Screen {
        display: PROJECTOR,
        work_area: Placement {
            x: 2560,
            y: 0,
            width: 1920,
            height: 1032,
        },
        primary: false,
    };

    /// A caption strip along the bottom of whichever display it was placed on.
    fn strip(x: i32, y: i32) -> Placement {
        Placement {
            x,
            y,
            width: 1600,
            height: 200,
        }
    }

    fn inside(rect: &Placement, area: &Placement) -> bool {
        i64::from(rect.x) >= i64::from(area.x)
            && i64::from(rect.y) >= i64::from(area.y)
            && i64::from(rect.x) + i64::from(rect.width)
                <= i64::from(area.x) + i64::from(area.width)
            && i64::from(rect.y) + i64::from(rect.height)
                <= i64::from(area.y) + i64::from(area.height)
    }

    #[test]
    fn an_overlay_left_on_a_removed_projector_comes_back_to_the_laptop() {
        let on_projector = strip(2720, 820);
        assert_eq!(
            rescue(&on_projector, &[LAPTOP_SCREEN, PROJECTOR_SCREEN]),
            None
        );

        let rescued = rescue(&on_projector, &[LAPTOP_SCREEN]).expect("reported as moved");
        assert!(inside(&rescued, &LAPTOP_SCREEN.work_area), "{rescued:?}");
        assert_eq!((rescued.width, rescued.height), (1600, 200));
        assert!(usable(&rescued, &[LAPTOP_SCREEN]));
    }

    #[test]
    fn an_overlay_already_on_the_laptop_is_left_alone() {
        assert_eq!(rescue(&strip(480, 1200), &[LAPTOP_SCREEN]), None);
        // Over the taskbar is the operator's choice, not a stranded window.
        assert_eq!(rescue(&strip(480, 1450), &[LAPTOP_SCREEN]), None);
        assert_eq!(
            rescue(&strip(480, 1200), &[PROJECTOR_SCREEN, LAPTOP_SCREEN]),
            None
        );
    }

    #[test]
    fn an_overlay_stretched_across_both_displays_on_purpose_is_left_alone() {
        // Centre on the laptop, wider than either display, inside the desktop both make.
        let across = Placement {
            x: 1280,
            y: 900,
            width: 2560,
            height: 160,
        };
        assert_eq!(rescue(&across, &[LAPTOP_SCREEN, PROJECTOR_SCREEN]), None);
        // …until the projector goes, and the desktop with it.
        assert!(rescue(&across, &[LAPTOP_SCREEN]).is_some());
    }

    #[test]
    fn projectors_left_of_and_above_the_laptop_are_rescued_from() {
        let left = Screen {
            display: Display {
                x: -1920,
                ..PROJECTOR
            },
            work_area: Placement {
                x: -1920,
                ..PROJECTOR_SCREEN.work_area
            },
            primary: false,
        };
        let above = Screen {
            display: Display {
                x: 0,
                y: -1080,
                ..PROJECTOR
            },
            work_area: Placement {
                x: 0,
                y: -1080,
                ..PROJECTOR_SCREEN.work_area
            },
            primary: false,
        };
        for (projector, window) in [(left, strip(-1760, 820)), (above, strip(160, -260))] {
            assert_eq!(rescue(&window, &[LAPTOP_SCREEN, projector]), None);
            let rescued = rescue(&window, &[LAPTOP_SCREEN]).expect("reported as moved");
            assert!(inside(&rescued, &LAPTOP_SCREEN.work_area), "{rescued:?}");
        }
    }

    #[test]
    fn an_overlay_bigger_than_the_remaining_display_is_shrunk_to_fit() {
        // Stretched across where both displays were, centre on the laptop, too wide for it.
        let wide = Placement {
            x: 0,
            y: 1300,
            width: 4480,
            height: 200,
        };
        let rescued = rescue(&wide, &[LAPTOP_SCREEN]).expect("reported as moved");
        assert_eq!(
            rescued,
            Placement {
                x: 0,
                y: 1300,
                width: 2560,
                height: 200,
            }
        );

        let huge = Placement {
            x: 0,
            y: 0,
            width: 3840,
            height: 2160,
        };
        let rescued = rescue(&huge, &[LAPTOP_SCREEN]).expect("reported as moved");
        assert_eq!(rescued, LAPTOP_SCREEN.work_area);
    }

    #[test]
    fn a_centre_on_no_display_goes_to_the_nearest_not_the_primary() {
        // Past the right edge of the projector: the projector is nearer than the laptop.
        let rescued = rescue(&strip(5200, 400), &[LAPTOP_SCREEN, PROJECTOR_SCREEN]).expect("moved");
        assert!(inside(&rescued, &PROJECTOR_SCREEN.work_area), "{rescued:?}");

        // Exactly between two displays: the primary wins, even listed second.
        let side = |x: i32, primary: bool| Screen {
            display: Display {
                x,
                y: 0,
                width: 1000,
                height: 1000,
                scale: 1.0,
            },
            work_area: Placement {
                x,
                y: 0,
                width: 1000,
                height: 1000,
            },
            primary,
        };
        let gap = Placement {
            x: 1300,
            y: 400,
            width: 400,
            height: 200,
        };
        let rescued = rescue(&gap, &[side(2001, false), side(0, true)]).expect("moved");
        assert!(inside(&rescued, &side(0, true).work_area), "{rescued:?}");
        // …and without a primary, the first listed.
        let rescued = rescue(&gap, &[side(2001, false), side(0, false)]).expect("moved");
        assert!(
            inside(&rescued, &side(2001, false).work_area),
            "{rescued:?}"
        );
    }

    #[test]
    fn extreme_coordinates_do_not_overflow() {
        let far = |x: i32, y: i32| Screen {
            display: Display {
                x,
                y,
                width: 1920,
                height: 1080,
                scale: 1.0,
            },
            work_area: Placement {
                x,
                y,
                width: 1920,
                height: 1040,
            },
            primary: false,
        };
        let corners = [
            far(i32::MIN, i32::MIN),
            far(i32::MAX - 1920, i32::MAX - 1080),
        ];
        for window in [
            Placement {
                x: i32::MAX,
                y: i32::MAX,
                width: u32::MAX,
                height: u32::MAX,
            },
            Placement {
                x: i32::MIN,
                y: i32::MIN,
                width: u32::MAX,
                height: 0,
            },
            Placement {
                x: i32::MIN,
                y: i32::MAX,
                width: u32::MAX,
                height: 1,
            },
        ] {
            let rescued = rescue(&window, &corners).expect("moved");
            assert!(
                corners.iter().any(|c| inside(&rescued, &c.work_area)),
                "{rescued:?}"
            );
        }
        assert_eq!(
            distance_squared((i64::MIN / 4, i64::MIN / 4), &corners[1].display.bounds()).signum(),
            1
        );
    }

    #[test]
    fn with_no_display_there_is_nothing_to_rescue_onto() {
        assert_eq!(rescue(&strip(2720, 820), &[]), None);
    }

    #[test]
    fn the_change_signature_sees_a_work_area_the_layout_signature_ignores() {
        let taskbar_moved = Screen {
            work_area: Placement {
                x: 80,
                y: 0,
                width: 2480,
                height: 1600,
            },
            ..LAPTOP_SCREEN
        };
        assert_eq!(
            layout_signature(&[LAPTOP_SCREEN.display]),
            layout_signature(&[taskbar_moved.display])
        );
        assert_ne!(
            change_signature(&[LAPTOP_SCREEN]),
            change_signature(&[taskbar_moved])
        );
        assert_eq!(
            change_signature(&[LAPTOP_SCREEN, PROJECTOR_SCREEN]),
            change_signature(&[PROJECTOR_SCREEN, LAPTOP_SCREEN])
        );
    }

    #[test]
    fn a_change_counts_once_it_holds_for_two_polls() {
        let mut settle = Settle::default();
        // The layout the app started on is a baseline, not a change.
        assert!(!settle.observe("a".into()));
        assert!(!settle.observe("a".into()));
        // A flicker that goes back is ignored.
        assert!(!settle.observe("b".into()));
        assert!(!settle.observe("a".into()));
        // Hot-plugging passes through an arrangement on its way to the one that stays.
        assert!(!settle.observe("b".into()));
        assert!(!settle.observe("c".into()));
        assert!(settle.observe("c".into()));
        // Acted on once, not on every poll after.
        assert!(!settle.observe("c".into()));
        assert!(!settle.observe("a".into()));
        assert!(settle.observe("a".into()));
    }
}
