//! Plugin manager for orchestrating multiple plugins

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

use autonav_communication::PluginConfig;

use crate::errors::{PluginError, Result};
use crate::file_watcher::FileWatcherPlugin;
use crate::github::GitHubPlugin;
use crate::plugin::{ActionResult, Plugin, PluginAction, PluginEvent, PluginHealthStatus};
use crate::slack::SlackPlugin;

/// Manager for loading and orchestrating plugins
pub struct PluginManager {
    plugins: HashMap<String, Arc<RwLock<Box<dyn Plugin>>>>,
    config_path: Option<std::path::PathBuf>,
}

impl PluginManager {
    /// Create a new plugin manager
    pub fn new() -> Self {
        Self {
            plugins: HashMap::new(),
            config_path: None,
        }
    }

    /// Load plugins from a configuration file
    pub async fn load_from_config(&mut self, config_path: &Path) -> Result<()> {
        info!("Loading plugins from: {:?}", config_path);

        let config = match PluginConfig::from_file(config_path) {
            Ok(c) => c,
            Err(e) => {
                warn!("Failed to load plugin config: {}. Using defaults.", e);
                PluginConfig::default()
            }
        };

        self.config_path = Some(config_path.to_path_buf());

        // Register built-in plugins based on config
        if let Some(slack_config) = config.slack {
            if slack_config.enabled {
                let plugin = SlackPlugin::new(slack_config);
                self.register(Box::new(plugin)).await?;
            }
        }

        if let Some(github_config) = config.github {
            if github_config.enabled {
                let plugin = GitHubPlugin::new(github_config);
                self.register(Box::new(plugin)).await?;
            }
        }

        if let Some(file_watcher_config) = config.file_watcher {
            if file_watcher_config.enabled {
                let plugin = FileWatcherPlugin::new(file_watcher_config);
                self.register(Box::new(plugin)).await?;
            }
        }

        info!("Loaded {} plugins", self.plugins.len());
        Ok(())
    }

    /// Register a plugin
    pub async fn register(&mut self, mut plugin: Box<dyn Plugin>) -> Result<()> {
        let name = plugin.name().to_string();
        debug!("Registering plugin: {}", name);

        // Initialize the plugin
        if let Err(e) = plugin.initialize().await {
            error!("Failed to initialize plugin {}: {}", name, e);
            return Err(PluginError::InitializationFailed(format!(
                "{}: {}",
                name, e
            )));
        }

        self.plugins
            .insert(name.clone(), Arc::new(RwLock::new(plugin)));
        info!("Registered plugin: {}", name);
        Ok(())
    }

    /// Get a list of registered plugin names
    pub fn plugin_names(&self) -> Vec<&str> {
        self.plugins.keys().map(|s| s.as_str()).collect()
    }

    /// Get a list of enabled plugin names
    pub async fn enabled_plugins(&self) -> Vec<String> {
        let mut enabled = Vec::new();
        for (name, plugin) in &self.plugins {
            let plugin = plugin.read().await;
            if plugin.is_enabled() {
                enabled.push(name.clone());
            }
        }
        enabled
    }

    /// Listen for events from all enabled plugins
    pub async fn listen_all(&self) -> Vec<PluginEvent> {
        let mut all_events = Vec::new();

        for (name, plugin) in &self.plugins {
            let mut plugin = plugin.write().await;
            if !plugin.is_enabled() {
                continue;
            }

            match plugin.listen().await {
                Ok(events) => {
                    debug!("Plugin {} returned {} events", name, events.len());
                    all_events.extend(events);
                }
                Err(e) => {
                    // Log but don't fail - other plugins should continue
                    error!("Plugin {} listen error: {}", name, e);
                }
            }
        }

        all_events
    }

    /// Execute an action on the appropriate plugin
    pub async fn execute(&self, action: PluginAction) -> Result<ActionResult> {
        let plugin_name = action.plugin_name();

        let plugin = self
            .plugins
            .get(plugin_name)
            .ok_or_else(|| PluginError::NotFound(plugin_name.to_string()))?;

        let mut plugin = plugin.write().await;

        if !plugin.is_enabled() {
            return Err(PluginError::NotEnabled(plugin_name.to_string()));
        }

        plugin.execute(action).await
    }

    /// Get health status for all plugins
    pub async fn health_check_all(&self) -> HashMap<String, PluginHealthStatus> {
        let mut statuses = HashMap::new();

        for (name, plugin) in &self.plugins {
            let plugin = plugin.read().await;
            let status = plugin.health_check().await;
            statuses.insert(name.clone(), status);
        }

        statuses
    }

    /// Shutdown all plugins
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down {} plugins", self.plugins.len());

        for (name, plugin) in &self.plugins {
            let mut plugin = plugin.write().await;
            if let Err(e) = plugin.shutdown().await {
                error!("Error shutting down plugin {}: {}", name, e);
            }
        }

        Ok(())
    }

    /// Get the config path if loaded from file
    pub fn config_path(&self) -> Option<&Path> {
        self.config_path.as_deref()
    }
}

impl Default for PluginManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_new_manager() {
        let manager = PluginManager::new();
        assert!(manager.plugin_names().is_empty());
    }

    #[tokio::test]
    async fn test_listen_all_empty() {
        let manager = PluginManager::new();
        let events = manager.listen_all().await;
        assert!(events.is_empty());
    }
}
