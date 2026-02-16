/**
 * Standup Config Utilities
 *
 * Global config directory resolution and standup directory creation.
 * Establishes a global autonav config pattern reusable by future commands.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Resolve the global autonav config directory.
 *
 * Priority: explicit override > AUTONAV_CONFIG_DIR env var > ~/.config/autonav/
 */
export function resolveConfigDir(override?: string): string {
  if (override) {
    return path.resolve(override);
  }

  const envDir = process.env.AUTONAV_CONFIG_DIR;
  if (envDir) {
    return path.resolve(envDir);
  }

  return path.join(os.homedir(), ".config", "autonav");
}

/**
 * Create a timestamped standup directory with reports/ and sync/ subdirs.
 *
 * @returns The path to the created standup directory
 */
export function createStandupDir(configDir: string): string {
  const standupsDir = path.join(configDir, "standups");

  // ISO timestamp with colons replaced by hyphens for filesystem safety
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "");

  const standupDir = path.join(standupsDir, timestamp);

  fs.mkdirSync(path.join(standupDir, "reports"), { recursive: true });
  fs.mkdirSync(path.join(standupDir, "sync"), { recursive: true });

  return standupDir;
}
