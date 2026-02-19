/**
 * OpenCode Harness
 *
 * Adapts OpenCode (https://opencode.ai/) into the universal Harness interface
 * via its TypeScript SDK (@opencode-ai/sdk).
 *
 * Architecture:
 *   - A shared opencode server process is started lazily on first run()
 *   - Each run() creates an SDK session + ephemeral project dir with custom tools
 *   - Events stream via SSE (event.subscribe) and translate to AgentEvent
 *   - Custom tools live in .opencode/tools/ as TypeScript files (loaded by OpenCode)
 *
 * The server persists across sessions within a single harness instance.
 * Calling close() on the harness kills the server process.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Harness,
  HarnessSession,
  AgentConfig,
  AgentEvent,
} from "./types.js";
import type { ToolDefinition } from "./tool-server.js";
// ephemeral-home is not used for OpenCode — we inject tools directly into
// the navigator directory because OpenCode requires a real git project context.

// Marker for tool server sentinel objects (same pattern as ChibiHarness)
const OPENCODE_TOOL_MARKER = "__opencode_tools__" as const;

interface OpenCodeToolServer {
  [OPENCODE_TOOL_MARKER]: true;
  name: string;
  tools: ToolDefinition[];
}

/**
 * Lazily-initialized shared server state.
 */
interface ServerState {
  url: string;
  close: () => void;
}

/**
 * Parse an autonav model string into OpenCode's { providerID, modelID } format.
 *
 * Supports:
 *   - "provider/model" → { providerID: "provider", modelID: "model" }
 *   - "model" → undefined (let OpenCode use its default)
 */
function parseModel(
  model?: string,
): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined;
  const slashIdx = model.indexOf("/");
  if (slashIdx > 0) {
    return {
      providerID: model.slice(0, slashIdx),
      modelID: model.slice(slashIdx + 1),
    };
  }
  // No provider prefix — can't construct the required format, skip
  return undefined;
}

/**
 * OpenCode harness session.
 *
 * Uses promptAsync + event.subscribe for streaming. Each prompt fires
 * asynchronously and events are consumed from the SSE stream filtered
 * by session ID.
 */
class OpenCodeSession implements HarnessSession {
  private config: AgentConfig;
  private sessionId: string;
  private client: any; // OpencodeClient (imported dynamically)
  private cleanupFn: (() => void) | null;
  private closed = false;
  private directory: string;
  private abortController: AbortController;
  private currentIterator: AsyncGenerator<AgentEvent> | null = null;

  constructor(
    config: AgentConfig,
    sessionId: string,
    client: any,
    cleanupFn: (() => void) | null,
    directory: string,
  ) {
    this.config = { ...config };
    this.sessionId = sessionId;
    this.client = client;
    this.cleanupFn = cleanupFn;
    this.directory = directory;
    this.abortController = new AbortController();
  }

