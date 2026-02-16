/**
 * Harness Module
 *
 * Universal agent runtime adapter. Everything goes through the harness:
 * query, update, chat, memento, standup, and agent-to-agent communication.
 */

export type {
  Harness,
  HarnessSession,
  AgentConfig,
  AgentEvent,
  HarnessType,
  SandboxConfig,
} from "./types.js";

export { ClaudeCodeHarness } from "./claude-code-harness.js";

export {
  resolveHarnessType,
  createHarness,
  resolveAndCreateHarness,
} from "./factory.js";

export {
  collectText,
  collectResult,
  type CollectedResult,
} from "./helpers.js";

export {
  defineTool,
  type ToolDefinition,
  type ToolResult,
} from "./tool-server.js";

export {
  createEphemeralHome,
  type EphemeralHome,
  type EphemeralHomeOptions,
} from "./ephemeral-home.js";

export {
  isSandboxEnabled,
  wrapCommand,
} from "./sandbox.js";
