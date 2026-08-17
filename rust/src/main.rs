mod sip_engine;
mod tools;
mod webhook;
mod xai_client;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tracing::info;
use webhook::{verify_signature, WebhookHeaders};
use xai_client::XaiClient;

#[derive(Clone)]
struct AppState {
    xai_api_key: String,
    xai_webhook_secret: String,
}

#[derive(Deserialize)]
struct IncomingCallEvent {
    #[serde(rename = "type")]
    event_type: String,
    data: CallData,
}

#[derive(Deserialize)]
struct CallData {
    call_id: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let xai_api_key = std::env::var("XAI_API_KEY").unwrap_or_else(|_| "test_key".to_string());
    let xai_webhook_secret = std::env::var("XAI_WEBHOOK_SECRET").unwrap_or_else(|_| "test_secret".to_string());

    let state = Arc::new(AppState {
        xai_api_key,
        xai_webhook_secret,
    });

    tokio::spawn(async move {
        if let Ok(sip_engine) = sip_engine::SipEngine::bind("0.0.0.0:5060").await {
            if let Err(e) = sip_engine.run_loop().await {
                eprintln!("SIP Engine error: {:?}", e);
            }
        }
    });

    let app = Router::new()
        .route("/", get(landing_page))
        .route("/xai/incoming", post(handle_incoming_webhook))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("Rust Axum server listening on http://0.0.0.0:3000");

    axum::serve(listener, app).await?;
    Ok(())
}

async fn landing_page() -> &'static str {
    "Dial-a-Repo Rust Edition\n\nVoice Agent & Telephony Engine running on Tokio + Axum."
}

async fn handle_incoming_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
) -> impl IntoResponse {
    let webhook_headers = WebhookHeaders {
        id: headers.get("webhook-id").and_then(|v| v.to_str().ok()),
        timestamp: headers.get("webhook-timestamp").and_then(|v| v.to_str().ok()),
        signature: headers.get("webhook-signature").and_then(|v| v.to_str().ok()),
    };

    if !verify_signature(&body, webhook_headers, &state.xai_webhook_secret) {
        return (StatusCode::UNAUTHORIZED, "Invalid signature");
    }

    if let Ok(evt) = serde_json::from_str::<IncomingCallEvent>(&body) {
        if evt.event_type == "realtime.call.incoming" {
            let call_id = evt.data.call_id.clone();
            let api_key = state.xai_api_key.clone();

            tokio::spawn(async move {
                let client = XaiClient::new(api_key);
                if let Err(e) = client.run_session(call_id.clone()).await {
                    eprintln!("Call session error for call_id={}: {:?}", call_id, e);
                }
            });
        }
    }

    (StatusCode::OK, "ok")
}
