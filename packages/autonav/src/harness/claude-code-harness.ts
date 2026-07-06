/**
 * Claude Code SDK Harness
 *
 * Adapts the Claude Agent SDK into the universal Harness interface.
 * This is a near-passthrough — most AgentConfig fields map directly
 * to SDK options. The main job is flattening SDK messages into AgentEvent.
 */

import { query, tool, createSdkMcpServer, type Query, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import * as os from "node:os";
import type { Harness, HarnessSession, AgentConfig, AgentEvent } from "./types.js";
import type { ToolDefinition } from "./tool-server.js";
import { resolveSandboxProvider, createSdkWrapper, buildNonoFlags, writeNonoFlagsFile } from "./sandbox.js";

/**
 * Flatten an SDK message into zero or more AgentEvents.
 *
 * SDK messages are rich and nested. We extract the parts that matter
 * for harness consumers (text, tool_use, tool_result, errors, result).
 */
function flattenMessage(message: SDKMessage): AgentEvent[] {
  const events: AgentEvent[] = [];

  if (message.type === "assistant") {
    // Check for rate limit error on the message
    if (message.error === "rate_limit") {
      events.push({
        type: "error",
        message: "Rate limit reached",
        retryable: true,
      });
    }

    // Extract content blocks
    for (const block of message.message.content) {
      if (block.type === "text") {
        events.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        events.push({
          type: "tool_use",
          name: block.name,
          id: block.id,
          input: (block.input as Record<string, unknown>) || {},
        });
      }
    }
  } else if (message.type === "user") {
    // Extract tool results from user messages
    const msg = message as Record<string, unknown>;
    if (msg.tool_use_result !== undefined) {
      const result = msg.tool_use_result;
      // Simple text result
      if (typeof result === "string") {
        events.push({
          type: "tool_result",
          toolUseId: "",
          content: result,
          isError: /^(Error:|error:)/i.test(result),
        });
      } else if (result && typeof result === "object") {
        const r = result as Record<string, unknown>;
        events.push({
          type: "tool_result",
          toolUseId: "",
          content: typeof r.content === "string" ? r.content : JSON.stringify(r),
          isError: r.isError === true,
        });
      }
    }
  } else if (message.type === "result") {
    const resultMsg = message as SDKResultMessage;
    if (resultMsg.subtype === "success") {
      events.push({
        type: "result",
        success: true,
        text: resultMsg.result,
        usage: {
          inputTokens: resultMsg.usage.input_tokens,
          outputTokens: resultMsg.usage.output_tokens,
        },
        costUsd: resultMsg.total_cost_usd,
        durationMs: resultMsg.duration_ms,
        durationApiMs: resultMsg.duration_api_ms,
        numTurns: resultMsg.num_turns,
        sessionId: resultMsg.session_id,
      });
    } else {
      const errors = "errors" in resultMsg ? resultMsg.errors : [];
      events.push({
        type: "result",
        success: false,
        text: errors.join("; "),
        usage: {
          inputTokens: resultMsg.usage.input_tokens,
          outputTokens: resultMsg.usage.output_tokens,
        },
        costUsd: resultMsg.total_cost_usd,
        durationMs: resultMsg.duration_ms,
        durationApiMs: resultMsg.duration_api_ms,
        numTurns: resultMsg.num_turns,
        sessionId: resultMsg.session_id,
      });
    }
  }

  return events;
}

/** Environment variables the Claude Code subprocess needs. Everything else is stripped. */
const ALLOWED_ENV_VARS = new Set([
  // System
  "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL", "LC_CTYPE",
  "TMPDIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
  // macOS
  "DEVELOPER_DIR", "SDKROOT", "SECURITYSESSIONID",
  // Anthropic API (the subprocess needs this to authenticate)
  "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL",
  // Claude Code (config dir has OAuth tokens, CLAUDECODE signals SDK context)
  "CLAUDE_CONFIG_DIR", "CLAUDECODE", "CLAUDE_CODE_MAX_MEMORY",
  // SSH (needed for git operations)
  "SSH_AUTH_SOCK",
  // Autonav internals
  "AUTONAV_DEBUG", "AUTONAV_SANDBOX", "AUTONAV_QUERY_DEPTH",
  "AUTONAV_METRICS", "AUTONAV_HARNESS",
  // Git
  "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL",
  // Node
  "NODE_PATH", "NODE_ENV",
]);

function buildCleanEnv(extra: Record<string, string> = {}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of ALLOWED_ENV_VARS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  // Forward prefixed vars needed by subprocesses
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith("AUTONAV_NAV_PATH_")) env[key] = value; // related-nav resolution
    if (key.startsWith("CLAUDE_")) env[key] = value;           // Claude Code config/auth
  }
  return { ...env, ...extra };
}

