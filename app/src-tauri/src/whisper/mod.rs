//! Multilingual, CPU-only local transcription, or translation into English with Whisper's
//! translate task. Capture, disk ingestion and inference run independently; normal Stop closes
//! input then drains every accepted frame.
pub mod cpu;
mod language;
pub mod models;
mod reconcile;
mod segment;
pub mod spool;

use std::sync::{atomic::Ordering, Arc, Mutex};
use std::time::Duration;

use anyhow::{ensure, Context, Result};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc::Receiver;
use tokio_util::sync::CancellationToken;
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperSegment,
};

use crate::errors::{id, AppError};
use crate::realtime::Events;
use crate::types::{events, Caption, Origin, SessionState, StatusUpdate};
use language::Languages;
use models::{ModelId, ModelLease, ModelManager};
use reconcile::{RawSegment, Reconciler};
use segment::{Segmenter, Window};
use spool::{Next, Spool, TimedChunk};

/// Input quiet for this long releases whatever audio is held, so the last words before Pause,
/// or before a call goes silent, are captioned now rather than when audio resumes.
const IDLE: Duration = Duration::from_secs(1);

/// A backlog beyond this switches to long windows; see `segment::LONG_WINDOW`.
const LONG_WINDOW_BACKLOG_MS: u64 = 30_000;

pub struct LoadedModel {
    context: WhisperContext,
    /// One inference at a time across sources. With Both sources, two concurrent passes would
    /// each start a full set of ggml workers, which spin while they wait and leave capture and
    /// the interface fighting for what is left; taking turns finishes both sooner.
    inference: Mutex<()>,
    _lease: ModelLease,
}

pub fn load(app: &AppHandle, id: ModelId) -> Result<Arc<LoadedModel>> {
    let lease = app
        .state::<ModelManager>()
        .lease(&models::directory(app)?, id)?;
    load_lease(lease)
}

fn load_lease(lease: ModelLease) -> Result<Arc<LoadedModel>> {
    // First native call of a session: refuse here, not with an illegal instruction inside it.
    cpu::ensure_supported()?;
    // Read through Rust's Unicode-aware filesystem API (Windows usernames may contain
    // non-ASCII characters), then pass the exact verified bytes to the native loader.
    let bytes = lease.read_verified()?;
    let mut params = WhisperContextParameters::default();
    params.use_gpu(false);
    let context = WhisperContext::new_from_buffer_with_params(&bytes, params)
        .context("Could not load Whisper model")?;
    Ok(Arc::new(LoadedModel {
        context,
        inference: Mutex::new(()),
        _lease: lease,
    }))
}

/// ggml's workers busy-wait between operations, so a thread per hardware thread starves
/// capture and the interface, and beyond about eight these small models stop getting faster.
/// x64 processors are assumed to have SMT: half the logical processors is one thread per core,
/// and the sibling hardware threads absorb capture and the interface. Windows-on-ARM has no
/// SMT, so one core is left free instead.
fn inference_threads(logical: usize) -> i32 {
    let threads = if cfg!(target_arch = "x86_64") {
        logical / 2
    } else {
        logical.saturating_sub(1)
    };
    i32::try_from(threads).unwrap_or(i32::MAX).clamp(1, 8)
}

pub fn validate_language(language: Option<&str>) -> Result<()> {
    let Some(language) = language else {
        return Ok(());
    };
    // These quantized multilingual tiny/base/small models have the original 99 languages.
    // Cantonese's separate token belongs to large-v3 and is deliberately not advertised.
    ensure!(!language.contains('\0'), "Invalid spoken language");
    ensure!(
        whisper_rs::get_lang_id(language).is_some_and(|id| id < 99),
        "Unsupported Whisper spoken language"
    );
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    origin: Origin,
    pending_ms: u64,
    finalizing: bool,
}

fn progress(app: &AppHandle, origin: Origin, spool: &Spool) {
    let _ = app.emit(
        events::WHISPER_PROGRESS,
        Progress {
            origin,
            pending_ms: spool.pending_ms(),
            finalizing: spool.finalizing.load(Ordering::Relaxed),
        },
    );
}

