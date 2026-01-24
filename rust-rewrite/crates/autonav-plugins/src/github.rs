//! GitHub plugin implementation

use async_trait::async_trait;
use octocrab::Octocrab;
use tracing::{debug, error, info};

use autonav_communication::GitHubConfig;

use crate::errors::{PluginError, Result};
use crate::plugin::{ActionResult, Plugin, PluginAction, PluginEvent, PluginHealthStatus};

/// GitHub plugin for repository integration
pub struct GitHubPlugin {
    config: GitHubConfig,
    client: Option<Octocrab>,
    initialized: bool,
}

impl GitHubPlugin {
    /// Create a new GitHub plugin
    pub fn new(config: GitHubConfig) -> Self {
        Self {
            config,
            client: None,
            initialized: false,
        }
    }

    /// Get the API token from config or environment
    fn get_token(&self) -> Result<String> {
        if let Some(token) = &self.config.token {
            return Ok(token.clone());
        }

        std::env::var("GITHUB_TOKEN").map_err(|_| {
            PluginError::AuthError("GITHUB_TOKEN not set and no token in config".to_string())
        })
    }

    /// Get the octocrab client
    fn client(&self) -> Result<&Octocrab> {
        self.client
            .as_ref()
            .ok_or_else(|| PluginError::InitializationFailed("Client not initialized".to_string()))
    }
}

