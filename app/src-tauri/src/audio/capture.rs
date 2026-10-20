//! Microphone capture via cpal. Cross-platform; this is the presenter-at-the-laptop path.
//!
//! The cpal stream callback runs on its own thread and is `!Send`, so `run_microphone`
//! is designed to be invoked inside a dedicated `std::thread`: it builds the stream,
//! starts it, then parks until cancelled, keeping the stream alive for its lifetime.

use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, I24, U24};
use tokio::sync::mpsc::{error::TrySendError, Sender};
use tokio_util::sync::CancellationToken;

use super::devices::PresenceCheck;
use super::resample::{downmix_to_mono, f32_to_pcm16_le, f64_to_f32, Resampler};
use super::{chunk_samples, AudioChunk};
use crate::types::{AudioDevice, AudioLevel, Origin};

/// How often the microphone re-enumerates inputs when Windows has reported no change. A
/// device change triggers the check at once; this only covers a watcher that failed.
const MIC_PRESENCE_FALLBACK: Duration = Duration::from_secs(5);

/// Distinguish a stream that failed while running from a device that could not open.
#[derive(Debug)]
pub struct MicrophoneRuntimeError(pub cpal::Error);

impl std::fmt::Display for MicrophoneRuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "microphone stream error: {}", self.0)
    }
}

impl std::error::Error for MicrophoneRuntimeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.0)
    }
}

fn handle_stream_error(
    error: cpal::Error,
    errors: &std::sync::mpsc::SyncSender<anyhow::Error>,
    cancel: &CancellationToken,
) {
    // CPAL continues delivering buffers after an xrun or denied realtime priority.
    // These are quality notifications, not a disconnected or invalid stream.
    if matches!(
        error.kind(),
        cpal::ErrorKind::Xrun | cpal::ErrorKind::RealtimeDenied
    ) {
        return;
    }
    let _ = errors.try_send(anyhow::Error::new(MicrophoneRuntimeError(error)));
    cancel.cancel();
}

/// Enumerate available input devices for the operator UI.
pub fn list_input_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_id = host
        .default_input_device()
        .and_then(|device| device.id().ok());

    let mut out = Vec::new();
    {
        let devices = host
            .input_devices()
            .context("failed to enumerate microphones")?;
        for device in devices {
            let name = device.to_string();
            if let Ok(id) = device.id() {
                let is_default = Some(&id) == default_id.as_ref();
                out.push(AudioDevice {
                    id: id.to_string(),
                    name,
                    is_default,
                });
            }
        }
    }
    Ok(out)
}

fn pick_device(name: Option<&str>) -> Result<cpal::Device> {
    let host = cpal::default_host();
    match name {
        Some(wanted) => host
            .input_devices()
            .context("failed to enumerate input devices")?
            .find(|device| {
                device.id().is_ok_and(|id| id.to_string() == wanted) || device.to_string() == wanted
            })
            .ok_or_else(|| anyhow!("microphone '{}' not found", wanted)),
        None => host
            .default_input_device()
            .ok_or_else(|| anyhow!("no default microphone available")),
    }
}

/// Capture from the microphone until `cancel` fires. Blocks the calling thread.
///
/// Startup and runtime failures return to the owner. The session owner supplies session
/// status, while preflight supplies test status; capture itself knows neither UI lifecycle.
pub fn run_microphone(
    device_name: Option<&str>,
    target_rate: u32,
    level_tx: Sender<AudioLevel>,
    chunk_tx: super::sink::AudioSink,
    cancel: &CancellationToken,
) -> Result<()> {
    let device = pick_device(device_name)?;
    let config = device
        .default_input_config()
        .context("failed to read default input config")?;

    // Per-stream state captured by the callback.
    let state = CaptureState::new(
        Origin::Microphone,
        config.sample_rate(),
        target_rate,
        level_tx,
        chunk_tx,
    );

    let stream_error_cancel = cancel.clone();
    let (error_tx, error_rx) = std::sync::mpsc::sync_channel(1);
    let err_fn = move |e: cpal::Error| {
        // The owner decides whether this is a session or a preflight failure. Never
        // emit UI events from a device callback, and never block the callback on reporting.
        handle_stream_error(e, &error_tx, &stream_error_cancel);
    };

    let stream = open_stream(&device, config, state, err_fn)?;
    stream.play().context("failed to start microphone stream")?;
    wait_while_present(&device, cancel)?;

    tracing::info!("microphone capture stopped");
    match error_rx.try_recv() {
        Ok(error) => Err(error),
        Err(_) => Ok(()),
    }
}

