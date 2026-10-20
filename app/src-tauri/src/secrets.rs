//! API-key storage, per translation provider. Prefers the OS keychain (via the `keyring`
//! crate); falls back to a `GEMINI_API_KEY` / `OPENAI_API_KEY` environment variable (or `.env`)
//! for development. Keys are only ever read on the Rust side to open the WebSocket — they never
//! reach the renderer.

use anyhow::{Context, Result};

use crate::types::Provider;

const SERVICE: &str = "io.github.fmadore.live-translation";

/// The service name up to 1.1.0, when the bundle identifier still named the workshop venue
/// rather than the author. Read once per provider so the rename does not cost an operator the
/// key they saved, then deleted — a credential this app no longer writes should not sit in
/// Credential Manager under a name that misstates who put it there.
const LEGACY_SERVICE: &str = "org.stias.live-translation";

/// Credential-store account name (one entry per provider). `None` for backends that need
/// no credential.
fn account(provider: Provider) -> Option<&'static str> {
    match provider {
        // Both Gemini backends read the same credential on purpose: one key from AI Studio
        // covers translation and subtitles, so switching mode never asks for it again.
        Provider::Gemini | Provider::GeminiTranscribe => Some("gemini-api-key"),
        Provider::OpenAi => Some("openai-api-key"),
        Provider::Mistral => Some("mistral-api-key"),
        Provider::OnDevice | Provider::Whisper | Provider::WhisperTranslate => None,
    }
}

/// Environment-variable fallback name.
fn env_var(provider: Provider) -> Option<&'static str> {
    match provider {
        Provider::Gemini | Provider::GeminiTranscribe => Some("GEMINI_API_KEY"),
        Provider::OpenAi => Some("OPENAI_API_KEY"),
        Provider::Mistral => Some("MISTRAL_API_KEY"),
        Provider::OnDevice | Provider::Whisper | Provider::WhisperTranslate => None,
    }
}

fn label(provider: Provider) -> &'static str {
    match provider {
        Provider::Gemini | Provider::GeminiTranscribe => "Gemini",
        Provider::OpenAi => "OpenAI",
        Provider::Mistral => "Mistral",
        Provider::OnDevice => "Built-in demo",
        Provider::Whisper | Provider::WhisperTranslate => "Whisper",
    }
}

fn entry_in(service: &str, provider: Provider) -> Result<keyring::Entry> {
    let account =
        account(provider).with_context(|| format!("{} needs no API key", label(provider)))?;
    keyring::Entry::new(service, account).context("failed to open OS keychain entry")
}

fn entry(provider: Provider) -> Result<keyring::Entry> {
    entry_in(SERVICE, provider)
}

/// Move a key saved under the pre-1.2.0 service name across, and hand it back.
///
/// Only reached when the current name holds nothing, so a migrated key is written once and
/// never looked for again. An update must not cost the operator their provider key: finding
/// out it is gone happens at the moment they press Start, which is five minutes before an
/// event rather than five days.
fn take_legacy_key(provider: Provider) -> Option<String> {
    let legacy = entry_in(LEGACY_SERVICE, provider).ok()?;
    let key = legacy.get_password().ok()?;
    if key.trim().is_empty() {
        return None;
    }
    // A write that fails leaves the old entry untouched, so the next launch tries again. A
    // delete that fails is not worth surfacing: the key has already moved, and the worst case
    // is a stale duplicate rather than a lost credential.
    entry(provider).ok()?.set_password(&key).ok()?;
    let _ = legacy.delete_credential();
    Some(key)
}

/// Store the provider's key in the OS keychain.
pub fn set_api_key(provider: Provider, key: &str) -> Result<()> {
    let key = key.trim();
    if key.is_empty() {
        anyhow::bail!("API key is empty");
    }
    entry(provider)?
        .set_password(key)
        .context("failed to write key to keychain")?;
    Ok(())
}

/// Remove the provider's key from the keychain (no-op if absent).
pub fn clear_api_key(provider: Provider) -> Result<()> {
    // The legacy entry too, and first: a Remove that left it behind would be undone by the
    // migration on the next launch, which reads as the app refusing to forget a key.
    if let Ok(legacy) = entry_in(LEGACY_SERVICE, provider) {
        let _ = legacy.delete_credential();
    }
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e).context("failed to delete key from keychain"),
    }
}

/// Resolve the provider's key for use: keychain first, then the environment/.env fallback.
pub fn resolve_api_key(provider: Provider) -> Result<String> {
    let Some(env_var) = env_var(provider) else {
        anyhow::bail!("{} needs no API key", label(provider));
    };
    if let Ok(pw) = entry(provider).and_then(|e| e.get_password().map_err(Into::into)) {
        if !pw.trim().is_empty() {
            return Ok(pw);
        }
    }
    if let Some(migrated) = take_legacy_key(provider) {
        return Ok(migrated);
    }
    if let Ok(env_key) = std::env::var(env_var) {
        if !env_key.trim().is_empty() {
            return Ok(env_key);
        }
    }
    anyhow::bail!(
        "No {} API key found. Save one in the operator window or set {}.",
        label(provider),
        env_var
    )
}

/// True once this provider is ready to start a session. Backends that need no credential
/// are always ready, so the operator's Start button is never gated on a key for them.
pub fn has_api_key(provider: Provider) -> bool {
    if !provider.requires_api_key() {
        return true;
    }
    resolve_api_key(provider).is_ok()
}
