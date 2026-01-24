//! Query engine for navigator interactions

use std::time::Duration;

use autonav_communication::{ConfidenceLevel, NavigatorResponse};
use tracing::{debug, info};

use crate::adapter::ClaudeAdapter;
use crate::errors::{AutonavError, Result};
use crate::navigator::LoadedNavigator;

/// Query options
#[derive(Debug, Clone, Default)]
pub struct QueryOptions {
    /// Response timeout
    pub timeout: Option<Duration>,

    /// Minimum confidence threshold
    pub confidence_threshold: Option<f64>,

    /// Validate that sources exist
    pub validate_sources: bool,

    /// Enable verbose output
    pub verbose: bool,
}

impl QueryOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn with_confidence(mut self, level: ConfidenceLevel) -> Self {
        self.confidence_threshold = Some(level.threshold());
        self
    }

    pub fn with_confidence_value(mut self, threshold: f64) -> Self {
        self.confidence_threshold = Some(threshold);
        self
    }

    pub fn validate_sources(mut self) -> Self {
        self.validate_sources = true;
        self
    }

    pub fn verbose(mut self) -> Self {
        self.verbose = true;
        self
    }
}

/// Query engine for executing queries against navigators
pub struct QueryEngine {
    adapter: ClaudeAdapter,
}

impl QueryEngine {
    /// Create a new query engine
    pub fn new() -> Self {
        Self {
            adapter: ClaudeAdapter::new(),
        }
    }

    /// Create a query engine with a custom adapter
    pub fn with_adapter(adapter: ClaudeAdapter) -> Self {
        Self { adapter }
    }

    /// Execute a query against a navigator
    pub async fn query(
        &self,
        navigator: &LoadedNavigator,
        question: &str,
        options: QueryOptions,
    ) -> Result<NavigatorResponse> {
        info!("Executing query: {}", question);

        // Get threshold from options or navigator config
        let confidence_threshold = options
            .confidence_threshold
            .or(navigator.config.confidence_threshold);

        // Execute query via adapter
        let response = self
            .adapter
            .query(navigator, question, options.timeout)
            .await?;

        // Validate sources if requested
        if options.validate_sources {
            autonav_communication::validation::validate_sources_exist(
                &response,
                &navigator.knowledge_base_path,
            )
            .map_err(|e| AutonavError::QueryError(e.to_string()))?;
        }

        // Check confidence threshold
        if let Some(threshold) = confidence_threshold {
            autonav_communication::validation::validate_confidence(&response, threshold)
                .map_err(|e| AutonavError::QueryError(e.to_string()))?;
        }

        debug!(
            "Query completed with confidence: {}",
            response.confidence
        );

        Ok(response)
    }

    /// Execute a multi-turn conversation
    pub async fn chat(
        &self,
        navigator: &LoadedNavigator,
        messages: &[String],
        options: QueryOptions,
    ) -> Result<NavigatorResponse> {
        // For now, combine messages and query
        // A more sophisticated implementation would maintain conversation state
        let combined = messages.join("\n\n");
        self.query(navigator, &combined, options).await
    }
}

impl Default for QueryEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse a timeout string like "30s", "1m", "1m30s"
pub fn parse_timeout(s: &str) -> Option<Duration> {
    let s = s.trim().to_lowercase();

    // Try parsing as milliseconds (bare number)
    if let Ok(ms) = s.parse::<u64>() {
        return Some(Duration::from_millis(ms));
    }

    // Parse with units
    let mut total_ms: u64 = 0;
    let mut current_num = String::new();

    for c in s.chars() {
        if c.is_ascii_digit() {
            current_num.push(c);
        } else {
            let num: u64 = current_num.parse().ok()?;
            current_num.clear();

            match c {
                's' => total_ms += num * 1000,
                'm' => total_ms += num * 60 * 1000,
                'h' => total_ms += num * 60 * 60 * 1000,
                _ => return None,
            }
        }
    }

    if total_ms > 0 {
        Some(Duration::from_millis(total_ms))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_query_options_builder() {
        let options = QueryOptions::new()
            .with_timeout(Duration::from_secs(30))
            .with_confidence(ConfidenceLevel::High)
            .validate_sources()
            .verbose();

        assert_eq!(options.timeout, Some(Duration::from_secs(30)));
        assert_eq!(options.confidence_threshold, Some(0.8));
        assert!(options.validate_sources);
        assert!(options.verbose);
    }

    #[test]
    fn test_parse_timeout() {
        assert_eq!(parse_timeout("30s"), Some(Duration::from_secs(30)));
        assert_eq!(parse_timeout("1m"), Some(Duration::from_secs(60)));
        assert_eq!(parse_timeout("1m30s"), Some(Duration::from_secs(90)));
        assert_eq!(parse_timeout("2h"), Some(Duration::from_secs(7200)));
        assert_eq!(parse_timeout("1000"), Some(Duration::from_millis(1000)));
        assert_eq!(parse_timeout("invalid"), None);
    }
}
