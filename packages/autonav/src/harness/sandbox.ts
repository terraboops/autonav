/**
 * Sandbox Utility (nono-ts)
 *
 * Wraps subprocess commands with nono for kernel-enforced sandboxing
 * (Landlock on Linux, Seatbelt on macOS). Uses the nono-ts CapabilitySet
 * API to programmatically build sandbox profiles, then serializes them
 * to JSON config files for child processes.
 *
 * Both harnesses use nono as the unified sandbox:
 *   - ClaudeCodeHarness → nono wrapper script via pathToClaudeCodeExecutable
 *   - ChibiHarness → nono run --config <profile> -- chibi-json
 *
 * Per-operation sandbox profiles:
 *   - query: read-only access to navigator directory
 *   - update: read+write access to navigator directory
 *   - chat/standup: configured per-operation (default: enabled)
 *   - memento: default disabled (worker needs full code access)
 *
 * Note: blockNetwork should NOT be used with harnesses that make their
 * own API calls (chibi). It's only useful for scenarios where the API
 * connection is managed in-process.
 *
 * Falls back gracefully when nono is not installed — the process runs
 * without sandboxing.
 *
 * CRITICAL: Never call nono-ts `apply()` — that sandboxes the autonav
 * process itself. We only build profiles for child processes.
 */

import {
  CapabilitySet,
  AccessMode,
  SandboxState,
  QueryContext,
  isSupported,
} from "nono-ts";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SandboxConfig } from "./types.js";

let nonoAvailableCache: boolean | null = null;

/**
 * Check if nono sandboxing is available on this platform (result is cached).
 *
 * Uses nono-ts isSupported() which checks for Seatbelt (macOS) or
 * Landlock (Linux 5.13+) support without spawning a subprocess.
 */