  /**
   * Send the initial or follow-up prompt and stream events.
   */
  private async *streamPrompt(prompt: string): AsyncGenerator<AgentEvent> {
    // Build prompt body
    const body: Record<string, unknown> = {
      parts: [{ type: "text", text: prompt }],
    };

    if (this.config.systemPrompt) {
      body.system = this.config.systemPrompt;
    }

    const model = parseModel(this.config.model);
    if (model) {
      body.model = model;
    }

    // Subscribe to events BEFORE sending the prompt
    const { stream } = await this.client.event.subscribe({
      query: { directory: this.directory },
    });

    // Fire the prompt asynchronously (returns immediately)
    await this.client.session.promptAsync({
      path: { id: this.sessionId },
      body,
      query: { directory: this.directory },
    });

    // Consume SSE events, filter by session ID, translate to AgentEvent
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    try {
      for await (const event of stream) {
        if (this.closed || this.abortController.signal.aborted) break;

        const evt = event as Record<string, unknown>;
        const eventType = evt.type as string;
        const props = evt.properties as Record<string, unknown> | undefined;

        if (!props) continue;

        // Filter by session ID where available
        const eventSessionId =
          (props.sessionID as string) ??
          ((props.part as Record<string, unknown>)?.sessionID as string);
        if (eventSessionId && eventSessionId !== this.sessionId) continue;

        switch (eventType) {
          case "message.part.updated": {
            const part = props.part as Record<string, unknown>;
            if (!part) break;

            const partType = part.type as string;

            if (partType === "text") {
              // Only emit completed text parts (time.end is set)
              const time = part.time as
                | { start?: number; end?: number }
                | undefined;
              const text = part.text as string;
              if (text && time?.end) {
                yield { type: "text", text };
              }
            } else if (partType === "tool") {
              const state = part.state as Record<string, unknown>;
              const status = state?.status as string;
              const toolName = part.tool as string;
              const callID = part.callID as string;

              if (status === "completed") {
                const input = (state.input as Record<string, unknown>) || {};
                yield {
                  type: "tool_use",
                  name: toolName,
                  id: callID || "",
                  input,
                };
                // Also emit the tool result
                const output = state.output as string;
                if (output !== undefined) {
                  yield {
                    type: "tool_result",
                    toolUseId: callID || "",
                    content: output,
                    isError: false,
                  };
                }
              } else if (status === "error") {
                const input = (state.input as Record<string, unknown>) || {};
                yield {
                  type: "tool_use",
                  name: toolName,
                  id: callID || "",
                  input,
                };
                const error = state.error as string;
                yield {
                  type: "tool_result",
                  toolUseId: callID || "",
                  content: error || "Tool error",
                  isError: true,
                };
              }
            } else if (partType === "step-finish") {
              const tokens = part.tokens as {
                input?: number;
                output?: number;
              };
              const cost = part.cost as number;
              if (tokens) {
                totalInputTokens += tokens.input || 0;
                totalOutputTokens += tokens.output || 0;
              }
              if (cost) {
                totalCost += cost;
              }
            }
            break;
          }

          case "session.error": {
            const error = props.error as Record<string, unknown> | undefined;
            const errorMsg =
              (error?.data as Record<string, unknown>)?.message ??
              error?.name ??
              "Unknown OpenCode error";
            yield {
              type: "error",
              message: String(errorMsg),
              retryable:
                (error?.data as Record<string, unknown>)?.isRetryable === true,
            };
            break;
          }

          case "session.idle": {
            // Session finished processing — emit result and break
            yield {
              type: "result",
              success: true,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
              },
              costUsd: totalCost || undefined,
              sessionId: this.sessionId,
            };
            return;
          }

          case "session.status": {
            const status = props.status as Record<string, unknown>;
            if (status?.type === "idle") {
              yield {
                type: "result",
                success: true,
                usage: {
                  inputTokens: totalInputTokens,
                  outputTokens: totalOutputTokens,
                },
                costUsd: totalCost || undefined,
                sessionId: this.sessionId,
              };
              return;
            }
            break;
          }

          case "permission.updated": {
            // Auto-approve all permissions for autonav sessions
            const permId = props.id as string;
            const permSessionId = props.sessionID as string;
            if (permId && permSessionId === this.sessionId) {
              try {
                await this.client.postSessionIdPermissionsPermissionId({
                  path: { id: this.sessionId, permissionID: permId },
                  body: { response: "always" },
                  query: { directory: this.directory },
                });
              } catch {
                // Best-effort permission approval
              }
            }
            break;
          }
        }
      }
    } catch (err) {
      // SSE stream error — if not deliberately closed, emit error
      if (!this.closed) {
        const msg = err instanceof Error ? err.message : String(err);
        yield { type: "error", message: `SSE stream error: ${msg}` };
      }
    }

