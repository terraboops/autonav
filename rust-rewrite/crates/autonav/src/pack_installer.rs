//! Knowledge pack installation from various sources

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use regex::Regex;
use reqwest::Client;
use tar::Archive;
use tracing::{debug, info, warn};

use autonav_communication::PackMetadata;

use crate::errors::{AutonavError, Result};

/// Default knowledge pack server
pub const DEFAULT_PACK_SERVER: &str = "https://packs.autonav.dev";

/// Knowledge pack installer
pub struct PackInstaller {
    client: Client,
    server_url: String,
}

/// Parsed GitHub URL components
#[derive(Debug, Clone)]
pub struct GitHubUrl {
    pub owner: String,
    pub repo: String,
    pub path: String,
    pub branch: Option<String>,
}

impl PackInstaller {
    /// Create a new pack installer with default server
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            server_url: DEFAULT_PACK_SERVER.to_string(),
        }
    }

    /// Create a pack installer with a custom server URL
    pub fn with_server(server_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            server_url: server_url.into(),
        }
    }

    /// Install a pack from a local tar.gz file
    pub async fn install_from_file(
        &self,
        file_path: &Path,
        dest_path: &Path,
    ) -> Result<PackMetadata> {
        info!("Installing pack from file: {:?}", file_path);

        let file = std::fs::File::open(file_path)?;
        let decoder = GzDecoder::new(file);
        let mut archive = Archive::new(decoder);

        // Create destination directory
        std::fs::create_dir_all(dest_path)?;

        // Extract all files
        archive.unpack(dest_path)?;

        // Load and validate metadata
        let metadata_path = dest_path.join("metadata.json");
        if !metadata_path.exists() {
            return Err(AutonavError::PackInstallError(
                "Pack missing metadata.json".to_string(),
            ));
        }

        let metadata = PackMetadata::from_file(&metadata_path).map_err(|e| {
            AutonavError::PackInstallError(format!("Invalid metadata.json: {}", e))
        })?;

        info!("Installed pack: {} v{}", metadata.name, metadata.version);
        Ok(metadata)
    }

    /// Install a pack from the pack server
    pub async fn install_from_server(
        &self,
        pack_name: &str,
        version: Option<&str>,
        dest_path: &Path,
    ) -> Result<PackMetadata> {
        let url = match version {
            Some(v) => format!("{}/packs/{}/{}", self.server_url, pack_name, v),
            None => format!("{}/packs/{}/latest", self.server_url, pack_name),
        };

        info!("Downloading pack from: {}", url);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(AutonavError::PackInstallError(format!(
                "Failed to download pack: HTTP {}",
                response.status()
            )));
        }

        // Save to temp file
        let bytes = response.bytes().await?;
        let temp_file = tempfile::NamedTempFile::new()?;
        std::fs::write(temp_file.path(), &bytes)?;

        // Install from temp file
        self.install_from_file(temp_file.path(), dest_path).await
    }

    /// Install a pack from GitHub
    pub async fn install_from_github(
        &self,
        github_url: &GitHubUrl,
        dest_path: &Path,
    ) -> Result<PackMetadata> {
        info!(
            "Installing pack from GitHub: {}/{}:{}",
            github_url.owner, github_url.repo, github_url.path
        );

        // Use GitHub Contents API to fetch directory contents
        let branch = github_url.branch.as_deref().unwrap_or("main");
        let api_url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
            github_url.owner, github_url.repo, github_url.path, branch
        );

        // Fetch directory listing
        let response = self
            .client
            .get(&api_url)
            .header("User-Agent", "autonav")
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(AutonavError::GitHubError(format!(
                "Failed to fetch from GitHub: HTTP {}",
                response.status()
            )));
        }

        let contents: Vec<GitHubContent> = response.json().await?;

        // Create destination directory
        std::fs::create_dir_all(dest_path)?;

        // Download all files recursively
        self.download_github_contents(&contents, dest_path, &github_url, branch)
            .await?;

        // Load metadata
        let metadata_path = dest_path.join("metadata.json");
        if !metadata_path.exists() {
            return Err(AutonavError::PackInstallError(
                "Pack missing metadata.json".to_string(),
            ));
        }

        let metadata = PackMetadata::from_file(&metadata_path).map_err(|e| {
            AutonavError::PackInstallError(format!("Invalid metadata.json: {}", e))
        })?;

        info!("Installed pack: {} v{}", metadata.name, metadata.version);
        Ok(metadata)
    }

    /// Download GitHub contents recursively
    async fn download_github_contents(
        &self,
        contents: &[GitHubContent],
        dest_path: &Path,
        github_url: &GitHubUrl,
        branch: &str,
    ) -> Result<()> {
        for item in contents {
            let item_dest = dest_path.join(&item.name);

            match item.content_type.as_str() {
                "file" => {
                    // Download file content
                    if let Some(download_url) = &item.download_url {
                        debug!("Downloading: {}", item.name);
                        let response = self
                            .client
                            .get(download_url)
                            .header("User-Agent", "autonav")
                            .send()
                            .await?;

                        if response.status().is_success() {
                            let content = response.bytes().await?;
                            std::fs::write(&item_dest, &content)?;
                        } else {
                            warn!("Failed to download {}: {}", item.name, response.status());
                        }
                    }
                }
                "dir" => {
                    // Recursively fetch directory contents
                    std::fs::create_dir_all(&item_dest)?;

                    let api_url = format!(
                        "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
                        github_url.owner, github_url.repo, item.path, branch
                    );

                    let response = self
                        .client
                        .get(&api_url)
                        .header("User-Agent", "autonav")
                        .header("Accept", "application/vnd.github.v3+json")
                        .send()
                        .await?;

                    if response.status().is_success() {
                        let sub_contents: Vec<GitHubContent> = response.json().await?;
                        Box::pin(self.download_github_contents(
                            &sub_contents,
                            &item_dest,
                            github_url,
                            branch,
                        ))
                        .await?;
                    }
                }
                _ => {
                    debug!("Skipping unknown type: {} ({})", item.name, item.content_type);
                }
            }
        }

        Ok(())
    }

    /// Smart install - detect source type and install appropriately
    pub async fn install(
        &self,
        source: &str,
        dest_path: &Path,
    ) -> Result<PackMetadata> {
        // Check if it's a local file
        let source_path = Path::new(source);
        if source_path.exists() && source_path.extension().map_or(false, |e| e == "gz") {
            return self.install_from_file(source_path, dest_path).await;
        }

        // Check if it's a GitHub URL
        if let Some(github_url) = Self::parse_github_url(source) {
            return self.install_from_github(&github_url, dest_path).await;
        }

        // Assume it's a pack name from the server
        self.install_from_server(source, None, dest_path).await
    }

    /// Parse various GitHub URL formats
    pub fn parse_github_url(input: &str) -> Option<GitHubUrl> {
        // Full HTTPS URL: https://github.com/owner/repo/tree/branch/path
        let https_re = Regex::new(
            r"^https?://github\.com/([^/]+)/([^/]+)/tree/([^/]+)/(.+)$"
        ).ok()?;
        if let Some(caps) = https_re.captures(input) {
            return Some(GitHubUrl {
                owner: caps[1].to_string(),
                repo: caps[2].to_string(),
                branch: Some(caps[3].to_string()),
                path: caps[4].to_string(),
            });
        }

        // Shorthand: github:owner/repo/path or github:owner/repo/path@version
        let shorthand_re = Regex::new(
            r"^github:([^/]+)/([^/]+)/(.+?)(?:@(.+))?$"
        ).ok()?;
        if let Some(caps) = shorthand_re.captures(input) {
            return Some(GitHubUrl {
                owner: caps[1].to_string(),
                repo: caps[2].to_string(),
                path: caps[3].to_string(),
                branch: caps.get(4).map(|m| m.as_str().to_string()),
            });
        }

        // SSH format: git@github.com:owner/repo/path
        let ssh_re = Regex::new(
            r"^git@github\.com:([^/]+)/([^/]+)/(.+)$"
        ).ok()?;
        if let Some(caps) = ssh_re.captures(input) {
            return Some(GitHubUrl {
                owner: caps[1].to_string(),
                repo: caps[2].to_string(),
                path: caps[3].to_string(),
                branch: None,
            });
        }

        None
    }
}

