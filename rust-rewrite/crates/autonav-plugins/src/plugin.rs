//! Core plugin trait and types

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::errors::Result;

/// Health status of a plugin
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginHealthStatus {
    pub healthy: bool,
    pub message: Option<String>,
    pub last_check: DateTime<Utc>,
}

impl PluginHealthStatus {
    pub fn healthy() -> Self {
        Self {
            healthy: true,
            message: None,
            last_check: Utc::now(),
        }
    }

    pub fn unhealthy(message: impl Into<String>) -> Self {
        Self {
            healthy: false,
            message: Some(message.into()),
            last_check: Utc::now(),
        }
    }
}

/// An event received from a plugin
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PluginEvent {
    /// Slack events
    SlackMessage {
        channel: String,
        user: String,
        text: String,
        ts: String,
        thread_ts: Option<String>,
    },
    SlackMention {
        channel: String,
        user: String,
        text: String,
        ts: String,
    },
    SlackReaction {
        channel: String,
        user: String,
        reaction: String,
        item_ts: String,
    },

    /// GitHub events
    GitHubIssue {
        owner: String,
        repo: String,
        number: u64,
        title: String,
        body: Option<String>,
        action: String,
    },
    GitHubPullRequest {
        owner: String,
        repo: String,
        number: u64,
        title: String,
        body: Option<String>,
        action: String,
    },
    GitHubComment {
        owner: String,
        repo: String,
        issue_number: u64,
        body: String,
        user: String,
    },

    /// File watcher events
    FileAdded {
        path: String,
    },
    FileChanged {
        path: String,
    },
    FileRemoved {
        path: String,
    },
}

impl PluginEvent {
    /// Get the plugin name this event is from
    pub fn plugin_name(&self) -> &'static str {
        match self {
            PluginEvent::SlackMessage { .. }
            | PluginEvent::SlackMention { .. }
            | PluginEvent::SlackReaction { .. } => "slack",
            PluginEvent::GitHubIssue { .. }
            | PluginEvent::GitHubPullRequest { .. }
            | PluginEvent::GitHubComment { .. } => "github",
            PluginEvent::FileAdded { .. }
            | PluginEvent::FileChanged { .. }
            | PluginEvent::FileRemoved { .. } => "file_watcher",
        }
    }
}

/// An action to execute via a plugin
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PluginAction {
    /// Slack actions
    SlackSendMessage {
        channel: String,
        text: String,
        thread_ts: Option<String>,
    },
    SlackAddReaction {
        channel: String,
        timestamp: String,
        reaction: String,
    },
    SlackUpdateMessage {
        channel: String,
        timestamp: String,
        text: String,
    },

    /// GitHub actions
    GitHubCreateIssue {
        owner: String,
        repo: String,
        title: String,
        body: Option<String>,
        labels: Vec<String>,
    },
    GitHubCommentIssue {
        owner: String,
        repo: String,
        issue_number: u64,
        body: String,
    },
    GitHubCloseIssue {
        owner: String,
        repo: String,
        issue_number: u64,
    },
    GitHubCreatePr {
        owner: String,
        repo: String,
        title: String,
        body: Option<String>,
        head: String,
        base: String,
    },
    GitHubCommentPr {
        owner: String,
        repo: String,
        pr_number: u64,
        body: String,
    },
    GitHubMergePr {
        owner: String,
        repo: String,
        pr_number: u64,
    },
    GitHubAddLabel {
        owner: String,
        repo: String,
        issue_number: u64,
        label: String,
    },

    /// File watcher actions
    FileWatcherRefresh,
    FileWatcherClear,
}

impl PluginAction {
    /// Get the plugin name this action is for
    pub fn plugin_name(&self) -> &'static str {
        match self {
            PluginAction::SlackSendMessage { .. }
            | PluginAction::SlackAddReaction { .. }
            | PluginAction::SlackUpdateMessage { .. } => "slack",
            PluginAction::GitHubCreateIssue { .. }
            | PluginAction::GitHubCommentIssue { .. }
            | PluginAction::GitHubCloseIssue { .. }
            | PluginAction::GitHubCreatePr { .. }
            | PluginAction::GitHubCommentPr { .. }
            | PluginAction::GitHubMergePr { .. }
            | PluginAction::GitHubAddLabel { .. } => "github",
            PluginAction::FileWatcherRefresh | PluginAction::FileWatcherClear => "file_watcher",
        }
    }
}

/// Result of executing a plugin action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl ActionResult {
    pub fn success(data: Option<serde_json::Value>) -> Self {
        Self {
            success: true,
            data,
            error: None,
        }
    }

    pub fn failure(error: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error.into()),
        }
    }
}

/// Trait for plugin implementations
#[async_trait]
pub trait Plugin: Send + Sync {
    /// Get the plugin name
    fn name(&self) -> &'static str;

    /// Get the plugin version
    fn version(&self) -> &'static str;

    /// Get a description of what this plugin does
    fn description(&self) -> &'static str;

    /// Check if the plugin is enabled
    fn is_enabled(&self) -> bool;

    /// Initialize the plugin with its configuration
    async fn initialize(&mut self) -> Result<()>;

    /// Shut down the plugin cleanly
    async fn shutdown(&mut self) -> Result<()>;

    /// Poll for events from this plugin
    async fn listen(&mut self) -> Result<Vec<PluginEvent>>;

    /// Execute an action through this plugin
    async fn execute(&mut self, action: PluginAction) -> Result<ActionResult>;

    /// Check plugin health
    async fn health_check(&self) -> PluginHealthStatus;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plugin_event_names() {
        let event = PluginEvent::SlackMessage {
            channel: "general".to_string(),
            user: "user1".to_string(),
            text: "hello".to_string(),
            ts: "123".to_string(),
            thread_ts: None,
        };
        assert_eq!(event.plugin_name(), "slack");

        let event = PluginEvent::GitHubIssue {
            owner: "owner".to_string(),
            repo: "repo".to_string(),
            number: 1,
            title: "title".to_string(),
            body: None,
            action: "opened".to_string(),
        };
        assert_eq!(event.plugin_name(), "github");
    }

    #[test]
    fn test_action_result() {
        let success = ActionResult::success(Some(serde_json::json!({"id": 123})));
        assert!(success.success);
        assert!(success.data.is_some());

        let failure = ActionResult::failure("Something went wrong");
        assert!(!failure.success);
        assert_eq!(failure.error, Some("Something went wrong".to_string()));
    }

    #[test]
    fn test_health_status() {
        let healthy = PluginHealthStatus::healthy();
        assert!(healthy.healthy);

        let unhealthy = PluginHealthStatus::unhealthy("Connection failed");
        assert!(!unhealthy.healthy);
        assert_eq!(unhealthy.message, Some("Connection failed".to_string()));
    }
}
