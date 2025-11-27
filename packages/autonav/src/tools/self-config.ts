/**
 * Self-Configuration Tools for Autonav Navigators
 *
 * These tools allow navigators to modify their own configuration
 * during conversations, enabling autonomous self-management.
 *
 * Uses MCP format for integration with Claude Agent SDK.
 *
 * @example
 * User: "Check in with me tomorrow at 3pm"
 * Nav: [Uses update_plugin_config tool to schedule check-in]
 */

import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { PluginManager } from "../plugins/index.js";
import {
  handleUpdatePluginConfig,
  handleGetPluginConfig,
} from "./handler.js";

/**
 * Available plugins that can be configured
 */
export const CONFIGURABLE_PLUGINS = ["slack", "signal", "github", "email"] as const;
export type ConfigurablePlugin = (typeof CONFIGURABLE_PLUGINS)[number];

/**
 * Input type for update_plugin_config tool
 */
export interface UpdatePluginConfigInput {
  plugin: ConfigurablePlugin;
  updates: Record<string, unknown>;
  reason: string;
}

/**
 * Input type for get_plugin_config tool
 */
export interface GetPluginConfigInput {
  plugin: ConfigurablePlugin | "all";
}

/**
 * Result of a self-configuration operation
 */
export interface SelfConfigResult {
  success: boolean;
  message: string;
  plugin: string;
  changes?: Record<string, unknown>;
  error?: string;
}

/**
 * Create an MCP server with self-configuration tools
 *
 * The tools allow the navigator to:
 * - Read its current plugin configuration
 * - Update plugin settings (scheduling, notifications, etc.)
 *
 * @param pluginManager - Optional plugin manager for runtime updates
 * @param pluginsConfigPath - Path to the plugins.json configuration file
 */
export function createSelfConfigMcpServer(
  pluginManager: PluginManager | undefined,
  pluginsConfigPath: string
) {
  const updatePluginConfigTool = tool(
    "update_plugin_config",
    `Update your own plugin configuration. Use this when the user asks you to:
- Schedule check-ins or reminders (signal plugin)
- Change notification settings or frequency
- Enable/disable plugins
- Update channel preferences (slack plugin)
- Modify any plugin behavior

This allows you to autonomously manage your own behavior based on user requests.`,
    {
      plugin: z.enum(CONFIGURABLE_PLUGINS).describe(
        "The plugin to configure (slack, signal, github, or email)"
      ),
      updates: z.record(z.unknown()).describe(
        `Configuration updates to apply. Common patterns:
- signal: { checkInSchedule: "custom", nextCheckIn: "2025-01-15T15:00:00Z", notificationTypes: ["urgent"] }
- slack: { channels: ["platform-team"], summaryFrequency: "weekly" }
- github: { repositories: ["org/repo"], issueLabels: ["docs"] }`
      ),
      reason: z.string().describe(
        "Brief explanation of why you're making this change (for logging)"
      ),
    },
    async (args) => {
      const result = await handleUpdatePluginConfig(
        {
          plugin: args.plugin,
          updates: args.updates,
          reason: args.reason,
        },
        pluginManager,
        pluginsConfigPath
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
        isError: !result.success,
      };
    }
  );

  const getPluginConfigTool = tool(
    "get_plugin_config",
    `Read your current plugin configuration. Use this to:
- Check what plugins are currently enabled
- See current notification settings before changing them
- Verify your current schedule or preferences`,
    {
      plugin: z.enum([...CONFIGURABLE_PLUGINS, "all"]).describe(
        "The plugin to read configuration for, or 'all' for all plugins"
      ),
    },
    async (args) => {
      const result = await handleGetPluginConfig(
        { plugin: args.plugin },
        pluginsConfigPath
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
        isError: !result.success,
      };
    }
  );

  return createSdkMcpServer({
    name: "autonav-self-config",
    version: "1.0.0",
    tools: [updatePluginConfigTool, getPluginConfigTool],
  });
}
