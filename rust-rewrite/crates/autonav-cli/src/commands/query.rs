//! Query command implementation

use std::path::PathBuf;

use color_eyre::eyre::{eyre, Result};
use owo_colors::OwoColorize;
use tracing::{debug, info};

use autonav::{Navigator, QueryEngine};
use autonav::query_engine::{QueryOptions as EngineOptions, parse_timeout};
use autonav_communication::ConfidenceLevel;

use crate::output;

/// Options for the query command
pub struct QueryOptions {
    pub path: PathBuf,
    pub question: String,
    pub compact: bool,
    pub json: bool,
    pub validate: bool,
    pub confidence: Option<String>,
    pub timeout: Option<String>,
    pub verbose: bool,
    pub no_color: bool,
}

/// Run the query command
pub async fn run(opts: QueryOptions) -> Result<()> {
    // Load navigator
    let navigator = Navigator::load(&opts.path).await?;

    debug!("Loaded navigator: {}", navigator.name());

    // Build query options
    let mut query_opts = EngineOptions::new();

    if opts.validate {
        query_opts = query_opts.validate_sources();
    }

    if opts.verbose {
        query_opts = query_opts.verbose();
    }

    if let Some(confidence) = &opts.confidence {
        if let Some(level) = ConfidenceLevel::from_str(confidence) {
            query_opts = query_opts.with_confidence(level);
        } else if let Ok(value) = confidence.parse::<f64>() {
            query_opts = query_opts.with_confidence_value(value);
        } else {
            return Err(eyre!(
                "Invalid confidence level '{}'. Use 'high', 'medium', 'low', or a number 0-1",
                confidence
            ));
        }
    }

    if let Some(timeout_str) = &opts.timeout {
        if let Some(timeout) = parse_timeout(timeout_str) {
            query_opts = query_opts.with_timeout(timeout);
        } else {
            return Err(eyre!(
                "Invalid timeout '{}'. Use format like '30s', '1m', '1m30s'",
                timeout_str
            ));
        }
    }

    // Show spinner while querying
    let spinner = if !opts.json && !opts.compact {
        Some(output::spinner("Thinking..."))
    } else {
        None
    };

    // Execute query
    let engine = QueryEngine::new();
    let response = engine.query(&navigator, &opts.question, query_opts).await?;

    if let Some(s) = spinner {
        s.finish_and_clear();
    }

    // Output result
    if opts.json {
        // Raw JSON output
        println!("{}", serde_json::to_string_pretty(&response)?);
    } else if opts.compact {
        // Compact output
        println!("{}", response.answer);
    } else {
        // Pretty output
        println!();
        println!("{}", response.answer);
        println!();

        // Show sources
        if !response.sources.is_empty() {
            println!("{}", "Sources:".dimmed());
            for source in &response.sources {
                println!(
                    "{}",
                    output::format_source(&source.file, &source.section, &source.relevance)
                );
            }
            println!();
        }

        // Show confidence
        println!(
            "{} {}",
            "Confidence:".dimmed(),
            output::format_confidence(response.confidence)
        );
    }

    // Cleanup
    navigator.shutdown().await?;

    Ok(())
}
