/**
 * Fake Harness for Testing
 *
 * A deterministic harness implementation that yields scripted AgentEvent
 * sequences without spawning any subprocess or making API calls.
 *
 * This is the "digital twin" of ClaudeCodeHarness — it honors the same
 * Harness interface contract so the entire pipeline (CLI → TUI → harness)
 * can be exercised in tests.
 *
 * Usage:
 *   const harness = new FakeHarness([
 *     { type: "text", text: "Hello!" },
 *     { type: "result", success: true, text: "Hello!" },
 *   ]);
 *   const session = harness.run(config, "Hi");
 *   for await (const event of session) { ... }
 */

import type { Harness, HarnessSession, AgentConfig, AgentEvent } from "./types.js";
import type { ToolDefinition } from "./tool-server.js";

/**
 * A script is an ordered sequence of AgentEvents to yield.
 * For multi-turn, provide an array of scripts (one per turn).
 */
export type FakeScript = AgentEvent[];

/**
 * Options for configuring the FakeHarness.
 */
export interface FakeHarnessOptions {
  /** Event scripts to yield — one per turn. First for initial prompt, rest for send(). */
  scripts: FakeScript[];
  /** Delay in ms between yielding events (default: 0). Simulates streaming. */
  eventDelayMs?: number;
  /** Callback invoked with each prompt received (for assertions). */
  onPrompt?: (prompt: string, turnIndex: number) => void;
  /** Callback invoked when run() is called (for config assertions). */
  onRun?: (config: AgentConfig, prompt: string) => void;
}

class FakeSession implements HarnessSession {
  private scripts: FakeScript[];
  private turnIndex = 0;
  private eventDelayMs: number;
  private onPrompt?: (prompt: string, turnIndex: number) => void;
  private closed = false;

  /** All prompts received (initial + follow-ups), for test assertions. */
  readonly prompts: string[] = [];

  constructor(
    scripts: FakeScript[],
    initialPrompt: string,
    eventDelayMs: number,
    onPrompt?: (prompt: string, turnIndex: number) => void,
  ) {
    this.scripts = scripts;
    this.eventDelayMs = eventDelayMs;
    this.onPrompt = onPrompt;
    this.prompts.push(initialPrompt);
    this.onPrompt?.(initialPrompt, 0);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    const script = this.scripts[this.turnIndex] ?? [];
    this.turnIndex++;

    for (const event of script) {
      if (this.eventDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.eventDelayMs));
      }
      yield event;
    }
  }

  send(prompt: string): AsyncIterable<AgentEvent> {
    if (this.closed) throw new Error("FakeSession is closed");

    this.prompts.push(prompt);
    this.onPrompt?.(prompt, this.turnIndex);

    const session = this;
    return {
      async *[Symbol.asyncIterator]() {
        const script = session.scripts[session.turnIndex] ?? [];
        session.turnIndex++;

        for (const event of script) {
          if (session.eventDelayMs > 0) {
            await new Promise((r) => setTimeout(r, session.eventDelayMs));
          }
          yield event;
        }
      },
    };
  }

  updateConfig(_config: Partial<AgentConfig>): void {
    // No-op in fake
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/**
 * A deterministic harness for testing.
 *
 * Yields scripted AgentEvent sequences without subprocess/API calls.
 * Exercises the full pipeline around the LLM boundary.
 */
export class FakeHarness implements Harness {
  readonly displayName = "Fake";

  private options: FakeHarnessOptions;

  /** The most recently created session, for test assertions. */
  lastSession: FakeSession | null = null;

  /** All configs passed to run(), for test assertions. */
  readonly runCalls: Array<{ config: AgentConfig; prompt: string }> = [];

  constructor(options: FakeHarnessOptions);
  /** Shorthand: single-turn script */
  constructor(script: FakeScript);
  constructor(arg: FakeHarnessOptions | FakeScript) {
    if (Array.isArray(arg)) {
      this.options = { scripts: [arg] };
    } else {
      this.options = arg;
    }
  }

  run(config: AgentConfig, prompt: string): HarnessSession {
    this.runCalls.push({ config, prompt });
    this.options.onRun?.(config, prompt);

    const session = new FakeSession(
      this.options.scripts,
      prompt,
      this.options.eventDelayMs ?? 0,
      this.options.onPrompt,
    );
    this.lastSession = session;
    return session;
  }

  createToolServer(name: string, tools: ToolDefinition[]): { server: unknown } {
    // Return a sentinel object — the FakeHarness doesn't need real MCP servers.
    // Tests that need to exercise tool handlers can call them directly.
    return { server: { _fake: true, name, toolNames: tools.map((t) => t.name) } };
  }
}

// ── Convenience builders ──────────────────────────────────────────────────

/** Build a simple text response script. */
export function fakeTextResponse(text: string): FakeScript {
  return [
    { type: "text", text },
    {
      type: "result",
      success: true,
      text,
      usage: { inputTokens: 100, outputTokens: 50 },
      costUsd: 0.001,
      durationMs: 500,
      numTurns: 1,
    },
  ];
}

/** Build a script with tool use → result → text. */
export function fakeToolResponse(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: string,
  finalText: string,
): FakeScript {
  return [
    { type: "tool_use", name: toolName, id: "fake-tool-1", input: toolInput },
    { type: "tool_result", toolUseId: "fake-tool-1", content: toolResult },
    { type: "text", text: finalText },
    {
      type: "result",
      success: true,
      text: finalText,
      usage: { inputTokens: 200, outputTokens: 100 },
      costUsd: 0.002,
      durationMs: 1000,
      numTurns: 1,
    },
  ];
}

/** Build an error response script. */
export function fakeErrorResponse(message: string): FakeScript {
  return [
    { type: "error", message, retryable: false },
    {
      type: "result",
      success: false,
      text: message,
      usage: { inputTokens: 50, outputTokens: 0 },
      costUsd: 0.0005,
      durationMs: 200,
      numTurns: 0,
    },
  ];
}