impl Default for PackInstaller {
    fn default() -> Self {
        Self::new()
    }
}

/// GitHub API content response
#[derive(Debug, serde::Deserialize)]
struct GitHubContent {
    name: String,
    path: String,
    #[serde(rename = "type")]
    content_type: String,
    download_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_url_https() {
        let url = "https://github.com/owner/repo/tree/main/packs/my-pack";
        let parsed = PackInstaller::parse_github_url(url).unwrap();
        assert_eq!(parsed.owner, "owner");
        assert_eq!(parsed.repo, "repo");
        assert_eq!(parsed.branch, Some("main".to_string()));
        assert_eq!(parsed.path, "packs/my-pack");
    }

    #[test]
    fn test_parse_github_url_shorthand() {
        let url = "github:owner/repo/packs/my-pack";
        let parsed = PackInstaller::parse_github_url(url).unwrap();
        assert_eq!(parsed.owner, "owner");
        assert_eq!(parsed.repo, "repo");
        assert_eq!(parsed.branch, None);
        assert_eq!(parsed.path, "packs/my-pack");
    }

    #[test]
    fn test_parse_github_url_shorthand_with_version() {
        let url = "github:owner/repo/packs/my-pack@v1.0.0";
        let parsed = PackInstaller::parse_github_url(url).unwrap();
        assert_eq!(parsed.owner, "owner");
        assert_eq!(parsed.repo, "repo");
        assert_eq!(parsed.branch, Some("v1.0.0".to_string()));
        assert_eq!(parsed.path, "packs/my-pack");
    }

    #[test]
    fn test_parse_github_url_ssh() {
        let url = "git@github.com:owner/repo/packs/my-pack";
        let parsed = PackInstaller::parse_github_url(url).unwrap();
        assert_eq!(parsed.owner, "owner");
        assert_eq!(parsed.repo, "repo");
        assert_eq!(parsed.path, "packs/my-pack");
    }

    #[test]
    fn test_parse_github_url_invalid() {
        assert!(PackInstaller::parse_github_url("not-a-url").is_none());
        assert!(PackInstaller::parse_github_url("https://gitlab.com/owner/repo").is_none());
    }
}
