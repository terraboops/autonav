//! Tool definitions and implementations for navigator self-configuration

use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{debug, info};

use autonav_communication::PluginConfig;

use crate::errors::{AutonavError, Result};
use crate::navigator::LoadedNavigator;

/// Tool definition for Claude API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// Tool call from Claude
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
}

/// Result of a tool execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_use_id: String,
    pub tool_name: String,
    pub result: serde_json::Value,
}

/// The submit_answer tool for structured responses
pub static SUBMIT_ANSWER_TOOL: once_cell::sync::Lazy<Tool> = once_cell::sync::Lazy::new(|| Tool {
    name: "submit_answer".to_string(),
    description: "Submit a grounded answer with sources and confidence score".to_string(),
    input_schema: json!({
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "description": "The grounded answer with citations"
            },
            "sources": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "file": {
                            "type": "string",
                            "description": "Relative path to source file"
                        },
                        "section": {
                            "type": "string",
                            "description": "Section or heading reference"
                        },
                        "relevance": {
                            "type": "string",
                            "description": "Why this source is relevant"
                        }
                    },
                    "required": ["file", "section", "relevance"]
                },
                "description": "Sources cited in the answer"
            },
            "confidence": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
                "description": "Confidence score (0-1)"
            }
        },
        "required": ["answer", "sources", "confidence"]
    }),
});

/// Self-configuration tools
pub static SELF_CONFIG_TOOLS: once_cell::sync::Lazy<Vec<Tool>> = once_cell::sync::Lazy::new(|| {
    vec![
        Tool {
            name: "get_plugin_config".to_string(),
            description: "Get current plugin configuration".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "plugin": {
                        "type": "string",
                        "enum": ["slack", "signal", "github", "email", "file_watcher", "all"],
                        "description": "Plugin name or 'all' for all plugins"
                    }
                },
                "required": ["plugin"]
            }),
        },
        Tool {
            name: "update_plugin_config".to_string(),
            description: "Update plugin configuration".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "plugin": {
                        "type": "string",
                        "enum": ["slack", "signal", "github", "email", "file_watcher"],
                        "description": "Plugin to update"
                    },
                    "updates": {
                        "type": "object",
                        "description": "Configuration updates to apply"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Reason for the update (for audit trail)"
                    }
                },
                "required": ["plugin", "updates", "reason"]
            }),
        },
    ]
});

/// Get plugin configuration
pub async fn get_plugin_config(
    input: &serde_json::Value,
    navigator: &LoadedNavigator,
) -> Result<serde_json::Value> {
    let plugin = input
        .get("plugin")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AutonavError::ToolError("Missing plugin field".to_string()))?;

    let config_path = navigator
        .plugins_config_path
        .as_ref()
        .ok_or_else(|| AutonavError::ToolError("No plugins config path".to_string()))?;

    let config = if config_path.exists() {
        PluginConfig::from_file(config_path).map_err(|e| {
            AutonavError::ToolError(format!("Failed to load config: {}", e))
        })?
    } else {
        PluginConfig::default()
    };

    debug!("Getting config for plugin: {}", plugin);

    let result = match plugin {
        "all" => serde_json::to_value(&config)?,
        "slack" => serde_json::to_value(&config.slack)?,
        "signal" => serde_json::to_value(&config.signal)?,
        "github" => serde_json::to_value(&config.github)?,
        "email" => serde_json::to_value(&config.email)?,
        "file_watcher" => serde_json::to_value(&config.file_watcher)?,
        _ => return Err(AutonavError::ToolError(format!("Unknown plugin: {}", plugin))),
    };

    Ok(json!({
        "success": true,
        "config": result
    }))
}

/// Update plugin configuration
pub async fn update_plugin_config(
    input: &serde_json::Value,
    navigator: &LoadedNavigator,
) -> Result<serde_json::Value> {
    let plugin = input
        .get("plugin")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AutonavError::ToolError("Missing plugin field".to_string()))?;

    let updates = input
        .get("updates")
        .ok_or_else(|| AutonavError::ToolError("Missing updates field".to_string()))?;

    let reason = input
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("No reason provided");

    let config_path = navigator
        .plugins_config_path
        .as_ref()
        .ok_or_else(|| AutonavError::ToolError("No plugins config path".to_string()))?;

    // Load existing config or create default
    let mut config = if config_path.exists() {
        PluginConfig::from_file(config_path).map_err(|e| {
            AutonavError::ToolError(format!("Failed to load config: {}", e))
        })?
    } else {
        PluginConfig::default()
    };

    info!("Updating {} config: {}", plugin, reason);
    debug!("Updates: {:?}", updates);

    // Apply updates to the appropriate plugin
    match plugin {
        "slack" => {
            let mut current = config.slack.unwrap_or_default();
            merge_json(&mut serde_json::to_value(&mut current)?, updates)?;
            config.slack = Some(serde_json::from_value(serde_json::to_value(&current)?)?);
        }
        "signal" => {
            let mut current = config.signal.unwrap_or_default();
            merge_json(&mut serde_json::to_value(&mut current)?, updates)?;
            config.signal = Some(serde_json::from_value(serde_json::to_value(&current)?)?);
        }
        "github" => {
            let mut current = config.github.unwrap_or_default();
            merge_json(&mut serde_json::to_value(&mut current)?, updates)?;
            config.github = Some(serde_json::from_value(serde_json::to_value(&current)?)?);
        }
        "email" => {
            let mut current = config.email.unwrap_or_default();
            merge_json(&mut serde_json::to_value(&mut current)?, updates)?;
            config.email = Some(serde_json::from_value(serde_json::to_value(&current)?)?);
        }
        "file_watcher" => {
            let mut current = config.file_watcher.unwrap_or_default();
            merge_json(&mut serde_json::to_value(&mut current)?, updates)?;
            config.file_watcher = Some(serde_json::from_value(serde_json::to_value(&current)?)?);
        }
        _ => return Err(AutonavError::ToolError(format!("Unknown plugin: {}", plugin))),
    }

    // Save updated config
    config.save(config_path).map_err(|e| {
        AutonavError::ToolError(format!("Failed to save config: {}", e))
    })?;

    Ok(json!({
        "success": true,
        "message": format!("Updated {} configuration", plugin),
        "reason": reason
    }))
}

/// Merge JSON objects (shallow)
fn merge_json(target: &mut serde_json::Value, source: &serde_json::Value) -> Result<()> {
    if let (Some(target_obj), Some(source_obj)) = (target.as_object_mut(), source.as_object()) {
        for (key, value) in source_obj {
            target_obj.insert(key.clone(), value.clone());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_submit_answer_tool() {
        let tool = &*SUBMIT_ANSWER_TOOL;
        assert_eq!(tool.name, "submit_answer");
        assert!(tool.input_schema.get("properties").is_some());
    }

    #[test]
    fn test_self_config_tools() {
        let tools = &*SELF_CONFIG_TOOLS;
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].name, "get_plugin_config");
        assert_eq!(tools[1].name, "update_plugin_config");
    }

    #[test]
    fn test_merge_json() {
        let mut target = json!({"a": 1, "b": 2});
        let source = json!({"b": 3, "c": 4});
        merge_json(&mut target, &source).unwrap();
        assert_eq!(target, json!({"a": 1, "b": 3, "c": 4}));
    }
}
