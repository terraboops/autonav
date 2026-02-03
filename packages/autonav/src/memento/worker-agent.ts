/**
 * Worker Agent for Memento Loop
 *
 * Executes implementation plans using the Claude Agent SDK.
 */

import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ImplementationPlan, WorkerResult } from "./types.js";
import { buildWorkerPrompt, buildWorkerSystemPrompt } from "./prompts.js";

/**
 * Minimal context for worker (no persisted state)
 */
interface WorkerContext {
  codeDirectory: string;
  task: string;
}

/**
 * Options for worker agent execution
 */
export interface WorkerAgentOptions {
  /** Show detailed logging */
  verbose?: boolean;

  /** Model to use (defaults to claude-sonnet-4-5) */
  model?: string;

  /** Maximum turns for worker agent */
  maxTurns?: number;
}

/**
 * Run the worker agent to implement a plan
 */
export async function runWorkerAgent(
  context: WorkerContext,
  plan: ImplementationPlan,
  options: WorkerAgentOptions = {}
): Promise<WorkerResult> {
  const startTime = Date.now();
  const {
    verbose = false,
    model = "claude-sonnet-4-5",
    maxTurns = 50,
  } = options;

  const prompt = buildWorkerPrompt(context.codeDirectory, plan);
  const systemPrompt = buildWorkerSystemPrompt(context.codeDirectory);

  if (verbose) {
    console.log("\n[Worker] Starting implementation...");
    console.log(`[Worker] Plan: ${plan.summary}`);
    console.log(`[Worker] Steps: ${plan.steps.length}`);
  }

  const filesModified: string[] = [];
  let lastAssistantText = "";
  let resultMessage: SDKResultMessage | undefined;

  try {
    const queryIterator = query({
      prompt,
      options: {
        model,
        maxTurns,
        systemPrompt,
        cwd: context.codeDirectory,
        permissionMode: "bypassPermissions",
      },
    });

    for await (const message of queryIterator) {
      if (message.type === "assistant") {
        const content = message.message.content;
        for (const block of content) {
          if (block.type === "tool_use") {
            // Track file operations
            if (verbose) {
              console.log(`[Worker] Tool: ${block.name}`);
            }

            // Extract file paths from common tools
            if (
              block.name === "Write" ||
              block.name === "Edit" ||
              block.name === "str_replace_based_edit_tool"
            ) {
              const input = block.input as Record<string, unknown>;
              const filePath = input.file_path || input.path;
              if (typeof filePath === "string" && !filesModified.includes(filePath)) {
                filesModified.push(filePath);
              }
            }
          } else if (block.type === "text") {
            lastAssistantText = block.text;
          }
        }
      }

      if (message.type === "result") {
        resultMessage = message;
      }
    }

    const durationMs = Date.now() - startTime;

    if (!resultMessage) {
      return {
        success: false,
        summary: "No result message received from worker agent",
        filesModified,
        errors: ["No result message received"],
        durationMs,
      };
    }

    if (resultMessage.subtype !== "success") {
      const errorDetails =
        "errors" in resultMessage
          ? resultMessage.errors.join(", ")
          : "Unknown error";

      return {
        success: false,
        summary: `Worker failed: ${resultMessage.subtype}`,
        filesModified,
        errors: [errorDetails],
        durationMs,
      };
    }

    if (verbose) {
      console.log(`[Worker] Completed in ${durationMs}ms`);
      console.log(`[Worker] Files modified: ${filesModified.length}`);
    }

    return {
      success: true,
      summary: resultMessage.result || lastAssistantText || "Implementation completed",
      filesModified,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      summary: `Worker error: ${errorMessage}`,
      filesModified,
      errors: [errorMessage],
      durationMs,
    };
  }
}
