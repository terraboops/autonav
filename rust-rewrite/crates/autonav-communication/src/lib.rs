//! Communication layer schemas and protocols for Autonav
//!
//! This crate provides the core data structures, schemas, and validation
//! for navigator configuration and communication.

pub mod schemas;
pub mod prompts;
pub mod validation;
pub mod errors;
pub mod version;

pub use schemas::*;
pub use errors::CommunicationError;
pub use version::PROTOCOL_VERSION;
