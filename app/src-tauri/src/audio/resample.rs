//! Streaming mono speech resampler.
//!
//! Downsampling low-pass filters at the input rate with a Kaiser-windowed sinc, then linearly
//! interpolates to the output rate. For the ratios devices usually present (48 → 16 kHz and
//! 48 → 24 kHz) every output lands exactly on an input sample, so the interpolation is plain
//! decimation and the filter alone decides what the provider hears.
//!
//! The filter used to be four cascaded one-pole low-passes at 0.45 × the output rate. That is
//! cheap, but a one-pole roll-off begins far below its corner: at 16 kHz output, speech was
//! already 4 dB down at 4 kHz and 10 dB down at 7 kHz, while 10–12 kHz content folding back
//! into the band was only 16–20 dB down. The windowed sinc keeps the band flat to about
//! 6.5 kHz and rejects what would alias by 60 dB or more, for about a hundred multiply-adds
//! per output sample.

use std::f64::consts::PI;

/// The filter's −6 dB point, as a fraction of the output rate.
const CUTOFF: f64 = 0.45;
/// Width of the filter's transition band, as a fraction of the output rate. With `CUTOFF`
/// this puts the passband edge near 0.4 × and the stopband edge near 0.5 × the output rate.
const TRANSITION: f64 = 0.11;
/// Stopband attenuation the Kaiser window is sized for, in dB.
const STOPBAND_DB: f64 = 60.0;
/// Input samples kept beyond the filter's span before the history is compacted. Compaction
/// moves one filter's worth of samples, so this only sets how often that happens.
const HISTORY_SLACK: usize = 4096;

pub struct Resampler {
    /// Input samples consumed per output sample (`in_rate / out_rate`).
    step: f64,
    /// Fractional position within the current [prev, cur) input interval.
    frac: f64,
    passthrough: bool,
    /// Symmetric low-pass taps with unity gain at DC; `[1.0]` — no filtering — when upsampling.
    taps: Vec<f32>,
    /// Recent input, oldest first. Holds at least `taps.len()` samples once started.
    history: Vec<f32>,
    /// The filtered value at the previous input sample, when it was computed there.
    prev: Option<f32>,
    started: bool,
}

impl Resampler {
    pub fn new(in_rate: u32, out_rate: u32) -> Self {
        let taps = if out_rate < in_rate {
            lowpass(in_rate, out_rate)
        } else {
            vec![1.0]
        };
        Self {
            step: f64::from(in_rate) / f64::from(out_rate),
            frac: 0.0,
            passthrough: in_rate == out_rate,
            history: Vec::with_capacity(taps.len() + HISTORY_SLACK + 1),
            taps,
            prev: None,
            started: false,
        }
    }

    /// Resample `input`, appending results to `out`.
    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        if self.passthrough {
            out.extend_from_slice(input);
            return;
        }
        let span = self.taps.len();
        for &sample in input {
            if !self.started {
                // Start from a steady state at the first sample, so the filter does not ring
                // up from an imagined silence.
                self.history.clear();
                self.history.resize(span, sample);
                self.prev = Some(sample);
                self.started = true;
                continue;
            }
            self.history.push(sample);
            // Outputs fall in [previous input, this input) only while `frac` is below one.
            // Most inputs have none when downsampling, and those are never filtered at all.
            if self.frac < 1.0 {
                let end = self.history.len();
                let (history, taps) = (&self.history, &self.taps);
                let prev = self
                    .prev
                    .unwrap_or_else(|| dot(&history[end - 1 - span..end - 1], taps));
                let mut cur = None;
                while self.frac < 1.0 {
                    // At an integer ratio every output sits exactly on an input sample.
                    let value = if self.frac == 0.0 {
                        prev
                    } else {
                        let cur = *cur.get_or_insert_with(|| dot(&history[end - span..end], taps));
                        prev + (cur - prev) * f64_to_f32(self.frac)
                    };
                    out.push(value);
                    self.frac += self.step;
                }
                self.prev = cur;
            } else {
                self.prev = None;
            }
            self.frac -= 1.0;
            if self.history.len() >= span + HISTORY_SLACK {
                let keep_from = self.history.len() - span;
                self.history.copy_within(keep_from.., 0);
                self.history.truncate(span);
            }
        }
    }
}

