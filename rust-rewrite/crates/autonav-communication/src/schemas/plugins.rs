//! Plugin configuration schemas

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use validator::Validate;

/// Complete plugin configuration stored in .claude/plugins.json
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PluginConfig {
    /// Workspace paths for file watching
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub workspaces: Vec<String>,

    /// Slack plugin configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slack: Option<SlackConfig>,

    /// Signal plugin configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<SignalConfig>,

    /// GitHub plugin configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github: Option<GitHubConfig>,

    /// Email plugin configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<EmailConfig>,

    /// File watcher plugin configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_watcher: Option<FileWatcherConfig>,

    /// Additional custom plugins
    #[serde(flatten)]
    pub custom: HashMap<String, serde_json::Value>,
}

/// Slack plugin configuration
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SlackConfig {
    /// Whether the plugin is enabled
    #[serde(default)]
    pub enabled: bool,

    /// Slack workspace name
    #[serde(default)]
    pub workspace: String,

    /// Channels to monitor
    #[serde(default)]
    pub channels: Vec<String>,

    /// Whether to send thread notifications
    #[serde(default = "default_true")]
    pub thread_notifications: bool,

    /// How often to send summaries
    #[serde(default = "default_summary_frequency")]
    pub summary_frequency: SummaryFrequency,

    /// Bot user ID (auto-populated)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bot_user_id: Option<String>,

    /// API token (optional, can use env var)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// Signal plugin configuration
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SignalConfig {
    /// Whether the plugin is enabled
    #[serde(default)]
    pub enabled: bool,

    /// Phone number for Signal
    #[serde(default)]
    pub phone_number: String,

    /// Check-in schedule (cron format or preset)
    #[serde(default = "default_check_in_schedule")]
    pub check_in_schedule: String,

    /// Specific check-in time (HH:MM)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_in_time: Option<String>,

    /// Types of notifications to send
    #[serde(default)]
    pub notification_types: Vec<String>,

    /// Next scheduled check-in (ISO8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_check_in: Option<String>,
}

/// GitHub plugin configuration
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct GitHubConfig {
    /// Whether the plugin is enabled
    #[serde(default)]
    pub enabled: bool,

    /// GitHub API token (optional, can use env var)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,

    /// Repository owner
    #[serde(default)]
    pub owner: String,

    /// Repository name
    #[serde(default)]
    pub repo: String,

    /// Watch for issue events
    #[serde(default)]
    pub watch_issues: bool,

    /// Watch for pull request events
    #[serde(default)]
    pub watch_pull_requests: bool,

    /// Watch for commit events
    #[serde(default)]
    pub watch_commits: bool,

    /// Poll interval in minutes
    #[serde(default = "default_poll_interval")]
    pub poll_interval_minutes: u32,

    /// Additional repositories to watch
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub repositories: Vec<String>,

    /// Issue labels to filter on
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub issue_labels: Vec<String>,

    /// Auto-respond to issues/PRs
    #[serde(default)]
    pub auto_respond: bool,
}

/// Email plugin configuration
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct EmailConfig {
    /// Whether the plugin is enabled
    #[serde(default)]
    pub enabled: bool,

    /// Email addresses to monitor
    #[serde(default)]
    pub addresses: Vec<String>,

    /// Digest frequency
    #[serde(default = "default_digest_frequency")]
    pub digest_frequency: String,
}

/// File watcher plugin configuration
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct FileWatcherConfig {
    /// Whether the plugin is enabled
    #[serde(default)]
    pub enabled: bool,

    /// Paths to watch
    #[serde(default)]
    pub paths: Vec<String>,

    /// Glob patterns to match
    #[serde(default)]
    pub patterns: Vec<String>,

    /// Patterns to ignore
    #[serde(default)]
    pub ignore_patterns: Vec<String>,

    /// Poll interval in milliseconds
    #[serde(default = "default_file_poll_interval")]
    pub poll_interval: u64,
}

/// Summary frequency options
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SummaryFrequency {
    Realtime,
    Hourly,
    #[default]
    Daily,
}

fn default_true() -> bool {
    true
}

fn default_summary_frequency() -> SummaryFrequency {
    SummaryFrequency::Daily
}

fn default_check_in_schedule() -> String {
    "daily".to_string()
}

fn default_poll_interval() -> u32 {
    5
}

fn default_digest_frequency() -> String {
    "weekly".to_string()
}

fn default_file_poll_interval() -> u64 {
    1000
}

impl PluginConfig {
    /// Load configuration from a JSON file
    pub fn from_file(path: impl AsRef<std::path::Path>) -> crate::errors::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: Self = serde_json::from_str(&content)?;
        Ok(config)
    }

    /// Save configuration to a JSON file
    pub fn save(&self, path: impl AsRef<std::path::Path>) -> crate::errors::Result<()> {
        // Ensure parent directory exists
        if let Some(parent) = path.as_ref().parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(path, content)?;
        Ok(())
    }

    /// Get a list of enabled plugin names
    pub fn enabled_plugins(&self) -> Vec<&str> {
        let mut plugins = Vec::new();
        if self.slack.as_ref().map_or(false, |c| c.enabled) {
            plugins.push("slack");
        }
        if self.signal.as_ref().map_or(false, |c| c.enabled) {
            plugins.push("signal");
        }
        if self.github.as_ref().map_or(false, |c| c.enabled) {
            plugins.push("github");
        }
        if self.email.as_ref().map_or(false, |c| c.enabled) {
            plugins.push("email");
        }
        if self.file_watcher.as_ref().map_or(false, |c| c.enabled) {
            plugins.push("file_watcher");
        }
        plugins
    }
}

