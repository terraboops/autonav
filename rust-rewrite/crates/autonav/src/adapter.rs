//! Claude API adapter for navigator queries

use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use autonav_communication::{NavigatorResponse, Source};

use crate::errors::{AutonavError, Result};
use crate::navigator::LoadedNavigator;
use crate::tools::{Tool, ToolCall, ToolResult, SUBMIT_ANSWER_TOOL, SELF_CONFIG_TOOLS};

/// Default Claude model
pub const DEFAULT_MODEL: &str = "claude-sonnet-4-20250514";

/// Default max turns for agentic loop
pub const DEFAULT_MAX_TURNS: u32 = 10;

/// Claude API adapter
pub struct ClaudeAdapter {
    client: Client,
    model: String,
    max_turns: u32,
    api_key: Option<String>,
}

impl ClaudeAdapter {
    /// Create a new adapter with default settings
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            model: DEFAULT_MODEL.to_string(),
            max_turns: DEFAULT_MAX_TURNS,
            api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
        }
    }

    /// Create an adapter with a specific model
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }

    /// Set the max turns for agentic loop
    pub fn with_max_turns(mut self, max_turns: u32) -> Self {
        self.max_turns = max_turns;
        self
    }

    /// Set the API key
    pub fn with_api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    /// Get the API key
    fn api_key(&self) -> Result<String> {
        self.api_key.clone().ok_or_else(|| {
            AutonavError::ClaudeApiError("ANTHROPIC_API_KEY not set".to_string())
        })
    }

    /// Execute a query against a navigator
    pub async fn query(
        &self,
        navigator: &LoadedNavigator,
        question: &str,
        timeout: Option<Duration>,
    ) -> Result<NavigatorResponse> {
        let api_key = self.api_key()?;

        info!("Querying navigator: {}", navigator.name());
        debug!("Question: {}", question);

        // Build the system prompt with grounding rules
        let system_prompt = format!(
            "{}\n\n{}",
            navigator.system_prompt,
            autonav_communication::prompts::GROUNDING_RULES
        );

        // Build the user message with question prompt
        let user_message = autonav_communication::prompts::create_answer_question_prompt(question);

        // Build tools list
        let mut tools = vec![SUBMIT_ANSWER_TOOL.clone()];

        // Add self-config tools if plugins are configured
        if navigator.plugins_config_path.is_some() {
            tools.extend(SELF_CONFIG_TOOLS.iter().cloned());
        }

        // Execute the agentic loop
        let mut messages = vec![Message {
            role: "user".to_string(),
            content: MessageContent::Text(user_message),
        }];

        let mut response: Option<NavigatorResponse> = None;
        let mut turns = 0;

        while turns < self.max_turns && response.is_none() {
            turns += 1;
            debug!("Turn {}/{}", turns, self.max_turns);

            // Call Claude API
            let api_response = self
                .call_api(&api_key, &system_prompt, &messages, &tools, timeout)
                .await?;

            // Process response
            match api_response.stop_reason.as_deref() {
                Some("tool_use") => {
                    // Handle tool calls
                    let tool_results = self.handle_tool_calls(
                        &api_response.content,
                        navigator,
                    ).await?;

                    // Check if submit_answer was called
                    for result in &tool_results {
                        if result.tool_name == "submit_answer" {
                            if let Ok(resp) = serde_json::from_value::<NavigatorResponse>(
                                result.result.clone()
                            ) {
                                response = Some(resp);
                                break;
                            }
                        }
                    }

                    // Add assistant message and tool results to conversation
                    messages.push(Message {
                        role: "assistant".to_string(),
                        content: MessageContent::Blocks(api_response.content),
                    });

                    messages.push(Message {
                        role: "user".to_string(),
                        content: MessageContent::ToolResults(tool_results),
                    });
                }
                Some("end_turn") | None => {
                    // Try to extract response from text
                    if let Some(text) = extract_text(&api_response.content) {
                        // Parse as NavigatorResponse if possible, otherwise create one
                        response = Some(NavigatorResponse::new(
                            question,
                            text,
                            0.5, // Default confidence when not using tool
                        ));
                    }
                    break;
                }
                Some(reason) => {
                    warn!("Unexpected stop reason: {}", reason);
                    break;
                }
            }
        }

        response.ok_or_else(|| {
            AutonavError::QueryError("No response generated".to_string())
        })
    }

    /// Call the Claude API
    async fn call_api(
        &self,
        api_key: &str,
        system_prompt: &str,
        messages: &[Message],
        tools: &[Tool],
        timeout: Option<Duration>,
    ) -> Result<ApiResponse> {
        let request = ApiRequest {
            model: self.model.clone(),
            max_tokens: 4096,
            system: system_prompt.to_string(),
            messages: messages.to_vec(),
            tools: tools.to_vec(),
        };

        let mut builder = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request);

        if let Some(t) = timeout {
            builder = builder.timeout(t);
        }

        let response = builder.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AutonavError::ClaudeApiError(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let api_response: ApiResponse = response.json().await?;
        Ok(api_response)
    }

    /// Handle tool calls from the API response
    async fn handle_tool_calls(
        &self,
        content: &[ContentBlock],
        navigator: &LoadedNavigator,
    ) -> Result<Vec<ToolResult>> {
        let mut results = Vec::new();

        for block in content {
            if let ContentBlock::ToolUse { id, name, input } = block {
                let result = self.execute_tool(name, input, navigator).await?;
                results.push(ToolResult {
                    tool_use_id: id.clone(),
                    tool_name: name.clone(),
                    result,
                });
            }
        }

        Ok(results)
    }

    /// Execute a tool call
    async fn execute_tool(
        &self,
        name: &str,
        input: &serde_json::Value,
        navigator: &LoadedNavigator,
    ) -> Result<serde_json::Value> {
        debug!("Executing tool: {} with input: {:?}", name, input);

        match name {
            "submit_answer" => {
                // Parse and validate the answer
                let answer = input.get("answer")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| AutonavError::ToolError("Missing answer field".to_string()))?;

                let confidence = input.get("confidence")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.5);

                let sources: Vec<Source> = input.get("sources")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_default();

                let response = NavigatorResponse {
                    protocol_version: autonav_communication::PROTOCOL_VERSION.to_string(),
                    query: String::new(), // Will be filled by caller
                    answer: answer.to_string(),
                    sources,
                    confidence,
                    metadata: Default::default(),
                    timestamp: Some(chrono::Utc::now()),
                };

                Ok(serde_json::to_value(response)?)
            }

            "get_plugin_config" => {
                crate::tools::get_plugin_config(input, navigator).await
            }

            "update_plugin_config" => {
                crate::tools::update_plugin_config(input, navigator).await
            }

            _ => Err(AutonavError::ToolError(format!("Unknown tool: {}", name))),
        }
    }
}

