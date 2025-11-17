import { z } from 'zod';
import { Plugin, PluginHealthStatus } from '../../types.js';
import { Octokit } from '@octokit/rest';

// Configuration schema
export const GitHubConfigSchema = z.object({
  token: z.string().describe('GitHub Personal Access Token'),
  owner: z.string().describe('Repository owner (username or org)'),
  repo: z.string().describe('Repository name'),
  watchIssues: z.boolean().default(true).describe('Monitor issues'),
  watchPullRequests: z.boolean().default(true).describe('Monitor pull requests'),
  watchCommits: z.boolean().default(false).describe('Monitor commits'),
  pollIntervalMinutes: z.number().default(5).describe('How often to check for updates'),
});

export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

// Event schema
export const GitHubEventSchema = z.object({
  type: z.enum(['issue', 'pull_request', 'commit', 'comment']),
  action: z.enum(['opened', 'closed', 'updated', 'commented']),
  number: z.number().optional(),
  sha: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  author: z.string(),
  url: z.string(),
  timestamp: z.string(),
});

export type GitHubEvent = z.infer<typeof GitHubEventSchema>;

// Action schema
export const GitHubActionSchema = z.object({
  type: z.enum([
    'create-issue',
    'comment-issue',
    'close-issue',
    'create-pr',
    'comment-pr',
    'merge-pr',
    'add-label',
  ]),
  issueNumber: z.number().optional(),
  prNumber: z.number().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  comment: z.string().optional(),
  labels: z.array(z.string()).optional(),
  head: z.string().optional(), // PR head branch
  base: z.string().optional(), // PR base branch
});

export type GitHubAction = z.infer<typeof GitHubActionSchema>;

/**
 * GitHub Integration Plugin
 *
 * Enables navigators to monitor and interact with GitHub repositories.
 * Supports issues, pull requests, commits, and comments.
 */
export class GitHubPlugin implements Plugin<GitHubConfig, GitHubEvent, GitHubAction> {
  readonly name = 'github';
  readonly version = '1.0.0';
  readonly description = 'Monitor and interact with GitHub repositories';
  readonly configSchema = GitHubConfigSchema;
  readonly eventSchema = GitHubEventSchema;
  readonly actionSchema = GitHubActionSchema;

  private config?: GitHubConfig;
  private octokit?: Octokit;
  private lastCheckTime: Date = new Date(0);