impl Default for SlackConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            workspace: String::new(),
            channels: Vec::new(),
            thread_notifications: true,
            summary_frequency: SummaryFrequency::Daily,
            bot_user_id: None,
            token: None,
        }
    }
}

impl Default for SignalConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phone_number: String::new(),
            check_in_schedule: "daily".to_string(),
            check_in_time: None,
            notification_types: vec!["urgent".to_string(), "daily-summary".to_string()],
            next_check_in: None,
        }
    }
}

impl Default for GitHubConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            token: None,
            owner: String::new(),
            repo: String::new(),
            watch_issues: false,
            watch_pull_requests: false,
            watch_commits: false,
            poll_interval_minutes: 5,
            repositories: Vec::new(),
            issue_labels: Vec::new(),
            auto_respond: false,
        }
    }
}

impl Default for EmailConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            addresses: Vec::new(),
            digest_frequency: "weekly".to_string(),
        }
    }
}

impl Default for FileWatcherConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            paths: Vec::new(),
            patterns: Vec::new(),
            ignore_patterns: Vec::new(),
            poll_interval: 1000,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_plugin_config() {
        let config = PluginConfig::default();
        assert!(config.slack.is_none());
        assert!(config.github.is_none());
    }

    #[test]
    fn test_enabled_plugins() {
        let mut config = PluginConfig::default();
        config.slack = Some(SlackConfig {
            enabled: true,
            ..Default::default()
        });
        config.github = Some(GitHubConfig {
            enabled: false,
            ..Default::default()
        });

        let enabled = config.enabled_plugins();
        assert_eq!(enabled, vec!["slack"]);
    }

    #[test]
    fn test_serialization() {
        let mut config = PluginConfig::default();
        config.slack = Some(SlackConfig {
            enabled: true,
            channels: vec!["general".to_string()],
            ..Default::default()
        });

        let json = serde_json::to_string(&config).unwrap();
        let parsed: PluginConfig = serde_json::from_str(&json).unwrap();
        assert!(parsed.slack.is_some());
        assert!(parsed.slack.unwrap().enabled);
    }
}
