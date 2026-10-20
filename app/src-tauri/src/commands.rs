//! Tauri commands exposed to the front-end. Thin wrappers over `secrets`, `audio`, and the
//! `SessionManager`. Errors are surfaced to JS as an `AppError` — an id the interface
//! translates plus the untranslated technical detail; see `errors.rs`.
//!
//! Most commands are `async`, and hand blocking keychain, device, filesystem and thread-join
//! work to Tauri's blocking pool. Four are synchronous, so Tauri runs them on the main thread:
//! `whisper_cpu_support`, `pause_session`, `cancel_whisper_download` and
//! `discard_whisper_pending`. Each only reads an answer worked out once or signals something
//! already running, which is quicker than handing it to a worker would be.

use tauri::{AppHandle, Manager, State};

use crate::audio::list_input_devices;
use crate::errors::{id, AppError};
use crate::ondevice::{self, OnDeviceReadiness};
use crate::overlay::{self, OVERLAY_LABEL};
use crate::secrets;
use crate::session::SessionManager;
use crate::textscale;
use crate::types::{AudioDevice, AudioSource, Provider, StartOptions};

#[tauri::command]
pub async fn list_microphones() -> Result<Vec<AudioDevice>, AppError> {
    tauri::async_runtime::spawn_blocking(list_input_devices)
        .await
        .map_err(|error| AppError::with(id::DEVICE_ENUMERATION, error))?
        .map_err(|error| AppError::with(id::DEVICE_ENUMERATION, error))
}

#[tauri::command]
pub async fn list_outputs() -> Result<Vec<AudioDevice>, AppError> {
    tauri::async_runtime::spawn_blocking(crate::audio::devices::list_outputs)
        .await
        .map_err(|e| AppError::with(id::DEVICE_ENUMERATION, e))?
        .map_err(|e| AppError::with(id::DEVICE_ENUMERATION, e))
}

#[tauri::command]
pub async fn has_api_key(provider: Provider) -> Result<bool, AppError> {
    tauri::async_runtime::spawn_blocking(move || secrets::has_api_key(provider))
        .await
        .map_err(|error| AppError::with(id::KEYCHAIN, error))
}

#[tauri::command]
pub async fn list_applications() -> Result<crate::audio::applications::ApplicationList, AppError> {
    tauri::async_runtime::spawn_blocking(crate::audio::applications::list)
        .await
        .map_err(|e| AppError::with(id::DEVICE_ENUMERATION, e))?
        .map_err(|e| AppError::with(id::DEVICE_ENUMERATION, e))
}

#[tauri::command]
pub async fn set_api_key(provider: Provider, key: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || secrets::set_api_key(provider, &key))
        .await
        .map_err(|error| AppError::with(id::KEYCHAIN, error))?
        .map_err(|error| AppError::with(id::KEYCHAIN, error))
}

#[tauri::command]
pub async fn clear_api_key(provider: Provider) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || secrets::clear_api_key(provider))
        .await
        .map_err(|error| AppError::with(id::KEYCHAIN, error))?
        .map_err(|error| AppError::with(id::KEYCHAIN, error))
}

#[tauri::command]
pub async fn ondevice_readiness(app: AppHandle) -> Result<OnDeviceReadiness, AppError> {
    tauri::async_runtime::spawn_blocking(move || ondevice::readiness(&app))
        .await
        .map_err(|error| AppError::with(id::DEMO_UNAVAILABLE, error))
}

#[tauri::command]
pub async fn start_session(
    app: AppHandle,
    manager: State<'_, SessionManager>,
    options: StartOptions,
) -> Result<(), AppError> {
    // Checked before anything is stopped or opened, and given its own sentence: "the session
    // could not be started" would not tell the operator that no retry can help on this PC.
    if options.provider.is_local_whisper() {
        crate::whisper::cpu::ensure_supported()
            .map_err(|error| AppError::with(id::WHISPER_CPU, error))?;
    }
    manager.start(&app, options).await.map_err(|error| {
        match error.downcast_ref::<crate::whisper::cpu::Unsupported>() {
            Some(unsupported) => AppError::with(id::WHISPER_CPU, unsupported),
            None => AppError::with(id::SESSION_START, format!("{error:#}")),
        }
    })
}

/// Whether this processor can run local Whisper, asked once by the setup sheet so an
/// unsupported PC is told before Start rather than by it.
#[tauri::command]
pub fn whisper_cpu_support() -> crate::whisper::cpu::CpuSupport {
    crate::whisper::cpu::support().clone()
}

/// Pause or resume the running session; see `SessionManager::set_paused`.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive their arguments by value"
)]
pub fn pause_session(
    app: AppHandle,
    manager: State<'_, SessionManager>,
    paused: bool,
) -> Result<(), AppError> {
    manager
        .set_paused(&app, paused)
        .map_err(|error| AppError::with(id::SESSION_PAUSE, format!("{error:#}")))
}

