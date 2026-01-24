//! Navigator response schema

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use validator::Validate;

/// A source reference in a navigator response
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct Source {
    /// Relative path from knowledge base
    #[validate(length(min = 1, message = "File path is required"))]
    pub file: String,

    /// Section/heading reference
    pub section: String,

    /// Why this source is relevant
    pub relevance: String,
}

/// Navigator response from a query
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct NavigatorResponse {
    /// Protocol version used
    #[serde(default = "default_protocol_version")]
    pub protocol_version: String,

    /// Original question
    pub query: String,

    /// Grounded answer with citations
    pub answer: String,

    /// Sources cited in the answer
    #[validate(nested)]
    pub sources: Vec<Source>,

    /// Confidence score (0-1)
    #[validate(range(min = 0.0, max = 1.0))]
    pub confidence: f64,

    /// Additional metadata
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, serde_json::Value>,

    /// Response timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<DateTime<Utc>>,
}

fn default_protocol_version() -> String {
    crate::PROTOCOL_VERSION.to_string()
}

impl NavigatorResponse {
    /// Create a new response
    pub fn new(query: impl Into<String>, answer: impl Into<String>, confidence: f64) -> Self {
        Self {
            protocol_version: default_protocol_version(),
            query: query.into(),
            answer: answer.into(),
            sources: Vec::new(),
            confidence,
            metadata: HashMap::new(),
            timestamp: Some(Utc::now()),
        }
    }

    /// Add a source to the response
    pub fn with_source(mut self, file: impl Into<String>, section: impl Into<String>, relevance: impl Into<String>) -> Self {
        self.sources.push(Source {
            file: file.into(),
            section: section.into(),
            relevance: relevance.into(),
        });
        self
    }

    /// Check if confidence meets a threshold
    pub fn meets_confidence(&self, threshold: f64) -> bool {
        self.confidence >= threshold
    }
}

/// Confidence level thresholds
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfidenceLevel {
    High,
    Medium,
    Low,
}

impl ConfidenceLevel {
    /// Get the minimum confidence value for this level
    pub fn threshold(&self) -> f64 {
        match self {
            ConfidenceLevel::High => 0.8,
            ConfidenceLevel::Medium => 0.5,
            ConfidenceLevel::Low => 0.2,
        }
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "high" => Some(ConfidenceLevel::High),
            "medium" => Some(ConfidenceLevel::Medium),
            "low" => Some(ConfidenceLevel::Low),
            _ => None,
        }
    }
}

impl std::fmt::Display for ConfidenceLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfidenceLevel::High => write!(f, "high"),
            ConfidenceLevel::Medium => write!(f, "medium"),
            ConfidenceLevel::Low => write!(f, "low"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_response() {
        let response = NavigatorResponse::new("How do I deploy?", "Run `make deploy`.", 0.85);
        assert_eq!(response.query, "How do I deploy?");
        assert_eq!(response.confidence, 0.85);
    }

    #[test]
    fn test_with_source() {
        let response = NavigatorResponse::new("test", "answer", 0.9)
            .with_source("docs/deploy.md", "Deployment", "Describes deployment process");
        assert_eq!(response.sources.len(), 1);
        assert_eq!(response.sources[0].file, "docs/deploy.md");
    }

    #[test]
    fn test_confidence_threshold() {
        let response = NavigatorResponse::new("test", "answer", 0.75);
        assert!(response.meets_confidence(0.5));
        assert!(response.meets_confidence(0.75));
        assert!(!response.meets_confidence(0.8));
    }

    #[test]
    fn test_confidence_levels() {
        assert_eq!(ConfidenceLevel::High.threshold(), 0.8);
        assert_eq!(ConfidenceLevel::Medium.threshold(), 0.5);
        assert_eq!(ConfidenceLevel::Low.threshold(), 0.2);
    }
}
