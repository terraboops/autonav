/**
 * Tests for FakeHarness — the deterministic test double for agent runtimes.
 *
 * These tests verify that FakeHarness correctly implements the Harness
 * contract, enabling reliable E2E testing of the full autonav pipeline
 * without subprocess spawning or API calls.
 */

import { describe, it, expect, vi } from "vitest";
import {
  FakeHarness,
  fakeTextResponse,
  fakeToolResponse,
  fakeErrorResponse,
  type FakeScript,
} from "../../src/harness/fake-harness.js";
import { collectText, collectResult } from "../../src/harness/helpers.js";

describe("FakeHarness", () => {
  describe("single-turn", () => {
    it("yields a scripted text response", async () => {
      const harness = new FakeHarness(fakeTextResponse("Hello, world!"));
      const session = harness.run({ model: "test" }, "Hi there");

      const events: import("../../src/harness/types.js").AgentEvent[] = [];
      for await (const event of session) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "text", text: "Hello, world!" });
      expect(events[1]).toMatchObject({ type: "result", success: true });
    });

    it("yields tool use events", async () => {
      const harness = new FakeHarness(
        fakeToolResponse("Read", { file_path: "/tmp/test.txt" }, "file contents", "I read the file.")
      );
      const session = harness.run({ model: "test" }, "Read that file");

      const events: import("../../src/harness/types.js").AgentEvent[] = [];
      for await (const event of session) {
        events.push(event);
      }

      expect(events).toHaveLength(4);
      expect(events[0]).toMatchObject({ type: "tool_use", name: "Read" });
      expect(events[1]).toMatchObject({ type: "tool_result", content: "file contents" });
      expect(events[2]).toMatchObject({ type: "text", text: "I read the file." });
      expect(events[3]).toMatchObject({ type: "result", success: true });
    });

    it("yields error responses", async () => {
      const harness = new FakeHarness(fakeErrorResponse("Rate limit exceeded"));
      const session = harness.run({ model: "test" }, "Hi");

      const events: import("../../src/harness/types.js").AgentEvent[] = [];
      for await (const event of session) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ type: "error", message: "Rate limit exceeded" });
      expect(events[1]).toMatchObject({ type: "result", success: false });
    });
  });

  describe("multi-turn", () => {
    it("yields different scripts for each turn", async () => {
      const harness = new FakeHarness({
        scripts: [
          fakeTextResponse("First response"),
          fakeTextResponse("Second response"),
        ],
      });

      const session = harness.run({ model: "test" }, "Turn 1");

      // First turn
      const turn1: import("../../src/harness/types.js").AgentEvent[] = [];
      for await (const event of session) {
        turn1.push(event);
      }
      expect(turn1[0]).toMatchObject({ type: "text", text: "First response" });

      // Second turn
      const turn2: import("../../src/harness/types.js").AgentEvent[] = [];
      for await (const event of session.send("Turn 2")) {
        turn2.push(event);
      }
      expect(turn2[0]).toMatchObject({ type: "text", text: "Second response" });
    });

    it("yields empty events when scripts are exhausted", async () => {
      const harness = new FakeHarness({
        scripts: [fakeTextResponse("Only response")],
      });

      const session = harness.run({ model: "test" }, "Turn 1");
      for await (const _ of session) { /* consume */ }

      // Second turn — no more scripts
      const turn2: import("../../src/harness/types.js").AgentEvent[] = [];
      for await (const event of session.send("Turn 2")) {
        turn2.push(event);
      }
      expect(turn2).toHaveLength(0);
    });
  });

  describe("test instrumentation", () => {
    it("records all prompts received", async () => {
      const harness = new FakeHarness({
        scripts: [fakeTextResponse("A"), fakeTextResponse("B")],
      });

      const session = harness.run({ model: "test" }, "first");
      for await (const _ of session) { /* consume */ }
      for await (const _ of session.send("second")) { /* consume */ }

      expect(harness.lastSession!.prompts).toEqual(["first", "second"]);
    });

    it("records run() calls with config", async () => {
      const harness = new FakeHarness(fakeTextResponse("ok"));

      harness.run({ model: "test-model", cwd: "/tmp" }, "hello");

      expect(harness.runCalls).toHaveLength(1);
      expect(harness.runCalls[0].config.model).toBe("test-model");
      expect(harness.runCalls[0].prompt).toBe("hello");
    });

    it("calls onPrompt callback for each prompt", async () => {
      const onPrompt = vi.fn();
      const harness = new FakeHarness({
        scripts: [fakeTextResponse("A"), fakeTextResponse("B")],
        onPrompt,
      });

      const session = harness.run({ model: "test" }, "first");
      for await (const _ of session) { /* consume */ }
      for await (const _ of session.send("second")) { /* consume */ }

      expect(onPrompt).toHaveBeenCalledTimes(2);
      expect(onPrompt).toHaveBeenCalledWith("first", 0);
      expect(onPrompt).toHaveBeenCalledWith("second", 1);
    });

    it("calls onRun callback with config", async () => {
      const onRun = vi.fn();
      const harness = new FakeHarness({
        scripts: [fakeTextResponse("ok")],
        onRun,
      });

      harness.run({ model: "test", systemPrompt: "You are helpful" }, "hi");

      expect(onRun).toHaveBeenCalledWith(
        expect.objectContaining({ model: "test", systemPrompt: "You are helpful" }),
        "hi"
      );
    });
  });

  describe("createToolServer", () => {
    it("returns a sentinel server object", () => {
      const harness = new FakeHarness(fakeTextResponse("ok"));
      const { server } = harness.createToolServer("test-server", [
        {
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler: async () => ({ content: [{ type: "text" as const, text: "ok" }], isError: false }),
        },
      ]);

      expect(server).toMatchObject({
        _fake: true,
        name: "test-server",
        toolNames: ["test_tool"],
      });
    });
  });

  describe("helpers integration", () => {
    it("works with collectText helper", async () => {
      const harness = new FakeHarness(fakeTextResponse("Collected text"));
      const session = harness.run({ model: "test" }, "hi");
      const text = await collectText(session);
      expect(text).toBe("Collected text");
    });

    it("works with collectResult helper", async () => {
      const harness = new FakeHarness(fakeTextResponse("Result text"));
      const session = harness.run({ model: "test" }, "hi");
      const result = await collectResult(session);
      expect(result.text).toBe("Result text");
      expect(result.success).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty script", async () => {
      const harness = new FakeHarness([]);
      const session = harness.run({ model: "test" }, "hi");

      const events: import("../../src/harness/types.js").AgentEvent[] = [];
      for await (const event of session) {
        events.push(event);
      }
      expect(events).toHaveLength(0);
    });

    it("throws when sending to closed session", async () => {
      const harness = new FakeHarness({
        scripts: [fakeTextResponse("ok"), fakeTextResponse("ok")],
      });
      const session = harness.run({ model: "test" }, "hi");
      for await (const _ of session) { /* consume */ }
      await session.close();

      expect(() => session.send("more")).toThrow("FakeSession is closed");
    });

    it("supports event delay for streaming simulation", async () => {
      const harness = new FakeHarness({
        scripts: [fakeTextResponse("delayed")],
        eventDelayMs: 10,
      });

      const start = Date.now();
      const session = harness.run({ model: "test" }, "hi");
      for await (const _ of session) { /* consume */ }
      const elapsed = Date.now() - start;

      // 2 events × 10ms delay = ~20ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(15);
    });
  });
});
