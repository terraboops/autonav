//! Response validation utilities

use crate::errors::{CommunicationError, Result};
use crate::schemas::{NavigatorResponse, Source};
use std::path::Path;

/// Validate that all sources in a response exist
pub fn validate_sources_exist(
    response: &NavigatorResponse,
    knowledge_base_path: &Path,
) -> Result<()> {
    for source in &response.sources {
        let source_path = knowledge_base_path.join(&source.file);
        if !source_path.exists() {
            return Err(CommunicationError::SourceNotFound(source.file.clone()));
        }
    }
    Ok(())
}

/// Validate confidence meets threshold
pub fn validate_confidence(response: &NavigatorResponse, threshold: f64) -> Result<()> {
    if response.confidence < threshold {
        return Err(CommunicationError::ConfidenceBelowThreshold {
            got: response.confidence,
            expected: threshold,
        });
    }
    Ok(())
}

/// Validate a complete navigator response
pub fn validate_response(
    response: &NavigatorResponse,
    knowledge_base_path: &Path,
    confidence_threshold: Option<f64>,
) -> Result<()> {
    // Validate sources exist
    validate_sources_exist(response, knowledge_base_path)?;

    // Validate confidence if threshold provided
    if let Some(threshold) = confidence_threshold {
        validate_confidence(response, threshold)?;
    }

    Ok(())
}

/// Check if a source reference looks valid (basic sanity check)
pub fn is_valid_source(source: &Source) -> bool {
    // File path should not be empty and should not contain suspicious patterns
    if source.file.is_empty() {
        return false;
    }

    // Prevent path traversal
    if source.file.contains("..") {
        return false;
    }

    // Should be a relative path
    if source.file.starts_with('/') {
        return false;
    }

    true
}

/// Sanitize a file path to prevent path traversal attacks
pub fn sanitize_path(path: &str) -> Option<String> {
    // Remove leading/trailing whitespace
    let path = path.trim();

    // Reject absolute paths
    if path.starts_with('/') || path.starts_with('\\') {
        return None;
    }

    // Reject path traversal
    if path.contains("..") {
        return None;
    }

    // Normalize separators
    let normalized = path.replace('\\', "/");

    // Remove leading ./
    let normalized = normalized.strip_prefix("./").unwrap_or(&normalized);

    Some(normalized.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_validate_sources_exist() {
        let temp_dir = TempDir::new().unwrap();
        let kb_path = temp_dir.path();

        // Create a test file
        std::fs::write(kb_path.join("test.md"), "content").unwrap();

        let response = NavigatorResponse::new("test", "answer", 0.9)
            .with_source("test.md", "section", "relevant");

        assert!(validate_sources_exist(&response, kb_path).is_ok());
    }

    #[test]
    fn test_validate_sources_missing() {
        let temp_dir = TempDir::new().unwrap();
        let kb_path = temp_dir.path();

        let response = NavigatorResponse::new("test", "answer", 0.9)
            .with_source("nonexistent.md", "section", "relevant");

        assert!(validate_sources_exist(&response, kb_path).is_err());
    }

    #[test]
    fn test_validate_confidence() {
        let response = NavigatorResponse::new("test", "answer", 0.75);

        assert!(validate_confidence(&response, 0.5).is_ok());
        assert!(validate_confidence(&response, 0.75).is_ok());
        assert!(validate_confidence(&response, 0.8).is_err());
    }

    #[test]
    fn test_is_valid_source() {
        assert!(is_valid_source(&Source {
            file: "docs/test.md".to_string(),
            section: "section".to_string(),
            relevance: "relevant".to_string(),
        }));

        assert!(!is_valid_source(&Source {
            file: "".to_string(),
            section: "section".to_string(),
            relevance: "relevant".to_string(),
        }));

        assert!(!is_valid_source(&Source {
            file: "../etc/passwd".to_string(),
            section: "section".to_string(),
            relevance: "relevant".to_string(),
        }));

        assert!(!is_valid_source(&Source {
            file: "/etc/passwd".to_string(),
            section: "section".to_string(),
            relevance: "relevant".to_string(),
        }));
    }

    #[test]
    fn test_sanitize_path() {
        assert_eq!(sanitize_path("docs/test.md"), Some("docs/test.md".to_string()));
        assert_eq!(sanitize_path("./docs/test.md"), Some("docs/test.md".to_string()));
        assert_eq!(sanitize_path("docs\\test.md"), Some("docs/test.md".to_string()));
        assert_eq!(sanitize_path("../etc/passwd"), None);
        assert_eq!(sanitize_path("/etc/passwd"), None);
    }
}
