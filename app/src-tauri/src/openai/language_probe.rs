//! Opt-in endpoint verification. Uses the app's normal credential resolution; never logs keys.
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message},
};

#[tokio::test]
#[ignore = "contacts OpenAI using the saved credential; run explicitly with --ignored --nocapture"]
async fn probe_target_language_codes() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let key = crate::secrets::resolve_api_key(crate::types::Provider::OpenAi)?;
    let mut accepted = Vec::new();
    for code in [
        "en", "es", "pt", "pt-BR", "pt-PT", "fr", "ja", "ru", "zh", "zh-Hans", "zh-Hant", "de",
        "ko", "hi", "id", "vi", "it",
    ] {
        let mut request =
            "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate"
                .into_client_request()?;
        request
            .headers_mut()
            .insert("Authorization", format!("Bearer {key}").parse()?);
        let (mut socket, _) =
            tokio::time::timeout(std::time::Duration::from_secs(20), connect_async(request))
                .await??;
        socket
            .send(Message::Text(
                serde_json::to_string(&super::protocol::SessionUpdate::translate(
                    code,
                    super::DEFAULT_OPENAI_TRANSCRIBE_MODEL,
                ))?
                .into(),
            ))
            .await?;
        let verdict = tokio::time::timeout(std::time::Duration::from_secs(15), async {
            while let Some(message) = socket.next().await {
                if let Message::Text(text) = message? {
                    let event: serde_json::Value = serde_json::from_str(&text)?;
                    match event["type"].as_str() {
                        Some("session.updated") => {
                            return Ok::<_, anyhow::Error>(format!(
                                "accepted: {}",
                                event["session"]["audio"]["output"]["language"]
                            ))
                        }
                        Some("error") => {
                            return Ok(format!("rejected: {}", event["error"]["message"]))
                        }
                        _ => {}
                    }
                }
            }
            anyhow::bail!("connection closed before verdict")
        })
        .await??;
        println!("{code}: {verdict}");
        if verdict.starts_with("accepted:") {
            accepted.push(code);
        }
        let _ = socket.close(None).await;
    }
    let catalog: serde_json::Value =
        serde_json::from_str(include_str!("../../../src/lib/languages.json"))?;
    for row in catalog["languages"].as_array().unwrap() {
        if row["providers"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p == "openai")
        {
            anyhow::ensure!(
                accepted.contains(&row["code"].as_str().unwrap()),
                "catalog target {} was not accepted",
                row["code"]
            );
        }
    }
    Ok(())
}
