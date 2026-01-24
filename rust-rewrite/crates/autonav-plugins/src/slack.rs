//! Slack plugin implementation

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

use autonav_communication::SlackConfig;

use crate::errors::{PluginError, Result};
use crate::plugin::{ActionResult, Plugin, PluginAction, PluginEvent, PluginHealthStatus};

const SLACK_API_BASE: &str = "https://slack.com/api";

/// Slack plugin for sending and receiving messages
pub struct SlackPlugin {
    config: SlackConfig,
    client: Client,
    initialized: bool,
    bot_user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackApiResponse<T> {
    ok: bool,
    error: Option<String>,
    #[serde(flatten)]
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct AuthTestResponse {
    user_id: String,
    user: String,
    team: String,
}

#[derive(Debug, Deserialize)]
struct MessageResponse {
    ts: String,
    channel: String,
}

#[derive(Debug, Serialize)]
struct PostMessageRequest {
    channel: String,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    thread_ts: Option<String>,
}

#[derive(Debug, Serialize)]
struct UpdateMessageRequest {
    channel: String,
    ts: String,
    text: String,
}

#[derive(Debug, Serialize)]
struct AddReactionRequest {
    channel: String,
    timestamp: String,
    name: String,
}

impl SlackPlugin {
    /// Create a new Slack plugin
    pub fn new(config: SlackConfig) -> Self {
        Self {
            config,
            client: Client::new(),
            initialized: false,
            bot_user_id: None,
        }
    }

    /// Get the API token from config or environment
    fn get_token(&self) -> Result<String> {
        if let Some(token) = &self.config.token {
            return Ok(token.clone());
        }

        std::env::var("SLACK_BOT_TOKEN").map_err(|_| {
            PluginError::AuthError("SLACK_BOT_TOKEN not set and no token in config".to_string())
        })
    }

    /// Make an authenticated API request
    async fn api_request<T: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        body: Option<impl Serialize>,
    ) -> Result<T> {
        let token = self.get_token()?;
        let url = format!("{}/{}", SLACK_API_BASE, method);

        let mut request = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json; charset=utf-8");

        if let Some(body) = body {
            request = request.json(&body);
        }

        let response = request.send().await?;

        let api_response: SlackApiResponse<T> = response.json().await?;

        if !api_response.ok {
            let error = api_response.error.unwrap_or_else(|| "Unknown error".to_string());
            if error == "ratelimited" {
                return Err(PluginError::RateLimited);
            }
            return Err(PluginError::ActionFailed(error));
        }

        api_response.data.ok_or_else(|| {
            PluginError::ActionFailed("No data in response".to_string())
        })
    }
}

#[async_trait]
impl Plugin for SlackPlugin {
    fn name(&self) -> &'static str {
        "slack"
    }

    fn version(&self) -> &'static str {
        "2.0.0"
    }

    fn description(&self) -> &'static str {
        "Slack integration for sending and receiving messages"
    }

    fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    async fn initialize(&mut self) -> Result<()> {
        if !self.config.enabled {
            debug!("Slack plugin is disabled, skipping initialization");
            return Ok(());
        }

        info!("Initializing Slack plugin");

        // Test authentication
        let auth: AuthTestResponse = self
            .api_request("auth.test", None::<()>)
            .await
            .map_err(|e| PluginError::InitializationFailed(format!("Auth test failed: {}", e)))?;

        self.bot_user_id = Some(auth.user_id.clone());
        info!(
            "Slack authenticated as {} in team {}",
            auth.user, auth.team
        );

        self.initialized = true;
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Shutting down Slack plugin");
        self.initialized = false;
        Ok(())
    }

    async fn listen(&mut self) -> Result<Vec<PluginEvent>> {
        // Note: Full implementation would use Slack Events API or Socket Mode
        // For now, this is a placeholder that returns no events
        // Real implementation would need webhook server or socket connection
        Ok(Vec::new())
    }

    async fn execute(&mut self, action: PluginAction) -> Result<ActionResult> {
        match action {
            PluginAction::SlackSendMessage {
                channel,
                text,
                thread_ts,
            } => {
                let request = PostMessageRequest {
                    channel,
                    text,
                    thread_ts,
                };

                let response: MessageResponse =
                    self.api_request("chat.postMessage", Some(&request)).await?;

                Ok(ActionResult::success(Some(serde_json::json!({
                    "ts": response.ts,
                    "channel": response.channel
                }))))
            }

            PluginAction::SlackUpdateMessage {
                channel,
                timestamp,
                text,
            } => {
                let request = UpdateMessageRequest {
                    channel,
                    ts: timestamp,
                    text,
                };

                let response: MessageResponse =
                    self.api_request("chat.update", Some(&request)).await?;

                Ok(ActionResult::success(Some(serde_json::json!({
                    "ts": response.ts,
                    "channel": response.channel
                }))))
            }

            PluginAction::SlackAddReaction {
                channel,
                timestamp,
                reaction,
            } => {
                let request = AddReactionRequest {
                    channel,
                    timestamp,
                    name: reaction,
                };

                self.api_request::<serde_json::Value>("reactions.add", Some(&request))
                    .await?;

                Ok(ActionResult::success(None))
            }

            _ => Err(PluginError::ActionFailed(
                "Action not supported by Slack plugin".to_string(),
            )),
        }
    }

    async fn health_check(&self) -> PluginHealthStatus {
        if !self.config.enabled {
            return PluginHealthStatus::unhealthy("Plugin is disabled");
        }

        if !self.initialized {
            return PluginHealthStatus::unhealthy("Plugin not initialized");
        }

        // Try auth test
        match self.api_request::<AuthTestResponse>("auth.test", None::<()>).await {
            Ok(_) => PluginHealthStatus::healthy(),
            Err(e) => PluginHealthStatus::unhealthy(format!("Health check failed: {}", e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_plugin() {
        let config = SlackConfig::default();
        let plugin = SlackPlugin::new(config);
        assert_eq!(plugin.name(), "slack");
        assert!(!plugin.is_enabled());
    }

    #[test]
    fn test_enabled_plugin() {
        let config = SlackConfig {
            enabled: true,
            ..Default::default()
        };
        let plugin = SlackPlugin::new(config);
        assert!(plugin.is_enabled());
    }
}