    // If we get here without yielding a result, emit a synthetic one
    yield {
      type: "result",
      success: !this.closed,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
      costUsd: totalCost || undefined,
      sessionId: this.sessionId,
    };
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    // The first iteration is started by the constructor's initial prompt
    // which is kicked off in run(). The iterator is set up there.
    if (this.currentIterator) {
      yield* this.currentIterator;
      this.currentIterator = null;
    }
  }

  /**
   * Start streaming for the initial prompt.
   */
  startInitialPrompt(prompt: string): void {
    this.currentIterator = this.streamPrompt(prompt);
  }

  send(prompt: string): AsyncIterable<AgentEvent> {
    if (this.closed) {
      throw new Error("Session is closed");
    }

    const gen = this.streamPrompt(prompt);
    return {
      [Symbol.asyncIterator]() {
        return gen;
      },
    };
  }

  updateConfig(config: Partial<AgentConfig>): void {
    Object.assign(this.config, config);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.abortController.abort();

    // Delete the session
    try {
      await this.client.session.delete({
        path: { id: this.sessionId },
        query: { directory: this.directory },
      });
    } catch {
      // Best-effort cleanup
    }

    // Clean up ephemeral home
    this.cleanupFn?.();
    this.cleanupFn = null;
  }
}

/**
 * OpenCode Harness
 *
 * Manages a shared opencode server and creates sessions that delegate
 * to the OpenCode SDK. Custom tools are injected via .opencode/tools/
 * in ephemeral project directories.
 */
export class OpenCodeHarness implements Harness {
  readonly displayName = "opencode";

  private server: ServerState | null = null;
  private client: any = null; // OpencodeClient
  private initPromise: Promise<void> | null = null;

  /**
   * Lazily start the shared opencode server.
   */
  private async ensureServer(config?: AgentConfig): Promise<void> {
    if (this.server && this.client) return;

    // Prevent concurrent initialization
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      const {
        createOpencodeServer,
        createOpencodeClient,
      } = await import("@opencode-ai/sdk");

      // Find a random available port
      const port = 10000 + Math.floor(Math.random() * 50000);

      const serverConfig: Record<string, unknown> = {};

      // Pass model config if available
      if (config?.model) {
        serverConfig.model = config.model;
      }

      // Set permissions based on sandbox config.
      // When sandbox is set with only readPaths (no writePaths), restrict to
      // read-only by denying edit and bash. Otherwise, allow all for headless operation.
      const isReadOnly = config?.sandbox &&
        config.sandbox.readPaths?.length &&
        !config.sandbox.writePaths?.length;

      serverConfig.permission = {
        edit: isReadOnly ? "deny" : "allow",
        bash: isReadOnly ? "deny" : "allow",
        webfetch: "allow",
        doom_loop: "allow",
        external_directory: "allow",
      };

      const stderr = config?.stderr;
      if (stderr) {
        stderr(`[opencode] Starting server on port ${port}...\n`);
      }

      this.server = await createOpencodeServer({
        port,
        config: serverConfig,
        timeout: 15_000,
      });

      this.client = createOpencodeClient({
        baseUrl: this.server.url,
      } as any);

      if (stderr) {
        stderr(`[opencode] Server ready at ${this.server.url}\n`);
      }
    })();

    await this.initPromise;
  }

  run(config: AgentConfig, prompt: string): HarnessSession {
    // Create the session synchronously (returns HarnessSession),
    // but actual setup is async inside the iterator.
    const harness = this;
    const lazySession = new LazyOpenCodeSession(harness, config, prompt);
    return lazySession;
  }

  /**
   * Internal: Create a fully-initialized OpenCodeSession.
   * Called from LazyOpenCodeSession on first iteration.
   */
  async createSession(
    config: AgentConfig,
    prompt: string,
  ): Promise<OpenCodeSession> {
    await this.ensureServer(config);

    // Use the navigator's actual directory as the OpenCode project directory.
    // OpenCode needs direct access to the project's files (knowledge base, etc.)
    // and requires a real git project context. We inject tools and config into
    // the navigator directory and track them for cleanup.
    const directory = config.cwd || process.cwd();
    const injectedPaths: string[] = [];

    // Inject .opencode/tools/ into the navigator directory
    const toolsDir = path.join(directory, ".opencode", "tools");
    fs.mkdirSync(toolsDir, { recursive: true });
    injectedPaths.push(path.join(directory, ".opencode"));

    const srcDir = fileURLToPath(
      new URL("./opencode-tools", import.meta.url),
    );
    if (fs.existsSync(srcDir)) {
      for (const file of fs.readdirSync(srcDir)) {
        const srcPath = path.join(srcDir, file);
        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, path.join(toolsDir, file));
        }
      }
    }

    // Write opencode.json project config with model settings
    const opencodeConfigPath = path.join(directory, "opencode.json");
    const hadExistingConfig = fs.existsSync(opencodeConfigPath);
    const opencodeConfig: Record<string, unknown> = {
      $schema: "https://opencode.ai/config.json",
    };
    if (config.model) {
      opencodeConfig.model = config.model;
    }
    fs.writeFileSync(opencodeConfigPath, JSON.stringify(opencodeConfig, null, 2));
    if (!hadExistingConfig) {
      injectedPaths.push(opencodeConfigPath);
    }

    // Create a cleanup function for injected files
    const cleanup = (): void => {
      for (const p of injectedPaths) {
        try {
          const stat = fs.statSync(p);
          if (stat.isDirectory()) {
            fs.rmSync(p, { recursive: true, force: true });
          } else {
            fs.unlinkSync(p);
          }
        } catch {
          // Best-effort cleanup
        }
      }
    };

    // Build extra env vars for tool scripts
    const extraEnv: Record<string, string> = {};
    if (config.cwd) {
      const pluginsPath = path.join(config.cwd, ".claude", "plugins.json");
      if (fs.existsSync(pluginsPath)) {
        extraEnv.AUTONAV_PLUGINS_PATH = pluginsPath;
      }
    }
    const currentDepth = process.env.AUTONAV_QUERY_DEPTH || "0";
    extraEnv.AUTONAV_QUERY_DEPTH = currentDepth;

    // Create an OpenCode session via SDK
    const result = await this.client.session.create({
      body: { title: "autonav" },
      query: { directory },
    });

    const sessionId = result.data?.id;
    if (!sessionId) {
      cleanup();
      throw new Error("Failed to create OpenCode session: no session ID returned");
    }

    if (config.stderr) {
      config.stderr(`[opencode] Session ${sessionId} created\n`);
    }

    const session = new OpenCodeSession(
      config,
      sessionId,
      this.client,
      cleanup,
      directory,
    );

    // Start streaming the initial prompt
    session.startInitialPrompt(prompt);

    return session;
  }

  createToolServer(name: string, tools: ToolDefinition[]): { server: unknown } {
    // Return a sentinel object that OpenCodeSession can detect.
    // Tools are file-based in OpenCode — the tool definitions here are for
    // reference only. Actual tools are in .opencode/tools/ TypeScript files.
    return {
      server: {
        [OPENCODE_TOOL_MARKER]: true,
        name,
        tools,
      } satisfies OpenCodeToolServer,
    };
  }

  /**
   * Stop the shared server and clean up all resources.
   */
  async close(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.client = null;
    this.initPromise = null;
  }
}

