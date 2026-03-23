#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { runConversationTUI, isInteractiveTerminal } from "../conversation/index.js";
import { resolveAndCreateHarness, isSandboxEnabled, getSandboxSummary, type SandboxConfig } from "../harness/index.js";
import { createRelatedNavsMcpServer } from "../tools/related-navs.js";
import { createRelatedNavsConfigServer } from "../tools/related-navs-config.js";
import { createCrossNavMcpServer } from "../tools/cross-nav.js";
import { createSandboxQueryMcpServer } from "../tools/sandbox-query.js";
import { resolveNavigatorArg } from "./resolve-nav.js";

/**
 * autonav chat CLI command
 *
 * Opens an interactive conversation with a navigator for management tasks.
 *
 * Usage:
 *   autonav chat <navigator-path>
 */

interface ChatOptions {
  verbose?: boolean;
  harness?: string;
}

function printUsage() {
  console.log(`
autonav chat - Interactive conversation with a navigator

Usage:
  autonav chat [navigator-path]

Arguments:
  navigator-path    Path to the navigator directory (auto-detects from cwd)

Options:
  --verbose         Show debug information

Description:
  Opens an interactive conversation mode with your navigator. You can:
  - Ask questions about your knowledge base
  - Reorganize information
  - Add new knowledge
  - Update configuration and behavior
  - Get help understanding what the navigator can do

Examples:
  autonav chat ./my-navigator
  autonav chat .                  # Use current directory
  autonav chat                    # Auto-detect from cwd (if inside a navigator)

Commands available in conversation:
  /help    - Show available commands
  /status  - Show navigator status
  /clear   - Clear conversation history
  /exit    - Exit conversation mode (or Ctrl+C/Ctrl+D)
`);
}

function parseArgs(args: string[]): {
  navigatorPath?: string;
  options: ChatOptions;
} {
  const options: ChatOptions = {};
  let navigatorPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg) continue;

    if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--harness" && i + 1 < args.length) {
      options.harness = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      navigatorPath = arg;
    }
  }

  return { navigatorPath, options };
}