/**
 * Map AgentConfig to Claude Code SDK Options
 */
function configToSdkOptions(config: AgentConfig): Record<string, unknown> {
  const options: Record<string, unknown> = {};

  if (config.model) options.model = config.model;
  if (config.systemPrompt) options.systemPrompt = config.systemPrompt;
  if (config.cwd) options.cwd = config.cwd;
  if (config.additionalDirectories) options.additionalDirectories = config.additionalDirectories;
  if (config.maxTurns !== undefined) options.maxTurns = config.maxTurns;
  if (config.maxBudgetUsd !== undefined) options.maxBudgetUsd = config.maxBudgetUsd;
  if (config.allowedTools) options.allowedTools = config.allowedTools;
  if (config.disallowedTools) options.disallowedTools = config.disallowedTools;
  if (config.mcpServers) options.mcpServers = config.mcpServers;
  if (config.permissionMode) options.permissionMode = config.permissionMode;
  if (config.stderr) options.stderr = config.stderr;

  // Resolve sandbox provider — determines which enforcement mechanism to use.
  // Throws if provider is "nono" but nono CLI is missing (no silent fallback).
  const sandboxResolution = config.sandbox
    ? resolveSandboxProvider(config.sandbox)
    : { provider: "none" as const, active: false };

  if (sandboxResolution.provider === "nono" && sandboxResolution.active && config.sandbox) {
    // nono: kernel-enforced sandbox via wrapper script.
    // Uses --profile claude-code as base + navigator flags from a temp file.
    const wrapperDir = os.tmpdir();
    if (config.stderr) {
      config.stderr(`[nono] SandboxConfig: ${JSON.stringify({ provider: "nono", readPaths: config.sandbox.readPaths, writePaths: config.sandbox.writePaths, allowedCommands: config.sandbox.allowedCommands })}\n`);
    }
    const wrapperPath = createSdkWrapper("", wrapperDir, config.sandbox);
    const nonoFlags = buildNonoFlags(config.sandbox);
    const flagsFilePath = writeNonoFlagsFile(nonoFlags, wrapperDir);

    options.pathToClaudeCodeExecutable = wrapperPath;
    const extraEnv: Record<string, string> = { NONO_FLAGS_FILE: flagsFilePath };
    if (config.sandbox.nonoProfile) {
      extraEnv.NONO_PROFILE = config.sandbox.nonoProfile;
    }
    options.env = buildCleanEnv(extraEnv);
    // Disable SDK sandbox — nono is the security boundary.
    options.sandbox = { enabled: false };
  } else if (sandboxResolution.provider === "claude-code" && sandboxResolution.active) {
    // Claude Code SDK's built-in sandbox (Seatbelt/bubblewrap).
    // No nono dependency needed — the SDK handles enforcement.
    if (config.stderr) {
      config.stderr(`[sandbox] Using Claude Code SDK sandbox (provider: "claude-code")\n`);
    }
    options.sandbox = { enabled: true };
  } else {
    // No sandbox — either provider is "none" or sandbox is disabled.
    options.sandbox = { enabled: false };
  }

  return options;
}

/**
 * Claude Code SDK harness session.
 *
 * For initial prompt: iterates over the SDK Query's async generator.
 * For multi-turn (send): builds conversation context from prior messages
 * and starts a new query with accumulated history.
 */
class ClaudeCodeSession implements HarnessSession {
  private config: AgentConfig;
  private queryInstance: Query;
  private conversationHistory: string[] = [];
  private closed = false;

