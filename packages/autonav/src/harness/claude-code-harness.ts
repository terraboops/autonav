/**
 * Claude Code SDK Harness
 *
 * Adapts the Claude Agent SDK into the universal Harness interface.
 * This is a near-passthrough — most AgentConfig fields map directly
 * to SDK options. The main job is flattening SDK messages into AgentEvent.
 */

import { query, tool, createSdkMcpServer, type Query, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Harness, HarnessSession, AgentConfig, AgentEvent } from "./types.js";
import type { ToolDefinition } from "./tool-server.js";

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
  if (config.disallowedTools) options.disallowedTools = config.disallowedTools;
  if (config.mcpServers) options.mcpServers = config.mcpServers;
  if (config.permissionMode) options.permissionMode = config.permissionMode;
  if (config.stderr) options.stderr = config.stderr;

  // Explicitly disable SDK sandbox. The SDK's Seatbelt/bubblewrap sandbox blocks
  // all network access by default and allowedDomains can't be reliably wired up
  // yet. File-level sandboxing is handled by ChibiHarness via nono.
  // ClaudeCodeHarness relies on cwd scoping, tool allowlists, and permission modes.
  options.sandbox = { enabled: false };

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

    for await (const message of this.queryInstance) {
      const events = flattenMessage(message);
      for (const event of events) {
        if (event.type === "text") {
          lastAssistantText = event.text;
        }
        yield event;
      }
    }

    // Record assistant response for multi-turn context
    if (lastAssistantText) {
      this.conversationHistory.push(`Assistant: ${lastAssistantText}`);
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
        for await (const message of session.queryInstance) {
          const events = flattenMessage(message);
          for (const event of events) {
            if (event.type === "text") {
              lastText = event.text;
            }
            yield event;
          }
        }
        if (lastText) {
          session.conversationHistory.push(`Assistant: ${lastText}`);
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
      tool(td.name, td.description, td.inputSchema, td.handler)
    );
    const server = createSdkMcpServer({
      name,
      version: "1.0.0",
      tools: sdkTools,
    });
    return { server };
  }
}
