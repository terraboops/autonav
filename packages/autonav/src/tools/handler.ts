/**
 * Tool Handler for Self-Configuration
 *
 * Processes tool calls from Claude and executes the corresponding actions.
 */

import * as fs from "node:fs";
import { PluginManager, PluginConfigFileSchema } from "../plugins/index.js";
import {
  type UpdatePluginConfigInput,
  type GetPluginConfigInput,
  type SelfConfigResult,
  CONFIGURABLE_PLUGINS,
} from "./self-config.js";

/**
 * Handle the update_plugin_config tool call
 */
export async function handleUpdatePluginConfig(
  input: UpdatePluginConfigInput,
  pluginManager: PluginManager | undefined,
  pluginsConfigPath: string
): Promise<SelfConfigResult> {
  const { plugin, updates, reason } = input;

  // Validate plugin name
  if (!CONFIGURABLE_PLUGINS.includes(plugin)) {
    return {
      success: false,
      message: `Unknown plugin: ${plugin}`,
      plugin,
      error: `Valid plugins are: ${CONFIGURABLE_PLUGINS.join(", ")}`,
    };
  }

  // Check if plugins config file exists
  if (!fs.existsSync(pluginsConfigPath)) {
    return {
      success: false,
      message: `Plugin configuration file not found`,
      plugin,
      error: `Expected file at: ${pluginsConfigPath}`,
    };
  }

  try {
    // Read current config
    const currentConfigContent = fs.readFileSync(pluginsConfigPath, "utf-8");
    const currentConfig = PluginConfigFileSchema.parse(
      JSON.parse(currentConfigContent)
    );

    // Initialize plugin config if it doesn't exist
    if (!currentConfig[plugin]) {
      currentConfig[plugin] = {
        enabled: false,
        config: {},
      };
    }

    // Merge updates into existing config
    const existingPluginConfig = currentConfig[plugin].config || {};
    const mergedConfig = {
      ...existingPluginConfig,
      ...updates,
    };

    // Update the config
    currentConfig[plugin] = {
      enabled: currentConfig[plugin].enabled,
      config: mergedConfig,
    };

    // Write back to file
    fs.writeFileSync(
      pluginsConfigPath,
      JSON.stringify(currentConfig, null, 2),
      "utf-8"
    );

    // If plugin manager exists and plugin is enabled, also update runtime config
    if (pluginManager) {
      const registeredPlugin = pluginManager.getPlugin(plugin);
      if (registeredPlugin) {
        try {
          await registeredPlugin.updateConfig(updates);
        } catch {
          // Plugin might not be initialized, that's okay
          // Config file was still updated
        }
      }
    }

    return {
      success: true,
      message: `Successfully updated ${plugin} configuration: ${reason}`,
      plugin,
      changes: updates,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to update ${plugin} configuration`,
      plugin,
      error: errorMessage,
    };
  }
}

/**
 * Handle the get_plugin_config tool call
 */
export async function handleGetPluginConfig(
  input: GetPluginConfigInput,
  pluginsConfigPath: string
): Promise<SelfConfigResult> {
  const { plugin } = input;

  // Check if plugins config file exists
  if (!fs.existsSync(pluginsConfigPath)) {
    return {
      success: false,
      message: `Plugin configuration file not found`,
      plugin,
      error: `Expected file at: ${pluginsConfigPath}`,
    };
  }

  try {
    // Read current config
    const currentConfigContent = fs.readFileSync(pluginsConfigPath, "utf-8");
    const currentConfig = PluginConfigFileSchema.parse(
      JSON.parse(currentConfigContent)
    );

    if (plugin === "all") {
      return {
        success: true,
        message: "Retrieved all plugin configurations",
        plugin: "all",
        changes: currentConfig as Record<string, unknown>,
      };
    }

    // Validate plugin name
    if (!CONFIGURABLE_PLUGINS.includes(plugin)) {
      return {
        success: false,
        message: `Unknown plugin: ${plugin}`,
        plugin,
        error: `Valid plugins are: ${CONFIGURABLE_PLUGINS.join(", ")}`,
      };
    }

    const pluginConfig = currentConfig[plugin] || {
      enabled: false,
      config: {},
    };

    return {
      success: true,
      message: `Retrieved ${plugin} configuration`,
      plugin,
      changes: pluginConfig as Record<string, unknown>,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to read plugin configuration`,
      plugin,
      error: errorMessage,
    };
  }
}