pub struct LocalSession {
    pub app: AppHandle,
    pub model: Arc<LoadedModel>,
    pub language: Option<String>,
    /// Write English, whatever is spoken, rather than what was said in its own language.
    pub translate: bool,
    pub origin: Origin,
    pub input: Receiver<TimedChunk>,
    pub spool: Arc<Spool>,
    pub capture_cancel: CancellationToken,
    pub abort: CancellationToken,
    pub failure: Arc<Mutex<Option<AppError>>>,
}

pub async fn run(config: LocalSession) {
    let LocalSession {
        app,
        model,
        language,
        translate,
        origin,
        mut input,
        spool,
        capture_cancel,
        abort,
        failure,
    } = config;
    app.status(StatusUpdate::source(origin, SessionState::Running, None));
    let ingest_spool = spool.clone();
    let ingest_app = app.clone();
    let ingest_cancel = capture_cancel.clone();
    let ingestion = tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        let _cancel = ingest_cancel.clone().drop_guard();
        // Always signal EOF, including on an I/O failure or a panic.
        struct Finish(Arc<Spool>);
        impl Drop for Finish {
            fn drop(&mut self) {
                self.0.finish();
            }
        }
        let _finish = Finish(ingest_spool.clone());
        let result = (|| {
            let mut count = 0usize;
            while let Some(frame) = input.blocking_recv() {
                ingest_spool.push(&frame)?;
                count += 1;
                if count.is_multiple_of(10) {
                    progress(&ingest_app, origin, &ingest_spool);
                }
            }
            ensure!(
                !ingest_spool.overflowed.load(Ordering::Relaxed),
                "Audio capture outran the local disk buffer; the transcript may be incomplete"
            );
            if let Some(error) = ingest_spool
                .capture_error
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .as_ref()
            {
                anyhow::bail!("{error}");
            }
            Ok(())
        })();
        if result.is_err() {
            ingest_cancel.cancel();
        }
        ingest_spool.finish();
        progress(&ingest_app, origin, &ingest_spool);
        result
    });
    let worker_spool = spool.clone();
    let worker_app = app.clone();
    let worker_abort = abort.clone();
    let worker_cancel = capture_cancel.clone();
    let inference = tauri::async_runtime::spawn_blocking(move || {
        // Unwinding must also stop capture, otherwise the other joined task waits forever.
        let _cancel = worker_cancel.drop_guard();
        transcribe(
            &model,
            language.as_deref(),
            translate,
            &worker_spool,
            &worker_abort,
            |text, start, end, turn| {
                let _ = worker_app.emit(
                    events::CAPTION,
                    Caption {
                        turn_id: turn,
                        text,
                        // Translating as well: the translate task returns English and no
                        // transcription of what was said, so there is no original to show.
                        source_text: "",
                        final_: true,
                        origin,
                        lane: 0,
                        start_ms: start,
                        end_ms: end,
                    },
                );
            },
            || progress(&worker_app, origin, &worker_spool),
        )
    });
    let (ingested, inferred) = tokio::join!(ingestion, inference);
    let result = ingested
        .context("Local audio writer stopped unexpectedly")
        .and_then(|r| r)
        .and_then(|_| {
            inferred
                .context("Whisper worker stopped unexpectedly")
                .and_then(|r| r)
        });
    capture_cancel.cancel();
    progress(&app, origin, &spool);
    let result = result.and_then(|_| {
        ensure!(
            !abort.is_cancelled(),
            "Remaining audio was discarded; the transcript is incomplete"
        );
        Ok(())
    });
    if let Err(error) = result {
        *failure.lock().unwrap_or_else(|e| e.into_inner()) =
            Some(AppError::with(id::WHISPER_SESSION, format!("{error:#}")));
        app.status(StatusUpdate::source(
            origin,
            SessionState::Error,
            Some(AppError::with(id::WHISPER_SESSION, format!("{error:#}"))),
        ));
    } else {
        app.status(StatusUpdate::source(origin, SessionState::Idle, None));
    }
}

