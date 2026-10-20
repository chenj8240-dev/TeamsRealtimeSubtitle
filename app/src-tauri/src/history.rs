//! Opt-in session history, separate from the disposable recovery spool.
//!
//! A session file is a log: one JSON record per line, a header first and then finalized lines
//! and progress records as they happen (the format is `src/lib/history.ts`'s, and opaque here).
//! `write_history` replaces a whole file; `append_history` adds records to one, so a long
//! session no longer rewrites everything it has already saved every few seconds. Files from
//! before the log format are a single JSON object, and are still read and renamed.
use crate::atomic_file;
use crate::errors::{id, AppError};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    fmt::Display,
    fs::File,
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

static HISTORY_IO: Mutex<()> = Mutex::new(());

/// Every history failure is the same one to the operator; the detail says what, and why.
fn storage_error(detail: impl Display) -> AppError {
    AppError::with(id::HISTORY_STORAGE, detail)
}

/// A file operation that failed, naming the file as Windows writes its path.
fn file_error(path: &Path, error: impl Display) -> AppError {
    storage_error(format!("{} — {error}", path.display()))
}

/// A blocking history task that panicked or was cancelled. A function of its own because the
/// commands' `id` argument, named by the renderer, would otherwise sit beside `id::` paths.
fn task_failed(error: impl Display) -> AppError {
    AppError::with(id::TASK_FAILED, error)
}

fn session_path(dir: &Path, id: &str) -> Result<PathBuf, AppError> {
    // UUIDs only; renderer input must never become an arbitrary filesystem path.
    if id.len() != 36
        || !id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
    {
        return Err(storage_error("invalid session id"));
    }
    Ok(dir.join(format!("{id}.json")))
}

fn directory(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.join("history"))
        .map_err(|e| storage_error(format!("no application data directory: {e}")))
}

#[tauri::command]
pub async fn write_history(app: AppHandle, id: String, contents: String) -> Result<(), AppError> {
    let dir = directory(&app)?;
    let path = session_path(&dir, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = HISTORY_IO.lock().unwrap_or_else(|p| p.into_inner());
        std::fs::create_dir_all(&dir).map_err(|e| file_error(&dir, e))?;
        atomic_file::replace(&path, contents.as_bytes()).map_err(|e| file_error(&path, e))
    })
    .await
    .map_err(task_failed)?
}

/// Add records to an existing session log and flush them. A missing file is an error rather
/// than a new one, so a log never starts without its header: the renderer answers the error
/// by writing the whole session. A record torn by an earlier failed write is closed off with
/// a newline first, so it cannot swallow the next one.
fn append_session(path: &Path, contents: &str) -> std::io::Result<()> {
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .append(true)
        .open(path)?;
    let mut last = [0u8; 1];
    if file.seek(SeekFrom::End(-1)).is_ok() && file.read_exact(&mut last).is_ok() && last != *b"\n"
    {
        file.write_all(b"\n")?;
    }
    file.write_all(contents.as_bytes())?;
    file.sync_data()
}

#[tauri::command]
pub async fn append_history(app: AppHandle, id: String, contents: String) -> Result<(), AppError> {
    let path = session_path(&directory(&app)?, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = HISTORY_IO.lock().unwrap_or_else(|p| p.into_inner());
        append_session(&path, &contents).map_err(|e| file_error(&path, e))
    })
    .await
    .map_err(task_failed)?
}

/// One session file as `list_history` reports it. `contents` is left out when the renderer
/// already holds the file at this length.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedSession {
    pub id: String,
    pub length: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contents: Option<String>,
}

/// The history folder, measured against what the renderer already holds.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryListing {
    /// Every session file, with its contents only where they are new to the renderer.
    pub sessions: Vec<ListedSession>,
    /// Sessions the renderer holds that are no longer listed.
    pub removed: Vec<String>,
}

/// A session file as text, with its length on disk. Logs are written as UTF-8, so the common
/// case keeps the buffer it was read into and only a damaged file pays for the lossy copy.
/// The length is the file's rather than the text's, because a lossy copy is longer and the
/// renderer hands this length back to be compared with the file's.
fn read_text(path: &Path) -> std::io::Result<(String, u64)> {
    let bytes = std::fs::read(path)?;
    let length = bytes.len() as u64;
    let text = String::from_utf8(bytes)
        .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());
    Ok((text, length))
}

