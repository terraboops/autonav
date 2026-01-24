//! Protocol versioning for communication layer

use semver::Version;

/// Current communication layer protocol version
pub const PROTOCOL_VERSION: &str = "1.0.0";

/// Get the current protocol version as a semver Version
pub fn protocol_version() -> Version {
    Version::parse(PROTOCOL_VERSION).expect("Invalid protocol version constant")
}

/// Check if a version string is compatible with current protocol
pub fn is_compatible(version: &str) -> bool {
    match Version::parse(version) {
        Ok(v) => v.major == protocol_version().major,
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_protocol_version_parses() {
        let v = protocol_version();
        assert_eq!(v.major, 1);
        assert_eq!(v.minor, 0);
        assert_eq!(v.patch, 0);
    }

    #[test]
    fn test_compatibility() {
        assert!(is_compatible("1.0.0"));
        assert!(is_compatible("1.1.0"));
        assert!(is_compatible("1.2.5"));
        assert!(!is_compatible("2.0.0"));
        assert!(!is_compatible("0.9.0"));
        assert!(!is_compatible("invalid"));
    }
}
