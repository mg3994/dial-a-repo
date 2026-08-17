use crate::tools::ToolsHandler;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info};

pub struct XaiClient {
    api_key: String,
    tools: ToolsHandler,
}

impl XaiClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            tools: ToolsHandler::new(),
        }
    }

    pub async fn run_session(&self, call_id: String) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let ws_url = format!("wss://api.x.ai/v1/realtime?call_id={}", urlencoding::encode(&call_id));
        let request = http::Request::builder()
            .uri(&ws_url)
            .header("Authorization", format!("Bearer {}", &self.api_key))
            .header("Host", "api.x.ai")
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Sec-WebSocket-Version", "13")
            .header("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
            .body(())?;

        let (ws_stream, _) = connect_async(request).await?;
        info!("WebSocket connected for call_id={}", call_id);

        let (mut write, mut read) = ws_stream.split();

        let session_update = json!({
            "type": "session.update",
            "session": {
                "voice": "celeste",
                "instructions": "You are Dial-a-Repo Rust edition. Keep responses concise.",
                "turn_detection": { "type": "server_vad" },
                "tools": [{
                    "type": "function",
                    "name": "load_repo",
                    "description": "Fetch real data about a public GitHub repo.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "repo": { "type": "string", "description": "owner/repo or project name" }
                        },
                        "required": ["repo"]
                    }
                }]
            }
        });
        write.send(Message::Text(session_update.to_string())).await?;

        let greeting = json!({
            "type": "conversation.item.create",
            "item": {
                "type": "force_message",
                "role": "assistant",
                "content": [{ "type": "output_text", "text": "Hi from Rust Dial-a-Repo! Name any GitHub repo." }]
            }
        });
        write.send(Message::Text(greeting.to_string())).await?;

        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(evt) = serde_json::from_str::<Value>(&text) {
                        if evt["type"] == "response.function_call_arguments.done" {
                            let fn_name = evt["name"].as_str().unwrap_or_default();
                            let fn_call_id = evt["call_id"].as_str().unwrap_or_default();
                            let args_str = evt["arguments"].as_str().unwrap_or("{}");

                            info!("Tool call triggered: name={}, call_id={}", fn_name, fn_call_id);

                            let output = if fn_name == "load_repo" {
                                let args: Value = serde_json::from_str(args_str).unwrap_or_default();
                                let repo_input = args["repo"].as_str().unwrap_or("");
                                match self.tools.load_repo(repo_input).await {
                                    Ok(info) => serde_json::to_string(&info).unwrap_or_default(),
                                    Err(err) => json!({ "error": err }).to_string(),
                                }
                            } else {
                                json!({ "error": "Unknown tool" }).to_string()
                            };

                            let output_item = json!({
                                "type": "conversation.item.create",
                                "item": {
                                    "type": "function_call_output",
                                    "call_id": fn_call_id,
                                    "output": output
                                }
                            });
                            write.send(Message::Text(output_item.to_string())).await?;
                            write.send(Message::Text(json!({ "type": "response.create" }).to_string())).await?;
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("WebSocket closed for call_id={}", call_id);
                    break;
                }
                Err(e) => {
                    error!("WebSocket error: {:?}", e);
                    break;
                }
                _ => {}
            }
        }

        Ok(())
    }
}
