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
 * Falls back gracefully when nono-ts native module is not available
 * (e.g., unsupported platform, missing native binary in CI) — the
 * process runs without sandboxing.
 *
 * CRITICAL: Never call nono-ts `apply()` — that sandboxes the autonav
 * process itself. We only build profiles for child processes.
 */

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SandboxConfig, SandboxProvider } from "./types.js";

// ── Lazy nono-ts loading ─────────────────────────────────────────────
// nono-ts uses NAPI-RS native bindings that may not be available on all
// platforms (e.g., CI runners without the native binary). We load it
// lazily so the module itself always loads — functions just return
// "not available" when the native module is missing.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nonoModule: any = null;
let nonoLoadAttempted = false;

function loadNono(): boolean {
  if (nonoLoadAttempted) return nonoModule !== null;
  nonoLoadAttempted = true;

  try {
    // Use createRequire for synchronous loading in ESM context.
    // nono-ts is a native module (NAPI-RS) that may not have binaries
    // for all platforms. This fails gracefully when the native binary
    // is missing (e.g., CI runners without platform-specific binaries).
    const req = createRequire(import.meta.url);
    nonoModule = req("nono-ts");
  } catch {
    nonoModule = null;
  }

  return nonoModule !== null;
}

/**
 * Access mode for sandbox path queries.
 * Mirrors nono-ts AccessMode enum so consumers don't need to import nono-ts directly.
 */
export enum AccessMode {
  Read = 0,
  Write = 1,
  ReadWrite = 2,
}

/** Minimum nono CLI version required for autonav sandboxing. */
const MIN_NONO_VERSION = "0.5.0";

/** Simple semver comparison: is actual >= required? */
function meetsMinVersion(actual: string, required: string): boolean {
  const a = actual.split(".").map(Number);
  const r = required.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (r[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (r[i] ?? 0)) return false;
  }
  return true; // equal
}

let nonoAvailableCache: boolean | null = null;
let nonoCliVersion: string | null = null;

/**
 * Check if nono sandboxing is available on this platform (result is cached).
 *
 * Checks both:
 *   1. nono-ts native module (for profile building / querying)
 *   2. nono CLI binary on PATH (for actual enforcement)
 *
 * Falls back to false if either is unavailable.
 */
export function isNonoAvailable(): boolean {
  if (nonoAvailableCache !== null) {
    return nonoAvailableCache;
  }

  // Check nono-ts native module
  if (!loadNono()) {
    nonoAvailableCache = false;
    return false;
  }

  try {
    if (nonoModule.isSupported() !== true) {
      nonoAvailableCache = false;
      return false;
    }
  } catch {
    nonoAvailableCache = false;
    return false;
  }

  // Check nono CLI binary is installed and meets minimum version
  try {
    const req = createRequire(import.meta.url);
    const { execFileSync } = req("node:child_process") as typeof import("node:child_process");
    const output = execFileSync("nono", ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3_000,
      encoding: "utf-8",
    }).trim();
    // Output format: "nono X.Y.Z" or just "X.Y.Z"
    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      nonoCliVersion = versionMatch[1]!;
      if (!meetsMinVersion(nonoCliVersion, MIN_NONO_VERSION)) {
        console.error(
          `[autonav] nono CLI v${nonoCliVersion} is too old (need >=${MIN_NONO_VERSION}). ` +
          `Sandboxing disabled. Upgrade: brew upgrade always-further/tap/nono`
        );
        nonoAvailableCache = false;
        return false;
      }
    }
    nonoAvailableCache = true;
  } catch {
    nonoAvailableCache = false;
  }

  return nonoAvailableCache!;
}

/**
 * Get the detected nono CLI version, or null if not available.
 */
export function getNonoVersion(): string | null {
  isNonoAvailable(); // ensure detection has run
  return nonoCliVersion;
}

/**
 * Get install instructions for nono CLI.
 */
export function getNonoInstallInstructions(): string {
  return `Install nono (kernel sandbox for autonav agents):
  macOS:  brew install always-further/tap/nono
  Linux:  cargo install nono
  More:   https://github.com/always-further/nono`;
}