/**
 * Lazy wrapper that defers async initialization until first iteration.
 *
 * Harness.run() must return synchronously, but OpenCode session creation
 * is async (server init, SDK session.create). This wrapper bridges the gap.
 */
class LazyOpenCodeSession implements HarnessSession {
  private harness: OpenCodeHarness;
  private config: AgentConfig;
  private initialPrompt: string;
  private realSession: OpenCodeSession | null = null;
  private initPromise: Promise<OpenCodeSession> | null = null;

  constructor(
    harness: OpenCodeHarness,
    config: AgentConfig,
    prompt: string,
  ) {
    this.harness = harness;
    this.config = config;
    this.initialPrompt = prompt;
  }

  private async getSession(): Promise<OpenCodeSession> {
    if (this.realSession) return this.realSession;

    if (!this.initPromise) {
      this.initPromise = this.harness.createSession(
        this.config,
        this.initialPrompt,
      );
    }

    this.realSession = await this.initPromise;
    return this.realSession;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    const session = await this.getSession();
    yield* session;
  }

  send(prompt: string): AsyncIterable<AgentEvent> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        const session = await self.getSession();
        yield* session.send(prompt);
      },
    };
  }

  updateConfig(config: Partial<AgentConfig>): void {
    if (this.realSession) {
      this.realSession.updateConfig(config);
    } else {
      Object.assign(this.config, config);
    }
  }

  async close(): Promise<void> {
    if (this.realSession) {
      await this.realSession.close();
    }
  }
}