/// List the session files, reading only those the renderer does not already hold.
///
/// A log only ever grows at its end, so a file whose length is the one the renderer holds
/// has not changed since it was read, and an open History tab no longer re-reads the whole
/// folder each time a recording session saves. One file that cannot be read now — locked by
/// a backup or a virus scan, say — is skipped with a warning instead of hiding every session:
/// a new one is listed once it can be read, and one the renderer holds is reported at its
/// old length, so the renderer keeps its copy and the next listing tries again.
///
/// `read` is `read_text`, and a parameter only so a test can make one file fail.
fn list_sessions(
    dir: &Path,
    known: &HashMap<String, u64>,
    read: impl Fn(&Path) -> std::io::Result<(String, u64)>,
) -> std::io::Result<HistoryListing> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(HistoryListing {
                sessions: vec![],
                removed: known.keys().cloned().collect(),
            })
        }
        Err(e) => return Err(e),
    };
    let mut sessions = vec![];
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                tracing::warn!("skipping a history entry that cannot be listed: {error}");
                continue;
            }
        };
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "json") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if session_path(dir, id).is_err() {
            continue;
        }
        let held = known.get(id).copied();
        // Asked of the file, not taken from the directory listing: on Windows the listing's
        // copy of a size can lag while another handle (a virus scan, say) still has the file
        // open, and a stale length would pass for an unchanged session. Not followed through
        // a link, like the file type it replaces.
        let read = match std::fs::symlink_metadata(&path) {
            Ok(metadata) if !metadata.is_file() => continue,
            Ok(metadata) if held == Some(metadata.len()) => Ok((metadata.len(), None)),
            Ok(_) => read(&path).map(|(contents, length)| (length, Some(contents))),
            Err(error) => Err(error),
        };
        let (length, contents) = match read {
            Ok(read) => read,
            Err(error) => {
                tracing::warn!("skipping history session {id} for now: {error}");
                // The renderer keeps the copy it holds, and the next listing tries again.
                let Some(length) = held else { continue };
                (length, None)
            }
        };
        sessions.push(ListedSession {
            id: id.to_owned(),
            length,
            contents,
        });
    }
    let listed: HashSet<&str> = sessions.iter().map(|s| s.id.as_str()).collect();
    let removed = known
        .keys()
        .filter(|id| !listed.contains(id.as_str()))
        .cloned()
        .collect();
    Ok(HistoryListing { sessions, removed })
}

/// The log format's version, as its header records it.
const LOG_VERSION: u64 = 2;

/// Whether a session file is a log, judged by its header record.
fn is_log(raw: &[u8]) -> bool {
    let header = raw.split(|&b| b == b'\n').next().unwrap_or_default();
    serde_json::from_slice::<serde_json::Value>(header)
        .is_ok_and(|record| record["version"] == LOG_VERSION)
}

/// A file's first line, newline included. Reading stops there, give or take the reader's
/// buffer.
fn read_header(reader: &mut impl BufRead) -> std::io::Result<Vec<u8>> {
    let mut header = Vec::new();
    reader.read_until(b'\n', &mut header)?;
    Ok(header)
}

/// Give a session a new title. Everything that can go wrong here is about the one file, so
/// a malformed record is reported as an I/O error on it, like a locked or missing one.
fn rename_session(path: &Path, title: &str) -> std::io::Result<()> {
    // Only the header says whether this is a log, and a long session's log runs to megabytes.
    let mut reader = BufReader::new(File::open(path)?);
    let mut raw = read_header(&mut reader)?;
    let title = title.trim().chars().take(120).collect::<String>();
    // A log takes the rename as one more record; the latest title record wins when it is read.
    if is_log(&raw) {
        drop(reader);
        let mut record = serde_json::to_string(&serde_json::json!({ "title": title }))?;
        record.push('\n');
        return append_session(path, &record);
    }
    // A file from before the log format is one JSON object, rewritten whole with its new
    // title, so the rest of it is needed after all.
    reader.read_to_end(&mut raw)?;
    drop(reader);
    let mut session: serde_json::Value = serde_json::from_slice(&raw)?;
    let record = session.as_object_mut().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "not a session record")
    })?;
    record.insert("title".into(), title.into());
    atomic_file::replace(path, &serde_json::to_vec(&session)?)
}

