//! File watcher plugin implementation

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use globset::{Glob, GlobSet, GlobSetBuilder};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

use autonav_communication::FileWatcherConfig;

use crate::errors::{PluginError, Result};
use crate::plugin::{ActionResult, Plugin, PluginAction, PluginEvent, PluginHealthStatus};

/// Sensitive directories that should never be watched
const SENSITIVE_DIRS: &[&str] = &[
    "/etc",
    "/root",
    "/var/log",
    "~/.ssh",
    "~/.aws",
    "~/.gnupg",
    "~/.config",
    "/proc",
    "/sys",
];

/// File watcher plugin for monitoring file system changes
pub struct FileWatcherPlugin {
    config: FileWatcherConfig,
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    events: Arc<Mutex<Vec<notify::Event>>>,
    include_patterns: Option<GlobSet>,
    ignore_patterns: Option<GlobSet>,
    initialized: bool,
}

impl FileWatcherPlugin {
    /// Create a new file watcher plugin
    pub fn new(config: FileWatcherConfig) -> Self {
        Self {
            config,
            watcher: Arc::new(Mutex::new(None)),
            events: Arc::new(Mutex::new(Vec::new())),
            include_patterns: None,
            ignore_patterns: None,
            initialized: false,
        }
    }

    /// Check if a path is in a sensitive directory
    fn is_sensitive_path(path: &str) -> bool {
        let expanded = shellexpand::tilde(path);
        for sensitive in SENSITIVE_DIRS {
            let sensitive_expanded = shellexpand::tilde(sensitive);
            if expanded.starts_with(sensitive_expanded.as_ref()) {
                return true;
            }
        }
        false
    }

    /// Build a globset from patterns
    fn build_globset(patterns: &[String]) -> Result<GlobSet> {
        let mut builder = GlobSetBuilder::new();
        for pattern in patterns {
            let glob = Glob::new(pattern)
                .map_err(|e| PluginError::ConfigError(format!("Invalid glob pattern: {}", e)))?;
            builder.add(glob);
        }
        builder
            .build()
            .map_err(|e| PluginError::ConfigError(format!("Failed to build globset: {}", e)))
    }

    /// Check if a path matches the include/ignore patterns
    fn should_include(&self, path: &PathBuf) -> bool {
        let path_str = path.to_string_lossy();

        // Check ignore patterns first
        if let Some(ignore) = &self.ignore_patterns {
            if ignore.is_match(path) {
                return false;
            }
        }

        // If no include patterns, include everything not ignored
        let Some(include) = &self.include_patterns else {
            return true;
        };

        // Check if matches include patterns
        include.is_match(path) || include.is_match(path_str.as_ref())
    }
}