fn transcribe(
    model: &LoadedModel,
    language: Option<&str>,
    translate: bool,
    spool: &Spool,
    abort: &CancellationToken,
    mut emit: impl FnMut(&str, u64, u64, u64),
    mut report: impl FnMut(),
) -> Result<()> {
    let mut state = model.context.create_state()?;
    let mut reconciler = Reconciler::default();
    let mut languages = Languages::new(language);
    let threads = inference_threads(std::thread::available_parallelism().map_or(2, usize::from));
    let process = |window: Window| -> Result<()> {
        if abort.is_cancelled() {
            return Ok(());
        }
        if window.speech {
            let duration_ms = window.samples.len() as u64 / 16;
            let spoken = languages.for_window(duration_ms);
            let mut params = decode_params(spoken, translate, threads);
            // whisper-rs 0.16's closure helper has an incorrect user-data cast and leaks its
            // allocation. Use the C callback with a borrowed, thread-safe token instead.
            // SAFETY: full() is synchronous; abort outlives the entire call, and the callback
            // only reads CancellationToken. No pointer escapes this invocation.
            unsafe {
                params.set_abort_callback(Some(abort_requested));
                params.set_abort_callback_user_data(std::ptr::from_ref(abort).cast_mut().cast());
            }
            // Whisper needs enough samples for its analysis window, including a final
            // phrase shorter than a second. Padding affects inference only, not timestamps.
            let mut samples = window.samples;
            samples.resize(samples.len().max(16_000), 0.0);
            let inferred = {
                let _turn = model.inference.lock().unwrap_or_else(|e| e.into_inner());
                state.full(params, &samples)
            };
            if let Err(error) = inferred {
                if abort.is_cancelled() {
                    return Ok(());
                }
                return Err(error.into());
            }
            let mut captioned = false;
            for segment in state.as_iter() {
                // A segment whisper.cpp cannot describe is skipped, never fatal to the source.
                let Some(segment) = raw_segment(&segment) else {
                    continue;
                };
                if let Some(line) = reconciler.accept(window.start_ms, duration_ms, &segment) {
                    emit(&line.text, line.start_ms, line.end_ms, line.turn);
                    captioned = true;
                }
            }
            let detected = whisper_rs::get_lang_str(state.full_lang_id_from_state())
                .filter(|&code| validate_language(Some(code)).is_ok());
            languages.observe(duration_ms, spoken, captioned, detected);
        }
        spool.complete(window.consumed);
        report();
        Ok(())
    };
    pump(spool, abort, IDLE, process)
}

/// How one window is decoded. `spoken` is the language it was spoken in, or `None` to detect
/// it; `translate` turns the task from transcription into translation into English. Translating
/// still starts from the spoken language — it is what Whisper translates from — so detection
/// and the operator's choice mean the same either way, and `Languages` keeps learning from what
/// whisper.cpp detected.
fn decode_params(spoken: Option<&str>, translate: bool, threads: i32) -> FullParams<'_, '_> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(spoken);
    // `detect_language=true` asks whisper.cpp to return after detection. Leaving it false with
    // language=None performs detection followed by the task.
    params.set_translate(translate);
    params.set_no_context(true);
    params.set_n_threads(threads);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_print_special(false);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    params
}

/// Feed spooled audio through the segmenter to `process` until input ends or is discarded.
fn pump(
    spool: &Spool,
    abort: &CancellationToken,
    idle: Duration,
    mut process: impl FnMut(Window) -> Result<()>,
) -> Result<()> {
    let mut segmenter = Segmenter::default();
    while !abort.is_cancelled() {
        segmenter.set_long_windows(spool.pending_ms() > LONG_WINDOW_BACKLOG_MS);
        match spool.next_timeout(idle)? {
            Next::Chunk(frame) => {
                for window in segmenter.push(&frame) {
                    process(window)?;
                }
            }
            Next::Idle => {
                if let Some(window) = segmenter.finish() {
                    process(window)?;
                }
            }
            Next::End => break,
        }
    }
    if !abort.is_cancelled() {
        if let Some(window) = segmenter.finish() {
            process(window)?;
        }
    }
    Ok(())
}

