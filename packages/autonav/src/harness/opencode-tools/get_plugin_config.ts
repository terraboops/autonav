/**
 * get_plugin_config — OpenCode custom tool
 *
 * Reads plugin configuration from $AUTONAV_PLUGINS_PATH.
 *
 * Runs inside OpenCode's Bun runtime via .opencode/tools/.
 */
import { tool } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "node:fs"

export default tool({
  name: "get_plugin_config",
  description:
    "Read your current plugin configuration. Use this to check what plugins are enabled, see notification settings, or verify your current schedule.",
  args: {
    plugin: tool.schema
      .string()
      .describe(
        'The plugin to read configuration for ("slack", "signal", "github", "email", or "all")',
      ),
  },
  async execute(input: { plugin: string }) {
    const { plugin } = input

    if (!plugin) {
      return JSON.stringify({
        success: false,
        error: "Missing required field: plugin",
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
      const config = JSON.parse(readFileSync(configPath, "utf-8"))

      if (plugin === "all") {
        return JSON.stringify({ success: true, plugin: "all", config })
      }

      const section = config[plugin]
      if (section === undefined || section === null) {
        return JSON.stringify({
          success: true,
          plugin,
          config: { enabled: false, config: {} },
        })
      }

      return JSON.stringify({ success: true, plugin, config: section })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return JSON.stringify({
        success: false,
        error: `Failed to read plugin config: ${msg}`,
      })
    }
  },
})
