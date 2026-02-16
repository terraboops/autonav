/**
 * Implementer Agent for Memento Loop
 *
 * Executes implementation plans using the Claude Agent SDK.
 */

import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
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
              console.log(`[Implementer] Tool: ${block.name}`);
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
        summary: "No result message received from implementer agent",
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
        summary: `Implementer failed: ${resultMessage.subtype}`,
        filesModified,
        errors: [errorDetails],
        durationMs,
      };
    }

    if (verbose) {
      console.log(`[Implementer] Completed in ${durationMs}ms`);
      console.log(`[Implementer] Files modified: ${filesModified.length}`);
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
      summary: `Implementer error: ${errorMessage}`,
      filesModified,
      errors: [errorMessage],
      durationMs,
    };
  }
}