impl Default for ClaudeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

/// Extract text from content blocks
fn extract_text(content: &[ContentBlock]) -> Option<String> {
    for block in content {
        if let ContentBlock::Text { text } = block {
            return Some(text.clone());
        }
    }
    None
}

// API types

#[derive(Debug, Serialize)]
struct ApiRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<Message>,
    tools: Vec<Tool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Message {
    role: String,
    content: MessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum MessageContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
    ToolResults(Vec<ToolResult>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
    },
}

#[derive(Debug, Deserialize)]
struct ApiResponse {
    content: Vec<ContentBlock>,
    stop_reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adapter_builder() {
        let adapter = ClaudeAdapter::new()
            .with_model("claude-opus-4-20250514")
            .with_max_turns(5)
            .with_api_key("test-key");

        assert_eq!(adapter.model, "claude-opus-4-20250514");
        assert_eq!(adapter.max_turns, 5);
        assert_eq!(adapter.api_key, Some("test-key".to_string()));
    }

    #[test]
    fn test_extract_text() {
        let content = vec![
            ContentBlock::Text {
                text: "Hello, world!".to_string(),
            },
        ];
        assert_eq!(extract_text(&content), Some("Hello, world!".to_string()));

        let empty: Vec<ContentBlock> = vec![];
        assert_eq!(extract_text(&empty), None);
    }
}
