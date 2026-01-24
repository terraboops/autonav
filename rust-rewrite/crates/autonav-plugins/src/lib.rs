//! Plugin system for Autonav
//!
//! This crate provides the plugin infrastructure including:
//! - Plugin trait definition
//! - Built-in plugins (Slack, GitHub, FileWatcher)
//! - Plugin manager for orchestration

pub mod plugin;
pub mod manager;
pub mod slack;
pub mod github;
pub mod file_watcher;
pub mod errors;

pub use plugin::{Plugin, PluginEvent, PluginAction, PluginHealthStatus};
pub use manager::PluginManager;
pub use errors::PluginError;
