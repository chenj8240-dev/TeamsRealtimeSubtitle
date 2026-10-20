//! Replacing a file whole, for every file the core writes for the operator: an exported
//! transcript, the crash-recovery spool, a history session.
//!
//! A reader finds either the old contents or all of the new ones — never a mix, and never the
//! empty file a power cut between truncating and writing would leave. The new bytes go to a
//! staging file in the same folder (and so on the same volume), are flushed to disk, and only
//! then renamed over the target, which Rust does as a replacement on Windows as well as Unix.
//! The target is untouched until that rename, and a failure removes the staging file again.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Where `replace` stages a file's next contents: beside it, named after it, so the read or
/// delete that comes later can find one a crash left behind. `transcript.json` is staged as
/// `transcript.json.pending`, which is also the name every earlier release used.
pub(crate) fn staging_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".pending");
    path.with_file_name(name)
}

/// Replace a file in a folder the app owns.
///
/// The staging file is `staging_path`, so `remove` and `discard_staging` can clear what an
/// interrupted replacement left. Every caller holds its own lock across the call, so a staging
/// file already there can only be such a leftover, and it is cleared first.
pub(crate) fn replace(path: &Path, contents: &[u8]) -> io::Result<()> {
    discard_staging(path)?;
    replace_via(path, &staging_path(path), contents)
}

/// Replace `path` by way of `staging`, which must be in the same folder and must not exist.
///
/// A staging name that is already taken is refused rather than truncated. That matters in a
/// folder the operator chose, where the app owns nothing but the file it was asked to write.
pub(crate) fn replace_via(path: &Path, staging: &Path, contents: &[u8]) -> io::Result<()> {
    replace_with(path, staging, |file| file.write_all(contents))
}

/// `replace_via` with the write as a parameter, so a test can make it fail half-way.
fn replace_with(
    path: &Path,
    staging: &Path,
    write: impl FnOnce(&mut File) -> io::Result<()>,
) -> io::Result<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(staging)?;
    let result = (|| {
        write(&mut file)?;
        // On disk before the rename, or a power cut could commit the new name ahead of the
        // data it is meant to point at.
        file.sync_all()?;
        drop(file);
        fs::rename(staging, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(staging);
    }
    result
}

/// Delete a file written by `replace`, along with any staging file a crash left beside it. A
/// file that is already gone is success.
pub(crate) fn remove(path: &Path) -> io::Result<()> {
    discard_staging(path)?;
    remove_if_present(path)
}

/// Delete an interrupted replacement, so it can never stand in for the last complete one.
pub(crate) fn discard_staging(path: &Path) -> io::Result<()> {
    remove_if_present(&staging_path(path))
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failed_replacement_preserves_the_previous_contents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("transcript.json");
        replace(&path, b"previous complete snapshot").unwrap();
        let result = replace_with(&path, &staging_path(&path), |f| {
            f.write_all(b"partial")?;
            Err(io::Error::other("simulated disk failure"))
        });
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "previous complete snapshot"
        );
        assert!(!staging_path(&path).exists());
    }

    #[test]
    fn replacement_works_for_an_existing_file_on_windows_too() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("transcript.json");
        for text in ["first", "Français — second complete snapshot"] {
            replace(&path, text.as_bytes()).unwrap();
            assert_eq!(fs::read_to_string(&path).unwrap(), text);
            assert!(!staging_path(&path).exists());
        }
    }

    #[test]
    fn a_failed_rename_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("a folder");
        fs::create_dir(&target).unwrap();
        assert!(replace(&target, b"cannot replace a directory").is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    // `replace` is only ever interrupted by a crash, and the next write must not be refused
    // because of what that crash left.
    #[test]
    fn a_staging_file_left_by_a_crash_does_not_block_the_next_replacement() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.json");
        fs::write(staging_path(&path), "interrupted replacement").unwrap();
        replace(&path, b"complete").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "complete");
        assert!(!staging_path(&path).exists());
    }

    // In a folder the operator chose, a file that happens to have the staging name is theirs.
    #[test]
    fn replace_via_never_truncates_a_staging_name_that_is_taken() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("captions.txt");
        let staging = dir.path().join("taken.tmp");
        fs::write(&staging, "someone else's file").unwrap();
        let error = replace_via(&path, &staging, b"captions").unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read_to_string(&staging).unwrap(), "someone else's file");
        assert!(!path.exists());
    }

    #[test]
    fn remove_clears_staging_left_by_a_crash_and_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("transcript.json");
        fs::write(&path, "committed").unwrap();
        fs::write(staging_path(&path), "interrupted replacement").unwrap();
        remove(&path).unwrap();
        remove(&path).unwrap();
        assert!(!path.exists());
        assert!(!staging_path(&path).exists());
    }

    #[test]
    fn the_staging_name_is_the_one_earlier_releases_used() {
        assert_eq!(
            staging_path(Path::new("recovery").join("transcript.json").as_path()),
            Path::new("recovery").join("transcript.json.pending")
        );
    }
}