/// Open `device` in its default format, feeding every buffer it delivers to `state`.
fn open_stream(
    device: &cpal::Device,
    config: cpal::SupportedStreamConfig,
    mut state: CaptureState,
    err_fn: impl FnMut(cpal::Error) + Send + 'static,
) -> Result<cpal::Stream> {
    let sample_format = config.sample_format();
    let channels = usize::from(config.channels());
    tracing::info!(
        rate = config.sample_rate(),
        channels,
        ?sample_format,
        "starting microphone capture"
    );
    let config: cpal::StreamConfig = config.into();

    match sample_format {
        // Already the pipeline's format: no conversion, so no copy through the scratch buffer.
        SampleFormat::F32 => device.build_input_stream(
            config,
            move |data: &[f32], _| state.push_samples(data, channels),
            err_fn,
            None,
        ),
        SampleFormat::I8 => build::<i8>(device, config, state, err_fn),
        SampleFormat::I16 => build::<i16>(device, config, state, err_fn),
        // What cpal reports for a 24-bit WASAPI microphone. cpal shifts each sample down out
        // of its 32-bit container before the callback sees it.
        SampleFormat::I24 => build::<I24>(device, config, state, err_fn),
        SampleFormat::I32 => build::<i32>(device, config, state, err_fn),
        SampleFormat::I64 => build::<i64>(device, config, state, err_fn),
        SampleFormat::U8 => build::<u8>(device, config, state, err_fn),
        SampleFormat::U16 => build::<u16>(device, config, state, err_fn),
        SampleFormat::U24 => build::<U24>(device, config, state, err_fn),
        SampleFormat::U32 => build::<u32>(device, config, state, err_fn),
        SampleFormat::U64 => build::<u64>(device, config, state, err_fn),
        SampleFormat::F64 => build::<f64>(device, config, state, err_fn),
        // DSD is a 1-bit bitstream, not PCM, and the enum is non-exhaustive.
        other => return Err(anyhow!("unsupported sample format: {other:?}")),
    }
    .context("failed to build input stream")
}

/// Park while the caller's stream runs, until `cancel` fires or `device` disappears. The
/// check runs off the realtime callback and also catches silent or suspended devices whose
/// driver fails to deliver an error. The opened device never follows a new default.
fn wait_while_present(device: &cpal::Device, cancel: &CancellationToken) -> Result<()> {
    let pinned_id = device
        .id()
        .context("failed to identify active microphone")?;
    let mut presence = PresenceCheck::new(MIC_PRESENCE_FALLBACK);
    while !cancel.is_cancelled() {
        std::thread::sleep(Duration::from_millis(100));
        if presence.due() {
            let available = cpal::default_host()
                .input_devices()
                .context("failed to check microphone availability")?
                .any(|device| device.id().is_ok_and(|id| id == pinned_id));
            anyhow::ensure!(available, "selected microphone disconnected or disabled");
        }
    }
    Ok(())
}

/// Open an input stream whose samples need converting to f32. cpal fixes the sample type of
/// the callback's slice at compile time, so each device format needs its own instantiation;
/// the conversion itself is `dasp_sample`'s, which cpal re-exports.
fn build<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    mut state: CaptureState,
    on_error: impl FnMut(cpal::Error) + Send + 'static,
) -> Result<cpal::Stream, cpal::Error>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = usize::from(config.channels);
    device.build_input_stream(
        config,
        move |data: &[T], _| state.push_converted(data, channels),
        on_error,
        None,
    )
}

/// Mutable state shared into a cpal callback: resampling, chunk accumulation, level metering.
/// Scratch buffers are retained across callbacks; each completed PCM chunk owns the one
/// small allocation transferred to the async WebSocket pipeline.
pub struct CaptureState {
    origin: Origin,
    level_tx: Sender<AudioLevel>,
    chunk_tx: super::sink::AudioSink,
    resampler: Resampler,
    // Samples in one ~100 ms chunk at the target rate.
    chunk_len: usize,
    conv_buf: Vec<f32>,
    mono_buf: Vec<f32>,
    // Accumulates resampled samples until we have a full ~100 ms chunk. The resampler
    // appends straight into it.
    pending: Vec<f32>,
    pending_start: usize,
    last_level: Instant,
    peak_accum: f32,
    sq_sum: f64,
    sq_count: usize,
}

impl CaptureState {
    pub fn new(
        origin: Origin,
        in_rate: u32,
        target_rate: u32,
        level_tx: Sender<AudioLevel>,
        chunk_tx: super::sink::AudioSink,
    ) -> Self {
        let chunk_len = chunk_samples(target_rate);
        Self {
            origin,
            level_tx,
            chunk_tx,
            resampler: Resampler::new(in_rate, target_rate),
            chunk_len,
            conv_buf: Vec::with_capacity(4096),
            mono_buf: Vec::with_capacity(4096),
            pending: Vec::with_capacity(chunk_len * 2),
            pending_start: 0,
            last_level: Instant::now(),
            peak_accum: 0.0,
            sq_sum: 0.0,
            sq_count: 0,
        }
    }