  constructor(config: AgentConfig, initialPrompt: string) {
    this.config = { ...config };
    this.conversationHistory.push(`User: ${initialPrompt}`);
    this.queryInstance = query({
      prompt: initialPrompt,
      options: configToSdkOptions(this.config),
    });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    let lastAssistantText = "";
    const toolCalls: string[] = [];
    const debug = process.env.AUTONAV_DEBUG === "1";

    for await (const message of this.queryInstance) {
      if (debug) {
        const msgType = (message as Record<string, unknown>).type;
        const msgSubtype = (message as Record<string, unknown>).subtype;
        const label = msgSubtype ? `${msgType}:${msgSubtype}` : msgType;
        process.stderr.write(`[harness] SDK message: ${label}\n`);
      }
      const events = flattenMessage(message);
      for (const event of events) {
        if (event.type === "text") {
          lastAssistantText = event.text;
        } else if (event.type === "tool_use") {
          toolCalls.push(`[Used tool: ${event.name}(${JSON.stringify(event.input).substring(0, 200)})]`);
        } else if (event.type === "tool_result" && event.content) {
          const summary = event.content.length > 300
            ? event.content.substring(0, 300) + "..."
            : event.content;
          toolCalls.push(`[Tool result: ${summary}]`);
        }
        yield event;
      }
    }

    // Record assistant response including tool activity for multi-turn context
    const parts: string[] = [];
    if (toolCalls.length > 0) {
      parts.push(toolCalls.join("\n"));
    }
    if (lastAssistantText) {
      parts.push(lastAssistantText);
    }
    if (parts.length > 0) {
      this.conversationHistory.push(`Assistant: ${parts.join("\n\n")}`);
    }
  }

  send(prompt: string): AsyncIterable<AgentEvent> {
    if (this.closed) {
      throw new Error("Session is closed");
    }

    this.conversationHistory.push(`User: ${prompt}`);

    // Build the full conversation as a single prompt
    // (same pattern as App.tsx conversation history)
    const fullPrompt = this.conversationHistory.join("\n\n");

    this.queryInstance = query({
      prompt: fullPrompt,
      options: configToSdkOptions(this.config),
    });

    // Return a new async iterable that tracks the response
    const session = this;
    return {
      async *[Symbol.asyncIterator]() {
        let lastText = "";
        const toolCalls: string[] = [];
        for await (const message of session.queryInstance) {
          const events = flattenMessage(message);
          for (const event of events) {
            if (event.type === "text") {
              lastText = event.text;
            } else if (event.type === "tool_use") {
              toolCalls.push(`[Used tool: ${event.name}(${JSON.stringify(event.input).substring(0, 200)})]`);
            } else if (event.type === "tool_result" && event.content) {
              const summary = event.content.length > 300
                ? event.content.substring(0, 300) + "..."
                : event.content;
              toolCalls.push(`[Tool result: ${summary}]`);
            }
            yield event;
          }
        }
        const parts: string[] = [];
        if (toolCalls.length > 0) {
          parts.push(toolCalls.join("\n"));
        }
        if (lastText) {
          parts.push(lastText);
        }
        if (parts.length > 0) {
          session.conversationHistory.push(`Assistant: ${parts.join("\n\n")}`);
        }
      },
    };
  }

  updateConfig(config: Partial<AgentConfig>): void {
    Object.assign(this.config, config);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/**
 * Claude Code SDK Harness
 *
 * Creates HarnessSessions that delegate to the Claude Agent SDK's query() function.
 * This is the default harness — it's a thin adapter since AgentConfig maps almost
 * directly to SDK options.
 */
export class ClaudeCodeHarness implements Harness {
  readonly displayName = "Claude";

  run(config: AgentConfig, prompt: string): HarnessSession {
    return new ClaudeCodeSession(config, prompt);
  }

  createToolServer(name: string, tools: ToolDefinition[]): { server: unknown } {
    const sdkTools = tools.map((td) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tool(td.name, td.description, td.inputSchema as any, ((args: any) => td.handler(args)) as any)
    );
    const server = createSdkMcpServer({
      name,
      version: "1.0.0",
      tools: sdkTools,
    });
    return { server };
  }
}
