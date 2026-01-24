//! Knowledge pack metadata schema

use serde::{Deserialize, Serialize};
use validator::Validate;

/// Metadata for a knowledge pack (metadata.json)
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct PackMetadata {
    /// Pack name
    #[validate(length(min = 1, message = "Pack name is required"))]
    pub name: String,

    /// Semantic version
    #[validate(length(min = 1, message = "Version is required"))]
    pub version: String,

    /// Pack description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// List of files included in the pack
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<String>,

    /// Pack author
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,

    /// Repository URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,

    /// License
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,

    /// Keywords for discovery
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keywords: Vec<String>,
}

impl PackMetadata {
    /// Create new pack metadata
    pub fn new(name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            version: version.into(),
            description: None,
            files: Vec::new(),
            author: None,
            repository: None,
            license: None,
            keywords: Vec::new(),
        }
    }

    /// Load metadata from a JSON file
    pub fn from_file(path: impl AsRef<std::path::Path>) -> crate::errors::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let metadata: Self = serde_json::from_str(&content)?;
        Ok(metadata)
    }

    /// Save metadata to a JSON file
    pub fn save(&self, path: impl AsRef<std::path::Path>) -> crate::errors::Result<()> {
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(path, content)?;
        Ok(())
    }
}

/// Pack server health response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackServerHealth {
    pub status: String,
    pub protocol: String,
}

/// Pack versions response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackVersions {
    pub versions: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_metadata() {
        let meta = PackMetadata::new("platform-engineering", "1.0.0");
        assert_eq!(meta.name, "platform-engineering");
        assert_eq!(meta.version, "1.0.0");
    }

    #[test]
    fn test_serialization() {
        let meta = PackMetadata {
            name: "test-pack".to_string(),
            version: "1.0.0".to_string(),
            description: Some("A test pack".to_string()),
            files: vec!["README.md".to_string()],
            author: None,
            repository: None,
            license: None,
            keywords: vec!["test".to_string()],
        };

        let json = serde_json::to_string(&meta).unwrap();
        let parsed: PackMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "test-pack");
        assert_eq!(parsed.keywords, vec!["test"]);
    }
}
