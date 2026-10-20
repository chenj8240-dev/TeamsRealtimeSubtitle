//! Pinned multilingual model downloads. No arbitrary URLs or renderer-supplied paths.
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

const REVISION: &str = "5359861c739e955e79d9a303bcbc70fb988958b1";

/// No overall deadline: Small is 182 MiB, and a slow or proxied network is still a network.
/// A connection that stops delivering is what fails, after this long without a byte.
const STALL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelId {
    Tiny,
    #[default]
    Base,
    Small,
}

impl ModelId {
    pub const ALL: [Self; 3] = [Self::Tiny, Self::Base, Self::Small];

    pub fn file(self) -> &'static str {
        match self {
            Self::Tiny => "ggml-tiny-q5_1.bin",
            Self::Base => "ggml-base-q5_1.bin",
            Self::Small => "ggml-small-q5_1.bin",
        }
    }

    pub fn bytes(self) -> u64 {
        match self {
            Self::Tiny => 32_152_673,
            Self::Base => 59_707_625,
            Self::Small => 190_085_487,
        }
    }

    fn sha256(self) -> &'static str {
        match self {
            Self::Tiny => "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
            Self::Base => "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
            Self::Small => "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
        }
    }

    /// The fixed name a download is written under until it has been verified. Fixed rather than
    /// random so the next download can find and delete what an interrupted one left behind:
    /// quitting mid-download exits the process without running destructors.
    fn partial(self) -> String {
        format!("{}.part", self.file())
    }
}

/// Where a download comes from and what it must turn out to be. Always the pinned Hugging Face
/// file in the app; the tests point it at a local server with a small payload.
struct Transfer {
    url: String,
    bytes: u64,
    sha256: String,
    stall: Duration,
}

impl Transfer {
    fn pinned(id: ModelId) -> Self {
        Self {
            url: format!(
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/{REVISION}/{}",
                id.file()
            ),
            bytes: id.bytes(),
            sha256: id.sha256().to_owned(),
            stall: STALL,
        }
    }
}

#[derive(Clone, Default)]
pub struct ModelManager(Arc<Mutex<ModelState>>);

#[derive(Default)]
struct ModelState {
    download: Option<(ModelId, CancellationToken, u64)>,
    leases: Vec<ModelId>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    id: ModelId,
    bytes: u64,
    installed: bool,
    downloading: bool,
    downloaded_bytes: u64,
    in_use: bool,
}

