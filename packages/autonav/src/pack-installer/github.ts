import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

/**
 * Parsed GitHub URL components
 */
export interface GitHubUrlInfo {
  owner: string;
  repo: string;
  ref: string; // branch, tag, or commit
  path: string; // path within repo (can be empty for root)
  useSsh: boolean; // whether to use SSH for cloning
}

/**
 * GitHub Contents API response item
 */
interface GitHubContentItem {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
  sha: string;
}

/**
 * Parse a GitHub folder URL into components
 *
 * Supports formats:
 * - https://github.com/owner/repo/tree/main/path/to/folder
 * - https://github.com/owner/repo/tree/v1.0.0/path/to/folder
 * - github:owner/repo/path/to/folder (defaults to main branch)
 * - github:owner/repo/path/to/folder@v1.0.0
 * - git@github.com:owner/repo/path/to/folder (SSH)
 * - git@github.com:owner/repo/path/to/folder@v1.0.0 (SSH with ref)
 *
 * @param url - GitHub URL to parse
 * @returns Parsed URL components or null if not a valid GitHub URL
 */
export function parseGitHubUrl(url: string): GitHubUrlInfo | null {
  // Handle SSH URLs: git@github.com:owner/repo/path/to/folder[@ref]
  if (url.startsWith("git@github.com:")) {
    const sshPart = url.slice(15); // Remove "git@github.com:"

    // Check for @ref suffix (but not in the middle of a path)
    const atIndex = sshPart.lastIndexOf("@");
    let pathPart: string;
    let ref = "main";

    if (atIndex > 0) {
      pathPart = sshPart.slice(0, atIndex);
      ref = sshPart.slice(atIndex + 1);
    } else {
      pathPart = sshPart;
    }

    // Remove .git suffix if present
    pathPart = pathPart.replace(/\.git$/, "");

    // Split into owner/repo/path
    const parts = pathPart.split("/");
    if (parts.length < 2) {
      return null;
    }

    const owner = parts[0];
    const repo = parts[1];
    const folderPath = parts.slice(2).join("/");

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo, ref, path: folderPath, useSsh: true };
  }

  // Handle github: shorthand
  if (url.startsWith("github:")) {
    const shorthand = url.slice(7); // Remove "github:"

    // Check for @ref suffix
    const atIndex = shorthand.lastIndexOf("@");
    let pathPart: string;
    let ref = "main";

    if (atIndex > 0) {
      pathPart = shorthand.slice(0, atIndex);
      ref = shorthand.slice(atIndex + 1);
    } else {
      pathPart = shorthand;
    }

    // Split into owner/repo/path
    const parts = pathPart.split("/");
    if (parts.length < 2) {
      return null;
    }

    const owner = parts[0];
    const repo = parts[1];
    const folderPath = parts.slice(2).join("/");

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo, ref, path: folderPath, useSsh: false };
  }

  // Handle full GitHub URLs
  // https://github.com/owner/repo/tree/ref/path/to/folder
  const treeMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.*))?$/
  );

  if (treeMatch) {
    const [, owner, repo, ref, folderPath] = treeMatch;
    if (!owner || !repo || !ref) {
      return null;
    }
    return {
      owner,
      repo,
      ref,
      path: folderPath || "",
      useSsh: false,
    };
  }

  // Handle repo root URLs (no tree/ref)
  // https://github.com/owner/repo
  const repoMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/
  );

  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    if (!owner || !repo) {
      return null;
    }
    return {
      owner,
      repo,
      ref: "main",
      path: "",
      useSsh: false,
    };
  }

  return null;
}

/**
 * Check if a string is a GitHub URL
 */
export function isGitHubUrl(url: string): boolean {
  return (
    url.startsWith("github:") ||
    url.startsWith("git@github.com:") ||
    url.startsWith("https://github.com/") ||
    url.startsWith("http://github.com/")
  );
}

/**
 * Fetch contents of a GitHub folder using git sparse-checkout (SSH or HTTPS)
 *
 * @param info - Parsed GitHub URL info
 * @param targetDir - Directory to write files to
 * @param onProgress - Optional progress callback
 */
