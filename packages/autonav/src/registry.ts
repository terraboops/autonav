/**
 * Global Navigator Registry
 *
 * Maps navigator names to filesystem paths. Stored at
 * ~/.config/autonav/navigators.json (or AUTONAV_CONFIG_DIR).
 *
 * Resolution priority for a navigator name:
 *   1. AUTONAV_NAV_PATH_<NAME> env var (uppercased, hyphens → underscores)
 *   2. Global registry file
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { resolveConfigDir } from "./standup/config.js";

const REGISTRY_FILE = "navigators.json";

type Registry = Record<string, string>;

/**
 * Read the global navigator registry.
 */
function readRegistry(configDir?: string): Registry {
  const dir = resolveConfigDir(configDir);
  const filePath = path.join(dir, REGISTRY_FILE);

  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Registry;
  } catch {
    return {};
  }
}

/**
 * Write the global navigator registry.
 */
function writeRegistry(registry: Registry, configDir?: string): void {
  const dir = resolveConfigDir(configDir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, REGISTRY_FILE);
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2) + "\n");
}

/**
 * Register a navigator in the global registry.
 */
export function registerNavigator(name: string, navPath: string, configDir?: string): void {
  const registry = readRegistry(configDir);
  registry[name] = path.resolve(navPath);
  writeRegistry(registry, configDir);
}

/**
 * Remove a navigator from the global registry.
 */
export function unregisterNavigator(name: string, configDir?: string): void {
  const registry = readRegistry(configDir);
  delete registry[name];
  writeRegistry(registry, configDir);
}

/**
 * Resolve a navigator name to a filesystem path.
 *
 * Priority:
 *   1. AUTONAV_NAV_PATH_<NAME> env var
 *   2. Global registry
 *
 * @returns The resolved path, or null if not found
 */
export function resolveNavigatorPath(name: string, configDir?: string): string | null {
  // 1. Check env var (e.g. AUTONAV_NAV_PATH_THUFIR for "thufir")
  const envKey = `AUTONAV_NAV_PATH_${name.toUpperCase().replace(/-/g, "_")}`;
  const envPath = process.env[envKey];
  if (envPath) {
    return path.resolve(envPath);
  }

  // 2. Check global registry
  const registry = readRegistry(configDir);
  const registryPath = registry[name];
  if (registryPath) {
    return registryPath;
  }

  return null;
}

/**
 * List all registered navigators.
 */
export function listNavigators(configDir?: string): Registry {
  return readRegistry(configDir);
}
