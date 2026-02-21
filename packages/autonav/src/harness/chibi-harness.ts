/**
 * Chibi Harness
 *
 * Adapts chibi-json into the universal Harness interface.
 *
 * chibi-json is stateless per invocation: each call reads ONE JSON object
 * from stdin, executes the command, outputs JSONL to stdout, and exits.
 * Multi-turn continuity comes from the named `context` — chibi persists
 * conversation history on disk keyed by context name.
 *
 * Protocol (from `chibi-json --json-schema`):
 *   Input:  { command: Command, context: string, project_root?: string, flags?: ExecutionFlags }
 *   Output: JSONL lines — transcript entries (entry_type: "message"|"tool_call"|"tool_result")
 *           and error objects (type: "error", message: string)
 *
 * Session lifecycle:
 *   1. set_system_prompt (separate invocation, no output) — also sets destroy_after_seconds_inactive
 *   2. send_prompt (separate invocation, streams JSONL output)
 *   3. For multi-turn: send_prompt again with same context name
 *
 * Context cleanup:
 *   Contexts self-destruct after CONTEXT_TTL_SECONDS of inactivity (chibi GC handles this).
 *   No explicit destroy_context call is needed.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import type { Harness, HarnessSession, AgentConfig, AgentEvent, SandboxConfig } from "./types.js";
import type { ToolDefinition } from "./tool-server.js";
import { createEphemeralHome, type EphemeralHome } from "./ephemeral-home.js";
import { wrapCommand, isSandboxEnabled } from "./sandbox.js";

/** Auto-destroy context after 12 hours of inactivity. */
const CONTEXT_TTL_SECONDS = 12 * 60 * 60;

const CHIBI_TOOL_MARKER = "__chibi_tools__" as const;

interface ChibiToolServer {
  [CHIBI_TOOL_MARKER]: true;
  name: string;
  tools: ToolDefinition[];
}

/**
 * Build the chibi-json input object for a command.
 *
 * When destroyAfterSecondsInactive is set, it is passed in `flags` so chibi
 * registers the TTL on the context entry at touch time.
 *
 * When `model` is provided it is passed via `config.model` so chibi uses
 * that model for the invocation. When omitted chibi falls back to whatever
 * model is configured in the user's config.toml (i.e. the user's default).
 */
function buildInput(
  command: Record<string, unknown> | string,
  context: string,
  projectRoot?: string,
  home?: string,
  destroyAfterSecondsInactive?: number,
  model?: string,
): string {
  const input: Record<string, unknown> = { command, context };
  if (projectRoot) {
    input.project_root = projectRoot;
  }
  if (home) {
    input.home = home;
  }
  if (destroyAfterSecondsInactive !== undefined) {
    input.flags = { destroy_after_seconds_inactive: destroyAfterSecondsInactive };
  }
  if (model) {
    input.config = { model };
  }
  return JSON.stringify(input);
}

/**
 * Run a chibi-json command synchronously (for commands with no streaming output like set_system_prompt).
 */
function runSync(
  inputJson: string,
  opts?: { env?: Record<string, string>; sandboxConfig?: SandboxConfig },
): void {
  const { command, args } = wrapCommand("chibi-json", [], opts?.sandboxConfig);
  execFileSync(command, args, {
    input: inputJson,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 10_000,
    env: opts?.env ? { ...process.env, ...opts.env } : undefined,
  });
}

/**
 * Parse a chibi JSONL output line into AgentEvents.
 *
 * Chibi transcript entries have:
 *   - entry_type: "message" | "tool_call" | "tool_result"
 *   - from: sender name
 *   - to: context name
 *   - content: string (for messages) or structured data
 *
 * Error objects have:
 *   - type: "error"
 *   - message: string
 */
function parseChibiLine(line: string): AgentEvent[] {
  const events: AgentEvent[] = [];

  try {
    const data = JSON.parse(line);

    // Error object
    if (data.type === "error") {
      events.push({
        type: "error",
        message: data.message || "Unknown chibi error",
      });
      return events;
    }

    // Transcript entries (from chibi's conversation log)
    if (data.entry_type === "message") {
      // Skip user messages (from="user"), only emit assistant responses
      if (data.from !== "user" && data.content) {
        events.push({ type: "text", text: data.content });
      }
    } else if (data.entry_type === "tool_call") {
      let input: Record<string, unknown> = {};
      try {
        input = typeof data.content === "string" ? JSON.parse(data.content) : (data.content || {});
      } catch {
        // content wasn't valid JSON — leave input empty
      }
      events.push({
        type: "tool_use",
        name: data.to || "unknown",
        id: data.tool_call_id || data.id || "",
        input,
      });
    } else if (data.entry_type === "tool_result") {
      events.push({
        type: "tool_result",
        toolUseId: data.tool_call_id || data.id || "",
        content: typeof data.content === "string" ? data.content : JSON.stringify(data.content || ""),
        isError: data.is_error === true,
      });
    }
  } catch {
    // Not valid JSON — ignore
  }

  return events;
}

