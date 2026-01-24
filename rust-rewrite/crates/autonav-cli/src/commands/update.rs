//! Update command implementation

use std::path::PathBuf;

use color_eyre::eyre::{eyre, Result};
use tracing::debug;

use autonav::{Navigator, QueryEngine};
use autonav::query_engine::{QueryOptions, parse_timeout};

use crate::output;

/// Options for the update command
pub struct UpdateOptions {
    pub path: PathBuf,
    pub message: String,
    pub timeout: String,
    pub verbose: bool,
}

/// Run the update command
pub async fn run(opts: UpdateOptions) -> Result<()> {
    // Parse timeout
    let timeout = parse_timeout(&opts.timeout).ok_or_else(|| {
        eyre!(
            "Invalid timeout '{}'. Use format like '30s', '1m', '1m30s'",
            opts.timeout
        )
    })?;

    // Load navigator
    let navigator = Navigator::load(&opts.path).await?;

    debug!("Loaded navigator: {}", navigator.name());

    // Create update prompt
    let update_prompt = format!(
        r#"You have received a documentation update request.

**Update Message:**
{}

Please process this update and make any necessary changes to the knowledge base.
If this involves modifying documentation files, explain what changes should be made.
If this involves updating your configuration, use the appropriate self-configuration tools.

After processing, summarize what actions were taken."#,
        opts.message
    );

    // Show spinner
    let spinner = output::spinner("Processing update...");

    // Execute with self-config tools available
    let query_opts = QueryOptions::new().with_timeout(timeout);
    let engine = QueryEngine::new();
    let response = engine.query(&navigator, &update_prompt, query_opts).await?;

    spinner.finish_and_clear();

    // Show response
    println!();
    output::success("Update processed");
    println!();
    println!("{}", response.answer);
    println!();

    // Cleanup
    navigator.shutdown().await?;

    Ok(())
}