#[tauri::command]
pub async fn whisper_models(
    app: AppHandle,
) -> Result<Vec<crate::whisper::models::ModelInfo>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = crate::whisper::models::directory(&app)?;
        Ok::<_, anyhow::Error>(
            app.state::<crate::whisper::models::ModelManager>()
                .list(&dir),
        )
    })
    .await
    .map_err(|e| AppError::with(id::WHISPER_MODEL, e))?
    .map_err(|e| AppError::with(id::WHISPER_MODEL, e))
}

#[tauri::command]
pub async fn download_whisper_model(
    app: AppHandle,
    model: crate::whisper::models::ModelId,
) -> Result<(), AppError> {
    let dir = crate::whisper::models::directory(&app)
        .map_err(|e| AppError::with(id::WHISPER_MODEL, e))?;
    let manager = app
        .state::<crate::whisper::models::ModelManager>()
        .inner()
        .clone();
    manager
        .download(&dir, model)
        .await
        .map_err(|e| AppError::with(id::WHISPER_MODEL, e))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive their arguments by value"
)]
pub fn cancel_whisper_download(manager: State<'_, crate::whisper::models::ModelManager>) {
    manager.cancel_download();
}

#[tauri::command]
pub async fn remove_whisper_model(
    app: AppHandle,
    model: crate::whisper::models::ModelId,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = crate::whisper::models::directory(&app)?;
        app.state::<crate::whisper::models::ModelManager>()
            .remove(&dir, model)
    })
    .await
    .map_err(|e| AppError::with(id::WHISPER_MODEL, e))?
    .map_err(|e| AppError::with(id::WHISPER_MODEL, e))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive their arguments by value"
)]
pub fn discard_whisper_pending(manager: State<'_, SessionManager>) {
    manager.discard_local_pending();
}

#[tauri::command]
pub async fn stop_session(
    app: AppHandle,
    manager: State<'_, SessionManager>,
) -> Result<(), AppError> {
    manager.stop(&app).await;
    Ok(())
}

/// Start level-only capture from the preflight so the operator can confirm a source is
/// actually producing sound. Opens no provider connection and keeps no audio; see
/// `SessionManager::start_test`.
#[tauri::command]
pub async fn start_audio_test(
    app: AppHandle,
    manager: State<'_, SessionManager>,
    source: AudioSource,
    mic_device_name: Option<String>,
    system_device_id: Option<String>,
    system_capture: Option<crate::audio::applications::SystemCapture>,
) -> Result<(), AppError> {
    manager
        .start_test(
            &app,
            source,
            mic_device_name,
            system_device_id,
            system_capture.unwrap_or_default(),
        )
        .await
        .map_err(|error| AppError::with(id::AUDIO_TEST_START, format!("{error:#}")))
}

#[tauri::command]
pub async fn stop_audio_test(
    app: AppHandle,
    manager: State<'_, SessionManager>,
) -> Result<(), AppError> {
    manager.stop_test(&app).await;
    Ok(())
}

/// Toggle click-through on the caption overlay. Enabled while captioning so the overlay
/// never steals clicks from the slides; disabled by "Move overlay" in the operator window
/// so the overlay can be dragged and resized into place.
#[tauri::command]
pub async fn set_overlay_click_through(app: AppHandle, enabled: bool) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        win.set_ignore_cursor_events(enabled)
            .map_err(|error| AppError::with(id::OVERLAY_WINDOW, error))?;
        // Click-through and no-activate go together: while captioning the overlay must never
        // take focus, but in move mode it has to in order to be dragged.
        overlay::set_no_activate(&win, enabled);
    }
    Ok(())
}

#[tauri::command]
pub async fn show_overlay(app: AppHandle, visible: bool) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let r = if visible { win.show() } else { win.hide() };
        r.map_err(|error| AppError::with(id::OVERLAY_WINDOW, error))?;
        if visible {
            overlay::raise(&win);
        }
    }
    Ok(())
}

/// The operator's Windows text-scale factor, asked for once as the window boots.
///
/// A command rather than only an event because the window has to lay itself out before it
/// could possibly have subscribed to anything, and an operator who needs 225% text should
/// never see one frame of 9.5px type. Changes after boot arrive on `events::TEXT_SCALE`.
#[tauri::command]
pub async fn text_scale_factor() -> f64 {
    textscale::current()
}

/// Show Windows Save As, then atomically write only to the selected destination.
#[tauri::command]
pub async fn save_transcript(
    app: AppHandle,
    window: tauri::WebviewWindow,
    content: String,
    filename: String,
) -> Result<Option<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::export::save(app, window, content, filename)
    })
    .await
    .map_err(|error| AppError::with(id::TASK_FAILED, error))?
}
