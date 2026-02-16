/**
 * Cross-Navigator Query Tool
 *
 * MCP tool that enables agents to query other navigators on-demand.
 * Replaces fragile skill-based patterns (ask-<nav> skills that run
 * `autonav query` via bash) with a direct MCP tool call.
 *
 * Cycle detection: Tracks query depth via a closure counter.
 * Rejects queries beyond MAX_DEPTH (3) to prevent infinite loops.
 */

import { z } from "zod";
import { loadNavigator } from "../query-engine/navigator-loader.js";
import { type Harness, collectText, defineTool } from "../harness/index.js";

const MAX_QUERY_DEPTH = 3;

/**
 * Create an MCP server with the query_navigator tool.
 *
 * Each session gets its own server instance. The harness is used
 * to execute queries against target navigators.
 */
export function createCrossNavMcpServer(
  harness: Harness,
  currentDepth: number = 0
) {
  const queryNavigatorTool = defineTool(
    "query_navigator",
    `Ask another navigator a question. Use this when you need information from a different navigator's knowledge base.

The target navigator will receive your question, search its knowledge base, and return an answer. This is useful for cross-domain questions that fall outside your own expertise.

Specify the navigator by its directory path (relative or absolute).`,
    {
      navigator: z
        .string()
        .describe(
          "Path to the target navigator directory (relative to cwd or absolute)"
        ),
      question: z
        .string()
        .min(5)
        .describe("The question to ask the target navigator"),
    },
    async (args) => {
      // Cycle detection
      if (currentDepth >= MAX_QUERY_DEPTH) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Query depth limit reached (max ${MAX_QUERY_DEPTH}). Cannot query another navigator from this depth.`,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        // Load target navigator
        const nav = loadNavigator(args.navigator);

        // Run query via harness
        const session = harness.run(
          {
            model: "claude-haiku-4-5",
            maxTurns: 10,
            systemPrompt: nav.systemPrompt,
            cwd: nav.navigatorPath,
          },
          args.question
        );

        const responseText = await collectText(session);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                navigator: nav.config.name,
                response: responseText,
              }),
            },
          ],
          isError: false,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Failed to query navigator: ${errorMsg}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return harness.createToolServer("autonav-cross-nav", [queryNavigatorTool]);
}