/**
 * Resolve the effective sandbox provider for this session.
 *
 * Returns the provider string and whether it's active.
 * Throws if provider is "nono" but nono is unavailable (no silent fallback).
 */
export function resolveSandboxProvider(config?: SandboxConfig): { provider: SandboxProvider; active: boolean } {
  // Env var override disables all sandboxing
  if (process.env.AUTONAV_SANDBOX === "0") {
    return { provider: "none", active: false };
  }

  // Explicit disable
  if (config?.enabled === false) {
    return { provider: "none", active: false };
  }

  const provider = config?.provider ?? "nono";

  if (provider === "none") {
    return { provider: "none", active: false };
  }

  if (provider === "claude-code") {
    return { provider: "claude-code", active: true };
  }

  // Provider is "nono" (default) — require it to be available
  if (!isNonoAvailable()) {
    const detected = nonoCliVersion
      ? `Detected: v${nonoCliVersion} (need >=${MIN_NONO_VERSION})`
      : "Detected: not installed";

    throw new Error(
      `Sandbox provider "nono" requires the nono CLI (kernel-enforced sandboxing).\n\n` +
      `  ${detected}\n\n` +
      `  ${getNonoInstallInstructions()}\n\n` +
      `  To use Claude Code's built-in sandbox instead:\n` +
      `    Set "sandbox": { "provider": "claude-code" } in config.json\n\n` +
      `  To disable sandboxing entirely:\n` +
      `    Set "sandbox": { "provider": "none" } in config.json`
    );
  }

  return { provider: "nono", active: true };
}

/**
 * Resolve whether sandboxing should be active for this session.
 *
 * For backward compatibility — wraps resolveSandboxProvider and catches
 * errors (returns false if nono is required but missing). Prefer using
 * resolveSandboxProvider directly for better error handling.
 */
