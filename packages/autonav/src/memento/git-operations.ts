/**
 * Git Operations for Memento Loop
 *
 * Helper functions for git operations: branches, commits, logs, PRs.
 */

import { execSync, type ExecSyncOptions } from "node:child_process";

/**
 * Options for git operations
 */
interface GitOptions {
  cwd: string;
  verbose?: boolean;
}

/**
 * Execute a git command and return output
 */
function execGit(command: string, options: GitOptions): string {
  const execOptions: ExecSyncOptions = {
    cwd: options.cwd,
    encoding: "utf-8",
    stdio: options.verbose ? "inherit" : "pipe",
  };

  try {
    const result = execSync(command, execOptions);
    return typeof result === "string" ? result.trim() : "";
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new Error(`Git command failed: ${command}\n${(error as Error & { stderr: string }).stderr}`);
    }
    throw error;
  }
}

/**
 * Check if directory is a git repository
 */
export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize a git repository if not already initialized
 */
export function ensureGitRepo(options: GitOptions): void {
  if (!isGitRepo(options.cwd)) {
    execGit("git init", options);
    if (options.verbose) {
      console.log(`Initialized git repository in ${options.cwd}`);
    }
  }
}

/**
 * Get current branch name
 */
export function getCurrentBranch(options: GitOptions): string {
  try {
    return execGit("git branch --show-current", { ...options, verbose: false });
  } catch {
    return "HEAD"; // Detached HEAD state
  }
}

/**
 * Create and checkout a new branch
 */
export function createBranch(name: string, options: GitOptions): void {
  // Check if branch already exists
  try {
    execGit(`git rev-parse --verify ${name}`, { ...options, verbose: false });
    // Branch exists, just checkout
    execGit(`git checkout ${name}`, options);
    if (options.verbose) {
      console.log(`Switched to existing branch: ${name}`);
    }
  } catch {
    // Branch doesn't exist, create it
    execGit(`git checkout -b ${name}`, options);
    if (options.verbose) {
      console.log(`Created and switched to branch: ${name}`);
    }
  }
}

/**
 * Get recent git log entries
 */
export function getRecentGitLog(
  options: GitOptions & { count?: number }
): string {
  const count = options.count ?? 10;

  try {
    // Check if there are any commits
    execGit("git rev-parse HEAD", { ...options, verbose: false });

    return execGit(
      `git log --oneline --no-decorate -n ${count}`,
      { ...options, verbose: false }
    );
  } catch {
    // No commits yet
    return "";
  }
}

/**
 * Get diff of recent changes (staged + unstaged)
 */
export function getRecentDiff(options: GitOptions): string {
  try {
    const staged = execGit("git diff --cached", { ...options, verbose: false });
    const unstaged = execGit("git diff", { ...options, verbose: false });
    return `${staged}\n${unstaged}`.trim();
  } catch {
    return "";
  }
}

/**
 * Diff statistics
 */
export interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Get diff stats (lines added/removed) for uncommitted changes
 */
export function getDiffStats(options: GitOptions): DiffStats {
  try {
    // git diff --shortstat outputs: " 3 files changed, 10 insertions(+), 5 deletions(-)"
    const output = execGit("git diff --shortstat", { ...options, verbose: false });

    if (!output) {
      return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
    }

    const filesMatch = output.match(/(\d+) files? changed/);
    const insertionsMatch = output.match(/(\d+) insertions?\(\+\)/);
    const deletionsMatch = output.match(/(\d+) deletions?\(-\)/);

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1]!, 10) : 0,
      linesAdded: insertionsMatch ? parseInt(insertionsMatch[1]!, 10) : 0,
      linesRemoved: deletionsMatch ? parseInt(deletionsMatch[1]!, 10) : 0,
    };
  } catch {
    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
  }
}

/**
 * Get diff stats between HEAD and HEAD~1 (last commit)
 */
export function getLastCommitDiffStats(options: GitOptions): DiffStats {
  try {
    const output = execGit("git diff --shortstat HEAD~1 HEAD", { ...options, verbose: false });

    if (!output) {
      return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
    }

    const filesMatch = output.match(/(\d+) files? changed/);
    const insertionsMatch = output.match(/(\d+) insertions?\(\+\)/);
    const deletionsMatch = output.match(/(\d+) deletions?\(-\)/);

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1]!, 10) : 0,
      linesAdded: insertionsMatch ? parseInt(insertionsMatch[1]!, 10) : 0,
      linesRemoved: deletionsMatch ? parseInt(deletionsMatch[1]!, 10) : 0,
    };
  } catch {
    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
  }
}

/**
 * Check if there are uncommitted changes
 */
