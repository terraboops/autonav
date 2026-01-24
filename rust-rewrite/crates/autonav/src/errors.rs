//! Error types for autonav core

use thiserror::Error;

/// Core autonav errors
#[derive(Error, Debug)]
pub enum AutonavError {
    #[error("Navigator not found: {0}")]
    NavigatorNotFound(String),

    #[error("Invalid navigator: {0}")]
    InvalidNavigator(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Pack installation failed: {0}")]
    PackInstallError(String),

    #[error("Query failed: {0}")]
    QueryError(String),

    #[error("Claude API error: {0}")]
    ClaudeApiError(String),

    #[error("Tool execution error: {0}")]
    ToolError(String),

    #[error("Template error: {0}")]
    TemplateError(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("GitHub error: {0}")]
    GitHubError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("Communication layer error: {0}")]
    CommunicationError(#[from] autonav_communication::CommunicationError),

    #[error("Plugin error: {0}")]
    PluginError(#[from] autonav_plugins::PluginError),
}

pub type Result<T> = std::result::Result<T, AutonavError>;
