import * as fs from "node:fs";
import * as path from "node:path";
import ignore from "ignore";

/**
 * Repository Scanner
 *
 * Scans an existing repository to understand its structure and content
 * for importing as a knowledge base.
 */

export interface ScannedFile {
  path: string;
  relativePath: string;
  type: "readme" | "config" | "docs" | "source" | "other";
  size: number;
  content?: string;
  modifiedAt: Date;
}

export interface ProjectMetadata {
  name?: string;
  description?: string;
  keywords?: string[];
  language?: string;
  dependencies?: string[];
}

export interface ScanStats {
  totalFiles: number;
  totalSize: number;
  scannedFiles: number;
  scannedSize: number;
  strategy: "full" | "truncated" | "sampled";
}

export interface ScanResult {
  files: ScannedFile[];
  directoryStructure: string;
  projectMetadata: ProjectMetadata;
  stats: ScanStats;
  warnings: string[];
}

export interface ScanOptions {
  /** Maximum total content to read in bytes (default: 100KB) */
  maxContentSize?: number;
  /** Whether to respect .gitignore (default: true) */
  respectGitignore?: boolean;
  /** Additional paths to skip */
  skipPaths?: string[];
}

// Default paths to always skip
const DEFAULT_SKIP_PATHS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "target", // Rust
  ".cargo",
  "coverage",
  ".nyc_output",
  ".cache",
  ".parcel-cache",
  ".turbo",
];

// File priority for scanning (lower = higher priority)
const FILE_PRIORITY: Record<string, number> = {
  "README.md": 1,
  "README": 1,
  "readme.md": 1,
  "package.json": 2,
  "Cargo.toml": 2,
  "pyproject.toml": 2,
  "go.mod": 2,
  "composer.json": 2,
  "pom.xml": 2,
  "build.gradle": 2,
  "ARCHITECTURE.md": 3,
  "CONTRIBUTING.md": 3,
  "CHANGELOG.md": 4,
};

/**
 * Categorize a file based on its path and name
 */
function categorizeFile(relativePath: string): ScannedFile["type"] {
  const basename = path.basename(relativePath).toLowerCase();
  const ext = path.extname(relativePath).toLowerCase();

  // READMEs
  if (basename.startsWith("readme")) {
    return "readme";
  }

  // Config files
  if (
    ["package.json", "cargo.toml", "pyproject.toml", "go.mod", "composer.json", "pom.xml", "build.gradle"].includes(basename)
  ) {
    return "config";
  }

  // Documentation
  if (relativePath.startsWith("docs/") || relativePath.startsWith("doc/")) {
    return "docs";
  }
  if (ext === ".md" || ext === ".rst" || ext === ".txt") {
    return "docs";
  }

  // Source code
  if ([".ts", ".js", ".py", ".rs", ".go", ".java", ".rb", ".php", ".c", ".cpp", ".h"].includes(ext)) {
    return "source";
  }

  return "other";
}

/**
 * Get priority for a file (lower = scan first)
 */
function getFilePriority(relativePath: string): number {
  const basename = path.basename(relativePath);
  if (FILE_PRIORITY[basename]) {
    return FILE_PRIORITY[basename];
  }

  const type = categorizeFile(relativePath);
  switch (type) {
    case "readme":
      return 1;
    case "config":
      return 2;
    case "docs":
      return 5;
    case "source":
      return 10;
    default:
      return 100;
  }
}

/**
 * Build a tree-like directory structure string
 */
function buildDirectoryTree(files: ScannedFile[], repoPath: string): string {
  // Get unique directories
  const dirs = new Set<string>();
  const filesByDir = new Map<string, string[]>();

  for (const file of files) {
    const dir = path.dirname(file.relativePath);
    if (dir !== ".") {
      // Add all parent directories
      const parts = dir.split(path.sep);
      for (let i = 1; i <= parts.length; i++) {
        dirs.add(parts.slice(0, i).join(path.sep));
      }
    }
    const parent = dir === "." ? "" : dir;
    if (!filesByDir.has(parent)) {
      filesByDir.set(parent, []);
    }
    filesByDir.get(parent)!.push(path.basename(file.relativePath));
  }

  // Build tree
  const lines: string[] = [path.basename(repoPath) + "/"];
  const sortedDirs = Array.from(dirs).sort();

  // Add top-level files
  const rootFiles = filesByDir.get("") || [];
  for (const file of rootFiles.slice(0, 10)) {
    lines.push(`├── ${file}`);
  }
  if (rootFiles.length > 10) {
    lines.push(`├── ... (${rootFiles.length - 10} more files)`);
  }

  // Add directories (limited)
  for (const dir of sortedDirs.slice(0, 20)) {
    const depth = dir.split(path.sep).length;
    const indent = "│   ".repeat(depth - 1);
    lines.push(`${indent}├── ${path.basename(dir)}/`);
  }
  if (sortedDirs.length > 20) {
    lines.push(`... (${sortedDirs.length - 20} more directories)`);
  }

  return lines.join("\n");
}