/**
 * Chibi harness session.
 *
 * Each prompt is a separate chibi-json invocation. The named context
 * provides conversation continuity across invocations.
 */
class ChibiSession implements HarnessSession {
  private config: AgentConfig;
  private contextName: string;
  private child: ChildProcess | null = null;
  private closed = false;
  private registeredTools: Map<string, ToolDefinition> = new Map();
  private ephemeralHome: EphemeralHome | null = null;
  private sandboxConfig: SandboxConfig | undefined;
  private extraEnv: Record<string, string> = {};
  private sandboxDenials: string[] = [];

  constructor(config: AgentConfig, initialPrompt: string) {
    this.config = { ...config };
    this.contextName = `autonav-${crypto.randomUUID().slice(0, 8)}`;

    // Create ephemeral home with all chibi plugins
    this.ephemeralHome = createEphemeralHome({
      harness: "chibi",
      setup: (home) => {
        // home_override IS the chibi_dir in AppState::load — files go at root level.
        // Copy user config so chibi can authenticate with the LLM API.
        const userConfig = path.join(os.homedir(), ".chibi", "config.toml");
        if (fs.existsSync(userConfig)) {
          fs.copyFileSync(userConfig, path.join(home, "config.toml"));
        }

        // Install all chibi plugins from the plugins directory
        const pluginsDir = path.join(home, "plugins");
        fs.mkdirSync(pluginsDir);
        const srcDir = fileURLToPath(new URL("./chibi-plugins", import.meta.url));
        if (fs.existsSync(srcDir)) {
          for (const file of fs.readdirSync(srcDir)) {
            const srcPath = path.join(srcDir, file);
            if (fs.statSync(srcPath).isFile()) {
              fs.copyFileSync(srcPath, path.join(pluginsDir, file));
              fs.chmodSync(path.join(pluginsDir, file), 0o755);
            }
          }
        }
      },
    });

    // Build extra env vars for plugin scripts
    if (config.cwd) {
      // Resolve plugins.json path relative to navigator directory
      const pluginsPath = path.join(config.cwd, ".claude", "plugins.json");
      if (fs.existsSync(pluginsPath)) {
        this.extraEnv.AUTONAV_PLUGINS_PATH = pluginsPath;
      }
    }
    // Cycle detection depth for cross-nav queries
    const currentDepth = process.env.AUTONAV_QUERY_DEPTH || "0";
    this.extraEnv.AUTONAV_QUERY_DEPTH = currentDepth;

    // Build sandbox config from AgentConfig.sandbox + defaults
    if (config.sandbox) {
      this.sandboxConfig = { ...config.sandbox };
      // Chibi makes its own API calls — never block network
      this.sandboxConfig.blockNetwork = false;

      // Merge paths: navigator dir (at least read), ephemeral home (always write)
      const writeSet = new Set(this.sandboxConfig.writePaths || []);
      if (this.ephemeralHome) writeSet.add(this.ephemeralHome.homePath);
      this.sandboxConfig.writePaths = [...writeSet];

      // Only add cwd to readPaths if it's not already in writePaths (write implies read)
      const readSet = new Set(this.sandboxConfig.readPaths || []);
      if (config.cwd && !writeSet.has(config.cwd)) readSet.add(config.cwd);
      this.sandboxConfig.readPaths = [...readSet];

      // Debug: log sandbox status
      if (process.env.AUTONAV_DEBUG === "1" && config.stderr) {
        const active = isSandboxEnabled(this.sandboxConfig);
        config.stderr(
          `[chibi] Sandbox: ${active ? "enabled (nono)" : "disabled"}\n`,
        );
        if (active) {
          const { command, args } = wrapCommand("chibi-json", [], this.sandboxConfig);
          config.stderr(`[chibi] Sandbox cmd: ${command} ${args.join(" ")}\n`);
        }
      }
    }

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

    // Set system prompt (separate synchronous invocation).
    // Also registers the inactivity TTL on the context entry so chibi GC
    // auto-destroys it after CONTEXT_TTL_SECONDS of disuse.
    if (config.systemPrompt) {
      const input = buildInput(
        { set_system_prompt: { prompt: config.systemPrompt } },
        this.contextName,
        config.cwd,
        this.ephemeralHome.homePath,
        CONTEXT_TTL_SECONDS,
        config.model,
      );
      try {
        runSync(input, { env: this.extraEnv, sandboxConfig: this.sandboxConfig });
      } catch (error) {
        // Log but don't fail — system prompt is best-effort
        const msg = error instanceof Error ? error.message : String(error);
        if (config.stderr) {
          config.stderr(`[chibi] Failed to set system prompt: ${msg}`);
        }
      }
    }

    // Start the prompt invocation
    this.child = this.spawnPrompt(initialPrompt);
  }

