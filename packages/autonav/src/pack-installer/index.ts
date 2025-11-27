import * as fs from "node:fs";
import * as path from "node:path";
import * as tar from "tar";
import { z } from "zod";
import {
  isGitHubUrl,
  parseGitHubUrl,
  fetchGitHubFolder,
} from "./github.js";

/**
 * Knowledge pack metadata schema
 */
const PackMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  files: z.array(z.string()).optional(),
});

export type PackMetadata = z.infer<typeof PackMetadataSchema>;

/**
 * Pack installation result
 */
export interface PackInstallResult {
  metadata: PackMetadata;
  installedFiles: string[];
  systemConfigPath: string | null;
}

/**
 * Options for pack installation
 */
export interface PackInstallOptions {
  packName?: string;
  packServer?: string;
  packFile?: string;
  targetDir: string;
  onProgress?: (message: string) => void;
}

/**
 * Default pack server URL (TBD - will be configured later)
 */
const DEFAULT_PACK_SERVER = "https://packs.autonav.dev";

/**
 * Install a knowledge pack from a local file
 */
export async function installPackFromFile(
  packFilePath: string,
  targetDir: string,
  onProgress?: (message: string) => void
): Promise<PackInstallResult> {
  onProgress?.(`Extracting pack from ${path.basename(packFilePath)}`);

  // Create temp directory for extraction
  const tempDir = fs.mkdtempSync(path.join(targetDir, ".pack-temp-"));

  try {
    // Extract tarball to temp directory
    await tar.extract({
      file: packFilePath,
      cwd: tempDir,
    });

    // Validate pack structure
    const metadata = validatePackStructure(tempDir);
    onProgress?.(`Validated pack: ${metadata.name} v${metadata.version}`);

    // Install pack files to target directory
    const installedFiles = installPackFiles(tempDir, targetDir, onProgress);

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      metadata,
      installedFiles,
      systemConfigPath: fs.existsSync(
        path.join(targetDir, "system-configuration.md")
      )
        ? "./system-configuration.md"
        : null,
    };
  } catch (error) {
    // Clean up on error
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Install a knowledge pack from a remote server
 */
export async function installPackFromServer(
  packName: string,
  targetDir: string,
  serverUrl?: string,
  onProgress?: (message: string) => void
): Promise<PackInstallResult> {
  const server = serverUrl || DEFAULT_PACK_SERVER;
  const packUrl = `${server}/packs/${packName}/latest`;

  onProgress?.(`Downloading pack from ${server}`);

  try {
    // Download pack (using native fetch)
    const response = await fetch(packUrl);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Knowledge pack '${packName}' not found on server ${server}`
        );
      }
      throw new Error(
        `Failed to download pack: ${response.status} ${response.statusText}`
      );
    }

    // Save to temp file
    const tempFile = path.join(targetDir, `.pack-${packName}-temp.tar.gz`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempFile, Buffer.from(buffer));

    onProgress?.(`Downloaded ${(buffer.byteLength / 1024).toFixed(1)} KB`);

    // Install from the downloaded file
    const result = await installPackFromFile(tempFile, targetDir, onProgress);

    // Clean up temp file
    fs.unlinkSync(tempFile);

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to install pack from server: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Install a knowledge pack from a GitHub folder
 */
export async function installPackFromGitHub(
  githubUrl: string,
  targetDir: string,
  onProgress?: (message: string) => void
): Promise<PackInstallResult> {
  const urlInfo = parseGitHubUrl(githubUrl);

  if (!urlInfo) {
    throw new Error(
      `Invalid GitHub URL: ${githubUrl}\n` +
      `Supported formats:\n` +
      `  - https://github.com/owner/repo/tree/main/path/to/pack\n` +
      `  - github:owner/repo/path/to/pack\n` +
      `  - github:owner/repo/path/to/pack@v1.0.0`
    );
  }

  // Create temp directory for GitHub download
  const tempDir = fs.mkdtempSync(path.join(targetDir, ".github-pack-temp-"));

  try {
    // Fetch files from GitHub
    await fetchGitHubFolder(urlInfo, tempDir, onProgress);

    // Validate pack structure
    const metadata = validatePackStructure(tempDir);
    onProgress?.(`Validated pack: ${metadata.name} v${metadata.version}`);

    // Install pack files to target directory
    const installedFiles = installPackFiles(tempDir, targetDir, onProgress);

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      metadata,
      installedFiles,
      systemConfigPath: fs.existsSync(
        path.join(targetDir, "system-configuration.md")
      )
        ? "./system-configuration.md"
        : null,
    };
  } catch (error) {
    // Clean up on error
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Install a knowledge pack based on options
 */
export async function installPack(
  options: PackInstallOptions
): Promise<PackInstallResult> {
  const { packName, packServer, packFile, targetDir, onProgress } = options;

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (packFile) {
    // Install from local file
    if (!fs.existsSync(packFile)) {
      throw new Error(`Pack file not found: ${packFile}`);
    }
    return installPackFromFile(packFile, targetDir, onProgress);
  } else if (packName) {
    // Check if it's a GitHub URL
    if (isGitHubUrl(packName)) {
      return installPackFromGitHub(packName, targetDir, onProgress);
    }
    // Install from server
    return installPackFromServer(packName, targetDir, packServer, onProgress);
  } else {
    throw new Error("Either packName or packFile must be provided");
  }
}

/**
 * Validate pack structure and return metadata
 */
function validatePackStructure(packDir: string): PackMetadata {
  // Check for metadata.json
  const metadataPath = path.join(packDir, "metadata.json");
  if (!fs.existsSync(metadataPath)) {
    throw new Error(
      "Invalid pack structure: missing metadata.json. Knowledge packs must include a metadata.json file."
    );
  }

  // Parse and validate metadata
  const metadataContent = fs.readFileSync(metadataPath, "utf-8");
  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataContent);
  } catch (error) {
    throw new Error(
      `Invalid metadata.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const validationResult = PackMetadataSchema.safeParse(metadata);
  if (!validationResult.success) {
    throw new Error(
      `Invalid pack metadata: ${validationResult.error.message}`
    );
  }

  // Check for required files
  const hasSystemConfig = fs.existsSync(
    path.join(packDir, "system-configuration.md")
  );
  const hasKnowledge = fs.existsSync(path.join(packDir, "knowledge"));

  if (!hasSystemConfig && !hasKnowledge) {
    throw new Error(
      "Invalid pack structure: must contain either system-configuration.md or knowledge/ directory"
    );
  }

  return validationResult.data;
}

/**
 * Install pack files to target directory
 */
function installPackFiles(
  packDir: string,
  targetDir: string,
  onProgress?: (message: string) => void
): string[] {
  const installedFiles: string[] = [];

  // Copy system-configuration.md if it exists
  const systemConfigPath = path.join(packDir, "system-configuration.md");
  if (fs.existsSync(systemConfigPath)) {
    const targetPath = path.join(targetDir, "system-configuration.md");
    fs.copyFileSync(systemConfigPath, targetPath);
    installedFiles.push("system-configuration.md");
    onProgress?.("Installed system-configuration.md");
  }

  // Copy knowledge directory if it exists
  const knowledgeDir = path.join(packDir, "knowledge");
  if (fs.existsSync(knowledgeDir)) {
    const targetKnowledgeDir = path.join(targetDir, "knowledge");
    copyDirectoryRecursive(knowledgeDir, targetKnowledgeDir);

    // Count files
    const files = countFilesRecursive(targetKnowledgeDir);
    installedFiles.push(...files.map((f) => `knowledge/${f}`));
    onProgress?.(
      `Installed ${files.length} knowledge file${files.length !== 1 ? "s" : ""}`
    );
  }

  // Copy plugins.json if it exists
  const pluginsPath = path.join(packDir, "plugins.json");
  if (fs.existsSync(pluginsPath)) {
    const targetPluginsDir = path.join(targetDir, ".claude");
    if (!fs.existsSync(targetPluginsDir)) {
      fs.mkdirSync(targetPluginsDir, { recursive: true });
    }
    const targetPath = path.join(targetPluginsDir, "plugins.json");
    fs.copyFileSync(pluginsPath, targetPath);
    installedFiles.push(".claude/plugins.json");
    onProgress?.("Installed plugins configuration");
  }

  return installedFiles;
}

/**
 * Recursively copy directory
 */
function copyDirectoryRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

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
 * Count files recursively in directory
 */
function countFilesRecursive(dir: string, relativeTo?: string): string[] {
  const base = relativeTo || dir;
  const files: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...countFilesRecursive(fullPath, base));
    } else {
      files.push(path.relative(base, fullPath));
    }
  }

  return files;
}