/**
 * Parse project metadata from config files
 */
function parseProjectMetadata(files: ScannedFile[]): ProjectMetadata {
  const metadata: ProjectMetadata = {};

  for (const file of files) {
    if (!file.content) continue;

    const basename = path.basename(file.relativePath).toLowerCase();

    try {
      if (basename === "package.json") {
        const pkg = JSON.parse(file.content);
        metadata.name = pkg.name;
        metadata.description = pkg.description;
        metadata.keywords = pkg.keywords;
        metadata.language = "TypeScript/JavaScript";
        metadata.dependencies = [
          ...Object.keys(pkg.dependencies || {}),
          ...Object.keys(pkg.devDependencies || {}),
        ].slice(0, 20);
      } else if (basename === "cargo.toml") {
        metadata.language = "Rust";
        // Basic TOML parsing for name
        const nameMatch = file.content.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch) metadata.name = nameMatch[1];
        const descMatch = file.content.match(/description\s*=\s*"([^"]+)"/);
        if (descMatch) metadata.description = descMatch[1];
      } else if (basename === "pyproject.toml") {
        metadata.language = "Python";
        const nameMatch = file.content.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch) metadata.name = nameMatch[1];
      } else if (basename === "go.mod") {
        metadata.language = "Go";
        const moduleMatch = file.content.match(/module\s+(\S+)/);
        if (moduleMatch) metadata.name = moduleMatch[1];
      }
    } catch {
      // Ignore parse errors
    }
  }

  return metadata;
}

/**
 * Load .gitignore patterns
 */
function loadGitignore(repoPath: string): ReturnType<typeof ignore> {
  const ig = ignore();

  const gitignorePath = path.join(repoPath, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    ig.add(content);
  }

  return ig;
}

/**
 * Phase 1: Discover all files without reading content
 */
