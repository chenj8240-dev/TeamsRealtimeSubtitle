//! System (loopback) audio capture — the "audio coming out of the laptop" path: a remote
//! speaker on Zoom or Teams, a browser tab, a media player. On Windows this uses WASAPI
//! loopback, which captures the render endpoint mix — every application's output, whatever
//! it is — without any virtual audio device. On other platforms it is a stub.
//!
//! The Windows path follows the current `wasapi` event-driven shared-stream API.
//! Everything downstream (resampling, chunking, leveling via `CaptureState`) is shared
//! with the mic path and is exercised by tests.

use anyhow::Result;
use tokio::sync::mpsc::Sender;
use tokio_util::sync::CancellationToken;

use crate::types::AudioLevel;

#[cfg(not(windows))]
pub fn run_system_loopback(
    _device_id: Option<String>,
    _capture: super::applications::SystemCapture,
    _target_rate: u32,
    _level_tx: Sender<AudioLevel>,
    _chunk_tx: crate::audio::sink::AudioSink,
    _cancel: &CancellationToken,
) -> Result<()> {
    anyhow::bail!("System (loopback) capture is only supported on Windows in this build")
}

#[cfg(windows)]
pub fn run_system_loopback(
    device_id: Option<String>,
    capture: super::applications::SystemCapture,
    target_rate: u32,
    level_tx: Sender<AudioLevel>,
    chunk_tx: crate::audio::sink::AudioSink,
    cancel: &CancellationToken,
) -> Result<()> {
    windows_impl::run(device_id, capture, target_rate, level_tx, chunk_tx, cancel)
}

#[cfg(windows)]
mod windows_impl {
    use std::collections::VecDeque;
    use std::time::Duration;

