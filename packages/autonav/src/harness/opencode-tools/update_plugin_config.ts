/**
 * update_plugin_config — OpenCode custom tool
 *
 * Reads plugins.json, merges updates into a plugin's config section,
 * and writes back. Requires AUTONAV_PLUGINS_PATH.
 *
 * Runs inside OpenCode's Bun runtime via .opencode/tools/.
 */
import { tool } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync } from "node:fs"

export default tool({
  name: "update_plugin_config",
  description:
    "Update your own plugin configuration. Use this to schedule check-ins, change notification settings, enable/disable plugins, update channel preferences, or modify any plugin behavior.",
  args: {
    plugin: {
      type: "string",
      description: 'The plugin to configure ("slack", "signal", "github", "email")',
    },
    updates: {
      type: "object",
      description:
        "Config key-value pairs to merge into the plugin's config section",
    },
    reason: {
      type: "string",
      description: "Brief explanation of why you're making this change",
    },
  },
  async execute(input: {
    plugin: string
    updates: Record<string, unknown>
    reason: string
  }) {
    const { plugin, updates, reason } = input

    if (!plugin || !updates || !reason) {
      return JSON.stringify({
        success: false,
        error: "Missing required fields: plugin, updates, and reason",
      })
    }

    const validPlugins = ["slack", "signal", "github", "email"]
    if (!validPlugins.includes(plugin)) {
      return JSON.stringify({
        success: false,
        error: `Unknown plugin: ${plugin}. Valid: ${validPlugins.join(", ")}`,
      })
    }

    const configPath = process.env.AUTONAV_PLUGINS_PATH
    if (!configPath) {
      return JSON.stringify({
        success: false,
        error: "AUTONAV_PLUGINS_PATH not set. Plugin configuration unavailable.",
      })
    }

    if (!existsSync(configPath)) {
      return JSON.stringify({
        success: false,
        error: "Plugin configuration file not found.",
      })
    }

    try {
      const current = JSON.parse(readFileSync(configPath, "utf-8"))

      // Ensure plugin section exists
      if (!current[plugin]) {
        current[plugin] = { enabled: false, config: {} }
      }
      if (!current[plugin].config) {
        current[plugin].config = {}
      }

      // Merge updates into the plugin's config section
      Object.assign(current[plugin].config, updates)

      // Write back
      writeFileSync(configPath, JSON.stringify(current, null, 2) + "\n")

      return JSON.stringify({
        success: true,
        plugin,
        message: `Updated ${plugin} config: ${reason}`,
        changes: updates,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return JSON.stringify({
        success: false,
        error: `Failed to update plugin config: ${msg}`,
      })
    }
  },
})
