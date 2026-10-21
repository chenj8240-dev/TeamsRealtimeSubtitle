//! Local audio backlog: a bounded in-memory queue from `audio::framing`.
//!
//! This module keeps the historical `Spool` name for the local Whisper pipeline. The queue
//! drops the oldest audio when full, reports dropped/lagging state, and never creates a file.

pub use crate::audio::framing::{FrameQueue as Spool, Next, TimedChunk};