function discoverFiles(
  repoPath: string,
  options: ScanOptions
): { files: Array<{ relativePath: string; size: number; modifiedAt: Date }>; warnings: string[] } {
  const warnings: string[] = [];
  const files: Array<{ relativePath: string; size: number; modifiedAt: Date }> = [];

  const skipPaths = new Set([...DEFAULT_SKIP_PATHS, ...(options.skipPaths || [])]);
  const ig = options.respectGitignore !== false ? loadGitignore(repoPath) : null;

  function walk(dir: string, relativeTo: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(relativeTo, fullPath);

      // Skip hidden files and directories (except .github)
      if (entry.name.startsWith(".") && entry.name !== ".github") {
        continue;
      }

      // Skip configured paths
      if (skipPaths.has(entry.name)) {
        continue;
      }

      // Check gitignore
      if (ig && ig.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath, relativeTo);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          files.push({
            relativePath,
            size: stats.size,
            modifiedAt: stats.mtime,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  walk(repoPath, repoPath);

  if (files.length > 10000) {
    warnings.push(`Large repository detected: ${files.length} files. Using sampling strategy.`);
  }

  return { files, warnings };
}

/**
 * Phase 2: Determine scanning strategy based on total size
 */
function determineScanStrategy(
  files: Array<{ relativePath: string; size: number }>,
  maxContentSize: number
): { strategy: ScanStats["strategy"]; filesToScan: string[] } {
  // Calculate total size of text files we care about
  const textFiles = files.filter((f) => {
    const type = categorizeFile(f.relativePath);
    return type !== "other" && type !== "source";
  });

  const totalTextSize = textFiles.reduce((sum, f) => sum + f.size, 0);

  // Sort by priority
  const sorted = [...textFiles].sort((a, b) => {
    const priorityDiff = getFilePriority(a.relativePath) - getFilePriority(b.relativePath);
    if (priorityDiff !== 0) return priorityDiff;
    // Prefer newer files
    return 0;
  });

  if (totalTextSize <= maxContentSize) {
    // Small repo: read everything
    return {
      strategy: "full",
      filesToScan: sorted.map((f) => f.relativePath),
    };
  }

  // Need to sample - accumulate until we hit budget
  const filesToScan: string[] = [];
  let accumulatedSize = 0;

  for (const file of sorted) {
    if (accumulatedSize + file.size > maxContentSize) {
      // If this file alone is bigger than remaining budget, truncate
      if (accumulatedSize < maxContentSize * 0.5) {
        filesToScan.push(file.relativePath);
        accumulatedSize += Math.min(file.size, maxContentSize - accumulatedSize);
      }
      break;
    }
    filesToScan.push(file.relativePath);
    accumulatedSize += file.size;
  }

  return {
    strategy: totalTextSize > maxContentSize * 2 ? "sampled" : "truncated",
    filesToScan,
  };
}

/**
 * Phase 3: Read file contents
 */
function readFileContents(
  repoPath: string,
  filesToScan: string[],
  discoveredFiles: Array<{ relativePath: string; size: number; modifiedAt: Date }>,
  maxContentSize: number
): ScannedFile[] {
  const scannedFiles: ScannedFile[] = [];
  let totalRead = 0;

  const fileMap = new Map(discoveredFiles.map((f) => [f.relativePath, f]));

  for (const relativePath of filesToScan) {
    const fileInfo = fileMap.get(relativePath);
    if (!fileInfo) continue;

    const fullPath = path.join(repoPath, relativePath);
    const remainingBudget = maxContentSize - totalRead;

    if (remainingBudget <= 0) break;

    try {
      // Read file, potentially truncating
      const fd = fs.openSync(fullPath, "r");
      const buffer = Buffer.alloc(Math.min(fileInfo.size, remainingBudget, 50000)); // Max 50KB per file
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);

      let content = buffer.subarray(0, bytesRead).toString("utf-8");

      // If truncated, add indicator
      if (bytesRead < fileInfo.size) {
        content += "\n\n[... content truncated ...]";
      }

      scannedFiles.push({
        path: fullPath,
        relativePath,
        type: categorizeFile(relativePath),
        size: fileInfo.size,
        content,
        modifiedAt: fileInfo.modifiedAt,
      });

      totalRead += bytesRead;
    } catch {
      // Skip files we can't read
    }
  }

  return scannedFiles;
}

/**
 * Scan a repository to understand its structure and content
 */
export async function scanRepository(
  repoPath: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const resolvedPath = path.resolve(repoPath);

  // Validate path exists and is a directory
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Path does not exist: ${repoPath}`);
  }
  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Path is not a directory: ${repoPath}`);
  }

  const maxContentSize = options.maxContentSize ?? 100 * 1024; // 100KB default
  const warnings: string[] = [];

  // Phase 1: Discover
  const { files: discoveredFiles, warnings: discoverWarnings } = discoverFiles(
    resolvedPath,
    options
  );
  warnings.push(...discoverWarnings);

  if (discoveredFiles.length === 0) {
    throw new Error(`No files found in repository: ${repoPath}`);
  }

  // Phase 2: Determine strategy
  const { strategy, filesToScan } = determineScanStrategy(discoveredFiles, maxContentSize);

  // Phase 3: Read content
  const scannedFiles = readFileContents(
    resolvedPath,
    filesToScan,
    discoveredFiles,
    maxContentSize
  );

  // Build results
  const directoryStructure = buildDirectoryTree(
    discoveredFiles.map((f) => ({
      path: path.join(resolvedPath, f.relativePath),
      relativePath: f.relativePath,
      type: categorizeFile(f.relativePath),
      size: f.size,
      modifiedAt: f.modifiedAt,
    })),
    resolvedPath
  );

  const projectMetadata = parseProjectMetadata(scannedFiles);

  const stats: ScanStats = {
    totalFiles: discoveredFiles.length,
    totalSize: discoveredFiles.reduce((sum, f) => sum + f.size, 0),
    scannedFiles: scannedFiles.length,
    scannedSize: scannedFiles.reduce((sum, f) => sum + (f.content?.length || 0), 0),
    strategy,
  };

  return {
    files: scannedFiles,
    directoryStructure,
    projectMetadata,
    stats,
    warnings,
  };
}
