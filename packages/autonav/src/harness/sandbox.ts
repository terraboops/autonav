/**
 * Sandbox Utility
 *
 * Wraps subprocess commands with nono.sh for kernel-enforced sandboxing
 * (Landlock on Linux, Seatbelt on macOS). Different autonav operations
 * use different sandbox profiles:
 *
 *   - query: read-only access to navigator
 *   - update: read+write access to navigator
 *   - memento/standup: broader access (configured per-operation)
 *
 * Note: blockNetwork should NOT be used with harnesses that make their
 * own API calls (chibi, opencode). It's only useful for Claude Code SDK
 * where the API connection is managed in-process by the SDK.
 *
 * Falls back gracefully when nono is not installed — the process runs
 * without sandboxing. Claude Code SDK has built-in sandboxing and
 * skips this entirely.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import type { SandboxConfig } from "./types.js";

let nonoAvailableCache: boolean | null = null;

/**
 * Check if nono is available on PATH (result is cached).
 */
export function isNonoAvailable(): boolean {
  if (nonoAvailableCache !== null) {
    return nonoAvailableCache;
  }

  try {
    execFileSync("nono", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 3_000,
    });
    nonoAvailableCache = true;
  } catch {
    nonoAvailableCache = false;
  }

  return nonoAvailableCache;
}

/**
 * Resolve whether sandboxing should be active for this session.
 *
 * Priority:
 *   1. config.enabled (explicit opt-in/out)
 *   2. AUTONAV_SANDBOX env var ("0" to disable)
 *   3. Auto-detect nono on PATH
 */
export function isSandboxEnabled(config?: SandboxConfig): boolean {
  // Explicit config takes priority
  if (config?.enabled !== undefined) {
    return config.enabled && isNonoAvailable();
  }

  // Env var override
  if (process.env.AUTONAV_SANDBOX === "0") {
    return false;
  }

  // Auto-detect
  return isNonoAvailable();
}

/**
 * System paths needed for sandboxed subprocesses to execute shell scripts
 * and common tools. Without these, plugin scripts can't run bash/jq/etc.
 */
function getSystemReadPaths(): string[] {
  const paths: string[] = [];

  if (os.platform() === "darwin") {
    // macOS system binaries and libraries
    for (const p of ["/bin", "/usr/bin", "/usr/lib", "/usr/libexec"]) {
      if (fs.existsSync(p)) paths.push(p);
    }
    // Homebrew (Apple Silicon and Intel)
    for (const p of ["/opt/homebrew", "/usr/local"]) {
      if (fs.existsSync(p)) paths.push(p);
    }
  } else {
    // Linux system paths
    for (const p of ["/bin", "/usr/bin", "/usr/lib", "/usr/lib64", "/lib", "/lib64"]) {
      if (fs.existsSync(p)) paths.push(p);
    }
  }

  return paths;
}

/**
 * Build nono CLI arguments for a given sandbox config.
 *
 * Returns the full argument list: ["run", "--silent", ...flags, "--"]
 * Returns empty array if sandbox is disabled.
 */
export function buildSandboxArgs(config: SandboxConfig): string[] {
  if (!isSandboxEnabled(config)) {
    return [];
  }

  const args = ["run", "--silent", "--allow-cwd"];

  // System binary paths (read-only) — needed for plugin script execution
  for (const p of getSystemReadPaths()) {
    args.push("--read", p);
  }

  // Read-only paths
  if (config.readPaths) {
    for (const p of config.readPaths) {
      args.push("--read", p);
    }
  }

  // Read+write paths
  if (config.writePaths) {
    for (const p of config.writePaths) {
      args.push("--allow", p);
    }
  }

  // Network blocking
  if (config.blockNetwork) {
    args.push("--net-block");
  }

  // Separator between nono args and the wrapped command
  args.push("--");

  return args;
}

/**
 * Wrap a command with nono sandbox if enabled.
 *
 * If sandboxing is active:
 *   { command: "nono", args: ["run", ...flags, "--", originalCommand, ...originalArgs] }
 *
 * If disabled:
 *   { command: originalCommand, args: originalArgs } (passthrough)
 */
export function wrapCommand(
  command: string,
  args: string[],
  config?: SandboxConfig,
): { command: string; args: string[] } {
  if (!config || !isSandboxEnabled(config)) {
    return { command, args };
  }

  const sandboxArgs = buildSandboxArgs(config);
  if (sandboxArgs.length === 0) {
    return { command, args };
  }

  return {
    command: "nono",
    args: [...sandboxArgs, command, ...args],
  };
}