async function fetchGitHubFolderViaGit(
  info: GitHubUrlInfo,
  targetDir: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const { owner, repo, ref, path: folderPath, useSsh } = info;

  // Build the git remote URL
  const repoUrl = useSsh
    ? `git@github.com:${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`;

  onProgress?.(`Cloning via ${useSsh ? "SSH" : "HTTPS"} from ${owner}/${repo}@${ref}`);

  // Create a temp directory for the git clone
  const gitTempDir = fs.mkdtempSync(path.join(targetDir, ".git-clone-"));

  try {
    // Clone with sparse checkout (minimal download)
    execSync(
      `git clone --depth 1 --filter=blob:none --sparse "${repoUrl}" "${gitTempDir}" --branch "${ref}"`,
      { stdio: "pipe" }
    );

    // If we have a specific path, use sparse-checkout to get only that folder
    if (folderPath) {
      execSync(`git -C "${gitTempDir}" sparse-checkout set "${folderPath}"`, {
        stdio: "pipe",
      });
      onProgress?.(`Checked out ${folderPath}`);
    } else {
      // Get everything
      execSync(`git -C "${gitTempDir}" sparse-checkout disable`, {
        stdio: "pipe",
      });
    }

    // Copy files from the cloned folder to target directory
    const sourceDir = folderPath
      ? path.join(gitTempDir, folderPath)
      : gitTempDir;

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Path "${folderPath}" not found in repository`);
    }

    // Copy all files except .git
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") continue;

      const srcPath = path.join(sourceDir, entry.name);
      const destPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        copyDirectoryRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      onProgress?.(`Copied ${entry.name}`);
    }
  } finally {
    // Clean up git clone
    fs.rmSync(gitTempDir, { recursive: true, force: true });
  }
}

/**
 * Recursively copy a directory
 */
function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Fetch contents of a GitHub folder recursively
 *
 * Uses git sparse-checkout for SSH URLs (or when API fails),
 * otherwise uses GitHub Contents API for HTTPS.
 *
 * @param info - Parsed GitHub URL info
 * @param targetDir - Directory to write files to
 * @param onProgress - Optional progress callback
 */
export async function fetchGitHubFolder(
  info: GitHubUrlInfo,
  targetDir: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const { owner, repo, ref, path: folderPath, useSsh } = info;

  // Use git for SSH URLs (required for auth) or if explicitly requested
  if (useSsh) {
    return fetchGitHubFolderViaGit(info, targetDir, onProgress);
  }

  // Try API first for HTTPS (faster for small repos, no git dependency)
  onProgress?.(`Fetching from github.com/${owner}/${repo}/${folderPath || "(root)"}@${ref}`);

  // Use GitHub Contents API
  const apiUrl = folderPath
    ? `https://api.github.com/repos/${owner}/${repo}/contents/${folderPath}?ref=${ref}`
    : `https://api.github.com/repos/${owner}/${repo}/contents?ref=${ref}`;

  await fetchContentsRecursive(apiUrl, targetDir, "", onProgress);
}

/**
 * Recursively fetch contents from GitHub API
 */
async function fetchContentsRecursive(
  apiUrl: string,
  targetDir: string,
  relativePath: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "autonav-cli",
  };

  // Use GITHUB_TOKEN if available for higher rate limits
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `GitHub path not found. Check that the repository, branch, and path exist.`
      );
    }
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
      if (rateLimitRemaining === "0") {
        throw new Error(
          "GitHub API rate limit exceeded. Set GITHUB_TOKEN environment variable for higher limits."
        );
      }
    }
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  const rawContents = await response.json() as GitHubContentItem[] | GitHubContentItem;

  // Handle single file response (when path points to a file, not directory)
  if (!Array.isArray(rawContents)) {
    throw new Error(
      "GitHub path is a file, not a directory. Knowledge packs must be directories."
    );
  }

  const contents = rawContents;

  for (const item of contents) {
    const itemRelativePath = relativePath
      ? `${relativePath}/${item.name}`
      : item.name;
    const targetPath = path.join(targetDir, itemRelativePath);

    if (item.type === "dir") {
      // Create directory and recurse
      fs.mkdirSync(targetPath, { recursive: true });

      // Fetch subdirectory contents
      const subApiUrl = `https://api.github.com/repos/${extractRepoFromUrl(apiUrl)}/contents/${item.path}?ref=${extractRefFromUrl(apiUrl)}`;
      await fetchContentsRecursive(subApiUrl, targetDir, itemRelativePath, onProgress);
    } else if (item.type === "file" && item.download_url) {
      // Download file
      const fileResponse = await fetch(item.download_url);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download ${item.path}: ${fileResponse.status}`);
      }

      const content = await fileResponse.text();

      // Ensure parent directory exists
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(targetPath, content);
      onProgress?.(`Downloaded ${itemRelativePath}`);
    }
  }
}

/**
 * Extract owner/repo from API URL
 */
function extractRepoFromUrl(apiUrl: string): string {
  const match = apiUrl.match(/repos\/([^/]+\/[^/]+)/);
  return match?.[1] ?? "";
}

/**
 * Extract ref from API URL query string
 */
function extractRefFromUrl(apiUrl: string): string {
  const match = apiUrl.match(/ref=([^&]+)/);
  return match?.[1] ?? "main";
}
