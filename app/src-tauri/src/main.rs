// Prevent an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    configure_webview2_user_data_folder();

    live_translation_lib::run()
}

/// Give WebView2 a dedicated per-app data directory before Tauri creates any windows.
/// This avoids a stale or locked default WebView2 profile preventing the app from starting.
#[cfg(windows)]
fn configure_webview2_user_data_folder() {
    use std::{env, fs, path::PathBuf};

    // Preserve an explicit override supplied by the user or a diagnostic launcher.
    if env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some() {
        return;
    }

    let Some(local_app_data) = env::var_os("LOCALAPPDATA") else {
        return;
    };
    let folder = PathBuf::from(local_app_data)
        .join("io.github.fmadore.live-translation")
        .join("webview2-user-data");
    if let Err(error) = fs::create_dir_all(&folder) {
        eprintln!("could not prepare WebView2 user data folder: {error}");
        return;
    }

    env::set_var("WEBVIEW2_USER_DATA_FOLDER", folder);
}
