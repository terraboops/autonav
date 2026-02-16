/**
 * Worker Agent for Memento Loop
 *
 * Executes implementation plans via the harness adapter.
 */

import type { ImplementationPlan, WorkerResult } from "./types.js";
import { buildWorkerPrompt, buildWorkerSystemPrompt } from "./prompts.js";
import { type Harness, ClaudeCodeHarness } from "../harness/index.js";

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

  /** Harness to use (defaults to ClaudeCodeHarness) */
  harness?: Harness;
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
    harness = new ClaudeCodeHarness(),
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

  try {
    const session = harness.run(
      {
        model,
        maxTurns,
        systemPrompt,
        cwd: context.codeDirectory,
        permissionMode: "bypassPermissions",
      },
      prompt
    );

    let success = false;
    let resultText = "";
    let errorText = "";

    for await (const event of session) {
      if (event.type === "tool_use") {
        if (verbose) {
          console.log(`[Worker] Tool: ${event.name}`);
        }

        // Extract file paths from common tools
        if (
          event.name === "Write" ||
          event.name === "Edit" ||
          event.name === "str_replace_based_edit_tool"
        ) {
          const filePath = event.input.file_path || event.input.path;
          if (typeof filePath === "string" && !filesModified.includes(filePath)) {
            filesModified.push(filePath);
          }
        }
      } else if (event.type === "text") {
        lastAssistantText = event.text;
      } else if (event.type === "result") {
        success = event.success;
        resultText = event.text || "";
        if (!event.success) {
          errorText = event.text || "Unknown error";
        }
      }
    }

    const durationMs = Date.now() - startTime;

    if (!success) {
      return {
        success: false,
        summary: errorText || "Worker failed",
        filesModified,
        errors: [errorText || "Unknown error"],
        durationMs,
      };
    }

    if (verbose) {
      console.log(`[Worker] Completed in ${durationMs}ms`);
      console.log(`[Worker] Files modified: ${filesModified.length}`);
    }

    return {
      success: true,
      summary: resultText || lastAssistantText || "Implementation completed",
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
