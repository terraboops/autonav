/**
 * Implementer Agent for Memento Loop
 *
 * Executes implementation plans using the harness interface.
 */

import type { Harness, AgentEvent } from "../harness/index.js";
import type { ImplementationPlan, ImplementerResult } from "./types.js";
import { buildImplementerPrompt, buildImplementerSystemPrompt } from "./prompts.js";

/**
 * Minimal context for implementer (no persisted state)
 */
interface ImplementerContext {
  codeDirectory: string;
  task: string;
}

/**
 * Options for implementer agent execution
 */
export interface ImplementerAgentOptions {
  /** Show detailed logging */
  verbose?: boolean;

  /** Model to use (defaults to claude-sonnet-4-5) */
  model?: string;

  /** Maximum turns for implementer agent */
  maxTurns?: number;
}

/**
 * Run the implementer agent to implement a plan
 */
export async function runImplementerAgent(
  context: ImplementerContext,
  plan: ImplementationPlan,
  harness: Harness,
  options: ImplementerAgentOptions = {}
): Promise<ImplementerResult> {
  const startTime = Date.now();
  const {
    verbose = false,
    model = "claude-sonnet-4-5",
    maxTurns = 50,
  } = options;

  const prompt = buildImplementerPrompt(context.codeDirectory, plan);
  const systemPrompt = buildImplementerSystemPrompt(context.codeDirectory);

  if (verbose) {
    console.log("\n[Implementer] Starting implementation...");
    console.log(`[Implementer] Plan: ${plan.summary}`);
    console.log(`[Implementer] Steps: ${plan.steps.length}`);
  }

  const filesModified: string[] = [];
  let lastAssistantText = "";
  let resultEvent: (AgentEvent & { type: "result" }) | undefined;

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

    for await (const event of session) {
      if (event.type === "tool_use") {
        if (verbose) {
          console.log(`[Implementer] Tool: ${event.name}`);
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
        resultEvent = event;
      }
    }

    const durationMs = Date.now() - startTime;

    if (!resultEvent) {
      return {
        success: false,
        summary: "No result message received from implementer agent",
        filesModified,
        errors: ["No result message received"],
        durationMs,
      };
    }

    if (!resultEvent.success) {
      return {
        success: false,
        summary: `Implementer failed`,
        filesModified,
        errors: [resultEvent.text || "Unknown error"],
        durationMs,
      };
    }

    if (verbose) {
      console.log(`[Implementer] Completed in ${durationMs}ms`);
      console.log(`[Implementer] Files modified: ${filesModified.length}`);
    }

    return {
      success: true,
      summary: resultEvent.text || lastAssistantText || "Implementation completed",
      filesModified,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      summary: `Implementer error: ${errorMessage}`,
      filesModified,
      errors: [errorMessage],
      durationMs,
    };
  }
}