export function isSandboxEnabled(config?: SandboxConfig): boolean {
  try {
    return resolveSandboxProvider(config).active;
  } catch {
    return false;
  }
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
 *
 * Returns null if nono-ts is not available.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCapabilitySet(config: SandboxConfig): any | null {
  if (!loadNono()) return null;

  const { CapabilitySet: CapsClass, AccessMode: AM } = nonoModule;
  const caps = new CapsClass();

  // System binary paths (read-only) — needed for plugin script execution
  for (const p of getSystemReadPaths()) {
    try {
      caps.allowPath(p, AM.Read);
    } catch {
      // Path may not exist or be inaccessible — skip
    }
  }

  // Claude Code infrastructure paths — equivalent to nono's built-in
  // claude-code profile. Baked into the profile so we don't need
  // --profile claude-code (which doesn't stack with --config).
  const home = os.homedir();
  const claudePaths: Array<{ path: string; mode: "read" | "readwrite"; file?: boolean }> = [
    { path: path.join(home, ".claude"), mode: "readwrite" },
    { path: path.join(home, ".claude-personal"), mode: "readwrite" },
    { path: path.join(home, ".gitconfig"), mode: "read", file: true },
    { path: path.join(home, ".gitignore_global"), mode: "read", file: true },
    { path: path.join(home, ".config", "git", "ignore"), mode: "read", file: true },
  ];
  // macOS keychain for OAuth
  if (os.platform() === "darwin") {
    claudePaths.push({ path: path.join(home, "Library", "Keychains", "login.keychain-db"), mode: "read", file: true });
  }
  // Claude tmp directory
  const claudeTmp = path.join("/private/tmp", `claude-${process.getuid?.() ?? 501}`);
  if (fs.existsSync(claudeTmp)) {
    claudePaths.push({ path: claudeTmp, mode: "readwrite" });
  }

  for (const { path: p, mode, file } of claudePaths) {
    try {
      if (file) {
        caps.allowFile(p, mode === "readwrite" ? AM.ReadWrite : AM.Read);
      } else {
        caps.allowPath(p, mode === "readwrite" ? AM.ReadWrite : AM.Read);
      }
    } catch {
      // Path doesn't exist — skip (optional infra path)
    }
  }

  // Read-only paths
  if (config.readPaths) {
    for (const p of config.readPaths) {
      try {
        caps.allowPath(p, AM.Read);
      } catch {
        // Path doesn't exist — skip silently
      }
    }
  }

  // Read+write paths
  if (config.writePaths) {
    for (const p of config.writePaths) {
      try {
        caps.allowPath(p, AM.ReadWrite);
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
  if (!caps) {
    throw new Error("nono-ts not available — cannot write sandbox profile");
  }

  const { SandboxState: SSClass } = nonoModule;
  const state = SSClass.fromCaps(caps);
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
 * Build nono CLI flags string for env var passing (NONO_FLAGS).
 *
 * Used by ClaudeCodeHarness where the wrapper script reads NONO_FLAGS
 * from the environment (trellis pattern).
 */
export function buildNonoFlags(config: SandboxConfig): string {
  const parts: string[] = ["--allow-cwd"];

  // Navigator-specific paths as --read/--allow flags.
  // These stack with --profile claude-code's base paths.
  // We can't use --config/profile JSON because nono-ts 0.3.0 format
  // is incompatible with nono CLI 0.15.0's profile parser.
  if (config.readPaths) {
    for (const p of config.readPaths) {
      if (fs.existsSync(p)) parts.push("--read", p);
    }
  }
  if (config.writePaths) {
    for (const p of config.writePaths) {
      if (fs.existsSync(p)) parts.push("--allow", p);
    }
  }

  parts.push(...commandFlags(config));

  if (config.blockNetwork) {
    parts.push("--net-block");
  }

  return parts.join(" ");
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
export function createSdkWrapper(_profilePath: string, dir: string, _config?: SandboxConfig): string {
  const wrapperPath = path.join(dir, "nono-claude-wrapper.sh");
  // Use nono's built-in claude-code profile as a base — it provides all
  // the paths claude needs (config, keychain, tmp dirs, etc.) and is
  // maintained by the nono team. Our custom --config adds navigator-specific
  // paths on top, and NONO_FLAGS adds --allow-command flags.
  //
  // Use --profile claude-code as base, then NONO_FLAGS adds navigator
  // paths as --read/--allow flags + --allow-command flags.
  // We can't use a profile JSON file because nono-ts 0.3.0's JSON format
  // is not compatible with nono CLI 0.15.0's profile parser (custom fs
  // entries are silently ignored). --read/--allow flags DO stack with
  // --profile, so we pass everything via NONO_FLAGS.
  //
  // Pre-create optional dirs that claude-code profile references to
  // suppress WARN messages on stdout (corrupts SDK JSON stream).
  const script = `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "\${HOME}/.vscode" 2>/dev/null || true
mkdir -p "\${HOME}/Library/Application Support/Code" 2>/dev/null || true
touch "\${HOME}/.gitignore_global" 2>/dev/null || true
exec nono run \\
    --silent \\
    --no-diagnostics \\
    --profile claude-code \\
    --allow "\${HOME}/.claude-personal" \\
    \${NONO_FLAGS:-} \\
    -- claude "$@"
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
  if (!caps) {
    return { status: "allowed", reason: "nono_unavailable" };
  }

  const { QueryContext: QCClass, AccessMode: AM } = nonoModule;
  const nonoMode = mode === AccessMode.Read ? AM.Read
    : mode === AccessMode.Write ? AM.Write
    : AM.ReadWrite;
  const qc = new QCClass(caps);
  return qc.queryPath(targetPath, nonoMode) as QueryResultInfo;
}

/**
 * Query whether network access would be allowed by a sandbox config.
 */
export function querySandboxNetwork(config: SandboxConfig): QueryResultInfo {
  const caps = buildCapabilitySet(config);
  if (!caps) {
    return { status: "allowed", reason: "nono_unavailable" };
  }

  const { QueryContext: QCClass } = nonoModule;
  const qc = new QCClass(caps);
  return qc.queryNetwork() as QueryResultInfo;
}

/**
 * Get a human-readable summary of the sandbox policy.
 *
 * Uses CapabilitySet.summary() from nono-ts.
 */
export function getSandboxSummary(config: SandboxConfig): string {
  const caps = buildCapabilitySet(config);
  if (!caps) {
    return "Sandbox: nono-ts not available on this platform";
  }
  return caps.summary();
}
