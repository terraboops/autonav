/**
 * Tool Server Abstraction
 *
 * Defines harness-agnostic tool types and a pure data constructor.
 * Each harness implementation adapts these definitions to its native
 * tool hosting mechanism (SDK MCP servers, chibi JSONL, etc.).
 *
 * Key design: `defineTool()` creates a plain data object with no SDK
 * dependency. The handler closure runs in-process regardless of harness,
 * so closure-based data capture (the "stop hook" pattern) works identically.
 */

import type { z } from "zod";

/**
 * Result returned by a tool handler.
 *
 * Matches the MCP tool result format used by Claude Agent SDK.
 */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

/**
 * A harness-agnostic tool definition.
 *
 * Pure data — no runtime dependency. Each harness converts these
 * into its native tool format via `createToolServer()`.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: any) => Promise<ToolResult>;
}

/**
 * Create a tool definition (pure data constructor).
 *
 * Drop-in replacement for SDK's `tool()` — same argument signature,
 * but returns a plain object instead of an SDK-specific tool.
 *
 * @param name - Tool name (e.g. "submit_answer")
 * @param description - Tool description shown to the agent
 * @param inputSchema - Zod shape defining the tool's input parameters
 * @param handler - Async function that processes tool calls
 * @returns A ToolDefinition object
 */
export function defineTool<T extends z.ZodRawShape>(
  name: string,
  description: string,
  inputSchema: T,
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<ToolResult>
): ToolDefinition {
  return { name, description, inputSchema, handler };
}