export function hasUncommittedChanges(options: GitOptions): boolean {
  try {
    const status = execGit("git status --porcelain", { ...options, verbose: false });
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Stage all changes
 */
export function stageAllChanges(options: GitOptions): void {
  execGit("git add -A", options);
}

/**
 * Commit staged changes
 *
 * Returns the commit hash, or null if nothing to commit
 */
export function commitChanges(
  message: string,
  options: GitOptions
): string | null {
  // Check if there's anything to commit
  if (!hasUncommittedChanges(options)) {
    if (options.verbose) {
      console.log("No changes to commit");
    }
    return null;
  }

  // Stage all changes
  stageAllChanges(options);

  // Commit
  execGit(`git commit -m "${message.replace(/"/g, '\\"')}"`, options);

  // Get the commit hash
  const hash = execGit("git rev-parse --short HEAD", { ...options, verbose: false });

  if (options.verbose) {
    console.log(`Committed: ${hash} - ${message}`);
  }

  return hash;
}

/**
 * Push branch to remote
 */
export function pushBranch(
  branch: string,
  options: GitOptions & { setUpstream?: boolean }
): void {
  const upstream = options.setUpstream ? "-u origin" : "";
  execGit(`git push ${upstream} ${branch}`.trim(), options);

  if (options.verbose) {
    console.log(`Pushed branch: ${branch}`);
  }
}

/**
 * Create a pull request using GitHub CLI
 *
 * Requires `gh` CLI to be installed and authenticated
 */
export function createPullRequest(
  options: GitOptions & {
    title: string;
    body: string;
    base?: string;
    draft?: boolean;
  }
): string {
  const { title, body, base = "main", draft = false } = options;

  // Escape for shell
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedBody = body.replace(/"/g, '\\"');

  const draftFlag = draft ? "--draft" : "";

  const output = execGit(
    `gh pr create --title "${escapedTitle}" --body "${escapedBody}" --base ${base} ${draftFlag}`.trim(),
    options
  );

  // gh pr create outputs the PR URL
  const prUrl = output.split("\n").pop() || output;

  if (options.verbose) {
    console.log(`Created PR: ${prUrl}`);
  }

  return prUrl;
}

/**
 * Check if gh CLI is available and authenticated
 */
export function isGhAvailable(): boolean {
  try {
    execSync("gh auth status", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the remote origin URL
 */
export function getRemoteUrl(options: GitOptions): string | null {
  try {
    return execGit("git remote get-url origin", { ...options, verbose: false });
  } catch {
    return null;
  }
}

/**
 * Detect the default branch (main or master).
 *
 * Tries `git symbolic-ref refs/remotes/origin/HEAD` first, then falls back
 * to checking if `main` or `master` exist locally.
 */
export function getDefaultBranch(options: GitOptions): string {
  // Try remote HEAD symbolic ref
  try {
    const ref = execGit("git symbolic-ref refs/remotes/origin/HEAD", { ...options, verbose: false });
    // ref looks like "refs/remotes/origin/main"
    const branch = ref.split("/").pop();
    if (branch) return branch;
  } catch {
    // No remote HEAD — fall through to local check
  }

  // Check if main exists locally
  try {
    execGit("git rev-parse --verify main", { ...options, verbose: false });
    return "main";
  } catch {
    // fall through
  }

  // Check if master exists locally
  try {
    execGit("git rev-parse --verify master", { ...options, verbose: false });
    return "master";
  } catch {
    // fall through
  }

  // Default to main
  return "main";
}

/**
 * Create a git worktree checked out on a new branch forked from baseBranch.
 *
 * Runs: `git worktree add -b <branch> <worktreePath> <baseBranch>` from repoDir.
 */
export function createWorktree(
  repoDir: string,
  worktreePath: string,
  branch: string,
  baseBranch?: string
): void {
  const base = baseBranch || getDefaultBranch({ cwd: repoDir });
  execGit(
    `git worktree add -b ${branch} "${worktreePath}" ${base}`,
    { cwd: repoDir }
  );
}

/**
 * Remove a git worktree and clean up.
 */
export function removeWorktree(repoDir: string, worktreePath: string): void {
  try {
    execGit(`git worktree remove "${worktreePath}" --force`, { cwd: repoDir });
  } catch {
    // If git worktree remove fails, try manual cleanup
  }

  // Clean up directory if it lingers
  try {
    const fs = require("node:fs");
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  } catch {
    // Best effort cleanup
  }
}

/**
 * Convert a plan summary into a git branch name.
 *
 * "feat: Add user authentication" → "feat/add-user-authentication"
 * Lowercase, replace spaces/special chars with hyphens, truncate to ~50 chars.
 */
export function slugifyBranchName(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/:\s*/g, "/")         // "feat: ..." → "feat/..."
    .replace(/[^a-z0-9/]+/g, "-")  // non-alphanumeric → hyphens
    .replace(/-+/g, "-")           // collapse multiple hyphens
    .replace(/^-|-$/g, "")         // trim leading/trailing hyphens
    .replace(/\/-|-\//g, "/")      // clean hyphens around slashes
    .substring(0, 50)
    .replace(/-$/, "");            // trim trailing hyphen after truncation
}

/**
 * Get list of uncommitted files with their status indicators.
 *
 * Returns lines like: "M  src/foo.ts", "?? new-file.ts", "A  added.ts"
 */
export function getUncommittedFiles(options: GitOptions): string[] {
  try {
    const output = execGit("git status --porcelain", { ...options, verbose: false });
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
