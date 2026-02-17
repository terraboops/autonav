/**
 * query_navigator — OpenCode custom tool
 *
 * Queries another navigator by spawning an opencode subprocess.
 * Cycle detection via AUTONAV_QUERY_DEPTH env var (max 3).
 *
 * Runs inside OpenCode's Bun runtime via .opencode/tools/.
 */
import { tool } from "@opencode-ai/plugin"
import { execFileSync, type ExecFileSyncOptions } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"

export default tool({
  name: "query_navigator",
  description:
    "Ask another navigator a question. Use this when you need information from a different navigator's knowledge base. The target navigator will search its own knowledge and return an answer.",
  args: {
    navigator: tool.schema
      .string()
      .describe(
        "Path to the target navigator directory (relative to cwd or absolute)",
      ),
    question: tool.schema
      .string()
      .describe("The question to ask the target navigator"),
  },
  async execute(input: { navigator: string; question: string }) {
    const { navigator, question } = input

    if (!navigator || !question) {
      return JSON.stringify({
        success: false,
        error: "Missing required fields: navigator and question",
      })
    }

    // Cycle detection
    const depth = parseInt(process.env.AUTONAV_QUERY_DEPTH || "0", 10)
    if (depth >= 3) {
      return JSON.stringify({
        success: false,
        error:
          "Query depth limit reached (max 3). Cannot query another navigator from this depth.",
      })
    }

    const navPath = resolve(navigator)
    if (!existsSync(navPath)) {
      return JSON.stringify({
        success: false,
        error: `Navigator directory not found: ${navPath}`,
      })
    }

    const configFile = join(navPath, "config.json")
    if (!existsSync(configFile)) {
      return JSON.stringify({
        success: false,
        error: "Navigator config.json not found.",
      })
    }

    let navName = "unknown"
    let instructionsPath = "CLAUDE.md"
    try {
      const config = JSON.parse(readFileSync(configFile, "utf-8"))
      navName = config.name || "unknown"
      instructionsPath = config.instructionsPath || "CLAUDE.md"
    } catch {
      return JSON.stringify({
        success: false,
        error: "Failed to parse navigator config.json",
      })
    }

    const promptFile = join(navPath, instructionsPath)
    if (!existsSync(promptFile)) {
      return JSON.stringify({
        success: false,
        error: `Navigator instructions file not found: ${instructionsPath}`,
      })
    }

    try {
      const opts: ExecFileSyncOptions = {
        timeout: 120_000,
        env: {
          ...process.env,
          AUTONAV_QUERY_DEPTH: String(depth + 1),
        },
        encoding: "utf-8",
      }

      // Use opencode run for a one-shot query
      const result = execFileSync(
        "opencode",
        ["run", "--dir", navPath, question],
        opts,
      )

      const response = typeof result === "string" ? result.trim() : ""

      if (response) {
        return JSON.stringify({
          success: true,
          navigator: navName,
          response,
        })
      } else {
        return JSON.stringify({
          success: false,
          navigator: navName,
          error: "Navigator returned empty response.",
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return JSON.stringify({
        success: false,
        navigator: navName,
        error: `Query failed: ${msg}`,
      })
    }
  },
})