    use anyhow::{Context, Result};
    use tokio::sync::mpsc::Sender;
    use tokio_util::sync::CancellationToken;
    use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};

    use crate::audio::applications::{ProcessGuard, ProcessIdentity, SystemCapture};
    use crate::audio::capture::CaptureState;
    use crate::audio::com::Apartment;
    use crate::audio::devices::PresenceCheck;
    use crate::types::{AudioLevel, Origin};

    /// `wasapi`'s fallible calls return `Box<dyn Error>`, which is neither `Send` nor
    /// `Sync` and so cannot flow into `anyhow` through `?` or `.context()`. This bridges
    /// them by stringifying the error behind a static context message.
    trait WasapiCtx<T> {
        fn ctx(self, msg: &'static str) -> Result<T>;
    }

    impl<T, E: std::fmt::Display> WasapiCtx<T> for std::result::Result<T, E> {
        fn ctx(self, msg: &'static str) -> Result<T> {
            self.map_err(|e| anyhow::anyhow!("{msg}: {e}"))
        }
    }

    pub fn run(
        device_id: Option<String>,
        capture: SystemCapture,
        target_rate: u32,
        level_tx: Sender<AudioLevel>,
        chunk_tx: crate::audio::sink::AudioSink,
        cancel: &CancellationToken,
    ) -> Result<()> {
        // COM must be initialised on the capture thread, and left only after every COM
        // object below is released.
        let _apartment = Apartment::mta().context("failed to initialise COM (MTA)")?;

        let Source {
            device,
            process,
            mut client,
            format,
            period,
        } = match capture {
            SystemCapture::Output => Source::output(device_id)?,
            SystemCapture::Application { process } => Source::application(process)?,
        };
        let (event, mut reader) = start(&mut client, &format, period)?;

        let mut state =
            CaptureState::new(Origin::System, reader.rate, target_rate, level_tx, chunk_tx);
        // The loop wakes on every device period (~100 Hz); the endpoint's state only needs
        // asking when Windows reports a change, or once a second in case it did not.
        let mut presence = PresenceCheck::new(Duration::from_secs(1));

        while !cancel.is_cancelled() {
            ensure_present(device.as_ref(), process.as_ref(), &mut presence)?;
            reader.forward(&mut state)?;

            // Wake on the audio event; short timeout keeps cancellation responsive.
            if event.wait_for_event(100).is_err() {
                // Timeout — loop and re-check cancellation.
            }
        }

        let _ = client.stop_stream();
        tracing::info!("WASAPI loopback capture stopped");
        Ok(())
    }

    /// What loopback captures, and the client, format and buffer duration it opens with.
    struct Source {
        /// The output endpoint, watched for removal. `None` when capturing an application.
        device: Option<wasapi::Device>,
        /// The captured application, watched for exit. `None` when capturing an output.
        process: Option<ProcessGuard>,
        client: wasapi::AudioClient,
        format: WaveFormat,
        /// In 100 ns units.
        period: i64,
    }

    impl Source {
        /// The mix of every application playing to the selected output, or the default one.
        fn output(device_id: Option<String>) -> Result<Self> {
            let enumerator = DeviceEnumerator::new().ctx("failed to create device enumerator")?;
            let device = match device_id {
                Some(id) => enumerator
                    .get_device(&id)
                    .ctx("selected output device unavailable")?,
                None => enumerator
                    .get_default_device(&Direction::Render)
                    .ctx("no default render device")?,
            };
            anyhow::ensure!(
                device.get_direction() == Direction::Render,
                "selected device is not an output endpoint"
            );
            let client = device
                .get_iaudioclient()
                .ctx("failed to get IAudioClient")?;
            let format = client.get_mixformat().ctx("failed to get mix format")?;
            let (_, period) = client
                .get_device_period()
                .ctx("failed to get device periods")?;
            Ok(Self {
                device: Some(device),
                process: None,
                client,
                format,
                period,
            })
        }

        /// One application's output, through a process loopback client.
        fn application(process: Option<ProcessIdentity>) -> Result<Self> {
            let identity = process.context("select an application before starting capture")?;
            let guard = ProcessGuard::selected(&identity)?;
            let client = wasapi::AudioClient::new_application_loopback_client(identity.pid, true)
                .ctx("failed to capture selected application")?;
            // Process clients have neither a device mix format nor a device period.
            let format = WaveFormat::new(32, 32, &SampleType::Float, 48000, 2, None);
            Ok(Self {
                device: None,
                process: Some(guard),
                client,
                format,
                period: 200_000,
            })
        }
    }

    /// Log the stream's format, then initialise `client` for event-driven shared capture and
    /// start it. Returns the event that signals each period and the reader for its packets.
    fn start(
        client: &mut wasapi::AudioClient,
        format: &WaveFormat,
        period: i64,
    ) -> Result<(wasapi::Handle, Reader)> {
        let in_rate = format.get_samplespersec();
        let channels = usize::from(format.get_nchannels());
        let bits = format.get_bitspersample();
        let sample_type = format.get_subformat().unwrap_or(SampleType::Float);

        tracing::info!(
            in_rate,
            channels,
            bits,
            ?sample_type,
            "starting WASAPI loopback capture"
        );

        // Loopback = render endpoint opened for capture.
        let mode = StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: period,
        };
        client
            .initialize_client(format, &Direction::Capture, &mode)
            .ctx("failed to initialise loopback client")?;

        let event = client
            .set_get_eventhandle()
            .ctx("failed to set event handle")?;
        let capture = client
            .get_audiocaptureclient()
            .ctx("failed to get capture client")?;

        client
            .start_stream()
            .ctx("failed to start loopback stream")?;

        let reader = Reader {
            capture,
            rate: in_rate,
            channels,
            bits,
            sample_type,
            raw: VecDeque::new(),
            frame: Vec::new(),
        };
        Ok((event, reader))
    }

    /// Fail once what is being captured has gone. An endpoint can disappear without
    /// producing another audio event, so its state is asked whenever `presence` is due.
    /// Never reopen the new default silently: the stream stays pinned to its original
    /// endpoint.
    fn ensure_present(
        device: Option<&wasapi::Device>,
        process: Option<&ProcessGuard>,
        presence: &mut PresenceCheck,
    ) -> Result<()> {
        if presence.due() {
            anyhow::ensure!(
                device.is_none_or(|d| matches!(d.get_state(), Ok(wasapi::DeviceState::Active))),
                "selected output device disconnected or disabled"
            );
        }
        anyhow::ensure!(
            process.is_none_or(ProcessGuard::running),
            "selected application has closed; select it again"
        );
        Ok(())
    }

    /// The capture side of a started stream, with the layout of its samples and buffers
    /// reused across wakes.
    struct Reader {
        capture: wasapi::AudioCaptureClient,
        rate: u32,
        channels: usize,
        bits: u16,
        sample_type: SampleType,
        raw: VecDeque<u8>,
        frame: Vec<f32>,
    }

    impl Reader {
        /// Decode the endpoint's next packet, if it has one, and feed it to `state`.
        /// `read_from_device_to_deque` reads a single packet per call, and the packet's
        /// buffer flags (silent, discontinuity) it returns are not looked at.
        fn forward(&mut self, state: &mut CaptureState) -> Result<()> {
            self.capture
                .read_from_device_to_deque(&mut self.raw)
                .ctx("failed to read loopback buffer")?;

            if !self.raw.is_empty() {
                self.frame.clear();
                decode_interleaved(&mut self.raw, self.sample_type, self.bits, &mut self.frame);
                self.raw.clear();
                state.push_samples(&self.frame, self.channels);
            }
            Ok(())
        }
    }

    /// Decode raw interleaved endpoint bytes into f32 samples in [-1, 1].
    /// `make_contiguous` rotates the deque in place instead of copying it out.
    fn decode_interleaved(bytes: &mut VecDeque<u8>, ty: SampleType, bits: u16, out: &mut Vec<f32>) {
        let buf: &[u8] = bytes.make_contiguous();
        match (ty, bits) {
            (SampleType::Float, 32) => {
                for c in buf.as_chunks::<4>().0 {
                    out.push(f32::from_le_bytes(*c));
                }
            }
            (SampleType::Int, 16) => {
                for c in buf.as_chunks::<2>().0 {
                    out.push(f32::from(i16::from_le_bytes(*c)) / 32768.0);
                }
            }
            (SampleType::Int, 32) => {
                for c in buf.as_chunks::<4>().0 {
                    let v = i32::from_le_bytes(*c);
                    out.push(v as f32 / 2_147_483_648.0);
                }
            }
            (_, b) => {
                // Unexpected format: emit silence of the right length rather than panic.
                let bytes_per = (b / 8).max(1) as usize;
                for _ in 0..(buf.len() / bytes_per) {
                    out.push(0.0);
                }
                tracing::warn!("unsupported loopback sample format: {ty:?}/{b}-bit");
            }
        }
    }
}
