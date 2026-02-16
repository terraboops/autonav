/**
 * Chibi Harness
 *
 * Adapts the chibi-json subprocess into the universal Harness interface.
 * Spawns chibi-json, communicates via JSONL (stdin/stdout), and translates
 * chibi transcript entries into AgentEvent.
 *
 * Key behaviors:
 * - Sets system prompt via set_system_prompt command
 * - Writes local.toml for model/tool config
 * - Adds anthropic/ prefix to model names if needed
 * - Chibi contexts persist on disk, enabling multi-turn continuity
 */

import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import type { Harness, HarnessSession, AgentConfig, AgentEvent } from "./types.js";
import type { ToolDefinition } from "./tool-server.js";

/**
 * Marker for chibi tool server sentinel objects.
 * ChibiSession inspects mcpServers for objects with this marker
 * and extracts tool definitions for JSONL interception.
 */
const CHIBI_TOOL_MARKER = "__chibi_tools__" as const;

interface ChibiToolServer {
  [CHIBI_TOOL_MARKER]: true;
  name: string;
  tools: ToolDefinition[];
}

/**
 * Ensure model name has the anthropic/ prefix for chibi
 */
function normalizeModelName(model: string): string {
  if (model.startsWith("anthropic/")) return model;
  if (model.startsWith("claude-")) return `anthropic/${model}`;
  return model;
}

/**
 * Generate a local.toml configuration for chibi
 */
