//! Native Save As and atomic transcript writes. Only the operator may invoke this.
#[cfg(any(windows, test))]
use std::io;
#[cfg(any(windows, test))]
use std::path::Path;
#[cfg(any(windows, test))]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(any(windows, test))]
static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

/// `atomic_file::replace_via`, staged under a hidden name of this process's own. The folder is
/// the operator's, so a name derived from the target's could already belong to one of their
/// files; this one cannot, and would be refused rather than truncated if it somehow existed.
#[cfg(any(windows, test))]
fn atomic_write(path: &Path, content: &[u8]) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("missing parent directory"))?;
    let staging = parent.join(format!(
        ".live-translation-{}-{}.tmp",
        std::process::id(),
        NEXT_FILE.fetch_add(1, Ordering::Relaxed)
    ));
    crate::atomic_file::replace_via(path, &staging, content)
}

#[cfg(windows)]
pub fn save(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    content: String,
    filename: String,
) -> Result<Option<String>, crate::errors::AppError> {
    use crate::errors::{id, AppError};
    use tauri::Manager;
    // A dedicated thread keeps the dialog's STA isolated from audio workers' COM state.
    std::thread::spawn(move || {
        let extension = Path::new(&filename)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let label = match extension {
            "md" => "Markdown",
            "txt" => "TXT",
            "vtt" => "WebVTT",
            "srt" => "SubRip",
            _ => {
                return Err(AppError::with(
                    id::TRANSCRIPT_WRITE,
                    "unsupported transcript format",
                ))
            }
        };
        let preference = app
            .path()
            .app_local_data_dir()
            .ok()
            .map(|p| p.join("export-directory.json"));
        let remembered = preference
            .as_ref()
            .and_then(|p| std::fs::read(p).ok())
            .and_then(|bytes| serde_json::from_slice::<std::path::PathBuf>(&bytes).ok())
            .filter(|p| p.is_dir());
        let mut dialog = rfd::FileDialog::new()
            .set_parent(&window)
            .set_file_name(&filename)
            .add_filter(label, &[extension]);
        if let Some(dir) = remembered.or_else(|| app.path().document_dir().ok()) {
            dialog = dialog.set_directory(dir);
        }
        // Windows' IFileSaveDialog supplies the normal overwrite confirmation.
        let Some(path) = dialog.save_file() else {
            return Ok(None);
        };
        atomic_write(&path, content.as_bytes()).map_err(|e| {
            AppError::with(id::TRANSCRIPT_WRITE, format!("{} — {e}", path.display()))
        })?;
        // Remember only successful saves. A preference failure must not undo a completed export.
        if let (Some(pref), Some(parent)) = (preference, path.parent()) {
            if let Some(dir) = pref.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            if let Ok(bytes) = serde_json::to_vec(parent) {
                let _ = atomic_write(&pref, &bytes);
            }
        }
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .join()
    .map_err(|_| {
        crate::errors::AppError::with(
            crate::errors::id::TASK_FAILED,
            "save dialog thread panicked",
        )
    })?
}

#[cfg(not(windows))]
pub fn save(
    _: tauri::AppHandle,
    _: tauri::WebviewWindow,
    _: String,
    _: String,
) -> Result<Option<String>, crate::errors::AppError> {
    Err(crate::errors::AppError::with(
        crate::errors::id::TRANSCRIPT_WRITE,
        "native transcript export requires Windows",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_complete_file_and_cleans_up_after_failed_replacement() {
        let dir = std::env::temp_dir().join(format!("export-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("captions.txt");
        atomic_write(&path, b"old").unwrap();
        atomic_write(&path, "Français — new".as_bytes()).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "Français — new");
        assert!(atomic_write(&dir, b"cannot replace a directory").is_err());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
