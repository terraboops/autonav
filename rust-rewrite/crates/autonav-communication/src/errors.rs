//! Error types for the communication layer

use thiserror::Error;

/// Errors that can occur in the communication layer
#[derive(Error, Debug)]
pub enum CommunicationError {
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Schema validation failed: {0}")]
    ValidationError(String),

    #[error("Source file not found: {0}")]
    SourceNotFound(String),

    #[error("Confidence threshold not met: got {got}, expected at least {expected}")]
    ConfidenceBelowThreshold { got: f64, expected: f64 },

    #[error("Protocol version mismatch: expected {expected}, got {got}")]
    ProtocolVersionMismatch { expected: String, got: String },

    #[error("Missing required field: {0}")]
    MissingField(String),

    #[error("Invalid JSON: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, CommunicationError>;