    /// Feed interleaved samples in a device format other than f32, without allocating: they
    /// are converted into a reused scratch buffer, the format's full scale becoming [-1, 1].
    pub fn push_converted<T>(&mut self, samples: &[T], channels: usize)
    where
        T: Sample,
        f32: FromSample<T>,
    {
        let mut conv = std::mem::take(&mut self.conv_buf);
        conv.clear();
        conv.extend(samples.iter().map(|&s| f32::from_sample(s)));
        self.push_samples(&conv, channels);
        self.conv_buf = conv;
    }

    /// Feed interleaved f32 samples at the device rate.
    pub fn push_samples(&mut self, interleaved: &[f32], channels: usize) {
        self.mono_buf.clear();
        downmix_to_mono(interleaved, channels, &mut self.mono_buf);

        // Accumulate level stats over the mono signal (pre-resample is fine).
        for &s in &self.mono_buf {
            let a = s.abs();
            if a > self.peak_accum {
                self.peak_accum = a;
            }
            self.sq_sum += f64::from(s) * f64::from(s);
            self.sq_count += 1;
        }
        self.maybe_emit_level();

        // Preflight intentionally has no receiver. Also covers a provider that has
        // ended: continue metering until cancellation without retaining audio samples.
        if self.chunk_tx.is_closed() {
            self.pending.clear();
            self.pending_start = 0;
            return;
        }

        self.resampler.process(&self.mono_buf, &mut self.pending);

        while self.pending.len() - self.pending_start >= self.chunk_len {
            let mut pcm = Vec::with_capacity(self.chunk_len * 2);
            let end = self.pending_start + self.chunk_len;
            f32_to_pcm16_le(&self.pending[self.pending_start..end], &mut pcm);
            self.pending_start = end;
            // Never block the real-time callback. Cloud queues favor current speech;
            // the local sink stops visibly if its independent writer queue overflows.
            if let Err(error) = self.chunk_tx.try_send(AudioChunk { pcm_le: pcm }) {
                if matches!(error, TrySendError::Closed(_)) {
                    self.pending_start = self.pending.len();
                    break;
                }
            }
        }

        // Compact occasionally instead of shifting the whole pending buffer every 100 ms.
        if self.pending_start >= self.chunk_len * 8
            || self.pending_start.saturating_mul(2) >= self.pending.len()
        {
            self.pending.copy_within(self.pending_start.., 0);
            self.pending
                .truncate(self.pending.len() - self.pending_start);
            self.pending_start = 0;
        }
    }

    fn maybe_emit_level(&mut self) {
        if self.last_level.elapsed() < Duration::from_millis(50) || self.sq_count == 0 {
            return;
        }
        let rms = f64_to_f32((self.sq_sum / self.sq_count as f64).sqrt());
        // Sent through a channel: the webview IPC hop happens on the emitter task, not here
        // on the real-time audio thread.
        let _ = self.level_tx.try_send(AudioLevel {
            source: self.origin,
            rms,
            peak: self.peak_accum,
        });
        self.last_level = Instant::now();
        self.peak_accum = 0.0;
        self.sq_sum = 0.0;
        self.sq_count = 0;
    }
}

