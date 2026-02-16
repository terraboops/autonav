/**
 * Harness Adapter Types
 *
 * Defines the universal interface for agent runtimes. Each harness
 * implementation translates autonav's needs into the underlying runtime
 * (Claude Code SDK, chibi, future runtimes).
 *
 * Everything goes through the harness: query, update, chat, memento,
 * standup, and agent-to-agent communication.
 */

import type { ToolDefinition } from "./tool-server.js";

/**
 * Supported harness types
 */
export type HarnessType = "claude-code" | "chibi";

/**
 * Sandbox configuration for process isolation.
 *
 * Only applies to harnesses that spawn subprocesses (chibi, opencode).
 * Claude Code SDK has built-in sandboxing and ignores this config.
 *
 * Uses nono.sh for kernel-enforced sandboxing (Landlock on Linux,
 * Seatbelt on macOS). Falls back to running unsandboxed if nono
 * is not available.
 */
export interface SandboxConfig {
  /** Explicitly enable/disable. Default: auto-detect nono on PATH. AUTONAV_SANDBOX=0 to disable. */
  enabled?: boolean;
  /** Paths with read-only access */
  readPaths?: string[];
  /** Paths with read+write access */
  writePaths?: string[];
  /** Block all network access */
  blockNetwork?: boolean;
}

/**
 * Configuration for an agent session.
 *
 * Each harness translates this into its runtime's native config format.
 * Fields map naturally to Claude Code SDK options and chibi-json config.
 */
export interface AgentConfig {
  /** Model to use (e.g. "claude-sonnet-4-5", "claude-haiku-4-5") */
  model?: string;

  /** System prompt for the agent */
  systemPrompt?: string;

  /** Working directory for the agent */
  cwd?: string;

  /** Additional directories the agent can access */
  additionalDirectories?: string[];

  /** Maximum turns for the agent loop */
  maxTurns?: number;

  /** Maximum budget in USD */
  maxBudgetUsd?: number;

  /** Tools the agent is allowed to use */
  allowedTools?: string[];

  /** Tools the agent is disallowed from using */
  disallowedTools?: string[];

  /** MCP servers to provide to the agent */
  mcpServers?: Record<string, unknown>;

  /** Permission mode (e.g. "bypassPermissions", "acceptEdits") */
  permissionMode?: string;

  /** Stderr handler for diagnostic output */
  stderr?: (data: string) => void;

  /**
   * Sandbox configuration for process isolation.
   * Only applies to harnesses that spawn subprocesses (chibi, opencode).
   * Claude Code SDK has built-in sandboxing and ignores this config.
   */
  sandbox?: SandboxConfig;
}

/**
 * Events emitted by a harness during agent execution.
 *
 * This is the universal event format — each harness translates its native
 * events into these types. Consumers never need to know which runtime
 * is being used.
 */
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; id: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "error"; message: string; retryable?: boolean }
  | {
      type: "result";
      success: boolean;
      text?: string;
      usage?: { inputTokens: number; outputTokens: number };
      costUsd?: number;
      durationMs?: number;
      durationApiMs?: number;
      numTurns?: number;
      sessionId?: string;
    };

/**
 * A running harness session.
 *
 * Implements AsyncIterable so you can use `for await...of` to consume events.
 * For multi-turn conversations, call `send()` to continue after the initial
 * response completes.
 *
 * Usage patterns:
 *
 * Single-shot (query, memento implementer, reviewer):
 * ```typescript
 * for await (const event of harness.run(config, prompt)) { ... }
 * ```
 *
 * Multi-turn (chat, standup nav-to-nav conversations):
 * ```typescript
 * const session = harness.run(config, firstPrompt);
 * for await (const event of session) { ... }
 * for await (const event of session.send(followUp)) { ... }
 * await session.close();
 * ```
 */
export interface HarnessSession extends AsyncIterable<AgentEvent> {
  /** Send a follow-up prompt in the same session */
  send(prompt: string): AsyncIterable<AgentEvent>;

  /** Update session config (e.g. change model mid-session) */
  updateConfig(config: Partial<AgentConfig>): void;

  /** Close the session and clean up resources */
  close(): Promise<void>;
}

/**
 * A harness adapter that translates autonav's needs into a specific runtime.
 *
 * Each implementation (ClaudeCodeHarness, ChibiHarness) maps AgentConfig
 * to its runtime's native options and translates events back to AgentEvent.
 */
export interface Harness {
  /** Display name for error messages and diagnostics */
  readonly displayName: string;

  /** Start a new agent session with the given config and initial prompt */
  run(config: AgentConfig, prompt: string): HarnessSession;

  /**
   * Create a tool server that hosts tool handlers within the agent session.
   *
   * Each harness adapts tool definitions to its native hosting mechanism:
   * - ClaudeCodeHarness: SDK `tool()` + `createSdkMcpServer()` (in-process MCP)
   * - ChibiHarness: JSONL tool_call/tool_result interception (no MCP needed)
   *
   * The returned `server` is opaque — pass it via `AgentConfig.mcpServers`.
   *
   * @param name - Server name (e.g. "autonav-response")
   * @param tools - Tool definitions created with `defineTool()`
   * @returns Object containing the server to pass to `mcpServers`
   */
  createToolServer(name: string, tools: ToolDefinition[]): { server: unknown };
}
