//! Plugin error types

use thiserror::Error;

/// Errors that can occur in the plugin system
#[derive(Error, Debug)]
pub enum PluginError {
    #[error("Plugin not found: {0}")]
    NotFound(String),

    #[error("Plugin initialization failed: {0}")]
    InitializationFailed(String),

    #[error("Plugin action failed: {0}")]
    ActionFailed(String),

    #[error("Plugin configuration error: {0}")]
    ConfigError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Authentication failed: {0}")]
    AuthError(String),

    #[error("Rate limited")]
    RateLimited,

    #[error("Plugin not enabled: {0}")]
    NotEnabled(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    HttpError(#[from] reqwest::Error),
}

pub type Result<T> = std::result::Result<T, PluginError>;