export function isNonoAvailable(): boolean {
  if (nonoAvailableCache !== null) {
    return nonoAvailableCache;
  }

  try {
    nonoAvailableCache = isSupported();
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
 *   3. Auto-detect via nono-ts isSupported()
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
 * Build a nono-ts CapabilitySet from a SandboxConfig.
 *
 * Maps config fields to nono capabilities:
 *   - System read paths (macOS/Linux binaries, homebrew)
 *   - readPaths → allowPath(p, AccessMode.Read)
 *   - writePaths → allowPath(p, AccessMode.ReadWrite)
 *   - allowedCommands → allowCommand(cmd)
 *   - blockNetwork → blockNetwork()
 *
 * Paths that don't exist on disk are silently skipped (nono-ts
 * validates path existence and throws on missing paths).
 */
export function buildCapabilitySet(config: SandboxConfig): CapabilitySet {
  const caps = new CapabilitySet();

  // System binary paths (read-only) — needed for plugin script execution
  for (const p of getSystemReadPaths()) {
    try {
      caps.allowPath(p, AccessMode.Read);
    } catch {
      // Path may not exist or be inaccessible — skip
    }
  }

  // Read-only paths
  if (config.readPaths) {
    for (const p of config.readPaths) {
      try {
        caps.allowPath(p, AccessMode.Read);
      } catch {
        // Path doesn't exist — skip silently
      }
    }
  }

  // Read+write paths
  if (config.writePaths) {
    for (const p of config.writePaths) {
      try {
        caps.allowPath(p, AccessMode.ReadWrite);
      } catch {
        // Path doesn't exist — skip silently
      }
    }
  }

  // Allowed commands
  if (config.allowedCommands) {
    for (const cmd of config.allowedCommands) {
      caps.allowCommand(cmd);
    }
  }

  // Network blocking
  if (config.blockNetwork) {
    caps.blockNetwork();
  }

  return caps;
}

/**
 * Write a nono sandbox profile JSON file to disk.
 *
 * Serializes the CapabilitySet via SandboxState and writes to a temp file.
 * Returns the absolute path to the profile file.
 *
 * Note: allowedCommands are NOT included in the profile JSON (nono-ts
 * SandboxState only serializes fs + network). Commands are passed as
 * --allow-command flags on the CLI.
 */
export function writeProfile(config: SandboxConfig, dir: string): string {
  const caps = buildCapabilitySet(config);
  const state = SandboxState.fromCaps(caps);
  const json = state.toJson();

  const profilePath = path.join(dir, `nono-profile-${Date.now()}.json`);
  fs.writeFileSync(profilePath, json, "utf-8");
  return profilePath;
}

/**
 * Build CLI arguments for allowedCommands (not included in profile JSON).
 */
function commandFlags(config?: SandboxConfig): string[] {
  if (!config?.allowedCommands?.length) return [];
  const flags: string[] = [];
  for (const cmd of config.allowedCommands) {
    flags.push("--allow-command", cmd);
  }
  return flags;
}

/**
 * Wrap a command with nono sandbox if enabled.
 *
 * Uses profile-based approach:
 *   nono run --config <profile> --silent --allow-cwd [--allow-command X] -- cmd args
 *
 * If sandboxing is disabled, returns the command unchanged (passthrough).
 *
 * @param profileDir - Directory to write the profile file. Defaults to os.tmpdir().
 */
export function wrapCommand(
  command: string,
  args: string[],
  config?: SandboxConfig,
  profileDir?: string,
): { command: string; args: string[] } {
  if (!config || !isSandboxEnabled(config)) {
    return { command, args };
  }

  const dir = profileDir || os.tmpdir();
  const profilePath = writeProfile(config, dir);

  const nonoArgs = [
    "run",
    "--config", profilePath,
    "--silent",
    "--allow-cwd",
    ...commandFlags(config),
    "--",
    command,
    ...args,
  ];

  return {
    command: "nono",
    args: nonoArgs,
  };
}

/**
 * Create a shell wrapper script for the Claude Code SDK.
 *
 * The SDK accepts `pathToClaudeCodeExecutable` — a custom executable path.
 * This generates a temp shell script that wraps `claude` with nono enforcement.
 *
 * Uses --exec flag to preserve TTY for interactive Claude Code sessions.
 *
 * @returns Absolute path to the wrapper script.
 */
export function createSdkWrapper(profilePath: string, dir: string, config?: SandboxConfig): string {
  const wrapperPath = path.join(dir, "nono-claude-wrapper.sh");
  const cmdFlags = commandFlags(config).join(" ");
  const extraFlags = cmdFlags ? ` ${cmdFlags}` : "";
  const script = `#!/usr/bin/env bash
set -euo pipefail
exec nono run --config "${profilePath}" --silent --exec --allow-cwd${extraFlags} -- claude "$@"
`;
  fs.writeFileSync(wrapperPath, script, "utf-8");
  fs.chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}

/**
 * Result from a sandbox pre-flight query.
 */
export interface QueryResultInfo {
  status: string;
  reason: string;
  grantedPath?: string;
  access?: string;
}

/**
 * Query whether a path operation would be allowed by a sandbox config.
 *
 * Uses nono-ts QueryContext for dry-run policy checks without
 * actually applying any sandbox. Useful for the sandbox_query
 * debugging tool.
 */
export function querySandbox(
  config: SandboxConfig,
  targetPath: string,
  mode: AccessMode,
): QueryResultInfo {
  const caps = buildCapabilitySet(config);
  const qc = new QueryContext(caps);
  return qc.queryPath(targetPath, mode) as QueryResultInfo;
}

/**
 * Query whether network access would be allowed by a sandbox config.
 */
export function querySandboxNetwork(config: SandboxConfig): QueryResultInfo {
  const caps = buildCapabilitySet(config);
  const qc = new QueryContext(caps);
  return qc.queryNetwork() as QueryResultInfo;
}

/**
 * Get a human-readable summary of the sandbox policy.
 *
 * Uses CapabilitySet.summary() from nono-ts.
 */
export function getSandboxSummary(config: SandboxConfig): string {
  const caps = buildCapabilitySet(config);
  return caps.summary();
}

// Re-export AccessMode for consumers that need it (e.g., sandbox-query tool)
export { AccessMode };