impl Drop for CaptureState {
    fn drop(&mut self) {
        if self.chunk_tx.local_spool().is_some() && self.pending_start < self.pending.len() {
            let mut pcm = Vec::new();
            f32_to_pcm16_le(&self.pending[self.pending_start..], &mut pcm);
            let _ = self.chunk_tx.try_send(AudioChunk { pcm_le: pcm });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quality_notifications_keep_capture_alive_but_device_failures_stop_it() {
        let cancel = CancellationToken::new();
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        for kind in [cpal::ErrorKind::Xrun, cpal::ErrorKind::RealtimeDenied] {
            for _ in 0..100 {
                handle_stream_error(cpal::Error::new(kind), &sender, &cancel);
            }
        }
        assert!(!cancel.is_cancelled());
        assert!(receiver.try_recv().is_err());
        handle_stream_error(
            cpal::Error::new(cpal::ErrorKind::DeviceNotAvailable),
            &sender,
            &cancel,
        );
        assert!(cancel.is_cancelled());
        // A second failure must never block the audio callback on the full channel.
        handle_stream_error(
            cpal::Error::new(cpal::ErrorKind::StreamInvalidated),
            &sender,
            &cancel,
        );
        assert_eq!(
            receiver
                .try_recv()
                .unwrap()
                .downcast_ref::<MicrophoneRuntimeError>()
                .unwrap()
                .0
                .kind(),
            cpal::ErrorKind::DeviceNotAvailable
        );
    }
    use tokio::sync::mpsc::channel;

    #[test]
    fn sustained_preflight_meters_without_accumulating_audio() {
        let (levels, mut level_rx) = channel(8);
        let (audio, audio_rx) = channel(5);
        drop(audio_rx);
        let mut state = CaptureState::new(Origin::Microphone, 48_000, 16_000, levels, audio.into());
        let samples = vec![0.25; 480];
        for _ in 0..10_000 {
            state.last_level = Instant::now() - Duration::from_millis(100);
            state.push_samples(&samples, 1);
            assert_eq!(level_rx.try_recv().unwrap().rms, 0.25);
            assert!(state.pending.is_empty());
        }
    }

    #[test]
    fn receiver_closing_mid_stream_discards_partial_audio() {
        let (levels, _) = channel(8);
        let (audio, audio_rx) = channel(5);
        let mut state = CaptureState::new(Origin::Microphone, 16_000, 16_000, levels, audio.into());
        state.push_samples(&[0.5; 160], 1);
        assert!(!state.pending.is_empty());
        drop(audio_rx);
        for _ in 0..100 {
            state.push_samples(&[0.5; 1600], 1);
            assert!(state.pending.is_empty());
            assert_eq!(state.pending_start, 0);
        }
    }

    /// A state whose meter and audio receivers are gone: these tests only read `mono_buf`.
    fn detached_state() -> CaptureState {
        let (levels, _) = channel(1);
        let (audio, _) = channel(1);
        CaptureState::new(Origin::Microphone, 16_000, 16_000, levels, audio.into())
    }

    /// The mono signal the stream callback produces from samples in a converted format.
    fn mono_of<T>(interleaved: &[T], channels: usize) -> Vec<f32>
    where
        T: Sample,
        f32: FromSample<T>,
    {
        let mut state = detached_state();
        state.push_converted(interleaved, channels);
        std::mem::take(&mut state.mono_buf)
    }

    /// Stereo frames at negative full scale, positive full scale and the midpoint, then the
    /// two extremes in opposite channels, which downmix to (almost) silence.
    fn extremes<T: Sample>(min: T, max: T) -> [T; 8] {
        let mid = T::EQUILIBRIUM;
        [min, min, max, max, mid, mid, min, max]
    }

    #[test]
    fn signed_24_bit_samples_convert_and_downmix() {
        let min = I24::new(-(1 << 23)).unwrap();
        let max = I24::new((1 << 23) - 1).unwrap();
        assert_eq!(
            mono_of(&extremes(min, max), 2),
            [-1.0, 1.0 - 2f32.powi(-23), 0.0, -(2f32.powi(-24))]
        );
    }

    #[test]
    fn signed_16_bit_samples_convert_and_downmix() {
        assert_eq!(
            mono_of(&extremes(i16::MIN, i16::MAX), 2),
            [-1.0, 1.0 - 2f32.powi(-15), 0.0, -(2f32.powi(-16))]
        );
    }

    #[test]
    fn unsigned_8_bit_samples_convert_around_their_offset_midpoint_and_downmix() {
        assert_eq!(u8::EQUILIBRIUM, 128);
        assert_eq!(
            mono_of(&extremes(u8::MIN, u8::MAX), 2),
            [-1.0, 1.0 - 2f32.powi(-7), 0.0, -(2f32.powi(-8))]
        );
    }

    #[test]
    fn f32_samples_pass_through_unconverted_and_downmix() {
        let mut state = detached_state();
        state.push_samples(&extremes(-1.0, 1.0), 2);
        assert_eq!(state.mono_buf, [-1.0, 1.0, 0.0, 0.0]);
    }

    #[test]
    fn every_other_accepted_format_spans_full_scale() {
        fn spans<T>(min: T, max: T)
        where
            T: Sample + std::fmt::Debug,
            f32: FromSample<T>,
        {
            let mono = mono_of(&[min, T::EQUILIBRIUM, max], 1);
            assert_eq!(mono[..2], [-1.0, 0.0], "{min:?}");
            // 8-bit is the coarsest format: one step below full scale is 127/128.
            assert!((1.0 - 2f32.powi(-7)..=1.0).contains(&mono[2]), "{max:?}");
        }
        spans(i8::MIN, i8::MAX);
        spans(i32::MIN, i32::MAX);
        spans(i64::MIN, i64::MAX);
        spans(u16::MIN, u16::MAX);
        spans(U24::new(0).unwrap(), U24::new((1 << 24) - 1).unwrap());
        spans(u32::MIN, u32::MAX);
        spans(u64::MIN, u64::MAX);
        spans(-1.0_f64, 1.0_f64);
    }

    #[test]
    fn downmix_averages_every_channel_of_a_frame() {
        let quad = [i16::MIN, 0, 0, 0, i16::MAX, i16::MAX, i16::MAX, i16::MAX];
        assert_eq!(mono_of(&quad, 4), [-0.25, 1.0 - 2f32.powi(-15)]);
    }
}
