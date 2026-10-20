//! OpenAI Realtime *translations* integration: WebSocket client and wire protocol.

pub mod client;
pub mod protocol;

#[cfg(test)]
mod language_probe;

pub use client::{
    OpenAiConfig, DEFAULT_OPENAI_HOST, DEFAULT_OPENAI_TRANSCRIBE_MODEL,
    DEFAULT_OPENAI_TRANSLATE_MODEL,
};