  /**
   * Spawn a chibi-json process for a send_prompt command.
   * Returns the child process whose stdout streams JSONL events.
   */
  private spawnPrompt(prompt: string): ChildProcess {
    const inputJson = buildInput(
      { send_prompt: { prompt } },
      this.contextName,
      this.config.cwd,
      this.ephemeralHome?.homePath,
      undefined,
      this.config.model,
    );

    const { command, args } = wrapCommand("chibi-json", [], this.sandboxConfig);
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.extraEnv },
    });

    // Write the single JSON input and close stdin
    child.stdin?.write(inputJson);
    child.stdin?.end();

    // Handle stderr — always capture sandbox denials, forward rest to debug handler
    if (child.stderr) {
      const stderrHandler = this.config.stderr;
      const sandboxActive = isSandboxEnabled(this.sandboxConfig);
      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        if (stderrHandler) {
          stderrHandler(text);
        }
        // Surface sandbox denials as events even outside debug mode
        if (sandboxActive && text.includes("nono:")) {
          this.sandboxDenials.push(text.trim());
        }
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
    let lastText = "";
    let hadError = false;

    for await (const line of rl) {
      if (!line.trim()) continue;

      const events = parseChibiLine(line);
      for (const event of events) {
        if (event.type === "error") {
          hadError = true;
        }
        if (event.type === "text") {
          lastText = event.text;
        }

        // Intercept tool_use events for registered tools
        // Note: chibi handles its own tool calls natively, but autonav-registered
        // tools (submit_answer, self-config) need local interception.
        // This won't work with stateless chibi-json — tool interception requires
        // a long-running process. For now, yield the event and let the caller handle it.
        yield event;
      }
    }

    // Surface sandbox denials so callers see what nono blocked
    // These are informational — the process exit code determines success/failure
    for (const denial of this.sandboxDenials) {
      yield { type: "error", message: `[sandbox] ${denial}` };
    }
    this.sandboxDenials = [];

    // Emit a synthetic result event based on process exit
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
        success: exitCode === 0 && !hadError,
        text: lastText || (hadError ? "chibi-json returned an error" : ""),
      };
    }
  }

  send(prompt: string): AsyncIterable<AgentEvent> {
    if (this.closed) {
      throw new Error("Session is closed");
    }

    // New invocation, same context name = multi-turn continuity
    this.child = this.spawnPrompt(prompt);

    const session = this;
    return {
      [Symbol.asyncIterator]() {
        return session[Symbol.asyncIterator]();
      },
    };
  }

  updateConfig(config: Partial<AgentConfig>): void {
    Object.assign(this.config, config);
  }

  async close(): Promise<void> {
    this.closed = true;

    if (this.child && this.child.exitCode === null) {
      this.child.kill("SIGTERM");
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

    // Context cleanup is handled by chibi's GC — destroy_after_seconds_inactive
    // was set at session start, so the context auto-destructs after 12h of inactivity.

    // Clean up ephemeral home directory
    this.ephemeralHome?.cleanup();
    this.ephemeralHome = null;
  }
}

/**
 * Chibi Harness
 *
 * Creates sessions that delegate to chibi-json subprocess invocations.
 * Each command is a separate process; context names provide multi-turn continuity.
 */
export class ChibiHarness implements Harness {
  readonly displayName = "chibi";

  run(config: AgentConfig, prompt: string): HarnessSession {
    return new ChibiSession(config, prompt);
  }

  createToolServer(name: string, tools: ToolDefinition[]): { server: unknown } {
    // Return a sentinel object that ChibiSession can detect and extract tools from.
    // Note: Tool interception doesn't work with stateless chibi-json invocations.
    // Tools registered here are yielded as events for the caller to handle.
    return {
      server: {
        [CHIBI_TOOL_MARKER]: true,
        name,
        tools,
      } satisfies ChibiToolServer,
    };
  }
}
