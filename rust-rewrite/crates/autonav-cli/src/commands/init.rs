//! Init command implementation

use std::path::PathBuf;

use color_eyre::eyre::{eyre, Result};
use tracing::{debug, info};

use autonav::{Navigator, PackInstaller};

use crate::output;
use crate::interview::Interview;

/// Options for the init command
pub struct InitOptions {
    pub name: String,
    pub pack: Option<String>,
    pub pack_file: Option<PathBuf>,
    pub server: Option<String>,
    pub from: Option<PathBuf>,
    pub in_place: bool,
    pub force: bool,
    pub quiet: bool,
    pub quick: bool,
    pub no_color: bool,
}

/// Run the init command
pub async fn run(opts: InitOptions) -> Result<()> {
    // Validate name
    if !is_valid_name(&opts.name) {
        return Err(eyre!(
            "Invalid navigator name '{}'. Must be kebab-case (e.g., my-navigator)",
            opts.name
        ));
    }

    let target_path = if opts.in_place {
        PathBuf::from(".")
    } else {
        PathBuf::from(&opts.name)
    };

    // Check if target already exists
    if target_path.exists() && !opts.force && !opts.in_place {
        return Err(eyre!(
            "Directory '{}' already exists. Use --force to overwrite or --in-place to add config to existing directory.",
            target_path.display()
        ));
    }

    if !opts.quiet {
        output::info(&format!("Initializing navigator: {}", opts.name));
    }

    // Create the navigator scaffold
    let spinner = if !opts.quiet {
        Some(output::spinner("Creating navigator structure..."))
    } else {
        None
    };

    Navigator::scaffold(&target_path, &opts.name, opts.pack.as_deref())?;

    if let Some(s) = &spinner {
        s.finish_with_message("Created navigator structure");
    }

    // Install knowledge pack if specified
    if let Some(pack) = &opts.pack {
        let spinner = if !opts.quiet {
            Some(output::spinner(&format!("Installing pack: {}...", pack)))
        } else {
            None
        };

        let installer = if let Some(server) = &opts.server {
            PackInstaller::with_server(server)
        } else {
            PackInstaller::new()
        };

        let pack_dest = target_path.join("knowledge-base");
        let metadata = installer.install(pack, &pack_dest).await?;

        if let Some(s) = spinner {
            s.finish_with_message(format!(
                "Installed pack: {} v{}",
                metadata.name, metadata.version
            ));
        }
    } else if let Some(pack_file) = &opts.pack_file {
        let spinner = if !opts.quiet {
            Some(output::spinner("Installing pack from file..."))
        } else {
            None
        };

        let installer = PackInstaller::new();
        let pack_dest = target_path.join("knowledge-base");
        let metadata = installer.install_from_file(pack_file, &pack_dest).await?;

        if let Some(s) = spinner {
            s.finish_with_message(format!(
                "Installed pack: {} v{}",
                metadata.name, metadata.version
            ));
        }
    }

    // Import from existing repo if specified
    if let Some(from_path) = &opts.from {
        let spinner = if !opts.quiet {
            Some(output::spinner("Analyzing repository..."))
        } else {
            None
        };

        // Scan the repository
        let scan = autonav::repo_scanner::scan_repository(from_path, Some(5))?;

        if let Some(s) = spinner {
            s.finish_with_message(format!(
                "Found {} files ({} markdown)",
                scan.total_files, scan.markdown_files
            ));
        }

        // Create symlink to the source
        let link_path = target_path.join("knowledge-base/source");
        std::os::unix::fs::symlink(from_path.canonicalize()?, &link_path)?;

        if !opts.quiet {
            output::info(&format!(
                "Linked knowledge base to: {}",
                from_path.display()
            ));
        }
    }

    // Run interactive interview unless skipped
    if !opts.quick && !opts.quiet {
        let mut interview = Interview::new(&target_path);
        interview.run().await?;
    }

    // Create local skill
    let skill_path = target_path.join(".autonav/skills").join(format!("ask-{}", opts.name));
    std::fs::create_dir_all(&skill_path)?;

    // Create skill metadata
    let skill_metadata = serde_json::json!({
        "name": format!("ask-{}", opts.name),
        "version": "1.0.0",
        "description": format!("Query the {} navigator", opts.name),
        "navigator": target_path.canonicalize()?.to_string_lossy()
    });
    std::fs::write(
        skill_path.join("skill.json"),
        serde_json::to_string_pretty(&skill_metadata)?,
    )?;

    if !opts.quiet {
        output::success(&format!(
            "Navigator '{}' created at {}",
            opts.name,
            target_path.display()
        ));
        println!();
        println!("Next steps:");
        println!("  {} Add documentation to {}/knowledge-base/", "1.".dimmed(), target_path.display());
        println!("  {} Query your navigator:", "2.".dimmed());
        println!("     autonav query {} \"Your question here\"", target_path.display());
        println!("  {} Or start a chat:", "3.".dimmed());
        println!("     autonav chat {}", target_path.display());
    }

    Ok(())
}

/// Validate navigator name (kebab-case)
fn is_valid_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 50 {
        return false;
    }

    let re = regex::Regex::new(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$").unwrap();
    re.is_match(name)
}

use owo_colors::OwoColorize;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_name() {
        assert!(is_valid_name("my-navigator"));
        assert!(is_valid_name("nav"));
        assert!(is_valid_name("my-cool-nav-2"));
        assert!(!is_valid_name("MyNavigator"));
        assert!(!is_valid_name("my_navigator"));
        assert!(!is_valid_name("123nav"));
        assert!(!is_valid_name(""));
    }
}
