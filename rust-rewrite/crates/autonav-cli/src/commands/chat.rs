//! Chat command implementation

use std::path::PathBuf;
use std::io::{self, Write};

use color_eyre::eyre::Result;
use owo_colors::OwoColorize;
use tracing::debug;

use autonav::{Navigator, QueryEngine};
use autonav::query_engine::QueryOptions;

use crate::output;

/// Options for the chat command
pub struct ChatOptions {
    pub path: PathBuf,
    pub verbose: bool,
    pub no_color: bool,
}

/// Run the chat command
pub async fn run(opts: ChatOptions) -> Result<()> {
    // Load navigator
    let navigator = Navigator::load(&opts.path).await?;

    println!();
    println!(
        "{} {}",
        "Chat with".dimmed(),
        navigator.name().cyan().bold()
    );
    println!("{}", "Type /help for commands, /exit to quit".dimmed());
    println!();

    let engine = QueryEngine::new();
    let mut history: Vec<String> = Vec::new();

    loop {
        // Show prompt
        print!("{} ", "you>".green().bold());
        io::stdout().flush()?;

        // Read input
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        let input = input.trim();

        // Handle empty input
        if input.is_empty() {
            continue;
        }

        // Handle commands
        if input.starts_with('/') {
            match input {
                "/exit" | "/quit" | "/q" => {
                    println!("{}", "Goodbye!".dimmed());
                    break;
                }
                "/help" | "/h" | "/?" => {
                    println!();
                    println!("{}", "Commands:".bold());
                    println!("  {} - Show this help", "/help".cyan());
                    println!("  {} - Show current status", "/status".cyan());
                    println!("  {} - Clear conversation history", "/clear".cyan());
                    println!("  {} - Exit the chat", "/exit".cyan());
                    println!();
                    continue;
                }
                "/status" => {
                    println!();
                    println!("{}", "Status:".bold());
                    println!("  Navigator: {}", navigator.name().cyan());
                    println!("  History: {} messages", history.len());
                    if let Some(pm) = &navigator.plugin_manager {
                        let enabled = pm.enabled_plugins().await;
                        println!("  Plugins: {}", enabled.join(", "));
                    }
                    println!();
                    continue;
                }
                "/clear" => {
                    history.clear();
                    println!("{}", "Conversation history cleared.".dimmed());
                    continue;
                }
                _ => {
                    println!(
                        "{} Unknown command: {}",
                        "⚠".yellow(),
                        input.red()
                    );
                    continue;
                }
            }
        }

        // Add to history
        history.push(input.to_string());

        // Show thinking indicator
        let spinner = output::spinner("Thinking...");

        // Execute query with history context
        let query_opts = QueryOptions::new();
        let combined_input = if history.len() > 1 {
            // Include last few messages for context
            let context_size = history.len().min(5);
            history[history.len() - context_size..].join("\n\n---\n\n")
        } else {
            input.to_string()
        };

        match engine.query(&navigator, &combined_input, query_opts).await {
            Ok(response) => {
                spinner.finish_and_clear();

                println!();
                println!("{} {}", "nav>".blue().bold(), response.answer);
                println!();

                // Show sources if any
                if !response.sources.is_empty() && opts.verbose {
                    println!("{}", "Sources:".dimmed());
                    for source in &response.sources {
                        println!(
                            "  {} {}",
                            "•".dimmed(),
                            source.file.cyan()
                        );
                    }
                    println!();
                }

                // Add response to history
                history.push(response.answer);
            }
            Err(e) => {
                spinner.finish_and_clear();
                output::error(&format!("Query failed: {}", e));
                // Remove the failed query from history
                history.pop();
            }
        }
    }

    // Cleanup
    navigator.shutdown().await?;

    Ok(())
}