#[async_trait]
impl Plugin for GitHubPlugin {
    fn name(&self) -> &'static str {
        "github"
    }

    fn version(&self) -> &'static str {
        "2.0.0"
    }

    fn description(&self) -> &'static str {
        "GitHub integration for repository management"
    }

    fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    async fn initialize(&mut self) -> Result<()> {
        if !self.config.enabled {
            debug!("GitHub plugin is disabled, skipping initialization");
            return Ok(());
        }

        info!("Initializing GitHub plugin");

        let token = self.get_token()?;
        let client = Octocrab::builder()
            .personal_token(token)
            .build()
            .map_err(|e| PluginError::InitializationFailed(e.to_string()))?;

        // Test authentication by getting current user
        let _user = client
            .current()
            .user()
            .await
            .map_err(|e| PluginError::AuthError(format!("Failed to authenticate: {}", e)))?;

        info!("GitHub authenticated successfully");
        self.client = Some(client);
        self.initialized = true;
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Shutting down GitHub plugin");
        self.client = None;
        self.initialized = false;
        Ok(())
    }

    async fn listen(&mut self) -> Result<Vec<PluginEvent>> {
        if !self.initialized {
            return Ok(Vec::new());
        }

        let client = self.client()?;
        let mut events = Vec::new();

        // Poll for issues if watching
        if self.config.watch_issues && !self.config.owner.is_empty() && !self.config.repo.is_empty()
        {
            match client
                .issues(&self.config.owner, &self.config.repo)
                .list()
                .state(octocrab::params::State::Open)
                .per_page(10)
                .send()
                .await
            {
                Ok(page) => {
                    for issue in page.items {
                        events.push(PluginEvent::GitHubIssue {
                            owner: self.config.owner.clone(),
                            repo: self.config.repo.clone(),
                            number: issue.number,
                            title: issue.title,
                            body: issue.body,
                            action: "open".to_string(),
                        });
                    }
                }
                Err(e) => {
                    error!("Failed to fetch issues: {}", e);
                }
            }
        }

        // Poll for PRs if watching
        if self.config.watch_pull_requests
            && !self.config.owner.is_empty()
            && !self.config.repo.is_empty()
        {
            match client
                .pulls(&self.config.owner, &self.config.repo)
                .list()
                .state(octocrab::params::State::Open)
                .per_page(10)
                .send()
                .await
            {
                Ok(page) => {
                    for pr in page.items {
                        events.push(PluginEvent::GitHubPullRequest {
                            owner: self.config.owner.clone(),
                            repo: self.config.repo.clone(),
                            number: pr.number,
                            title: pr.title.unwrap_or_default(),
                            body: pr.body,
                            action: "open".to_string(),
                        });
                    }
                }
                Err(e) => {
                    error!("Failed to fetch PRs: {}", e);
                }
            }
        }

        Ok(events)
    }

    async fn execute(&mut self, action: PluginAction) -> Result<ActionResult> {
        let client = self.client()?;

        match action {
            PluginAction::GitHubCreateIssue {
                owner,
                repo,
                title,
                body,
                labels,
            } => {
                let issues_handler = client.issues(&owner, &repo);
                let create_builder = issues_handler.create(&title);

                // Build with body if present
                let create_builder = match body {
                    Some(b) => create_builder.body(b),
                    None => create_builder,
                };

                // Build with labels if present
                let create_builder = if !labels.is_empty() {
                    create_builder.labels(labels)
                } else {
                    create_builder
                };

                let issue = create_builder
                    .send()
                    .await
                    .map_err(|e| PluginError::ActionFailed(e.to_string()))?;

                Ok(ActionResult::success(Some(serde_json::json!({
                    "number": issue.number,
                    "url": issue.html_url
                }))))
            }

            PluginAction::GitHubCommentIssue {
                owner,
                repo,
                issue_number,
                body,
            } => {
                let comment = client
                    .issues(&owner, &repo)
                    .create_comment(issue_number, body)
                    .await
                    .map_err(|e| PluginError::ActionFailed(e.to_string()))?;

                Ok(ActionResult::success(Some(serde_json::json!({
                    "id": comment.id,
                    "url": comment.html_url
                }))))
            }

            PluginAction::GitHubCloseIssue {
                owner,
                repo,
                issue_number,
            } => {
                client
                    .issues(&owner, &repo)
                    .update(issue_number)
                    .state(octocrab::models::IssueState::Closed)
                    .send()
                    .await
                    .map_err(|e| PluginError::ActionFailed(e.to_string()))?;

                Ok(ActionResult::success(None))
            }

            PluginAction::GitHubCreatePr {
                owner,
                repo,
                title,
                body,
                head,
                base,
            } => {
                let pr = client
                    .pulls(&owner, &repo)
                    .create(&title, &head, &base)
                    .body(body.unwrap_or_default())
                    .send()
                    .await
                    .map_err(|e| PluginError::ActionFailed(e.to_string()))?;

                Ok(ActionResult::success(Some(serde_json::json!({
                    "number": pr.number,
                    "url": pr.html_url
                }))))
            }

            PluginAction::GitHubCommentPr {
                owner,
                repo,
                pr_number,
                body,
            } => {
                // PRs are also issues in GitHub API
                let comment = client
                    .issues(&owner, &repo)
                    .create_comment(pr_number, body)
                    .await
                    .map_err(|e| PluginError::ActionFailed(e.to_string()))?;

                Ok(ActionResult::success(Some(serde_json::json!({
                    "id": comment.id,
                    "url": comment.html_url
                }))))
            }

            PluginAction::GitHubMergePr {
                owner,
                repo,
                pr_number,
            } => {
                client
                    .pulls(&owner, &repo)
                    .merge(pr_number)
                    .send()
                    .await
                    .map_err(|e| PluginError::ActionFailed(e.to_string()))?;

                Ok(ActionResult::success(None))
            }

            PluginAction::GitHubAddLabel {
                owner,
                repo,
                issue_number,
                label,
            } => {
                client
                    .issues(&owner, &repo)
                    .add_labels(issue_number, &[label])
                    .await
                    .map_err(|e| PluginError::ActionFailed(e.to_string()))?;

                Ok(ActionResult::success(None))
            }

            _ => Err(PluginError::ActionFailed(
                "Action not supported by GitHub plugin".to_string(),
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

        match self.client() {
            Ok(client) => match client.current().user().await {
                Ok(_) => PluginHealthStatus::healthy(),
                Err(e) => PluginHealthStatus::unhealthy(format!("API check failed: {}", e)),
            },
            Err(e) => PluginHealthStatus::unhealthy(format!("Client error: {}", e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_plugin() {
        let config = GitHubConfig::default();
        let plugin = GitHubPlugin::new(config);
        assert_eq!(plugin.name(), "github");
        assert!(!plugin.is_enabled());
    }

    #[test]
    fn test_enabled_plugin() {
        let config = GitHubConfig {
            enabled: true,
            owner: "test".to_string(),
            repo: "repo".to_string(),
            ..Default::default()
        };
        let plugin = GitHubPlugin::new(config);
        assert!(plugin.is_enabled());
    }
}
