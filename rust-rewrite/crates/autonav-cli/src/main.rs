//! Autonav CLI - LLM-agnostic context management system

use std::path::PathBuf;
use std::time::Duration;

use clap::{Parser, Subcommand};
use color_eyre::eyre::{eyre, Result};
use tracing::Level;
use tracing_subscriber::EnvFilter;

mod commands;
mod output;
mod interview;

use commands::{init, query, chat, update, install, uninstall};

/// Autonav - LLM-agnostic context management system
#[derive(Parser)]
#[command(name = "autonav")]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Enable verbose output
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Disable colored output
    #[arg(long, global = true)]
    no_color: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new navigator
    Init {
        /// Navigator name (kebab-case)
        name: String,

        /// Install from a knowledge pack
        #[arg(long)]
        pack: Option<String>,

        /// Install from a local pack file (tar.gz)
        #[arg(long)]
        pack_file: Option<PathBuf>,

        /// Custom pack server URL
        #[arg(long)]
        server: Option<String>,

        /// Import existing repository as knowledge base
        #[arg(long)]
        from: Option<PathBuf>,

        /// Add config to existing directory instead of creating new
        #[arg(long)]
        in_place: bool,

        /// Overwrite existing files without prompting
        #[arg(short, long)]
        force: bool,

        /// Minimal output
        #[arg(short, long)]
        quiet: bool,

        /// Skip interactive interview
        #[arg(long)]
        quick: bool,
    },

    /// Query a navigator
    Query {
        /// Path to navigator directory
        path: PathBuf,

        /// Question to ask
        question: String,

        /// Compact output format
        #[arg(long)]
        compact: bool,

        /// Output raw JSON only
        #[arg(long)]
        json: bool,

        /// Fail if sources don't exist
        #[arg(long)]
        validate: bool,

        /// Minimum confidence level (high, medium, low)
        #[arg(long)]
        confidence: Option<String>,

        /// Timeout (e.g., "30s", "1m", "1m30s")
        #[arg(long)]
        timeout: Option<String>,
    },

    /// Interactive chat with a navigator
    Chat {
        /// Path to navigator directory
        path: PathBuf,
    },

    /// Send an update to a navigator
    Update {
        /// Path to navigator directory
        path: PathBuf,

        /// Update message
        message: String,

        /// Timeout (default: 2m)
        #[arg(long, default_value = "2m")]
        timeout: String,
    },

    /// Install navigator skills globally
    Install {
        /// Path to navigator directory (default: current directory)
        path: Option<PathBuf>,

        /// Overwrite existing skills
        #[arg(short, long)]
        force: bool,

        /// Minimal output
        #[arg(short, long)]
        quiet: bool,
    },

    /// Uninstall navigator skills
    Uninstall {
        /// Path to navigator directory (default: current directory)
        path: Option<PathBuf>,

        /// Minimal output
        #[arg(short, long)]
        quiet: bool,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize color-eyre for nice error messages
    color_eyre::install()?;

    let cli = Cli::parse();

    // Setup tracing
    let filter = if cli.verbose {
        EnvFilter::new("debug")
    } else {
        EnvFilter::new("info").add_directive("reqwest=warn".parse()?)
    };

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_ansi(!cli.no_color)
        .init();

    // Dispatch to command handlers
    match cli.command {
        Commands::Init {
            name,
            pack,
            pack_file,
            server,
            from,
            in_place,
            force,
            quiet,
            quick,
        } => {
            init::run(init::InitOptions {
                name,
                pack,
                pack_file,
                server,
                from,
                in_place,
                force,
                quiet,
                quick,
                no_color: cli.no_color,
            })
            .await
        }

        Commands::Query {
            path,
            question,
            compact,
            json,
            validate,
            confidence,
            timeout,
        } => {
            query::run(query::QueryOptions {
                path,
                question,
                compact,
                json,
                validate,
                confidence,
                timeout,
                verbose: cli.verbose,
                no_color: cli.no_color,
            })
            .await
        }

        Commands::Chat { path } => {
            chat::run(chat::ChatOptions {
                path,
                verbose: cli.verbose,
                no_color: cli.no_color,
            })
            .await
        }

        Commands::Update {
            path,
            message,
            timeout,
        } => {
            update::run(update::UpdateOptions {
                path,
                message,
                timeout,
                verbose: cli.verbose,
            })
            .await
        }

        Commands::Install { path, force, quiet } => {
            install::run(install::InstallOptions {
                path: path.unwrap_or_else(|| PathBuf::from(".")),
                force,
                quiet,
                no_color: cli.no_color,
            })
            .await
        }

        Commands::Uninstall { path, quiet } => {
            uninstall::run(uninstall::UninstallOptions {
                path: path.unwrap_or_else(|| PathBuf::from(".")),
                quiet,
                no_color: cli.no_color,
            })
            .await
        }
    }
}