fn raw_segment(segment: &WhisperSegment<'_>) -> Option<RawSegment> {
    // Lossy: a token boundary inside a multi-byte character must cost one character, not the
    // rest of the meeting's transcript.
    let text = segment.to_str_lossy().ok()?.into_owned();
    let tokens = segment.n_tokens();
    let mean_logprob = if tokens > 0 {
        (0..tokens)
            .filter_map(|i| segment.get_token(i))
            .map(|token| token.token_data().plog)
            .sum::<f32>()
            / tokens as f32
    } else {
        0.0
    };
    Some(RawSegment {
        text,
        start_cs: segment.start_timestamp(),
        end_cs: segment.end_timestamp(),
        no_speech: segment.no_speech_probability(),
        mean_logprob,
    })
}

unsafe extern "C" fn abort_requested(data: *mut std::ffi::c_void) -> bool {
    // SAFETY: installed only above, with a live CancellationToken for the full() duration.
    unsafe { &*data.cast::<CancellationToken>() }.is_cancelled()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn speech(start_ms: u64) -> TimedChunk {
        TimedChunk {
            start_ms,
            pcm: 100i16.to_le_bytes().repeat(1600),
        }
    }

    #[test]
    fn inference_threads_leave_room_for_capture_and_stop_at_eight() {
        if cfg!(target_arch = "x86_64") {
            assert_eq!(
                [1, 2, 4, 8, 12, 16, 32].map(inference_threads),
                [1, 1, 2, 4, 6, 8, 8]
            );
        } else {
            assert_eq!(
                [1, 2, 4, 8, 12, 16].map(inference_threads),
                [1, 1, 3, 7, 8, 8]
            );
        }
    }

    #[test]
    fn the_task_reaches_whisper_with_the_spoken_language_still_set() {
        // whisper-rs exposes no getters; its Debug output shows the native parameters.
        for translate in [false, true] {
            let params = format!("{:?}", decode_params(Some("fr"), translate, 4));
            assert!(
                params.contains(&format!("translate: {translate},")),
                "{params}"
            );
            assert!(params.contains("n_threads: 4,"), "{params}");
            assert!(params.contains("detect_language: false,"), "{params}");
        }
    }

    #[test]
    fn quiet_input_releases_held_speech_without_waiting_for_more_audio() {
        let spool = Arc::new(Spool::new().unwrap());
        for i in 0..20 {
            spool.push(&speech(i * 100)).unwrap();
        }
        let (sent, windows) = std::sync::mpsc::channel();
        let reader = spool.clone();
        let worker = std::thread::spawn(move || {
            pump(
                &reader,
                &CancellationToken::new(),
                Duration::from_millis(100),
                |window| {
                    reader.complete(window.consumed);
                    sent.send((window.start_ms, window.consumed, window.speech))
                        .unwrap();
                    Ok(())
                },
            )
        });
        // Input is still open, as during Pause: only going idle can release these two seconds.
        let window = windows.recv_timeout(Duration::from_secs(10)).unwrap();
        assert_eq!(window, (0, 20 * 1600, true));
        assert_eq!(spool.pending_ms(), 0);
        // Resuming after the pause starts a new window at its own time.
        spool.push(&speech(9_000)).unwrap();
        let window = windows.recv_timeout(Duration::from_secs(10)).unwrap();
        assert_eq!(window, (9_000, 1600, true));
        spool.finish();
        worker.join().unwrap().unwrap();
        assert!(windows.try_recv().is_err());
    }

    #[test]
    fn a_backlog_is_worked_through_in_long_windows_then_normal_ones() {
        let spool = Spool::new().unwrap();
        for i in 0..400 {
            spool.push(&speech(i * 100)).unwrap();
        }
        spool.finish();
        let mut cuts = Vec::new();
        pump(
            &spool,
            &CancellationToken::new(),
            Duration::from_secs(5),
            |window| {
                spool.complete(window.consumed);
                cuts.push((window.start_ms, window.samples.len()));
                Ok(())
            },
        )
        .unwrap();
        // 40 s queued: one 28 s window, after which 13 s remain and 10 s windows resume.
        assert_eq!(
            cuts,
            [
                (0, 28 * 16_000),
                (27_000, 10 * 16_000),
                (36_000, 4 * 16_000)
            ]
        );
        assert_eq!(spool.pending_ms(), 0);
    }

    #[test]
    fn discarding_stops_the_pump_without_flushing() {
        let spool = Spool::new().unwrap();
        spool.push(&speech(0)).unwrap();
        spool.finish();
        let abort = CancellationToken::new();
        abort.cancel();
        let mut windows = 0;
        pump(&spool, &abort, Duration::from_millis(10), |_| {
            windows += 1;
            Ok(())
        })
        .unwrap();
        assert_eq!(windows, 0);
    }

    #[test]
    fn advertised_languages_match_the_native_multilingual_vocabulary() {
        let choices: Vec<serde_json::Value> =
            serde_json::from_str(include_str!("../../../src/lib/whisperLanguages.json")).unwrap();
        let mut ids = std::collections::HashSet::new();
        for choice in choices {
            let code = choice["code"].as_str().unwrap();
            validate_language(Some(code)).unwrap();
            assert!(ids.insert(whisper_rs::get_lang_id(code).unwrap()));
        }
        assert_eq!(ids.len(), 99);
    }

    /// Put the pinned Tiny model in `dir`. Downloading it costs CI 40 to 100 s a lane, so when
    /// `WHISPER_SMOKE_MODEL_CACHE` names a directory, which CI restores between runs, a copy
    /// there that matches the pin is used instead, and a download refills it. The download
    /// itself stays covered, against a local server, by the tests in `models.rs`.
    async fn smoke_model(manager: &ModelManager, dir: &std::path::Path) {
        let id = ModelId::Tiny;
        let Some(cache) =
            std::env::var_os("WHISPER_SMOKE_MODEL_CACHE").filter(|path| !path.is_empty())
        else {
            manager.download(dir, id).await.unwrap();
            return;
        };
        let cache = std::path::PathBuf::from(cache);
        let cached = cache.join(id.file());
        let started = std::time::Instant::now();
        match models::read_verified(&cached, id) {
            Ok(bytes) => {
                // The bytes just verified, rather than a second read of the file.
                std::fs::write(dir.join(id.file()), bytes).unwrap();
                eprintln!("{} ({:.2?})", cached.display(), started.elapsed());
                return;
            }
            Err(error) => eprintln!("{}: {error:#}; downloading", cached.display()),
        }
        manager.download(dir, id).await.unwrap();
        eprintln!("{} downloaded ({:.2?})", id.file(), started.elapsed());
        std::fs::create_dir_all(&cache).expect("WHISPER_SMOKE_MODEL_CACHE must be writable");
        std::fs::copy(dir.join(id.file()), &cached)
            .expect("WHISPER_SMOKE_MODEL_CACHE must be writable");
    }

    /// Explicit opt-in: downloads the 31 MiB pinned model (or takes it from CI's cache), then
    /// exercises the production spool, segmentation, inference and EOF-draining path against
    /// both bundled fixtures, and translates the French one into English with its language
    /// detected. CI runs this on native x64 and ARM64, without a GPU, microphone or provider key.
    #[tokio::test]
    #[ignore = "downloads a Whisper model; run with --ignored local_whisper_smoke"]
    async fn local_whisper_smoke() {
        let temp = tempfile::tempdir().unwrap();
        // Non-ASCII on purpose: a Windows username can put such characters in the real path.
        let dir = temp.path().join("réunion-日本語");
        std::fs::create_dir(&dir).unwrap();
        let manager = ModelManager::default();
        smoke_model(&manager, &dir).await;
        let model = load_lease(manager.lease(&dir, ModelId::Tiny).unwrap()).unwrap();
        for (fixture, language, translate, expected) in [
            ("rehearsal-en.wav", None, false, Some("caption")),
            ("rehearsal-fr.wav", Some("fr"), false, Some("public")),
            // Tiny translates poorly, and its wording moves with the instruction set: ARM64 said
            // "This is a recording of repetition…", x64 "This is an arrangement of repetition…".
            // So the translation is held to being English, not to any one word.
            ("rehearsal-fr.wav", None, true, None),
        ] {
            let samples = crate::audio::fixture::load_fixture(
                &std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("resources/fixtures")
                    .join(fixture),
            )
            .unwrap();
            let spool = Spool::new().unwrap();
            for (i, chunk) in samples.chunks(1600).enumerate() {
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "the fixture is 16-bit PCM over 32768, so this restores it exactly"
                )]
                let pcm = chunk
                    .iter()
                    .flat_map(|s| ((*s * 32768.0) as i16).to_le_bytes())
                    .collect();
                spool
                    .push(&TimedChunk {
                        start_ms: i as u64 * 100,
                        pcm,
                    })
                    .unwrap();
            }
            spool.finish();
            let mut text = String::new();
            let mut last_end = 0;
            let started = std::time::Instant::now();
            transcribe(
                &model,
                language,
                translate,
                &spool,
                &CancellationToken::new(),
                |caption, start, end, _| {
                    assert!(start >= last_end && end >= start);
                    assert!(end <= samples.len() as u64 / 16);
                    last_end = end;
                    text.push_str(caption);
                    text.push(' ');
                },
                || {},
            )
            .unwrap();
            // The time is the one number CI can compare across instruction-set changes.
            eprintln!("{fixture} ({:.2?}): {text}", started.elapsed());
            match expected {
                Some(word) => assert!(text.to_lowercase().contains(word), "{fixture}: {text}"),
                None => assert!(reads_as_english(&text), "{fixture}: {text}"),
            }
            assert_eq!(
                spool.pending_ms(),
                0,
                "Stop must drain the final partial window"
            );
        }
    }

    /// Whether `text` is English rather than French, judged by function words, which survive
    /// any rewording: plenty of English ones and few French ones.
    fn reads_as_english(text: &str) -> bool {
        const ENGLISH: [&str; 7] = ["the", "is", "and", "to", "of", "this", "a"];
        const FRENCH: [&str; 9] = ["le", "la", "les", "est", "et", "une", "des", "sont", "du"];
        let lower = text.to_lowercase();
        let words: Vec<&str> = lower
            .split(|c: char| !c.is_alphabetic())
            .filter(|w| !w.is_empty())
            .collect();
        let count = |set: &[&str]| words.iter().filter(|w| set.contains(w)).count();
        let (english, french) = (count(&ENGLISH), count(&FRENCH));
        english >= 5 && english > 3 * french
    }

    #[test]
    fn english_is_told_from_french_by_its_function_words() {
        // What Tiny produced on the two CI architectures, and the French it was translating.
        assert!(reads_as_english(concat!(
            "This is a recording of repetition for the subject system to direct. ",
            "A portrait is a public and each sentence is translated later. to the screen."
        )));
        assert!(reads_as_english(concat!(
            "This is an arrangement of repetition for the subject system to direct. ",
            "A portrait is a public and each sentence is translated later. ",
            "to the screen, then to the screen."
        )));
        assert!(!reads_as_english(concat!(
            "Ceci est un enregistrement de répétition pour le système de sous-titrage en direct. ",
            "Une oratrice s'adresse à un public et chaque phrase est transcrite puis affichée à ",
            "l'écran. Les sous-titres apparaissent juste après les mots."
        )));
    }

    #[test]
    fn validates_multilingual_choices_and_rejects_injection_or_unavailable_tokens() {
        for language in [
            None,
            Some("fr"),
            Some("en"),
            Some("ar"),
            Some("de"),
            Some("sw"),
            Some("ja"),
        ] {
            validate_language(language).unwrap();
        }
        for language in ["fake", "yue", "fr\0suffix"] {
            assert!(validate_language(Some(language)).is_err());
        }
    }
}