function generateLocalToml(config: AgentConfig): string {
  const lines: string[] = [];

  if (config.model) {
    lines.push(`model = "${normalizeModelName(config.model)}"`);
  }

  if (config.maxTurns !== undefined) {
    lines.push(`fuel = ${config.maxTurns}`);
  }

  // Tool filtering
  if (config.allowedTools && config.allowedTools.length > 0) {
    lines.push("");
    lines.push("[tools]");
    lines.push(`include = [${config.allowedTools.map((t) => `"${t}"`).join(", ")}]`);
  } else if (config.disallowedTools && config.disallowedTools.length > 0) {
    lines.push("");
    lines.push("[tools]");
    lines.push(`exclude = [${config.disallowedTools.map((t) => `"${t}"`).join(", ")}]`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Parse a chibi JSONL line into AgentEvents
 */
function parseChibiLine(line: string): AgentEvent[] {
  const events: AgentEvent[] = [];

  try {
    const data = JSON.parse(line);

    // Transcript entry
    if (data.entry_type === "message" && data.content) {
      events.push({ type: "text", text: data.content });
    } else if (data.entry_type === "tool_call") {
      events.push({
        type: "tool_use",
        name: data.tool_name || data.name || "unknown",
        id: data.id || "",
        input: data.input || data.arguments || {},
      });
    } else if (data.entry_type === "tool_result") {
      events.push({
        type: "tool_result",
        toolUseId: data.tool_call_id || data.id || "",
        content: typeof data.content === "string" ? data.content : JSON.stringify(data.content || ""),
        isError: data.is_error === true,
      });
    }

    // Result message
    if (data.type === "result") {
      events.push({
        type: "result",
        success: data.success !== false,
        text: data.text || data.content || "",
        usage: data.usage
          ? {
              inputTokens: data.usage.input_tokens || 0,
              outputTokens: data.usage.output_tokens || 0,
            }
          : undefined,
        costUsd: data.cost_usd,
      });
    }

    // Text content (direct format)
    if (data.type === "text" && data.text) {
      events.push({ type: "text", text: data.text });
    }

    // Assistant message (alternate format)
    if (data.role === "assistant" && data.content) {
      if (typeof data.content === "string") {
        events.push({ type: "text", text: data.content });
      } else if (Array.isArray(data.content)) {
        for (const block of data.content) {
          if (block.type === "text") {
            events.push({ type: "text", text: block.text });
          } else if (block.type === "tool_use") {
            events.push({
              type: "tool_use",
              name: block.name || "unknown",
              id: block.id || "",
              input: block.input || {},
            });
          }
        }
      }
    }
  } catch {
    // Not valid JSON — could be raw text output, ignore
  }

  return events;
}

/**
 * Chibi harness session.
 *
 * Manages a chibi-json subprocess and translates JSONL events.
 */
class ChibiSession implements HarnessSession {
  private config: AgentConfig;
  private contextDir: string;
  private child: ChildProcess | null = null;
  private closed = false;
  private registeredTools: Map<string, ToolDefinition> = new Map();

  constructor(config: AgentConfig, initialPrompt: string) {
    this.config = { ...config };

    // Extract chibi tool servers from mcpServers config
    if (config.mcpServers) {
      for (const serverObj of Object.values(config.mcpServers)) {
        if (
          serverObj &&
          typeof serverObj === "object" &&
          CHIBI_TOOL_MARKER in (serverObj as Record<string, unknown>)
        ) {
          const chibiServer = serverObj as unknown as ChibiToolServer;
          for (const td of chibiServer.tools) {
            this.registeredTools.set(td.name, td);
          }
        }
      }
    }

    // Create a context directory for this session
    this.contextDir = fs.mkdtempSync(path.join(os.tmpdir(), "chibi-ctx-"));

    // Write local.toml config
    const tomlContent = generateLocalToml(this.config);
    fs.writeFileSync(path.join(this.contextDir, "local.toml"), tomlContent);

    // Start chibi-json process
    this.child = this.spawnChibi(initialPrompt);
  }

  private spawnChibi(prompt: string): ChildProcess {
    const args: string[] = [];

    // Set project root
    if (this.config.cwd) {
      args.push("--project-root", this.config.cwd);
    }

    // Set context directory
    args.push("--context-dir", this.contextDir);

    const child = spawn("chibi-json", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
      },
    });

    // Set system prompt first, then send the prompt
    if (this.config.systemPrompt) {
      const setSystemPrompt = JSON.stringify({
        type: "set_system_prompt",
        content: this.config.systemPrompt,
      });
      child.stdin?.write(setSystemPrompt + "\n");
    }

    // Send the prompt
    const sendPrompt = JSON.stringify({
      type: "send_prompt",
      content: prompt,
    });
    child.stdin?.write(sendPrompt + "\n");

    // Handle stderr for diagnostics
    if (child.stderr && this.config.stderr) {
      const stderrHandler = this.config.stderr;
      child.stderr.on("data", (data: Buffer) => {
        stderrHandler(data.toString());
      });
    }

    return child;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    if (!this.child || !this.child.stdout) {
      throw new Error("Chibi process not started");
    }

    const rl = readline.createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity,
    });

    let hasResult = false;

    for await (const line of rl) {
      if (!line.trim()) continue;

      const events = parseChibiLine(line);
      for (const event of events) {
        if (event.type === "result") {
          hasResult = true;
        }

        // Intercept tool_use events for registered tools
        if (event.type === "tool_use" && this.registeredTools.has(event.name)) {
          const toolDef = this.registeredTools.get(event.name)!;
          try {
            const result = await toolDef.handler(event.input);
            // Send tool_result back via stdin JSONL
            const resultMsg = JSON.stringify({
              type: "tool_result",
              tool_call_id: event.id,
              content: result.content.map((c) => c.text).join("\n"),
              is_error: result.isError,
            });
            this.child?.stdin?.write(resultMsg + "\n");
          } catch (error) {
            const errorMsg = JSON.stringify({
              type: "tool_result",
              tool_call_id: event.id,
              content: error instanceof Error ? error.message : String(error),
              is_error: true,
            });
            this.child?.stdin?.write(errorMsg + "\n");
          }
          // Still yield the tool_use event so closure capture works for callers
          yield event;
          continue;
        }

        yield event;
      }
    }

    // If we didn't get a result event, emit one based on exit code
    if (!hasResult) {
      const exitCode = await new Promise<number | null>((resolve) => {
        if (!this.child) {
          resolve(null);
          return;
        }
        if (this.child.exitCode !== null) {
          resolve(this.child.exitCode);
          return;
        }
        this.child.on("exit", (code) => resolve(code));
      });

      yield {
        type: "result",
        success: exitCode === 0,
        text: exitCode === 0 ? "Completed" : `Process exited with code ${exitCode}`,
      };
    }
  }

  send(prompt: string): AsyncIterable<AgentEvent> {
    if (this.closed) {
      throw new Error("Session is closed");
    }

    // For multi-turn, we spawn a new chibi-json process
    // Chibi contexts persist on disk, so history is maintained
    this.child = this.spawnChibi(prompt);

    const session = this;
    return {
      [Symbol.asyncIterator]() {
        return session[Symbol.asyncIterator]();
      },
    };
  }

  updateConfig(config: Partial<AgentConfig>): void {
    Object.assign(this.config, config);

    // Re-write local.toml with updated config
    const tomlContent = generateLocalToml(this.config);
    fs.writeFileSync(path.join(this.contextDir, "local.toml"), tomlContent);
  }

  async close(): Promise<void> {
    this.closed = true;

    if (this.child && this.child.exitCode === null) {
      this.child.kill("SIGTERM");
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (!this.child) {
          resolve();
          return;
        }
        this.child.on("exit", () => resolve());
        setTimeout(() => {
          this.child?.kill("SIGKILL");
          resolve();
        }, 5000);
      });
    }

    // Clean up context directory
    try {
      fs.rmSync(this.contextDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Chibi Harness
 *
 * Creates HarnessSessions that delegate to chibi-json subprocess.
 * Translates AgentConfig to chibi-json's JSONL protocol and local.toml config.
 */
export class ChibiHarness implements Harness {
  run(config: AgentConfig, prompt: string): HarnessSession {
    return new ChibiSession(config, prompt);
  }

  createToolServer(name: string, tools: ToolDefinition[]): { server: unknown } {
    return {
      server: {
        [CHIBI_TOOL_MARKER]: true,
        name,
        tools,
      } satisfies ChibiToolServer,
    };
  }
}
