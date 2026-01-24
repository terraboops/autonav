//! Navigator configuration schema (config.json)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use validator::Validate;

/// Navigator configuration stored in config.json
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct NavigatorConfig {
    /// Semantic version of this navigator
    #[validate(length(min = 1, message = "Version is required"))]
    pub version: String,

    /// Navigator name (kebab-case, 1-50 chars)
    #[validate(length(min = 1, max = 50), custom(function = "validate_kebab_case"))]
    pub name: String,

    /// Purpose description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Protocol version range (e.g., "^1.0.0")
    #[serde(default = "default_communication_layer_version")]
    pub communication_layer_version: String,

    /// SDK adapter version range
    #[serde(default = "default_sdk_adapter_version")]
    pub sdk_adapter_version: String,

    /// Path to knowledge base directory
    #[serde(default = "default_knowledge_base_path")]
    pub knowledge_base_path: String,

    /// Path to CLAUDE.md instructions file
    #[serde(default = "default_instructions_path")]
    pub instructions_path: String,

    /// Creation timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,

    /// Last update timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<DateTime<Utc>>,

    /// Extensible metadata
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, serde_json::Value>,

    /// Knowledge pack metadata if installed from a pack
    #[serde(skip_serializing_if = "Option::is_none")]
    pub knowledge_pack: Option<KnowledgePackRef>,

    /// Minimum confidence threshold for responses
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(range(min = 0.0, max = 1.0))]
    pub confidence_threshold: Option<f64>,

    /// Plugin configuration reference
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugins: Option<PluginsRef>,
}

/// Reference to a knowledge pack
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgePackRef {
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Plugin configuration reference
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginsRef {
    /// Path to plugins.json config file
    #[serde(default = "default_plugins_config_file")]
    pub config_file: String,
}

fn default_communication_layer_version() -> String {
    "^1.0.0".to_string()
}

fn default_sdk_adapter_version() -> String {
    "^1.0.0".to_string()
}

fn default_knowledge_base_path() -> String {
    "knowledge-base".to_string()
}

fn default_instructions_path() -> String {
    "CLAUDE.md".to_string()
}

fn default_plugins_config_file() -> String {
    ".claude/plugins.json".to_string()
}

/// Validate that a string is in kebab-case
fn validate_kebab_case(name: &str) -> Result<(), validator::ValidationError> {
    let kebab_case_re = regex::Regex::new(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$").unwrap();
    if kebab_case_re.is_match(name) {
        Ok(())
    } else {
        let mut err = validator::ValidationError::new("kebab_case");
        err.message = Some("Name must be in kebab-case (e.g., my-navigator)".into());
        Err(err)
    }
}

impl Default for NavigatorConfig {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            name: "unnamed-navigator".to_string(),
            description: None,
            communication_layer_version: default_communication_layer_version(),
            sdk_adapter_version: default_sdk_adapter_version(),
            knowledge_base_path: default_knowledge_base_path(),
            instructions_path: default_instructions_path(),
            created_at: Some(Utc::now()),
            updated_at: None,
            metadata: HashMap::new(),
            knowledge_pack: None,
            confidence_threshold: None,
            plugins: Some(PluginsRef {
                config_file: default_plugins_config_file(),
            }),
        }
    }
}

impl NavigatorConfig {
    /// Create a new NavigatorConfig with the given name
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            ..Default::default()
        }
    }

    /// Load configuration from a JSON file
    pub fn from_file(path: impl AsRef<std::path::Path>) -> crate::errors::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: Self = serde_json::from_str(&content)?;
        Ok(config)
    }

    /// Save configuration to a JSON file
    pub fn save(&self, path: impl AsRef<std::path::Path>) -> crate::errors::Result<()> {
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(path, content)?;
        Ok(())
    }

    /// Update the updated_at timestamp
    pub fn touch(&mut self) {
        self.updated_at = Some(Utc::now());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = NavigatorConfig::default();
        assert_eq!(config.version, "1.0.0");
        assert_eq!(config.knowledge_base_path, "knowledge-base");
        assert_eq!(config.instructions_path, "CLAUDE.md");
    }

    #[test]
    fn test_new_config() {
        let config = NavigatorConfig::new("my-navigator");
        assert_eq!(config.name, "my-navigator");
    }

    #[test]
    fn test_kebab_case_validation() {
        assert!(validate_kebab_case("my-navigator").is_ok());
        assert!(validate_kebab_case("nav").is_ok());
        assert!(validate_kebab_case("my-cool-nav-2").is_ok());
        assert!(validate_kebab_case("MyNavigator").is_err());
        assert!(validate_kebab_case("my_navigator").is_err());
        assert!(validate_kebab_case("123nav").is_err());
    }

    #[test]
    fn test_serialization() {
        let config = NavigatorConfig::new("test-nav");
        let json = serde_json::to_string(&config).unwrap();
        let parsed: NavigatorConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "test-nav");
    }
}
