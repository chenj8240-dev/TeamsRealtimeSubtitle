//! Windows text scaling for the operator window.
//!
//! Windows' *Settings → Accessibility → Text size* slider does not reach web content inside
//! WebView2 — [WebView2Feedback#1662](https://github.com/MicrosoftEdge/WebView2Feedback/issues/1662).
//! Display scaling does, because that scales the whole window; the text-only factor is
//! invisible to the front end unless something reads it and hands it over. That is this
//! module: it reads `UISettings.TextScaleFactor`, gives it to the operator window at boot
//! through [`crate::commands::text_scale_factor`], and emits [`events::TEXT_SCALE`] whenever
//! the operator moves the slider while the app is running.
//!
//! The overlay is deliberately excluded. Its captions are projected content whose size the
//! operator sets for the room, the same reason it opts out of contrast themes — see
//! `docs/accessibility.md`.

use tauri::{AppHandle, Emitter};

use crate::types::events;

/// No scaling. Also the value every non-Windows build reports.
pub const DEFAULT: f64 = 1.0;

/// The Windows slider's own range. Reading past it would mean Windows changed, not that the
/// operator asked for something this window can lay out, so the factor is clamped rather
/// than trusted: a stray large value would push the rail off the screen.
pub const MIN: f64 = 1.0;
pub const MAX: f64 = 2.25;

/// Hold a reported factor to the range the layout is verified at, and refuse anything that is
/// not a real number.
pub fn clamp(factor: f64) -> f64 {
    if !factor.is_finite() {
        return DEFAULT;
    }
    factor.clamp(MIN, MAX)
}

/// The operator's current text scale, or [`DEFAULT`] if Windows will not say.
pub fn current() -> f64 {
    #[cfg(windows)]
    {
        clamp(platform::read().unwrap_or(DEFAULT))
    }
    #[cfg(not(windows))]
    {
        DEFAULT
    }
}

/// Start reporting changes to the front end for the rest of the process' life.
///
/// Best-effort by design: if the WinRT call fails the app keeps running at the factor the
/// window already applied, because an operator who cannot subscribe to a settings change is
/// still better served by a working window than by a failed launch.
pub fn watch(app: &AppHandle) {
    #[cfg(windows)]
    {
        if let Err(error) = platform::watch(app.clone()) {
            tracing::warn!("text scale changes will not be followed: {error}");
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app;
    }
}

/// Announce a factor to whichever window is listening. Separate from [`watch`] so the
/// platform code has one place to send from and the tests have one thing to read.
#[cfg_attr(not(windows), allow(dead_code))]
fn announce(app: &AppHandle, factor: f64) {
    let factor = clamp(factor);
    tracing::debug!("text scale factor is now {factor}");
    let _ = app.emit(events::TEXT_SCALE, factor);
}

#[cfg(windows)]
mod platform {
    use std::sync::OnceLock;

    use tauri::AppHandle;
    use windows::core::Result;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::ViewManagement::UISettings;

    /// `TextScaleFactorChanged` unregisters when the `UISettings` that owns it is dropped, so
    /// the instance has to outlive the call that made it. There is exactly one process and
    /// exactly one subscription, which is what this is.
    static SETTINGS: OnceLock<UISettings> = OnceLock::new();

    pub fn read() -> Result<f64> {
        UISettings::new()?.TextScaleFactor()
    }

    pub fn watch(app: AppHandle) -> Result<()> {
        let settings = UISettings::new()?;

        // The handler is called on a Windows thread-pool thread, not the UI thread; `emit`
        // is safe from any thread and the front end applies the value itself.
        settings.TextScaleFactorChanged(&TypedEventHandler::new(
            move |sender: windows::core::Ref<'_, UISettings>, _| {
                let factor = sender
                    .as_ref()
                    .and_then(|settings| settings.TextScaleFactor().ok())
                    .unwrap_or(super::DEFAULT);
                super::announce(&app, factor);
                Ok(())
            },
        ))?;

        // A second call would drop the first subscription on the floor; there is only ever
        // one, from `setup`.
        let _ = SETTINGS.set(settings);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{clamp, DEFAULT, MAX, MIN};

    #[test]
    fn the_windows_range_passes_through_untouched() {
        for factor in [1.0, 1.25, 1.45, 1.75, 2.0, 2.25] {
            assert_eq!(clamp(factor), factor);
        }
    }

    #[test]
    fn anything_outside_the_range_is_held_at_its_edge() {
        assert_eq!(clamp(0.5), MIN);
        assert_eq!(clamp(-3.0), MIN);
        assert_eq!(clamp(4.0), MAX);
    }

    /// A factor is a number the front end multiplies every font size by, so anything that is
    /// not one would make every `calc()` in the stylesheet invalid and blank the window.
    /// These cannot come from the slider, only from a corrupt read, so they fall back to no
    /// scaling rather than to the far edge of a range nobody asked for.
    #[test]
    fn a_factor_that_is_not_a_real_number_falls_back_to_no_scaling() {
        assert_eq!(clamp(f64::NAN), DEFAULT);
        assert_eq!(clamp(f64::INFINITY), DEFAULT);
        assert_eq!(clamp(f64::NEG_INFINITY), DEFAULT);
    }
}
