//! Autonav - LLM-agnostic context management system
//!
//! This crate provides the core functionality for Autonav navigators:
//! - Knowledge pack installation
//! - Query engine with Claude API integration
//! - Navigator loading and management
//! - Self-configuration tools

pub mod errors;
pub mod navigator;
pub mod pack_installer;
pub mod query_engine;
pub mod adapter;
pub mod templates;
pub mod tools;
pub mod repo_scanner;

pub use errors::{AutonavError, Result};
pub use navigator::{Navigator, LoadedNavigator};
pub use pack_installer::PackInstaller;
pub use query_engine::QueryEngine;
pub use adapter::ClaudeAdapter;