#[tauri::command]
pub async fn rename_history(app: AppHandle, id: String, title: String) -> Result<(), AppError> {
    let path = session_path(&directory(&app)?, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = HISTORY_IO.lock().unwrap_or_else(|p| p.into_inner());
        rename_session(&path, &title).map_err(|e| file_error(&path, e))
    })
    .await
    .map_err(task_failed)?
}

/// List the history folder. `known` is what the renderer already holds, as `[id, length]`
/// pairs; those sessions come back without their contents unless their file has changed.
#[tauri::command]
pub async fn list_history(
    app: AppHandle,
    known: Vec<(String, u64)>,
) -> Result<HistoryListing, AppError> {
    let dir = directory(&app)?;
    let known: HashMap<String, u64> = known.into_iter().collect();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = HISTORY_IO.lock().unwrap_or_else(|p| p.into_inner());
        list_sessions(&dir, &known, read_text).map_err(|e| file_error(&dir, e))
    })
    .await
    .map_err(task_failed)?
}

#[tauri::command]
pub async fn delete_history(app: AppHandle, id: String) -> Result<(), AppError> {
    let path = session_path(&directory(&app)?, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = HISTORY_IO.lock().unwrap_or_else(|p| p.into_inner());
        atomic_file::remove(&path).map_err(|e| file_error(&path, e))
    })
    .await
    .map_err(task_failed)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rename_preserves_latest_disk_contents_and_does_not_recreate_missing_sessions() {
        let dir = std::env::temp_dir().join(format!(
            "history-rename-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("session.json");
        let raw = br#"{"lines":[{"text":"newest caption"}],"futureField":42}"#;
        std::fs::write(&path, raw).unwrap();
        rename_session(&path, " Meeting ").unwrap();
        let record: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(record["title"], "Meeting");
        assert_eq!(record["lines"][0]["text"], "newest caption");
        assert_eq!(record["futureField"], 42);
        std::fs::remove_file(&path).unwrap();
        assert!(rename_session(&path, "gone").is_err());
        std::fs::remove_dir(dir).unwrap();
    }
    fn temp_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn appends_extend_a_log_and_never_create_one() {
        let path = temp_file("history-append");
        assert!(append_session(&path, "{\"line\":1}\n").is_err());
        assert!(!path.exists());
        std::fs::write(&path, "{\"version\":2}\n").unwrap();
        append_session(&path, "{\"line\":1}\n").unwrap();
        append_session(&path, "{\"line\":2}\n").unwrap();
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{\"version\":2}\n{\"line\":1}\n{\"line\":2}\n"
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn a_torn_record_cannot_swallow_the_next_append() {
        let path = temp_file("history-torn");
        std::fs::write(&path, "{\"version\":2}\n{\"line\":").unwrap();
        append_session(&path, "{\"line\":2}\n").unwrap();
        let contents = std::fs::read_to_string(&path).unwrap();
        assert_eq!(contents.lines().last(), Some("{\"line\":2}"));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn renaming_a_log_appends_a_title_record() {
        let path = temp_file("history-rename-log");
        std::fs::write(&path, "{\"version\":2,\"id\":\"x\"}\n{\"line\":{}}\n").unwrap();
        rename_session(&path, "  Keynote ").unwrap();
        let contents = std::fs::read_to_string(&path).unwrap();
        assert_eq!(contents.lines().count(), 3);
        assert_eq!(contents.lines().last(), Some("{\"title\":\"Keynote\"}"));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn history_survives_reopening_and_deletion_is_per_session() {
        let dir = std::env::temp_dir().join(format!(
            "live-history-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(list(&dir, &[]).sessions.is_empty());
        std::fs::create_dir(&dir).unwrap();
        let first = session_path(&dir, FIRST).unwrap();
        let second = session_path(&dir, SECOND).unwrap();
        atomic_file::replace(&first, b"complete session").unwrap();
        atomic_file::replace(&second, b"second session").unwrap();
        // Incomplete writes and unrelated files are never offered as saved sessions.
        std::fs::write(atomic_file::staging_path(&first), "partial").unwrap();
        std::fs::write(dir.join("unrelated.json"), "unrelated").unwrap();
        assert_eq!(list(&dir, &[]).sessions.len(), 2);
        // A corrupt record remains individually deletable without hiding the good one.
        std::fs::write(&second, [0xff, 0x00]).unwrap();
        let reopened = list(&dir, &[]).sessions;
        assert_eq!(reopened.len(), 2);
        assert!(reopened
            .iter()
            .any(|s| s.contents.as_deref() == Some("complete session")));
        atomic_file::remove(&first).unwrap();
        atomic_file::remove(&first).unwrap();
        assert_eq!(list(&dir, &[]).sessions.len(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }

    const FIRST: &str = "12345678-1234-1234-1234-123456789abc";
    const SECOND: &str = "12345678-1234-1234-1234-123456789abd";

    fn list(dir: &Path, known: &[(&str, u64)]) -> HistoryListing {
        let known = known.iter().map(|&(id, n)| (id.to_owned(), n)).collect();
        list_sessions(dir, &known, read_text).unwrap()
    }

    fn listed<'a>(listing: &'a HistoryListing, id: &str) -> &'a ListedSession {
        listing.sessions.iter().find(|s| s.id == id).unwrap()
    }

    // Each history write sent the open History tab back to read every session in full. Logs
    // only grow, so a length the renderer already holds means the file has not changed.
    #[test]
    fn listing_sends_only_sessions_that_are_new_or_have_grown() {
        let dir = tempfile::tempdir().unwrap();
        let first = session_path(dir.path(), FIRST).unwrap();
        let second = session_path(dir.path(), SECOND).unwrap();
        std::fs::write(&first, "{\"version\":2}\n").unwrap();
        std::fs::write(&second, "{\"version\":2}\n{\"line\":1}\n").unwrap();

        let fresh = list(dir.path(), &[]);
        assert_eq!(fresh.sessions.len(), 2);
        assert_eq!(listed(&fresh, FIRST).length, 14);
        assert_eq!(
            listed(&fresh, SECOND).contents.as_deref(),
            Some("{\"version\":2}\n{\"line\":1}\n")
        );
        assert!(fresh.removed.is_empty());

        let held = [(FIRST, 14), (SECOND, 25)];
        let unchanged = list(dir.path(), &held);
        assert_eq!(unchanged.sessions.len(), 2);
        assert!(unchanged.sessions.iter().all(|s| s.contents.is_none()));
        assert_eq!(listed(&unchanged, SECOND).length, 25);

        append_session(&first, "{\"line\":1}\n").unwrap();
        let grown = list(dir.path(), &held);
        assert_eq!(listed(&grown, FIRST).length, 25);
        assert!(listed(&grown, FIRST).contents.is_some());
        assert!(listed(&grown, SECOND).contents.is_none());

        // A deleted session, and one remembered from a folder that has since gone, are both
        // named as removed rather than silently left out.
        atomic_file::remove(&second).unwrap();
        let gone = list(dir.path(), &[(FIRST, 25), (SECOND, 25)]);
        assert_eq!(gone.sessions.len(), 1);
        assert_eq!(gone.removed, vec![SECOND.to_owned()]);
        let missing = list(&dir.path().join("absent"), &[(FIRST, 25)]);
        assert!(missing.sessions.is_empty());
        assert_eq!(missing.removed, vec![FIRST.to_owned()]);
    }

    // One unreadable file used to fail the whole listing, so the tab showed no history at all.
    #[test]
    fn a_session_that_cannot_be_read_is_skipped_without_hiding_the_others() {
        let dir = tempfile::tempdir().unwrap();
        let first = session_path(dir.path(), FIRST).unwrap();
        let second = session_path(dir.path(), SECOND).unwrap();
        std::fs::write(&first, "{\"version\":2}\n").unwrap();
        std::fs::write(&second, "{\"version\":2}\n{\"line\":1}\n").unwrap();
        let locked = |path: &Path| {
            if path == second {
                Err(std::io::Error::other("locked by another process"))
            } else {
                read_text(path)
            }
        };

        // New to the renderer: left out until it can be read.
        let fresh = list_sessions(dir.path(), &HashMap::new(), locked).unwrap();
        assert_eq!(fresh.sessions.len(), 1);
        assert_eq!(fresh.sessions[0].id, FIRST);
        assert!(fresh.removed.is_empty());

        // Held at an older length: reported as held, so the renderer keeps its copy and asks
        // again next time instead of dropping the session from the list.
        let known = HashMap::from([(SECOND.to_owned(), 14)]);
        let held = list_sessions(dir.path(), &known, locked).unwrap();
        assert_eq!(held.sessions.len(), 2);
        assert_eq!(listed(&held, SECOND).length, 14);
        assert!(listed(&held, SECOND).contents.is_none());
        assert!(held.removed.is_empty());
    }

    // The same against a real lock: Windows refuses to open a file that another handle holds
    // without sharing, which is what a backup or a virus scan can do.
    #[cfg(windows)]
    #[test]
    fn a_file_locked_by_another_handle_does_not_fail_the_listing() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let first = session_path(dir.path(), FIRST).unwrap();
        let second = session_path(dir.path(), SECOND).unwrap();
        std::fs::write(&first, "{\"version\":2}\n").unwrap();
        std::fs::write(&second, "{\"version\":2}\n").unwrap();
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&second)
            .unwrap();
        let listing = list(dir.path(), &[]);
        assert_eq!(listing.sessions.len(), 1);
        assert_eq!(listing.sessions[0].id, FIRST);
        drop(lock);
        assert_eq!(list(dir.path(), &[]).sessions.len(), 2);
    }

    // The length handed back is the file's, so a damaged file read lossily, whose text is
    // longer than its bytes, still counts as unchanged on the next listing.
    #[test]
    fn a_lossily_read_session_reports_its_length_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = session_path(dir.path(), FIRST).unwrap();
        std::fs::write(&path, [b'{', 0xff, b'}']).unwrap();
        let fresh = list(dir.path(), &[]);
        assert_eq!(fresh.sessions[0].length, 3);
        assert_eq!(fresh.sessions[0].contents.as_deref(), Some("{\u{fffd}}"));
        let again = list(dir.path(), &[(FIRST, 3)]);
        assert!(again.sessions[0].contents.is_none());
    }

    #[test]
    fn renaming_reads_only_the_header_line() {
        let mut log = std::io::Cursor::new(b"{\"version\":2}\n{\"line\":1}\n".to_vec());
        assert_eq!(read_header(&mut log).unwrap(), b"{\"version\":2}\n");
        assert_eq!(log.position(), 14);
        // A file from before the log format has no newline, so its header is all of it.
        let mut whole = std::io::Cursor::new(b"{\"lines\":[]}".to_vec());
        assert_eq!(read_header(&mut whole).unwrap(), b"{\"lines\":[]}");
    }

    // The header decides; what follows it in a log is never parsed by a rename.
    #[test]
    fn renaming_a_log_ignores_whatever_follows_its_header() {
        let path = temp_file("history-rename-damaged");
        let mut contents = b"{\"version\":2}\n".to_vec();
        contents.extend_from_slice(&[0xff; 64]);
        std::fs::write(&path, &contents).unwrap();
        rename_session(&path, "Board").unwrap();
        let after = std::fs::read(&path).unwrap();
        assert!(after.ends_with(b"\n{\"title\":\"Board\"}\n"));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn session_ids_cannot_escape_the_history_directory() {
        let dir = Path::new("history");
        for id in [
            "../transcript",
            "C:\\secrets",
            "",
            "../../../../../../../../../../../abc",
            "00000000-0000-0000-0000-00000000000/",
        ] {
            assert!(session_path(dir, id).is_err());
        }
        assert_eq!(
            session_path(dir, "../transcript").unwrap_err(),
            storage_error("invalid session id")
        );
        assert_eq!(
            session_path(dir, "12345678-1234-1234-1234-123456789abc").unwrap(),
            dir.join("12345678-1234-1234-1234-123456789abc.json")
        );
    }
}
