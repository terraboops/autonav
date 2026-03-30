/**
 * Shared sandbox config builder.
 *
 * Extracts the per-operation sandbox config building logic that was
 * duplicated across navigator-adapter.ts and nav-chat.ts into a
 * single function. Also used by cross-nav and related-navs tools
 * to ensure sub-sessions inherit the target navigator's sandbox.
 */

import type { NavigatorConfig } from "@autonav/communication-layer";
import type { SandboxConfig, SandboxProvider } from "./types.js";

type Operation = "query" | "update" | "chat" | "standup" | "memento";

/**
 * Build a SandboxConfig for a specific operation on a navigator.
 *
 * Merges top-level permissions with per-operation profile settings.
 * Returns undefined if sandbox is disabled for this operation/provider.
 */
export function buildSandboxConfigForOperation(
  navConfig: NavigatorConfig,
  navigatorPath: string,
  knowledgeBasePath: string,
  operation: Operation,
): SandboxConfig | undefined {
  // Resolve provider
  const sandboxSection = navConfig.sandbox;
  const provider: SandboxProvider = sandboxSection?.dangerouslyDisableSandbox
    ? "none"
    : (sandboxSection?.provider ?? "nono");

  if (provider === "none") return undefined;

  // Check per-operation enable flag
  const profile = sandboxSection?.[operation] as
    | { enabled?: boolean; accessLevel?: string; blockNetwork?: boolean; allowedCommands?: string[]; extraReadPaths?: string[]; extraWritePaths?: string[] }
    | undefined;
  if (profile?.enabled === false) return undefined;

  // Merge top-level + per-operation permissions
  const topCommands = navConfig.permissions?.allowedCommands ?? [];
  const opCommands = profile?.allowedCommands ?? [];
  const allCommands = [...topCommands, ...opCommands];

  const topPaths = navConfig.permissions?.allowedPaths ?? [];
  const opReadPaths = profile?.extraReadPaths ?? [];
  const opWritePaths = profile?.extraWritePaths ?? [];

  const readPaths = [
    navigatorPath,
    knowledgeBasePath,
    ...topPaths,
    ...opReadPaths,
  ];

  // Only grant write if accessLevel is "readwrite"
  const writePaths = profile?.accessLevel === "readwrite"
    ? [navigatorPath, ...opWritePaths]
    : undefined;

  return {
    enabled: true,
    provider,
    readPaths,
    writePaths,
    allowedCommands: allCommands.length > 0 ? allCommands : undefined,
    blockNetwork: profile?.blockNetwork,
  };
}
