/**
 * Chibi Harness Tests
 *
 * Unit tests for the ChibiHarness and ChibiSession implementation.
 * Mocks child_process to verify chibi-json invocations without requiring
 * chibi to be installed.
 *
 * Key behaviours under test:
 *   - destroy_after_seconds_inactive is set on set_system_prompt invocation
 *   - destroy_context is NOT called on close()
 *   - Context name is randomised per session
 *   - buildInput correctly serialises flags
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ---- mock node:child_process ----

const mockExecFileSync = vi.fn();
const mockSpawn = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// ---- mock ephemeral-home ----

vi.mock("../../src/harness/ephemeral-home.js", () => ({
  createEphemeralHome: vi.fn(() => ({
    homePath: "/tmp/ephemeral-home",
    cleanup: vi.fn(),
  })),
}));

// ---- mock sandbox ----

vi.mock("../../src/harness/sandbox.js", () => ({
  wrapCommand: (_cmd: string, args: string[]) => ({ command: "chibi-json", args }),
  isSandboxEnabled: vi.fn(() => false),
}));

// ---- helpers ----

function makeChildProcess() {
  const child = new EventEmitter() as ReturnType<typeof mockSpawn>;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  (child as Record<string, unknown>).stdout = stdout;
  (child as Record<string, unknown>).stderr = stderr;
  (child as Record<string, unknown>).stdin = { write: vi.fn(), end: vi.fn() };
  (child as Record<string, unknown>).exitCode = null;
  (child as Record<string, unknown>).kill = vi.fn(() => {
    (child as Record<string, unknown>).exitCode = 0;
    child.emit("exit", 0);
  });
  return child;
}

// ---- tests ----

describe("ChibiHarness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReturnValue(makeChildProcess());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes destroy_after_seconds_inactive on set_system_prompt invocation", async () => {
    const { ChibiHarness } = await import("../../src/harness/chibi-harness.js");
    const harness = new ChibiHarness();

    harness.run(
      { systemPrompt: "You are a test navigator.", cwd: "/tmp/nav" },
      "hello",
    );

    expect(mockExecFileSync).toHaveBeenCalledOnce();
    const [, , opts] = mockExecFileSync.mock.calls[0];
    const input = JSON.parse(opts.input as string);

    expect(input.flags).toBeDefined();
    expect(input.flags.destroy_after_seconds_inactive).toBe(12 * 60 * 60);
  });

  it("does not pass destroy_after_seconds_inactive on send_prompt invocations", async () => {
    const { ChibiHarness } = await import("../../src/harness/chibi-harness.js");
    const harness = new ChibiHarness();

    harness.run(
      { systemPrompt: "You are a test navigator.", cwd: "/tmp/nav" },
      "hello",
    );

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [, , spawnOpts] = mockSpawn.mock.calls[0];
    // spawn receives no input arg — chibi-json reads from child.stdin
    // Verify via the stdin.write call instead
    const child = mockSpawn.mock.results[0].value;
    const stdinWrite = (child.stdin as { write: ReturnType<typeof vi.fn> }).write;
    expect(stdinWrite).toHaveBeenCalledOnce();
    const input = JSON.parse(stdinWrite.mock.calls[0][0] as string);

    expect(input.flags?.destroy_after_seconds_inactive).toBeUndefined();
    void spawnOpts; // suppress unused warning
  });

  it("does not call destroy_context on close()", async () => {
    const child = makeChildProcess();
    // Pre-set exitCode so close() doesn't wait for the exit event
    (child as Record<string, unknown>).exitCode = 0;
    mockSpawn.mockReturnValue(child);

    const { ChibiHarness } = await import("../../src/harness/chibi-harness.js");
    const harness = new ChibiHarness();
    const session = harness.run(
      { systemPrompt: "You are a test navigator.", cwd: "/tmp/nav" },
      "hello",
    );

    mockExecFileSync.mockClear();
    await session.close();

    // execFileSync is used for synchronous commands (set_system_prompt, destroy_context).
    // After clearing post-setup, no further calls should occur.
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("uses a unique context name per session", async () => {
    const { ChibiHarness } = await import("../../src/harness/chibi-harness.js");
    const harness = new ChibiHarness();

    mockSpawn.mockReturnValue(makeChildProcess());
    harness.run({ systemPrompt: "nav", cwd: "/tmp/nav" }, "q1");

    mockSpawn.mockReturnValue(makeChildProcess());
    harness.run({ systemPrompt: "nav", cwd: "/tmp/nav" }, "q2");

    const ctx1 = JSON.parse(mockExecFileSync.mock.calls[0][2].input as string).context as string;
    const ctx2 = JSON.parse(mockExecFileSync.mock.calls[1][2].input as string).context as string;

    expect(ctx1).toMatch(/^autonav-/);
    expect(ctx2).toMatch(/^autonav-/);
    expect(ctx1).not.toBe(ctx2);
  });
});