pub fn directory(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_local_data_dir()?.join("whisper-models");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Delete whatever earlier downloads left in the models folder: our own `.part` files, and the
/// random `.tmp*` names releases up to 1.6.1 used. Only one download runs at a time and only
/// this app writes here, so nothing matching is in use. Best effort: a file that cannot be
/// deleted now is tried again next time.
fn remove_partials(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if (name.ends_with(".part") || name.starts_with(".tmp"))
            && entry.file_type().is_ok_and(|t| t.is_file())
        {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// The download in progress. Removed on every way out except a verified install, including an
/// error, a cancellation or an unwind.
struct Partial {
    path: PathBuf,
    file: Option<File>,
}

impl Partial {
    fn create(path: PathBuf) -> Result<Self> {
        let file = File::create(&path)?;
        Ok(Self {
            path,
            file: Some(file),
        })
    }

    fn write(&mut self, bytes: &[u8]) -> Result<()> {
        self.file
            .as_mut()
            .context("The partial download was already closed")?
            .write_all(bytes)?;
        Ok(())
    }

    /// Flush, close, then rename over the final name: a reader sees either no model or a
    /// complete, verified one.
    fn install(mut self, destination: &Path) -> Result<()> {
        let file = self
            .file
            .take()
            .context("The partial download was already closed")?;
        file.sync_all()?;
        drop(file);
        fs::rename(&self.path, destination).context("Could not install the verified model")
    }
}

impl Drop for Partial {
    fn drop(&mut self) {
        // Close first: Windows only finishes deleting a file once its last handle is gone.
        drop(self.file.take());
        let _ = fs::remove_file(&self.path);
    }
}

impl ModelManager {
    pub fn list(&self, dir: &Path) -> Vec<ModelInfo> {
        let state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        ModelId::ALL
            .into_iter()
            .map(|id| {
                let download = state.download.as_ref().filter(|d| d.0 == id);
                ModelInfo {
                    id,
                    bytes: id.bytes(),
                    installed: fs::metadata(dir.join(id.file()))
                        .is_ok_and(|m| m.len() == id.bytes()),
                    downloading: download.is_some(),
                    downloaded_bytes: download.map_or(0, |d| d.2),
                    in_use: state.leases.contains(&id),
                }
            })
            .collect()
    }

    pub fn cancel_download(&self) {
        if let Some((_, token, _)) = &self.0.lock().unwrap_or_else(|e| e.into_inner()).download {
            token.cancel();
        }
    }

    pub fn remove(&self, dir: &Path, id: ModelId) -> Result<()> {
        let state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        ensure!(
            !state.leases.contains(&id),
            "The model is being used by a session"
        );
        ensure!(state.download.is_none(), "A model download is in progress");
        let path = dir.join(id.file());
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    /// Pins the file against deletion or replacement for the lifetime of the context.
    pub fn lease(&self, dir: &Path, id: ModelId) -> Result<ModelLease> {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        ensure!(
            state.download.as_ref().is_none_or(|d| d.0 != id),
            "The model is still downloading"
        );
        let path = dir.join(id.file());
        ensure!(
            path.is_file(),
            "Download the selected Whisper model before starting"
        );
        state.leases.push(id);
        Ok(ModelLease {
            manager: self.clone(),
            id,
            path,
        })
    }

    pub async fn download(&self, dir: &Path, id: ModelId) -> Result<()> {
        self.download_from(dir, id, &Transfer::pinned(id)).await
    }

    async fn download_from(&self, dir: &Path, id: ModelId, transfer: &Transfer) -> Result<()> {
        let token = CancellationToken::new();
        {
            let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
            ensure!(
                state.download.is_none(),
                "Another model download is in progress"
            );
            ensure!(
                !state.leases.contains(&id),
                "The model is being used by a session"
            );
            state.download = Some((id, token.clone(), 0));
        }
        // RAII clears the operation even on error/unwind; `Partial` does the same for the file.
        let _operation = DownloadGuard(self.clone());
        remove_partials(dir);
        let mut partial = Partial::create(dir.join(id.partial()))?;
        let client = reqwest::Client::builder()
            // Plain HTTP exists only for the local test server.
            .https_only(cfg!(not(test)))
            .connect_timeout(Duration::from_secs(15));
        // A developer's own proxy setting must not intercept the tests' loopback server.
        #[cfg(test)]
        let client = client.no_proxy();
        let client = client.build()?;
        let mut response = tokio::select! {
            _ = token.cancelled() => anyhow::bail!("Model download cancelled"),
            response = tokio::time::timeout(transfer.stall, client.get(&transfer.url).send()) =>
                response.context("The model download stopped responding")??.error_for_status()?,
        };
        if let Some(length) = response.content_length() {
            ensure!(
                length <= transfer.bytes,
                "The model exceeds its expected size"
            );
        }
        let mut hash = Sha256::new();
        let mut total = 0u64;
        loop {
            // Cancellation also interrupts a stalled connection, not only a successful read.
            let chunk = tokio::select! {
                _ = token.cancelled() => anyhow::bail!("Model download cancelled"),
                chunk = tokio::time::timeout(transfer.stall, response.chunk()) =>
                    chunk.context("The model download stopped responding")??,
            };
            let Some(chunk) = chunk else {
                break;
            };
            total += chunk.len() as u64;
            ensure!(
                total <= transfer.bytes,
                "The model exceeds its expected size"
            );
            hash.update(&chunk);
            partial.write(&chunk)?;
            if let Some(download) = &mut self.0.lock().unwrap_or_else(|e| e.into_inner()).download {
                download.2 = total;
            }
        }
        ensure!(!token.is_cancelled(), "Model download cancelled");
        ensure!(
            total == transfer.bytes && hex(&hash.finalize()) == transfer.sha256,
            "Whisper model integrity check failed; remove and download it again"
        );
        partial.install(&dir.join(id.file()))
    }
}

struct DownloadGuard(ModelManager);
impl Drop for DownloadGuard {
    fn drop(&mut self) {
        self.0 .0.lock().unwrap_or_else(|e| e.into_inner()).download = None;
    }
}

pub struct ModelLease {
    manager: ModelManager,
    id: ModelId,
    pub path: PathBuf,
}
impl ModelLease {
    /// Check cached bytes too: a corrupt/replaced local file must never reach native inference.
    pub fn read_verified(&self) -> Result<Vec<u8>> {
        read_verified(&self.path, self.id)
    }
}
impl Drop for ModelLease {
    fn drop(&mut self) {
        let mut state = self.manager.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(i) = state.leases.iter().position(|id| *id == self.id) {
            state.leases.remove(i);
        }
    }
}

/// The whole file at `path`, provided it is exactly the pinned model `id`. The size is checked
/// first, so a wrong file is refused before it is read into memory.
pub(super) fn read_verified(path: &Path, id: ModelId) -> Result<Vec<u8>> {
    let bytes = fs::metadata(path)?.len();
    ensure!(
        bytes == id.bytes(),
        "Model size is wrong; remove and download it again"
    );
    let data = fs::read(path)?;
    verify_digest(id, data.len() as u64, &hex(&Sha256::digest(&data)))?;
    Ok(data)
}

/// Lowercase hex, the form the pinned digests are written in.
fn hex(digest: &[u8]) -> String {
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn verify_digest(id: ModelId, bytes: u64, digest: &str) -> Result<()> {
    ensure!(
        bytes == id.bytes() && digest == id.sha256(),
        "Whisper model integrity check failed; remove and download it again"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::time::Instant;

    #[test]
    fn rejects_wrong_size_and_hash() {
        assert!(
            verify_digest(ModelId::Base, ModelId::Base.bytes(), ModelId::Base.sha256()).is_ok()
        );
        assert!(verify_digest(ModelId::Base, 2, ModelId::Base.sha256()).is_err());
        assert!(verify_digest(ModelId::Base, ModelId::Base.bytes(), "corrupt").is_err());
    }

    #[tokio::test]
    async fn active_model_cannot_be_removed_or_replaced() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(ModelId::Tiny.file()), b"not a model").unwrap();
        let manager = ModelManager::default();
        let lease = manager.lease(dir.path(), ModelId::Tiny).unwrap();
        assert!(lease.read_verified().is_err());
        assert!(manager.remove(dir.path(), ModelId::Tiny).is_err());
        assert!(manager.download(dir.path(), ModelId::Tiny).await.is_err());
        drop(lease);
        manager.remove(dir.path(), ModelId::Tiny).unwrap();
    }

    #[test]
    fn production_downloads_are_pinned_https() {
        let transfer = Transfer::pinned(ModelId::Small);
        assert!(transfer.url.starts_with("https://huggingface.co/"));
        assert!(transfer.url.contains(REVISION));
        assert_eq!(transfer.bytes, ModelId::Small.bytes());
        assert_eq!(transfer.stall, STALL);
    }

    const PAYLOAD: &[u8] = b"a small stand-in for a model";

    /// What the loopback server sends after the request: a status line and headers, then body
    /// pieces, each optionally preceded by a pause. `hang` keeps the socket open, silent, at
    /// the end — a stalled connection rather than a finished one.
    struct Script {
        head: String,
        body: Vec<(Duration, Vec<u8>)>,
        hang: bool,
    }

    fn ok(body: Vec<(Duration, Vec<u8>)>, length: Option<usize>, hang: bool) -> Script {
        let length = length.map_or(String::new(), |n| format!("Content-Length: {n}\r\n"));
        Script {
            head: format!("HTTP/1.1 200 OK\r\n{length}Connection: close\r\n\r\n"),
            body,
            hang,
        }
    }

    /// A one-request HTTP server on a loopback port. A plain thread, so it keeps answering
    /// while the test's runtime is busy with the client.
    fn serve(script: Script) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            while reader.read_line(&mut line).is_ok_and(|n| n > 0) && line != "\r\n" {
                line.clear();
            }
            if stream.write_all(script.head.as_bytes()).is_err() {
                return;
            }
            for (pause, piece) in script.body {
                std::thread::sleep(pause);
                if stream
                    .write_all(&piece)
                    .and_then(|()| stream.flush())
                    .is_err()
                {
                    return;
                }
            }
            if script.hang {
                std::thread::sleep(Duration::from_secs(30));
            }
        });
        format!("http://{address}/model.bin")
    }

    fn transfer(url: String) -> Transfer {
        Transfer {
            url,
            bytes: PAYLOAD.len() as u64,
            sha256: hex(&Sha256::digest(PAYLOAD)),
            stall: Duration::from_millis(500),
        }
    }

    /// Everything left in the models folder, sorted.
    fn files(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[tokio::test]
    async fn a_verified_download_is_installed_under_its_final_name_only() {
        let dir = tempfile::tempdir().unwrap();
        let url = serve(ok(
            vec![
                (Duration::ZERO, PAYLOAD[..10].to_vec()),
                (Duration::from_millis(50), PAYLOAD[10..].to_vec()),
            ],
            Some(PAYLOAD.len()),
            false,
        ));
        let manager = ModelManager::default();
        manager
            .download_from(dir.path(), ModelId::Tiny, &transfer(url))
            .await
            .unwrap();
        assert_eq!(files(dir.path()), [ModelId::Tiny.file()]);
        assert_eq!(
            fs::read(dir.path().join(ModelId::Tiny.file())).unwrap(),
            PAYLOAD
        );
        assert!(manager.list(dir.path()).iter().all(|m| !m.downloading));
    }

    #[tokio::test]
    async fn a_hash_mismatch_installs_nothing_and_leaves_no_partial_file() {
        let dir = tempfile::tempdir().unwrap();
        let mut corrupt = PAYLOAD.to_vec();
        corrupt[0] ^= 1;
        let url = serve(ok(
            vec![(Duration::ZERO, corrupt)],
            Some(PAYLOAD.len()),
            false,
        ));
        let error = ModelManager::default()
            .download_from(dir.path(), ModelId::Tiny, &transfer(url))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("integrity"), "{error:#}");
        assert!(files(dir.path()).is_empty(), "{:?}", files(dir.path()));
    }

    #[tokio::test]
    async fn an_oversized_body_is_refused_with_or_without_a_declared_length() {
        let mut long = PAYLOAD.to_vec();
        long.push(b'!');
        for declared in [Some(long.len()), None] {
            let dir = tempfile::tempdir().unwrap();
            let url = serve(ok(vec![(Duration::ZERO, long.clone())], declared, false));
            let error = ModelManager::default()
                .download_from(dir.path(), ModelId::Tiny, &transfer(url))
                .await
                .unwrap_err();
            assert!(error.to_string().contains("expected size"), "{error:#}");
            assert!(files(dir.path()).is_empty());
        }
    }

    #[tokio::test]
    async fn a_stalled_connection_fails_after_the_stall_timeout_not_a_total_deadline() {
        let dir = tempfile::tempdir().unwrap();
        // Slower in total than the stall timeout, but never silent for that long.
        let pieces = PAYLOAD
            .chunks(4)
            .map(|piece| (Duration::from_millis(150), piece.to_vec()))
            .collect();
        let url = serve(ok(pieces, Some(PAYLOAD.len()), false));
        let manager = ModelManager::default();
        let started = Instant::now();
        manager
            .download_from(dir.path(), ModelId::Tiny, &transfer(url))
            .await
            .unwrap();
        assert!(started.elapsed() > Duration::from_millis(500));

        // Then a server that goes quiet half-way.
        let dir = tempfile::tempdir().unwrap();
        let url = serve(ok(
            vec![(Duration::ZERO, PAYLOAD[..5].to_vec())],
            Some(PAYLOAD.len()),
            true,
        ));
        let error = manager
            .download_from(dir.path(), ModelId::Tiny, &transfer(url))
            .await
            .unwrap_err();
        assert!(
            error.to_string().contains("stopped responding"),
            "{error:#}"
        );
        assert!(files(dir.path()).is_empty());
    }

    #[tokio::test]
    async fn cancelling_a_download_removes_its_partial_file() {
        let dir = tempfile::tempdir().unwrap();
        let url = serve(ok(
            vec![(Duration::ZERO, PAYLOAD[..5].to_vec())],
            Some(PAYLOAD.len()),
            true,
        ));
        let manager = ModelManager::default();
        let mut slow = transfer(url);
        slow.stall = Duration::from_secs(20);
        let download = {
            let manager = manager.clone();
            let dir = dir.path().to_owned();
            tokio::spawn(async move { manager.download_from(&dir, ModelId::Tiny, &slow).await })
        };
        // Wait until the first bytes are on disk, so the cancel lands mid-transfer.
        let deadline = Instant::now() + Duration::from_secs(10);
        while manager
            .list(dir.path())
            .iter()
            .all(|m| m.downloaded_bytes == 0)
        {
            assert!(Instant::now() < deadline, "the download never started");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert_eq!(files(dir.path()), [ModelId::Tiny.partial()]);
        manager.cancel_download();
        let error = download.await.unwrap().unwrap_err();
        assert!(error.to_string().contains("cancelled"), "{error:#}");
        assert!(files(dir.path()).is_empty());
        assert!(manager.list(dir.path()).iter().all(|m| !m.downloading));
    }

    #[tokio::test]
    async fn a_new_download_clears_what_interrupted_ones_left_behind() {
        let dir = tempfile::tempdir().unwrap();
        for stale in [
            ModelId::Small.partial().as_str(),
            ".tmpA1b2C3",
            ModelId::Base.file(),
            "notes.txt",
        ] {
            fs::write(dir.path().join(stale), b"left over").unwrap();
        }
        // The download itself fails; the clean-up happens regardless.
        let url = serve(Script {
            head: "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                .to_owned(),
            body: Vec::new(),
            hang: false,
        });
        assert!(ModelManager::default()
            .download_from(dir.path(), ModelId::Tiny, &transfer(url))
            .await
            .is_err());
        assert_eq!(files(dir.path()), [ModelId::Base.file(), "notes.txt"]);
    }
}
