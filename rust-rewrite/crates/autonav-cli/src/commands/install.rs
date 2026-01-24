//! Install command implementation

use std::path::PathBuf;

use color_eyre::eyre::{eyre, Result};
use tracing::debug;

use autonav::Navigator;

use crate::output;

/// Options for the install command
pub struct InstallOptions {
    pub path: PathBuf,
    pub force: bool,
    pub quiet: bool,
    pub no_color: bool,
}

/// Global skills directory
fn global_skills_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".autonav/skills")
}

/// Run the install command
pub async fn run(opts: InstallOptions) -> Result<()> {
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

    // Create global skills directory
    let global_dir = global_skills_dir();
    std::fs::create_dir_all(&global_dir)?;

    // Get local skill path
    let local_skill = opts.path.join(".autonav/skills").join(&skill_name);
    if !local_skill.exists() {
        return Err(eyre!(
            "Local skill not found at '{}'. The navigator may need to be re-initialized.",
            local_skill.display()
        ));
    }

    // Create symlink
    let global_skill = global_dir.join(&skill_name);

    if global_skill.exists() {
        if opts.force {
            std::fs::remove_file(&global_skill).or_else(|_| std::fs::remove_dir_all(&global_skill))?;
        } else {
            return Err(eyre!(
                "Skill '{}' already installed. Use --force to overwrite.",
                skill_name
            ));
        }
    }

    // Create symlink to local skill
    std::os::unix::fs::symlink(&local_skill, &global_skill)?;

    if !opts.quiet {
        output::success(&format!(
            "Installed skill '{}' globally",
            skill_name
        ));
        println!(
            "  {} -> {}",
            global_skill.display(),
            local_skill.display()
        );
    }

    // Cleanup
    navigator.shutdown().await?;

    Ok(())
}
