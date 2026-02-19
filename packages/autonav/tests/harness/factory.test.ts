/**
 * Harness Factory Tests
 *
 * Covers:
 * - resolveHarnessType: explicit, env var, navigator config, default
 * - validateHarnessType: valid and invalid types including new "opencode"
 * - createHarness: all three harness types
 * - resolveAndCreateHarness: end-to-end resolution + creation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveHarnessType,
  createHarness,
  resolveAndCreateHarness,
  ClaudeCodeHarness,
} from "../../src/harness/index.js";

describe("Harness Factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env for each test
    process.env = { ...originalEnv };
    delete process.env.AUTONAV_HARNESS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("resolveHarnessType", () => {
    it("returns explicit type when provided", () => {
      expect(resolveHarnessType("chibi")).toBe("chibi");
    });

    it("returns explicit opencode type", () => {
      expect(resolveHarnessType("opencode")).toBe("opencode");
    });

    it("returns explicit claude-code type", () => {
      expect(resolveHarnessType("claude-code")).toBe("claude-code");
    });

    it("uses AUTONAV_HARNESS env var when no explicit type", () => {
      process.env.AUTONAV_HARNESS = "chibi";
      expect(resolveHarnessType()).toBe("chibi");
    });

    it("uses AUTONAV_HARNESS=opencode env var", () => {
      process.env.AUTONAV_HARNESS = "opencode";
      expect(resolveHarnessType()).toBe("opencode");
    });

    it("uses navigator config when no explicit type or env var", () => {
      expect(
        resolveHarnessType(undefined, { harness: { type: "chibi" } })
      ).toBe("chibi");
    });

    it("uses navigator config with opencode", () => {
      expect(
        resolveHarnessType(undefined, { harness: { type: "opencode" } })
      ).toBe("opencode");
    });

    it("defaults to claude-code when nothing specified", () => {
      expect(resolveHarnessType()).toBe("claude-code");
    });

    it("explicit type takes priority over env var", () => {
      process.env.AUTONAV_HARNESS = "chibi";
      expect(resolveHarnessType("opencode")).toBe("opencode");
    });

    it("env var takes priority over navigator config", () => {
      process.env.AUTONAV_HARNESS = "opencode";
      expect(
        resolveHarnessType(undefined, { harness: { type: "chibi" } })
      ).toBe("opencode");
    });

    it("throws on invalid harness type", () => {
      expect(() => resolveHarnessType("invalid")).toThrow(
        'Invalid harness type: "invalid"'
      );
    });

    it("throws on invalid env var", () => {
      process.env.AUTONAV_HARNESS = "nonsense";
      expect(() => resolveHarnessType()).toThrow(
        'Invalid harness type: "nonsense"'
      );
    });

    it("throws on invalid navigator config type", () => {
      expect(() =>
        resolveHarnessType(undefined, { harness: { type: "bad" } })
      ).toThrow('Invalid harness type: "bad"');
    });

    it("handles empty navigator config gracefully", () => {
      expect(resolveHarnessType(undefined, {})).toBe("claude-code");
    });

    it("handles navigator config with no harness key", () => {
      expect(resolveHarnessType(undefined, { harness: {} })).toBe(
        "claude-code"
      );
    });
  });

  describe("createHarness", () => {
    it("creates ClaudeCodeHarness for claude-code type", async () => {
      const harness = await createHarness("claude-code");
      expect(harness).toBeInstanceOf(ClaudeCodeHarness);
      expect(harness.displayName).toBe("Claude");
    });

    it("creates ChibiHarness for chibi type (dynamic import)", async () => {
      // This test verifies the dynamic import path works
      // ChibiHarness is loaded via dynamic import to avoid pulling deps
      const harness = await createHarness("chibi");
      expect(harness.displayName).toBe("chibi");
    });

    it("creates OpenCodeHarness for opencode type (dynamic import)", async () => {
      const harness = await createHarness("opencode");
      expect(harness.displayName).toBe("opencode");
    });
  });

  describe("resolveAndCreateHarness", () => {
    it("creates claude-code harness by default", async () => {
      const harness = await resolveAndCreateHarness();
      expect(harness).toBeInstanceOf(ClaudeCodeHarness);
    });

    it("creates harness from explicit type", async () => {
      const harness = await resolveAndCreateHarness("opencode");
      expect(harness.displayName).toBe("opencode");
    });

    it("creates harness from navigator config", async () => {
      const harness = await resolveAndCreateHarness(undefined, {
        harness: { type: "opencode" },
      });
      expect(harness.displayName).toBe("opencode");
    });

    it("throws on invalid type", async () => {
      await expect(resolveAndCreateHarness("bogus")).rejects.toThrow(
        "Invalid harness type"
      );
    });
  });
});
