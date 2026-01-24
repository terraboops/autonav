//! Uninstall command implementation

use std::path::PathBuf;

use color_eyre::eyre::{eyre, Result};
use tracing::debug;

use autonav::Navigator;

use crate::output;

/// Options for the uninstall command
pub struct UninstallOptions {
    pub path: PathBuf,
    pub quiet: bool,
    pub no_color: bool,
}

/// Global skills directory
fn global_skills_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".autonav/skills")
}

/// Run the uninstall command
pub async fn run(opts: UninstallOptions) -> Result<()> {
    // Verify navigator exists
    if !Navigator::is_valid(&opts.path) {
        return Err(eyre!(
            "No navigator found at '{}'. Run 'autonav init' first.",
            opts.path.display()
        ));
    }

    // Load navigator to get name
    let navigator = Navigator::load(&opts.path).await?;
    let nav_name = navigator.name().to_string();
    let skill_name = format!("ask-{}", nav_name);

    // Find global skill
    let global_dir = global_skills_dir();
    let global_skill = global_dir.join(&skill_name);

    if !global_skill.exists() {
        if !opts.quiet {
            output::warn(&format!(
                "Skill '{}' not installed globally",
                skill_name
            ));
        }
        return Ok(());
    }

    // Remove symlink (preserves local skill)
    if global_skill.is_symlink() {
        std::fs::remove_file(&global_skill)?;
    } else {
        std::fs::remove_dir_all(&global_skill)?;
    }

    if !opts.quiet {
        output::success(&format!(
            "Uninstalled skill '{}' from global location",
            skill_name
        ));
        println!("  Local skill at {} preserved", opts.path.join(".autonav/skills").join(&skill_name).display());
    }

    // Cleanup
    navigator.shutdown().await?;

    Ok(())
}
