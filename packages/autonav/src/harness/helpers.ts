/**
 * Harness Helpers
 *
 * Utility functions for consuming AgentEvent streams.
 * These are the most common patterns across all harness consumers.
 */

import type { AgentEvent } from "./types.js";

/**
 * Collect all text from an agent event stream into a single string.
 *
 * Useful for simple queries where you just need the final answer text.
 */
export async function collectText(events: AsyncIterable<AgentEvent>): Promise<string> {
  let text = "";
  for await (const event of events) {
    if (event.type === "text") {
      text = event.text; // Use last text (not concatenate — each text event is a full block)
    } else if (event.type === "result" && event.text && !text) {
      text = event.text;
    }
  }
  return text;
}

/**
 * Result from collecting a complete agent run.
 */
export interface CollectedResult {
  /** Whether the run succeeded */
  success: boolean;

  /** Final text output */
  text: string;

  /** Token usage */
  usage?: { inputTokens: number; outputTokens: number };

  /** Cost in USD */
  costUsd?: number;

  /** Duration in ms */
  durationMs?: number;

  /** All text events (in order) */
  textEvents: string[];

  /** All tool use events */
  toolUseEvents: Array<{ name: string; id: string; input: Record<string, unknown> }>;

  /** All tool result events */
  toolResultEvents: Array<{ toolUseId: string; content: string; isError?: boolean }>;

  /** All error events */
  errorEvents: Array<{ message: string; retryable?: boolean }>;
}

/**
 * Collect the full result from an agent event stream.
 *
 * Accumulates all events into a structured result. Useful when you need
 * to inspect tool usage, track errors, or access usage metrics.
 */
export async function collectResult(events: AsyncIterable<AgentEvent>): Promise<CollectedResult> {
  const result: CollectedResult = {
    success: false,
    text: "",
    textEvents: [],
    toolUseEvents: [],
    toolResultEvents: [],
    errorEvents: [],
  };

  for await (const event of events) {
    switch (event.type) {
      case "text":
        result.textEvents.push(event.text);
        result.text = event.text; // Last text block
        break;
      case "tool_use":
        result.toolUseEvents.push({
          name: event.name,
          id: event.id,
          input: event.input,
        });
        break;
      case "tool_result":
        result.toolResultEvents.push({
          toolUseId: event.toolUseId,
          content: event.content,
          isError: event.isError,
        });
        break;
      case "error":
        result.errorEvents.push({
          message: event.message,
          retryable: event.retryable,
        });
        break;
      case "result":
        result.success = event.success;
        if (event.text && !result.text) {
          result.text = event.text;
        }
        result.usage = event.usage;
        result.costUsd = event.costUsd;
        result.durationMs = event.durationMs;
        break;
    }
  }

  return result;
}