#[async_trait]
impl Plugin for FileWatcherPlugin {
    fn name(&self) -> &'static str {
        "file_watcher"
    }

    fn version(&self) -> &'static str {
        "2.0.0"
    }

    fn description(&self) -> &'static str {
        "File system watcher for monitoring changes"
    }

    fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    async fn initialize(&mut self) -> Result<()> {
        if !self.config.enabled {
            debug!("FileWatcher plugin is disabled, skipping initialization");
            return Ok(());
        }

        info!("Initializing FileWatcher plugin");

        // Check for sensitive paths
        let mut safe_paths = Vec::new();
        for path in &self.config.paths {
            if Self::is_sensitive_path(path) {
                warn!("Skipping sensitive path: {}", path);
                continue;
            }
            safe_paths.push(path.clone());
        }

        if safe_paths.is_empty() {
            return Err(PluginError::ConfigError(
                "No safe paths to watch".to_string(),
            ));
        }

        // Build glob patterns
        if !self.config.patterns.is_empty() {
            self.include_patterns = Some(Self::build_globset(&self.config.patterns)?);
        }

        if !self.config.ignore_patterns.is_empty() {
            self.ignore_patterns = Some(Self::build_globset(&self.config.ignore_patterns)?);
        }

        // Create event storage
        let events = self.events.clone();

        // Create watcher with callback that stores events
        let config = Config::default()
            .with_poll_interval(Duration::from_millis(self.config.poll_interval));

        let watcher = RecommendedWatcher::new(
            move |res: notify::Result<notify::Event>| {
                if let Ok(event) = res {
                    // Use blocking lock since this callback is from a sync context
                    if let Ok(mut events_guard) = events.try_lock() {
                        events_guard.push(event);
                    }
                }
            },
            config,
        )
        .map_err(|e| PluginError::InitializationFailed(format!("Failed to create watcher: {}", e)))?;

        // Store watcher
        {
            let mut watcher_guard = self.watcher.lock().await;
            *watcher_guard = Some(watcher);
        }

        // Add paths to watch
        {
            let mut watcher_guard = self.watcher.lock().await;
            if let Some(watcher) = watcher_guard.as_mut() {
                for path in &safe_paths {
                    let path_buf = PathBuf::from(shellexpand::tilde(path).to_string());
                    if path_buf.exists() {
                        watcher
                            .watch(&path_buf, RecursiveMode::Recursive)
                            .map_err(|e| {
                                PluginError::InitializationFailed(format!(
                                    "Failed to watch {}: {}",
                                    path, e
                                ))
                            })?;
                        info!("Watching: {}", path);
                    } else {
                        warn!("Path does not exist, skipping: {}", path);
                    }
                }
            }
        }

        self.initialized = true;
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Shutting down FileWatcher plugin");
        {
            let mut watcher_guard = self.watcher.lock().await;
            *watcher_guard = None;
        }
        {
            let mut events_guard = self.events.lock().await;
            events_guard.clear();
        }
        self.initialized = false;
        Ok(())
    }

    async fn listen(&mut self) -> Result<Vec<PluginEvent>> {
        let mut result_events = Vec::new();
        let mut seen_paths: HashSet<PathBuf> = HashSet::new();

        // Get pending events
        let pending_events: Vec<notify::Event> = {
            let mut events_guard = self.events.lock().await;
            std::mem::take(&mut *events_guard)
        };

        for event in pending_events {
            for path in event.paths {
                // Deduplicate events for the same path
                if seen_paths.contains(&path) {
                    continue;
                }

                // Check if path matches patterns
                if !self.should_include(&path) {
                    continue;
                }

                seen_paths.insert(path.clone());
                let path_str = path.to_string_lossy().to_string();

                let plugin_event = match event.kind {
                    notify::EventKind::Create(_) => PluginEvent::FileAdded { path: path_str },
                    notify::EventKind::Modify(_) => PluginEvent::FileChanged { path: path_str },
                    notify::EventKind::Remove(_) => PluginEvent::FileRemoved { path: path_str },
                    _ => continue,
                };

                result_events.push(plugin_event);
            }
        }

        Ok(result_events)
    }

    async fn execute(&mut self, action: PluginAction) -> Result<ActionResult> {
        match action {
            PluginAction::FileWatcherRefresh => {
                // Re-initialize to refresh watches
                self.shutdown().await?;
                self.initialize().await?;
                Ok(ActionResult::success(None))
            }

            PluginAction::FileWatcherClear => {
                // Clear pending events
                let mut events_guard = self.events.lock().await;
                events_guard.clear();
                Ok(ActionResult::success(None))
            }

            _ => Err(PluginError::ActionFailed(
                "Action not supported by FileWatcher plugin".to_string(),
            )),
        }
    }

    async fn health_check(&self) -> PluginHealthStatus {
        if !self.config.enabled {
            return PluginHealthStatus::unhealthy("Plugin is disabled");
        }

        if !self.initialized {
            return PluginHealthStatus::unhealthy("Plugin not initialized");
        }

        let watcher_guard = self.watcher.lock().await;
        if watcher_guard.is_none() {
            return PluginHealthStatus::unhealthy("Watcher not running");
        }

        PluginHealthStatus::healthy()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_plugin() {
        let config = FileWatcherConfig::default();
        let plugin = FileWatcherPlugin::new(config);
        assert_eq!(plugin.name(), "file_watcher");
        assert!(!plugin.is_enabled());
    }

    #[test]
    fn test_sensitive_paths() {
        assert!(FileWatcherPlugin::is_sensitive_path("/etc/passwd"));
        assert!(FileWatcherPlugin::is_sensitive_path("~/.ssh/id_rsa"));
        assert!(FileWatcherPlugin::is_sensitive_path("/root/.bashrc"));
        assert!(!FileWatcherPlugin::is_sensitive_path("/home/user/project"));
        assert!(!FileWatcherPlugin::is_sensitive_path("./src"));
    }

    #[test]
    fn test_build_globset() {
        let patterns = vec!["*.md".to_string(), "src/**/*.rs".to_string()];
        let globset = FileWatcherPlugin::build_globset(&patterns).unwrap();
        assert!(globset.is_match("README.md"));
        assert!(globset.is_match("src/main.rs"));
        assert!(!globset.is_match("package.json"));
    }

    #[tokio::test]
    async fn test_listen_empty() {
        let config = FileWatcherConfig::default();
        let mut plugin = FileWatcherPlugin::new(config);
        let events = plugin.listen().await.unwrap();
        assert!(events.is_empty());
    }
}
