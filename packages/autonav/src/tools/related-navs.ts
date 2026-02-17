/**
 * Per-Navigator Query Tools
 *
 * Generates one ask_<name> tool per related navigator listed in config.json.
 * Each tool's handler runs in the autonav orchestrator process (outside any
 * sandbox), resolves the target navigator's path from the global registry
 * or env vars, spawns a new sandboxed session, and returns the response.
 */

import { z } from "zod";
import { loadNavigator } from "../query-engine/navigator-loader.js";
import { resolveNavigatorPath } from "../registry.js";
import { type Harness, collectText, defineTool, type ToolDefinition } from "../harness/index.js";

const MAX_QUERY_DEPTH = 3;

interface RelatedNavigator {
  name: string;
  description?: string;
}

/**
 * Create an MCP/tool server with one ask_<name> tool per related navigator.
 *
 * Returns null if there are no related navigators configured.
 */
export function createRelatedNavsMcpServer(
  harness: Harness,
  relatedNavigators: RelatedNavigator[],
  currentDepth: number = 0
): { server: unknown } | null {
  if (relatedNavigators.length === 0) {
    return null;
  }

  const tools: ToolDefinition[] = relatedNavigators.map((nav) => {
    const toolName = `ask_${nav.name.replace(/-/g, "_")}`;

    const desc = nav.description
      ? `Ask ${nav.name} a question. ${nav.name} is: ${nav.description}. Use this when you need information from ${nav.name}'s knowledge base.`
      : `Ask ${nav.name} a question. Use this when you need information from ${nav.name}'s knowledge base.`;

    return defineTool(
      toolName,
      desc,
      {
        question: z
          .string()
          .min(5)
          .describe(`The question to ask ${nav.name}`),
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

        // Resolve navigator path
        const navPath = resolveNavigatorPath(nav.name);
        if (!navPath) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: `Navigator "${nav.name}" not found. Register it with \`autonav init\` or set AUTONAV_NAV_PATH_${nav.name.toUpperCase().replace(/-/g, "_")} env var.`,
                }),
              },
            ],
            isError: true,
          };
        }

        try {
          const target = loadNavigator(navPath);

          const session = harness.run(
            {
              model: "claude-haiku-4-5",
              maxTurns: 10,
              systemPrompt: target.systemPrompt,
              cwd: target.navigatorPath,
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
                  navigator: target.config.name,
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
                  error: `Failed to query ${nav.name}: ${errorMsg}`,
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  });

  return harness.createToolServer("autonav-related-navs", tools);
}