/// A Kaiser-windowed sinc low-pass for downsampling from `in_rate` to `out_rate`, normalised
/// to unity gain at DC. The length and window shape are Kaiser's estimates for reaching
/// `STOPBAND_DB` across the transition band; the length is odd so the centre is a sample.
fn lowpass(in_rate: u32, out_rate: u32) -> Vec<f32> {
    let rate = f64::from(in_rate);
    let cutoff = CUTOFF * f64::from(out_rate) / rate;
    let transition = TRANSITION * f64::from(out_rate) / rate;
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "a positive length of tens to hundreds of taps, and `as` saturates regardless"
    )]
    let len = ((STOPBAND_DB - 7.95) / (2.285 * 2.0 * PI * transition)).ceil() as usize | 1;
    let beta = 0.1102 * (STOPBAND_DB - 8.7);
    let centre = (len / 2) as f64;
    let taps: Vec<f64> = (0..len)
        .map(|i| {
            let t = i as f64 - centre;
            let sinc = if t == 0.0 {
                2.0 * cutoff
            } else {
                (2.0 * PI * cutoff * t).sin() / (PI * t)
            };
            let r = t / centre;
            sinc * bessel_i0(beta * (1.0 - r * r).max(0.0).sqrt()) / bessel_i0(beta)
        })
        .collect();
    let gain: f64 = taps.iter().sum();
    taps.iter().map(|&tap| f64_to_f32(tap / gain)).collect()
}

/// Modified Bessel function of the first kind, order zero, by its power series. The window
/// only evaluates it for arguments up to `beta`, where the series converges in a few dozen
/// terms.
fn bessel_i0(x: f64) -> f64 {
    let half = x / 2.0;
    let (mut sum, mut term) = (1.0, 1.0);
    for k in 1..64 {
        term *= (half / f64::from(k)).powi(2);
        sum += term;
        if term < sum * 1e-12 {
            break;
        }
    }
    sum
}

/// Dot product over eight independent accumulators, so the compiler can vectorise it; a
/// single running sum would have to be added in order.
fn dot(a: &[f32], b: &[f32]) -> f32 {
    let mut lanes = [0.0f32; 8];
    let ((a_chunks, a_tail), (b_chunks, b_tail)) = (a.as_chunks::<8>(), b.as_chunks::<8>());
    let tail: f32 = a_tail.iter().zip(b_tail).map(|(x, y)| x * y).sum();
    for (x, y) in a_chunks.iter().zip(b_chunks) {
        for lane in 0..8 {
            lanes[lane] += x[lane] * y[lane];
        }
    }
    lanes.iter().sum::<f32>() + tail
}

/// Average interleaved frames down to a single mono channel.
pub fn downmix_to_mono(interleaved: &[f32], channels: usize, out: &mut Vec<f32>) {
    if channels <= 1 {
        out.extend_from_slice(interleaved);
        return;
    }
    for frame in interleaved.chunks_exact(channels) {
        let sum: f32 = frame.iter().copied().sum();
        out.push(sum / channels as f32);
    }
}

/// Narrow a value computed in f64 to the f32 the audio path carries. Rounding to the nearest
/// f32 is the point: what passes through here is a sample, a filter tap or an interpolation
/// fraction, all far inside f32's range.
#[expect(
    clippy::cast_possible_truncation,
    reason = "rounding to the nearest f32 is the intent"
)]
pub fn f64_to_f32(value: f64) -> f32 {
    value as f32
}