  async initialize(config: GitHubConfig): Promise<void> {
    this.config = config;

    // Initialize Octokit
    this.octokit = new Octokit({
      auth: config.token,
    });

    // Verify authentication and repository access
    try {
      const { data: user } = await this.octokit.users.getAuthenticated();
      console.log(`Authenticated as GitHub user: ${user.login}`);

      const { data: repo } = await this.octokit.repos.get({
        owner: config.owner,
        repo: config.repo,
      });

      console.log(`Watching repository: ${repo.full_name}`);
    } catch (error) {
      throw new Error(
        `GitHub initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listen(): Promise<GitHubEvent[]> {
    if (!this.octokit || !this.config) {
      return [];
    }

    const events: GitHubEvent[] = [];
    const since = this.lastCheckTime.toISOString();

    try {
      // Fetch issues
      if (this.config.watchIssues) {
        const { data: issues } = await this.octokit.issues.listForRepo({
          owner: this.config.owner,
          repo: this.config.repo,
          since,
          state: 'all',
          per_page: 50,
        });

        for (const issue of issues) {
          // Skip pull requests (they appear in issues API)
          if (issue.pull_request) continue;

          const action = issue.state === 'open'
            ? (new Date(issue.created_at) > this.lastCheckTime ? 'opened' : 'updated')
            : 'closed';

          events.push({
            type: 'issue',
            action,
            number: issue.number,
            title: issue.title,
            body: issue.body || '',
            author: issue.user?.login || 'unknown',
            url: issue.html_url,
            timestamp: issue.updated_at,
          });
        }
      }

      // Fetch pull requests
      if (this.config.watchPullRequests) {
        const { data: prs } = await this.octokit.pulls.list({
          owner: this.config.owner,
          repo: this.config.repo,
          state: 'all',
          per_page: 50,
        });

        for (const pr of prs) {
          const updatedAt = new Date(pr.updated_at);
          if (updatedAt <= this.lastCheckTime) continue;

          const action = pr.state === 'open'
            ? (new Date(pr.created_at) > this.lastCheckTime ? 'opened' : 'updated')
            : 'closed';

          events.push({
            type: 'pull_request',
            action,
            number: pr.number,
            title: pr.title,
            body: pr.body || '',
            author: pr.user?.login || 'unknown',
            url: pr.html_url,
            timestamp: pr.updated_at,
          });
        }
      }

      // Fetch commits
      if (this.config.watchCommits) {
        const { data: commits } = await this.octokit.repos.listCommits({
          owner: this.config.owner,
          repo: this.config.repo,
          since,
          per_page: 50,
        });

        for (const commit of commits) {
          events.push({
            type: 'commit',
            action: 'opened',
            sha: commit.sha,
            title: commit.commit.message.split('\n')[0],
            body: commit.commit.message,
            author: commit.commit.author?.name || 'unknown',
            url: commit.html_url,
            timestamp: commit.commit.author?.date || new Date().toISOString(),
          });
        }
      }

      // Update last check time
      this.lastCheckTime = new Date();

    } catch (error) {
      console.error('Error fetching GitHub events:', error);
    }

    return events;
  }

  async execute(action: GitHubAction): Promise<unknown> {
    if (!this.octokit || !this.config) {
      throw new Error('GitHub client not initialized');
    }

    const { owner, repo } = this.config;

    switch (action.type) {
      case 'create-issue': {
        if (!action.title || !action.body) {
          throw new Error('Title and body required for creating issue');
        }

        const { data } = await this.octokit.issues.create({
          owner,
          repo,
          title: action.title,
          body: action.body,
          labels: action.labels,
        });

        return data;
      }

      case 'comment-issue': {
        if (!action.issueNumber || !action.comment) {
          throw new Error('Issue number and comment required');
        }

        const { data } = await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: action.issueNumber,
          body: action.comment,
        });

        return data;
      }

      case 'close-issue': {
        if (!action.issueNumber) {
          throw new Error('Issue number required');
        }

        const { data } = await this.octokit.issues.update({
          owner,
          repo,
          issue_number: action.issueNumber,
          state: 'closed',
        });

        return data;
      }

      case 'create-pr': {
        if (!action.title || !action.body || !action.head || !action.base) {
          throw new Error('Title, body, head, and base required for creating PR');
        }

        const { data } = await this.octokit.pulls.create({
          owner,
          repo,
          title: action.title,
          body: action.body,
          head: action.head,
          base: action.base,
        });

        return data;
      }

      case 'comment-pr': {
        if (!action.prNumber || !action.comment) {
          throw new Error('PR number and comment required');
        }

        const { data } = await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: action.prNumber,
          body: action.comment,
        });

        return data;
      }

      case 'merge-pr': {
        if (!action.prNumber) {
          throw new Error('PR number required');
        }

        const { data } = await this.octokit.pulls.merge({
          owner,
          repo,
          pull_number: action.prNumber,
        });

        return data;
      }

      case 'add-label': {
        if (!action.issueNumber || !action.labels || action.labels.length === 0) {
          throw new Error('Issue number and labels required');
        }

        const { data } = await this.octokit.issues.addLabels({
          owner,
          repo,
          issue_number: action.issueNumber,
          labels: action.labels,
        });

        return data;
      }

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  async updateConfig(updates: Partial<GitHubConfig>): Promise<GitHubConfig> {
    if (!this.config) {
      throw new Error('Plugin not initialized');
    }

    const newConfig = { ...this.config, ...updates };

    // Re-initialize if token or repo changed
    if (
      (updates.token && updates.token !== this.config.token) ||
      (updates.owner && updates.owner !== this.config.owner) ||
      (updates.repo && updates.repo !== this.config.repo)
    ) {
      await this.shutdown();
      await this.initialize(newConfig);
    } else {
      this.config = newConfig;
    }

    return newConfig;
  }

  getConfig(): GitHubConfig {
    if (!this.config) {
      throw new Error('Plugin not initialized');
    }
    return { ...this.config };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    if (!this.octokit) {
      return {
        healthy: false,
        message: 'Client not initialized',
      };
    }

    try {
      const { data: user } = await this.octokit.users.getAuthenticated();
      const { data: repo } = await this.octokit.repos.get({
        owner: this.config!.owner,
        repo: this.config!.repo,
      });

      return {
        healthy: true,
        message: 'Connected to GitHub',
        metadata: {
          user: user.login,
          repository: repo.full_name,
          private: repo.private,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        lastError: error instanceof Error ? error : undefined,
      };
    }
  }

  async shutdown(): Promise<void> {
    this.octokit = undefined;
    this.lastCheckTime = new Date(0);
  }
}
