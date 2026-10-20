//! What the providers' protocols share on the wire, so each provider module only spells out
//! what is its own.

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_tungstenite::tungstenite::http::{header::AUTHORIZATION, HeaderValue};

/// A WebSocket handshake authenticated with an `Authorization: Bearer` header, as OpenAI and
/// Mistral both require. `provider` names it in the errors, which the operator reads as the
/// detail of a reconnecting status.
pub fn bearer_request(provider: &str, url: &str, api_key: &str) -> Result<Request> {
    let mut request = url
        .into_client_request()
        .with_context(|| format!("failed to build {provider} request"))?;
    let bearer = HeaderValue::from_str(&format!("Bearer {api_key}"))
        .with_context(|| format!("{provider} API key is not a valid header value"))?;
    request.headers_mut().insert(AUTHORIZATION, bearer);
    Ok(request)
}

/// One provider frame, parsed — or logged and skipped. A frame that does not parse is not worth
/// ending a live session over: the providers add and reshape events without notice, and every
/// field a client reads is optional for the same reason.
pub fn parse_or_log<T: DeserializeOwned>(provider: &str, text: &str) -> Option<T> {
    match serde_json::from_str(text) {
        Ok(message) => Some(message),
        Err(error) => {
            tracing::debug!("unparsed {provider} message: {error} :: {text}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_frame_that_does_not_parse_is_skipped_rather_than_fatal() {
        let parsed: Option<serde_json::Value> = parse_or_log("Test", r#"{"type":"ok"}"#);
        assert_eq!(parsed, Some(serde_json::json!({"type": "ok"})));
        assert_eq!(
            parse_or_log::<serde_json::Value>("Test", "{truncated"),
            None
        );
    }
}
