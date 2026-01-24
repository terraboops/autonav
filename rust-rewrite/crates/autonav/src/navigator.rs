//! Navigator loading and management

use std::path::{Path, PathBuf};

use autonav_communication::{NavigatorConfig, PluginConfig};
use autonav_plugins::PluginManager;
use tracing::{debug, info};

use crate::errors::{AutonavError, Result};

/// A loaded navigator ready for queries
pub struct LoadedNavigator {
    /// Navigator configuration
    pub config: NavigatorConfig,

    /// System prompt from CLAUDE.md
    pub system_prompt: String,

    /// Path to the navigator directory
    pub navigator_path: PathBuf,

    /// Path to the knowledge base
    pub knowledge_base_path: PathBuf,

    /// Plugin manager (if plugins configured)
    pub plugin_manager: Option<PluginManager>,

    /// Path to plugins config file
    pub plugins_config_path: Option<PathBuf>,
}

/// Navigator operations
pub struct Navigator;

impl Navigator {
    /// Load a navigator from a directory
    pub async fn load(path: impl AsRef<Path>) -> Result<LoadedNavigator> {
        let path = path.as_ref();
        let navigator_path = if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir()?.join(path)
        };

        info!("Loading navigator from: {:?}", navigator_path);

        // Check directory exists
        if !navigator_path.exists() {
            return Err(AutonavError::NavigatorNotFound(
                navigator_path.display().to_string(),
            ));
        }

        // Load config.json
        let config_path = navigator_path.join("config.json");
        if !config_path.exists() {
            return Err(AutonavError::InvalidNavigator(
                "config.json not found".to_string(),
            ));
        }

        let config = NavigatorConfig::from_file(&config_path).map_err(|e| {
            AutonavError::ConfigError(format!("Failed to load config.json: {}", e))
        })?;

        debug!("Loaded config for navigator: {}", config.name);

        // Load CLAUDE.md (system prompt)
        let instructions_path = navigator_path.join(&config.instructions_path);
        let system_prompt = if instructions_path.exists() {
            std::fs::read_to_string(&instructions_path)?
        } else {
            // Use default prompt
            crate::templates::default_claude_md(&config.name, &config.knowledge_base_path)
        };

        // Resolve knowledge base path
        let knowledge_base_path = navigator_path.join(&config.knowledge_base_path);

        // Load plugins if configured
        let (plugin_manager, plugins_config_path) = if let Some(plugins_ref) = &config.plugins {
            let plugins_path = navigator_path.join(&plugins_ref.config_file);
            if plugins_path.exists() {
                let mut manager = PluginManager::new();
                if let Err(e) = manager.load_from_config(&plugins_path).await {
                    // Log but don't fail - plugins are optional
                    tracing::warn!("Failed to load plugins: {}", e);
                    (None, Some(plugins_path))
                } else {
                    (Some(manager), Some(plugins_path))
                }
            } else {
                (None, Some(plugins_path))
            }
        } else {
            (None, None)
        };

        Ok(LoadedNavigator {
            config,
            system_prompt,
            navigator_path,
            knowledge_base_path,
            plugin_manager,
            plugins_config_path,
        })
    }

    /// Check if a path is a valid navigator
    pub fn is_valid(path: impl AsRef<Path>) -> bool {
        let path = path.as_ref();
        path.join("config.json").exists()
    }

    /// Create a new navigator directory structure
    pub fn scaffold(
        path: impl AsRef<Path>,
        name: &str,
        knowledge_pack: Option<&str>,
    ) -> Result<PathBuf> {
        let path = path.as_ref();

        // Create directories
        std::fs::create_dir_all(path)?;
        std::fs::create_dir_all(path.join("knowledge-base"))?;
        std::fs::create_dir_all(path.join(".claude"))?;
        std::fs::create_dir_all(path.join(".autonav/skills"))?;

        // Create config.json
        let mut config = NavigatorConfig::new(name);
        if let Some(pack) = knowledge_pack {
            config.knowledge_pack = Some(autonav_communication::KnowledgePackRef {
                name: pack.to_string(),
                version: "1.0.0".to_string(),
                source: None,
            });
        }
        config.save(path.join("config.json"))?;

        // Create CLAUDE.md
        let claude_md = crate::templates::default_claude_md(name, "knowledge-base");
        std::fs::write(path.join("CLAUDE.md"), claude_md)?;

        // Create plugins.json
        let plugins_config = PluginConfig::default();
        plugins_config.save(path.join(".claude/plugins.json"))?;

        // Create .gitignore
        let gitignore = crate::templates::default_gitignore();
        std::fs::write(path.join(".gitignore"), gitignore)?;

        // Create README.md in knowledge base
        let readme = crate::templates::knowledge_base_readme(name);
        std::fs::write(path.join("knowledge-base/README.md"), readme)?;

        info!("Created navigator scaffold at: {:?}", path);
        Ok(path.to_path_buf())
    }
}

impl LoadedNavigator {
    /// Get the navigator name
    pub fn name(&self) -> &str {
        &self.config.name
    }

    /// Shutdown the navigator (cleanup plugins, etc.)
    pub async fn shutdown(&self) -> Result<()> {
        if let Some(pm) = &self.plugin_manager {
            pm.shutdown().await.map_err(AutonavError::from)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_is_valid_navigator() {
        let temp = TempDir::new().unwrap();

        // Not valid without config.json
        assert!(!Navigator::is_valid(temp.path()));

        // Valid with config.json
        let config = NavigatorConfig::new("test");
        config.save(temp.path().join("config.json")).unwrap();
        assert!(Navigator::is_valid(temp.path()));
    }

    #[test]
    fn test_scaffold() {
        let temp = TempDir::new().unwrap();
        let nav_path = temp.path().join("my-nav");

        Navigator::scaffold(&nav_path, "my-nav", None).unwrap();

        assert!(nav_path.join("config.json").exists());
        assert!(nav_path.join("CLAUDE.md").exists());
        assert!(nav_path.join(".claude/plugins.json").exists());
        assert!(nav_path.join("knowledge-base").exists());
    }

    #[tokio::test]
    async fn test_load_navigator() {
        let temp = TempDir::new().unwrap();
        Navigator::scaffold(temp.path(), "test-nav", None).unwrap();

        let loaded = Navigator::load(temp.path()).await.unwrap();
        assert_eq!(loaded.name(), "test-nav");
    }
}
