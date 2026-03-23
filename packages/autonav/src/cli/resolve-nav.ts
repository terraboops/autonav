/**
 * Resolve a navigator path from an optional CLI argument.
 *
 * Priority:
 *   1. Explicit path/name argument (if provided)
 *   2. Current working directory (if config.json exists)
 *   3. Registry lookup by name (via resolveNavigatorPath from src/registry.ts)
 *   4. Error with helpful message
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { resolveNavigatorPath } from "../registry.js";

export function resolveNavigatorArg(arg?: string): string {
  // 1. Explicit argument provided
  if (arg) {
    // If it looks like a path (contains / or . or starts with ~), resolve it
    if (arg.includes("/") || arg.startsWith(".")) {
      const resolved = path.resolve(process.cwd(), arg);
      const configPath = path.join(resolved, "config.json");
      if (!fs.existsSync(configPath)) {
        console.error(`Error: No navigator found at: ${resolved}`);
        console.error(`   Missing config.json\n`);
        console.error(`Create a new navigator with: autonav init <name>\n`);
        process.exit(1);
      }
      return resolved;
    }

    // Bare name — try registry first, then resolve relative to cwd
    const registryPath = resolveNavigatorPath(arg);
    if (registryPath) {
      const configPath = path.join(registryPath, "config.json");
      if (fs.existsSync(configPath)) {
        return registryPath;
      }
    }

    // Try as relative directory name
    const relative = path.resolve(process.cwd(), arg);
    const configPath = path.join(relative, "config.json");
    if (fs.existsSync(configPath)) {
      return relative;
    }

    console.error(`Error: Navigator not found: ${arg}`);
    console.error(`\n  Not found in registry or as a local directory.\n`);
    console.error(`Run from inside a navigator directory, or specify a path:`);
    console.error(`  autonav chat ./my-navigator`);
    console.error(`  autonav chat my-navigator  (if registered)\n`);
    process.exit(1);
  }

  // 2. No argument — check if cwd is a navigator
  const cwd = process.cwd();
  const cwdConfig = path.join(cwd, "config.json");
  if (fs.existsSync(cwdConfig)) {
    try {
      const content = fs.readFileSync(cwdConfig, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed.name) {
        return cwd;
      }
    } catch {
      // Invalid config.json, fall through
    }
  }

  // 3. Nothing found
  console.error(`Error: No navigator found.`);
  console.error(`\nRun from inside a navigator directory, or specify a path:`);
  console.error(`  autonav chat ./my-navigator`);
  console.error(`  autonav chat my-navigator  (if registered)\n`);
  process.exit(1);
}
