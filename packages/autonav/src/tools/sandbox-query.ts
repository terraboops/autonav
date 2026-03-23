/**
 * Sandbox Query Tool
 *
 * MCP tool that lets navigators check "would this operation be allowed?"
 * against the current sandbox policy. Uses nono-ts QueryContext for
 * dry-run policy checks without actually applying any sandbox.
 *
 * This is read-only — it tells the navigator what's blocked and what
 * config change would fix it, but cannot modify config.json itself.
 * The navigator must ask the user to approve the change.
 * Config changes take effect on next launch.
 */

import { z } from "zod";
import {
  type Harness,
  type SandboxConfig,
  querySandbox,
  querySandboxNetwork,
  getSandboxSummary,
  isSandboxEnabled,
  AccessMode,
  defineTool,
} from "../harness/index.js";

/**
 * Create an MCP server with the sandbox_query tool.
 *
 * The tool requires the current session's SandboxConfig so it can
 * query the active policy. If no sandbox is active, all queries
 * return "allowed".
 */
export function createSandboxQueryMcpServer(
  harness: Harness,
  sandboxConfig: SandboxConfig | undefined,
) {
  const sandboxQueryTool = defineTool(
    "sandbox_query",
    `Check if a path or network operation would be allowed by the current sandbox policy.

Use this tool to diagnose permission issues — for example, when a CLI command fails
or a file operation is blocked. The tool returns the policy decision and a suggestion
for what config change would fix it (if denied).

Note: You cannot modify the sandbox config directly. Suggest changes to the user,
who must approve them in config.json. Changes take effect on next launch.`,
    {
      path: z
        .string()
        .optional()
        .describe("Absolute path to check access for"),
      operation: z
        .enum(["read", "write", "readwrite"])
        .optional()
        .default("read")
        .describe("Type of access to check"),
      checkNetwork: z
        .boolean()
        .optional()
        .describe("Check if network access is allowed"),
      checkCommand: z
        .string()
        .optional()
        .describe("Check if a CLI command (e.g. 'linear') is allowed"),
    },
    async (args) => {
      // If sandbox is not active, everything is allowed
      if (!sandboxConfig || !isSandboxEnabled(sandboxConfig)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "allowed",
                reason: "sandbox_disabled",
                message: "Sandbox is not active — all operations are allowed.",
              }),
            },
          ],
          isError: false,
        };
      }

      try {
        // Check network access
        if (args.checkNetwork) {
          const result = querySandboxNetwork(sandboxConfig);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ...result,
                  ...(result.status === "denied"
                    ? {
                        suggestion:
                          "Remove 'blockNetwork: true' from sandbox config in config.json, or set sandbox.chat.blockNetwork to false.",
                      }
                    : {}),
                }),
              },
            ],
            isError: false,
          };
        }

        // Check command access
        if (args.checkCommand) {
          const isAllowed =
            sandboxConfig.allowedCommands?.includes(args.checkCommand) ?? false;
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: isAllowed ? "allowed" : "denied",
                  reason: isAllowed ? "command_allowed" : "command_not_in_allowlist",
                  command: args.checkCommand,
                  ...(isAllowed
                    ? {}
                    : {
                        suggestion: `Add '${args.checkCommand}' to permissions.allowedCommands in config.json. Example:\n"permissions": { "allowedCommands": ["${args.checkCommand}"] }`,
                      }),
                }),
              },
            ],
            isError: false,
          };
        }

        // Check path access
        if (args.path) {
          const mode =
            args.operation === "write"
              ? AccessMode.Write
              : args.operation === "readwrite"
                ? AccessMode.ReadWrite
                : AccessMode.Read;

          const result = querySandbox(sandboxConfig, args.path, mode);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ...result,
                  path: args.path,
                  operation: args.operation,
                  ...(result.status === "denied"
                    ? {
                        suggestion:
                          args.operation === "read"
                            ? `Add '${args.path}' to permissions.allowedPaths or sandbox.chat.extraReadPaths in config.json.`
                            : `Add '${args.path}' to sandbox.chat.extraWritePaths in config.json, and set sandbox.chat.accessLevel to "readwrite".`,
                      }
                    : {}),
                }),
              },
            ],
            isError: false,
          };
        }

        // No specific check requested — return policy summary
        const summary = getSandboxSummary(sandboxConfig);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "info",
                summary,
                allowedCommands: sandboxConfig.allowedCommands ?? [],
                message:
                  "Use 'path', 'checkNetwork', or 'checkCommand' parameters to check specific operations.",
              }),
            },
          ],
          isError: false,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                message: `Failed to query sandbox: ${errorMsg}`,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return harness.createToolServer("autonav-sandbox", [sandboxQueryTool]);
}