/// Convert f32 [-1, 1] samples to little-endian 16-bit PCM bytes.
pub fn f32_to_pcm16_le(samples: &[f32], out: &mut Vec<u8>) {
    out.reserve(samples.len() * 2);
    for &s in samples {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "clamped to ±32767 first, so only the fraction is dropped"
        )]
        let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downsample_48k_to_16k_thirds_the_rate() {
        let mut r = Resampler::new(48_000, 16_000);
        let input: Vec<f32> = (0..4800).map(|i| (i as f32 * 0.001).sin()).collect();
        let mut out = Vec::new();
        r.process(&input, &mut out);
        // ~1/3 of the input length, allowing for warm-up of one sample.
        let expected = input.len() / 3;
        assert!(out.len().abs_diff(expected) <= 2, "got {}", out.len());
    }

    #[test]
    fn passthrough_when_rates_match() {
        let mut r = Resampler::new(16_000, 16_000);
        let input = vec![0.1, 0.2, 0.3];
        let mut out = Vec::new();
        r.process(&input, &mut out);
        assert_eq!(out, input);
    }

    /// Level of a sine after resampling, relative to the input, in dB. Fed in 10 ms blocks
    /// as a capture callback would, and measured after the filter has settled. The phase is
    /// wrapped in f64: an f32 phase a second into a 20 kHz tone is imprecise enough to add
    /// broadband noise near -55 dB, which would be measured as leakage through the filter.
    fn gain_db(in_rate: u32, out_rate: u32, hz: f32) -> f32 {
        let mut resampler = Resampler::new(in_rate, out_rate);
        let input: Vec<f32> = (0..in_rate)
            .map(|i| {
                let cycles = (f64::from(hz) * f64::from(i) / f64::from(in_rate)).fract();
                0.5 * f64_to_f32((2.0 * std::f64::consts::PI * cycles).sin())
            })
            .collect();
        let mut output = Vec::new();
        for block in input.chunks(in_rate as usize / 100) {
            resampler.process(block, &mut output);
        }
        let settled = &output[output.len() / 10..];
        let rms = (settled.iter().map(|s| s * s).sum::<f32>() / settled.len() as f32).sqrt();
        20.0 * (rms / (0.5 / std::f32::consts::SQRT_2)).log10()
    }

    // The speech band reaches the provider intact. The old one-pole cascade was already
    // 4.3 dB down at 4 kHz and 10.4 dB down at 7 kHz on the way to 16 kHz.
    #[test]
    fn the_speech_band_passes_at_full_level() {
        for hz in [300.0, 1_000.0, 4_000.0, 6_000.0] {
            let gain = gain_db(48_000, 16_000, hz);
            assert!(gain.abs() < 0.5, "{hz} Hz to 16 kHz: {gain:.2} dB");
        }
        let edge = gain_db(48_000, 16_000, 7_000.0);
        assert!(edge > -4.0, "7 kHz to 16 kHz: {edge:.2} dB");
        for hz in [1_000.0, 6_000.0, 9_000.0] {
            let gain = gain_db(48_000, 24_000, hz);
            assert!(gain.abs() < 0.5, "{hz} Hz to 24 kHz: {gain:.2} dB");
        }
        let gain = gain_db(44_100, 16_000, 4_000.0);
        assert!(gain.abs() < 1.0, "4 kHz from 44.1 to 16 kHz: {gain:.2} dB");
    }

    // Content above the new Nyquist limit would fold back into the band as tones that were
    // never spoken. The old filter let 10 kHz through at -16 dB.
    #[test]
    fn content_that_would_alias_is_rejected() {
        for hz in [9_000.0, 10_000.0, 12_000.0, 15_000.0, 20_000.0] {
            let gain = gain_db(48_000, 16_000, hz);
            assert!(gain < -55.0, "{hz} Hz to 16 kHz: {gain:.1} dB");
        }
        for hz in [13_000.0, 15_000.0, 20_000.0] {
            let gain = gain_db(48_000, 24_000, hz);
            assert!(gain < -55.0, "{hz} Hz to 24 kHz: {gain:.1} dB");
        }
        let gain = gain_db(44_100, 16_000, 10_000.0);
        assert!(gain < -50.0, "10 kHz from 44.1 to 16 kHz: {gain:.1} dB");
    }

    #[test]
    fn a_constant_signal_comes_through_unchanged() {
        let mut resampler = Resampler::new(48_000, 16_000);
        let mut output = Vec::new();
        resampler.process(&[0.3; 4_800], &mut output);
        assert!(output.iter().all(|s| (s - 0.3).abs() < 1e-5));
    }

    // Callback sizes vary, and the history is compacted every few thousand samples; neither
    // may change a single output sample.
    #[test]
    fn block_boundaries_do_not_change_the_output() {
        let input: Vec<f32> = (0..20_000)
            .map(|i| ((i * 7919) % 2003) as f32 / 1001.5 - 1.0)
            .collect();
        for (in_rate, out_rate) in [(48_000, 16_000), (44_100, 16_000), (48_000, 24_000)] {
            let mut whole = Vec::new();
            Resampler::new(in_rate, out_rate).process(&input, &mut whole);
            let mut blocks = Vec::new();
            let mut resampler = Resampler::new(in_rate, out_rate);
            for block in input.chunks(441) {
                resampler.process(block, &mut blocks);
            }
            assert_eq!(whole, blocks, "{in_rate} to {out_rate}");
        }
    }

    #[test]
    fn upsampling_interpolates_without_filtering() {
        let mut resampler = Resampler::new(8_000, 16_000);
        let mut output = Vec::new();
        resampler.process(&[0.0, 1.0, 0.0], &mut output);
        assert_eq!(output, vec![0.0, 0.5, 1.0, 0.5]);
    }

    #[test]
    fn pcm16_roundtrip_endianness() {
        let mut out = Vec::new();
        f32_to_pcm16_le(&[0.0, 1.0, -1.0], &mut out);
        assert_eq!(out, vec![0, 0, 0xFF, 0x7F, 0x01, 0x80]);
    }
}
