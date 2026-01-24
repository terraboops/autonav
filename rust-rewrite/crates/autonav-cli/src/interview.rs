//! Interactive interview for navigator setup

use std::path::Path;

use color_eyre::eyre::Result;
use dialoguer::{theme::ColorfulTheme, Confirm, Input, Select};
use owo_colors::OwoColorize;

use autonav_communication::{NavigatorConfig, PluginConfig, SlackConfig, GitHubConfig, SignalConfig};

/// Interactive interview for navigator configuration
pub struct Interview {
    navigator_path: std::path::PathBuf,
}

impl Interview {
    /// Create a new interview for a navigator
    pub fn new(path: &Path) -> Self {
        Self {
            navigator_path: path.to_path_buf(),
        }
    }

    /// Run the interactive interview
    pub async fn run(&mut self) -> Result<()> {
        println!();
        println!("{}", "Navigator Setup".bold().cyan());
        println!("{}", "Let's configure your navigator.".dimmed());
        println!();

        // Load current config
        let config_path = self.navigator_path.join("config.json");
        let mut config = NavigatorConfig::from_file(&config_path)?;

        // Ask for description
        let description: String = Input::with_theme(&ColorfulTheme::default())
            .with_prompt("Describe what this navigator will help with")
            .default(config.description.clone().unwrap_or_default())
            .allow_empty(true)
            .interact_text()?;

        if !description.is_empty() {
            config.description = Some(description);
        }

        // Ask about plugins
        if Confirm::with_theme(&ColorfulTheme::default())
            .with_prompt("Would you like to configure integrations (Slack, GitHub, etc.)?")
            .default(false)
            .interact()?
        {
            self.configure_plugins().await?;
        }

        // Ask about confidence threshold
        let confidence_choices = vec!["High (0.8)", "Medium (0.5)", "Low (0.2)", "None"];
        let confidence_idx = Select::with_theme(&ColorfulTheme::default())
            .with_prompt("Minimum confidence threshold for responses")
            .items(&confidence_choices)
            .default(3)
            .interact()?;

        config.confidence_threshold = match confidence_idx {
            0 => Some(0.8),
            1 => Some(0.5),
            2 => Some(0.2),
            _ => None,
        };

        // Save updated config
        config.touch();
        config.save(&config_path)?;

        println!();
        println!("{}", "Configuration saved!".green().bold());
        println!();

        Ok(())
    }

    /// Configure plugins interactively
    async fn configure_plugins(&mut self) -> Result<()> {
        let plugins_path = self.navigator_path.join(".claude/plugins.json");
        let mut plugins_config = if plugins_path.exists() {
            PluginConfig::from_file(&plugins_path)?
        } else {
            PluginConfig::default()
        };

        // Slack configuration
        if Confirm::with_theme(&ColorfulTheme::default())
            .with_prompt("Enable Slack integration?")
            .default(false)
            .interact()?
        {
            println!("{}", "Slack configuration:".bold());

            let workspace: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt("Slack workspace name")
                .interact_text()?;

            let channels: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt("Channels to monitor (comma-separated)")
                .default("general".to_string())
                .interact_text()?;

            let channels: Vec<String> = channels
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();

            plugins_config.slack = Some(SlackConfig {
                enabled: true,
                workspace,
                channels,
                ..Default::default()
            });

            println!("{}", "  Slack token should be set in SLACK_BOT_TOKEN environment variable".dimmed());
        }

        // GitHub configuration
        if Confirm::with_theme(&ColorfulTheme::default())
            .with_prompt("Enable GitHub integration?")
            .default(false)
            .interact()?
        {
            println!("{}", "GitHub configuration:".bold());

            let owner: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt("Repository owner (username or org)")
                .interact_text()?;

            let repo: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt("Repository name")
                .interact_text()?;

            let watch_issues = Confirm::with_theme(&ColorfulTheme::default())
                .with_prompt("Watch issues?")
                .default(true)
                .interact()?;

            let watch_prs = Confirm::with_theme(&ColorfulTheme::default())
                .with_prompt("Watch pull requests?")
                .default(true)
                .interact()?;

            plugins_config.github = Some(GitHubConfig {
                enabled: true,
                owner,
                repo,
                watch_issues,
                watch_pull_requests: watch_prs,
                ..Default::default()
            });

            println!("{}", "  GitHub token should be set in GITHUB_TOKEN environment variable".dimmed());
        }

        // Signal configuration
        if Confirm::with_theme(&ColorfulTheme::default())
            .with_prompt("Enable Signal notifications?")
            .default(false)
            .interact()?
        {
            println!("{}", "Signal configuration:".bold());

            let phone: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt("Phone number (with country code, e.g., +1234567890)")
                .interact_text()?;

            let schedule_choices = vec!["Daily", "Weekly", "Custom"];
            let schedule_idx = Select::with_theme(&ColorfulTheme::default())
                .with_prompt("Check-in schedule")
                .items(&schedule_choices)
                .default(0)
                .interact()?;

            let schedule = match schedule_idx {
                0 => "daily".to_string(),
                1 => "weekly".to_string(),
                _ => "custom".to_string(),
            };

            plugins_config.signal = Some(SignalConfig {
                enabled: true,
                phone_number: phone,
                check_in_schedule: schedule,
                notification_types: vec!["urgent".to_string(), "daily-summary".to_string()],
                ..Default::default()
            });
        }

        // Save plugins config
        plugins_config.save(&plugins_path)?;

        Ok(())
    }
}