/** Run this command with the given args (called by dispatcher) */
export async function run(args: string[]): Promise<void> {

  // Handle --help
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Parse arguments
  const { navigatorPath: rawPath, options } = parseArgs(args);

  // Resolve navigator path (auto-detects from cwd if no arg given)
  const navigatorPath = resolveNavigatorArg(rawPath);

  // Load config
  const configPath = path.join(navigatorPath, "config.json");
  let config: {
    name: string;
    knowledgeBasePath: string;
    instructionsPath?: string;
    relatedNavigators?: Array<{ name: string; description?: string }>;
    permissions?: {
      allowedCommands?: string[];
      allowedPaths?: string[];
    };
    sandbox?: {
      dangerouslyDisableSandbox?: boolean;
      chat?: {
        enabled?: boolean;
        accessLevel?: "readonly" | "readwrite";
        blockNetwork?: boolean;
        allowedCommands?: string[];
        extraReadPaths?: string[];
        extraWritePaths?: string[];
      };
    };
    harness?: { type?: string; model?: string };
  };
  let configContent: string;
  try {
    configContent = fs.readFileSync(configPath, "utf-8");
    config = JSON.parse(configContent);
  } catch (error) {
    console.error(`❌ Error: Failed to parse config.json: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Load system prompt (CLAUDE.md or custom)
  const instructionsFile = config.instructionsPath || "CLAUDE.md";
  const instructionsPath = path.join(navigatorPath, instructionsFile);

  if (!fs.existsSync(instructionsPath)) {
    console.error(`❌ Error: Instructions file not found: ${instructionsFile}`);
    console.error(`Expected path: ${instructionsPath}`);
    process.exit(1);
  }

  const systemPrompt = fs.readFileSync(instructionsPath, "utf-8");

  // Resolve knowledge base path
  const knowledgeBasePath = path.join(navigatorPath, config.knowledgeBasePath || "knowledge");

  if (!fs.existsSync(knowledgeBasePath)) {
    console.error(`❌ Error: Knowledge base not found: ${knowledgeBasePath}`);
    process.exit(1);
  }

  // Check for interactive terminal
  if (!isInteractiveTerminal()) {
    console.error("❌ Error: Interactive conversation requires a TTY terminal.");
    console.error("\nRun this command in an interactive terminal (not piped or in a script).\n");
    process.exit(1);
  }

  // Run the conversation TUI
  try {
    if (options.verbose) {
      console.log(`Navigator: ${config.name}`);
      console.log(`Path: ${navigatorPath}`);
      console.log(`Knowledge Base: ${knowledgeBasePath}`);
      console.log("");
    }

    // Resolve harness from CLI flag, env var, or default
    const harness = await resolveAndCreateHarness(options.harness);

    // Build MCP servers for cross-navigator communication
    const mcpServers: Record<string, unknown> = {};

    // Generic cross-nav tool (query by path)
    const crossNavMcp = createCrossNavMcpServer(harness);
    mcpServers["autonav-cross-nav"] = crossNavMcp.server;

    // Per-navigator tools (ask_<name>) from relatedNavigators config
    if (config.relatedNavigators && config.relatedNavigators.length > 0) {
      const relatedNavsMcp = createRelatedNavsMcpServer(
        harness,
        config.relatedNavigators
      );
      if (relatedNavsMcp) {
        mcpServers["autonav-related-navs"] = relatedNavsMcp.server;
      }
    }

    // Self-config tools for managing related navigators
    const relatedNavsConfigMcp = createRelatedNavsConfigServer(
      navigatorPath,
      harness
    );
    mcpServers["autonav-related-navs-config"] = relatedNavsConfigMcp.server;

    // Build full SandboxConfig from navigator config
    const sandboxConfig: SandboxConfig | undefined = (() => {
      if (config.sandbox?.dangerouslyDisableSandbox) return undefined;
      const chatSandbox = config.sandbox?.chat;
      if (chatSandbox?.enabled === false) return undefined;

      return {
        enabled: true,
        readPaths: [
          navigatorPath,
          knowledgeBasePath,
          ...(config.permissions?.allowedPaths ?? []),
          ...(chatSandbox?.extraReadPaths ?? []),
        ],
        writePaths: chatSandbox?.accessLevel === "readwrite"
          ? [navigatorPath, ...(chatSandbox?.extraWritePaths ?? [])]
          : undefined,
        allowedCommands: [
          ...(config.permissions?.allowedCommands ?? []),
          ...(chatSandbox?.allowedCommands ?? []),
        ].length > 0
          ? [...(config.permissions?.allowedCommands ?? []), ...(chatSandbox?.allowedCommands ?? [])]
          : undefined,
        blockNetwork: chatSandbox?.blockNetwork,
      };
    })();

    // Register sandbox_query tool so navigators can diagnose permission issues
    if (sandboxConfig && isSandboxEnabled(sandboxConfig)) {
      const sandboxMcp = createSandboxQueryMcpServer(harness, sandboxConfig);
      mcpServers["autonav-sandbox"] = sandboxMcp.server;
    }

    // Inject sandbox summary into system prompt when sandbox is active
    let augmentedSystemPrompt = systemPrompt;
    if (sandboxConfig && isSandboxEnabled(sandboxConfig)) {
      const summary = getSandboxSummary(sandboxConfig);
      augmentedSystemPrompt += `\n\n## Sandbox Policy (active)\n${summary}\nUse the sandbox_query tool to check specific operations.\nConfig changes require user approval and take effect on next launch.\n`;
    }

    // Collect allowed commands from both top-level permissions and chat-specific config.
    // These bypass the SDK permission prompt (separate from nono sandbox enforcement).
    const allowedCommands = [
      ...(config.permissions?.allowedCommands ?? []),
      ...(config.sandbox?.chat?.allowedCommands ?? []),
    ];

    await runConversationTUI({
      navigatorName: config.name,
      navigatorPath,
      navigatorSystemPrompt: augmentedSystemPrompt,
      knowledgeBasePath,
      harness,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      sandboxConfig,
      allowedCommands: allowedCommands.length > 0 ? allowedCommands : undefined,
      configJson: configContent,
      model: config.harness?.model,
    });

    console.log("\n👋 Conversation ended.\n");
    process.exit(0);
  } catch (error) {
    if (error instanceof Error && error.message.includes("TTY")) {
      console.error(`❌ Error: ${error.message}`);
    } else {
      console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}
