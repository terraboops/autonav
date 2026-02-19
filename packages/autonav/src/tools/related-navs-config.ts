/**
 * Self-Configuration Tools for Related Navigators
 *
 * Allows navigators to add/remove related navigators in their own config.json.
 * Changes are written to disk but cannot update tools in the running session —
 * the user is warned to restart.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type Harness } from "../harness/index.js";

interface RelatedNav {
  name: string;
  description?: string;
}

/**
 * Read relatedNavigators from a config.json file.
 */
function readRelatedNavs(configPath: string): RelatedNav[] {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);
    return Array.isArray(config.relatedNavigators) ? config.relatedNavigators : [];
  } catch {
    return [];
  }
}

/**
 * Write relatedNavigators to a config.json file (preserving other fields).
 */
function writeRelatedNavs(configPath: string, navs: RelatedNav[]): void {
  const content = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(content);
  config.relatedNavigators = navs;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Create self-config tools for managing related navigators.
 */
export function createRelatedNavsConfigServer(
  navigatorPath: string,
  harness: Harness
): { server: unknown } {
  const configPath = path.join(navigatorPath, "config.json");

  const getRelatedNavigators = defineTool(
    "get_related_navigators",
    "List all related navigators configured for this navigator.",
    {},
    async () => {
      const navs = readRelatedNavs(configPath);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, relatedNavigators: navs }),
          },
        ],
        isError: false,
      };
    }
  );

  const updateRelatedNavigators = defineTool(
    "update_related_navigators",
    `Add or remove related navigators. Changes are saved to config.json.

IMPORTANT: New tools (ask_<name>) will only appear after restarting the session. Inform the user they need to restart for changes to take effect.`,
    {
      action: z.enum(["add", "remove"]).describe("Whether to add or remove a related navigator"),
      name: z.string().min(1).describe("Navigator name (used to generate ask_<name> tool)"),
      description: z.string().optional().describe("What this navigator knows about (required for add)"),
    },
    async (args) => {
      const navs = readRelatedNavs(configPath);

      if (args.action === "add") {
        // Check for duplicates
        if (navs.some((n) => n.name === args.name)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: `Navigator "${args.name}" is already a related navigator.`,
                }),
              },
            ],
            isError: true,
          };
        }

        const entry: RelatedNav = { name: args.name };
        if (args.description) {
          entry.description = args.description;
        }
        navs.push(entry);
        writeRelatedNavs(configPath, navs);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                message: `Added "${args.name}" as a related navigator. The ask_${args.name.replace(/-/g, "_")} tool will be available after restarting the session.`,
                relatedNavigators: navs,
              }),
            },
          ],
          isError: false,
        };
      }

      // Remove
      const idx = navs.findIndex((n) => n.name === args.name);
      if (idx === -1) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Navigator "${args.name}" is not in the related navigators list.`,
              }),
            },
          ],
          isError: true,
        };
      }

      navs.splice(idx, 1);
      writeRelatedNavs(configPath, navs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `Removed "${args.name}" from related navigators. Changes take effect after restarting the session.`,
              relatedNavigators: navs,
            }),
          },
        ],
        isError: false,
      };
    }
  );

  return harness.createToolServer("autonav-related-navs-config", [
    getRelatedNavigators,
    updateRelatedNavigators,
  ]);
}
