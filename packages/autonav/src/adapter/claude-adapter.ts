import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  NavigatorConfig,
  NavigatorConfigSchema,
  NavigatorResponse,
  NavigatorResponseSchema,
  createAnswerQuestionPrompt,
  validateResponse,
  type ValidationResult,
} from "@platform-ai/communication-layer";
import { createPluginManager, PluginManager, PluginConfigFileSchema } from "../plugins/index.js";

/**
 * Claude SDK Adapter
 *
 * Bridges Claude API to the Communication Layer protocol.
 * Loads navigators, executes queries, and validates responses.
 */
export class ClaudeAdapter {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Load a navigator from a directory
   *
   * Reads and validates config.json and CLAUDE.md
   */
  loadNavigator(navigatorPath: string): LoadedNavigator {
    const configPath = path.join(navigatorPath, "config.json");

    // Validate directory exists
    if (!fs.existsSync(navigatorPath)) {
      throw new Error(`Navigator directory not found: ${navigatorPath}`);
    }

    // Load and validate config.json
    if (!fs.existsSync(configPath)) {
      throw new Error(`config.json not found in ${navigatorPath}`);
    }

    const configContent = fs.readFileSync(configPath, "utf-8");
    let config: NavigatorConfig;

    try {
      const configJson = JSON.parse(configContent);
      config = NavigatorConfigSchema.parse(configJson);
    } catch (error) {
      throw new Error(
        `Invalid config.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Load CLAUDE.md instructions
    const actualInstructionsPath = path.join(
      navigatorPath,
      config.instructionsPath || "CLAUDE.md"
    );

    if (!fs.existsSync(actualInstructionsPath)) {
      throw new Error(
        `Instructions file not found: ${config.instructionsPath || "CLAUDE.md"}`
      );
    }

    const systemPrompt = fs.readFileSync(actualInstructionsPath, "utf-8");

    // Validate knowledge base exists
    const knowledgeBasePath = path.join(
      navigatorPath,
      config.knowledgeBasePath || "knowledge-base"
    );

    if (!fs.existsSync(knowledgeBasePath)) {
      throw new Error(
        `Knowledge base directory not found: ${config.knowledgeBasePath || "knowledge-base"}`
      );
    }

    // Load plugins if .claude/plugins.json exists
    let pluginManager: PluginManager | undefined;
    const pluginsConfigPath = path.join(navigatorPath, ".claude", "plugins.json");

    if (fs.existsSync(pluginsConfigPath)) {
      try {
        const pluginsConfigContent = fs.readFileSync(pluginsConfigPath, "utf-8");
        // Validate the config file
        PluginConfigFileSchema.parse(JSON.parse(pluginsConfigContent));

        // Create and initialize plugin manager
        pluginManager = createPluginManager(pluginsConfigPath);

        // Load plugins (async, but we'll handle it synchronously for now)
        // In a real implementation, you might want to make loadNavigator async
        // For now, we'll just create the manager and defer loading to when it's first used
        console.log("Plugin configuration found, plugins will be initialized on first use");
      } catch (error) {
        console.warn(
          `Failed to load plugins: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue without plugins (fail-safe)
      }
    }

    return {
      config,
      systemPrompt,
      navigatorPath,
      knowledgeBasePath,
      pluginManager,
    };
  }

  /**
   * Execute a query using Claude
   *
   * Sends the question to Claude with the navigator's system prompt
   * and parses the response into a NavigatorResponse.
   */
  async query(
    navigator: LoadedNavigator,
    question: string
  ): Promise<NavigatorResponse> {
    // Create the prompt
    const prompt = createAnswerQuestionPrompt(question);

    try {
      // Call Claude API
      const response = await this.client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: navigator.systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract text from response
      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      // Parse the response
      const navigatorResponse = this.parseResponse(textContent, question);

      // Validate the response
      const validation = this.validate(
        navigatorResponse,
        navigator.config,
        navigator.knowledgeBasePath
      );

      // Log warnings but don't throw
      if (validation.warnings.length > 0) {
        console.warn("⚠️  Validation warnings:");
        for (const warning of validation.warnings) {
          console.warn(`  - ${warning}`);
        }
      }

      // Throw on errors
      if (!validation.valid) {
        console.error("❌ Validation failed:");
        for (const error of validation.errors) {
          console.error(`  - ${error.message}`);
        }
        throw new Error(
          "Response validation failed. See errors above for details."
        );
      }

      return navigatorResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(
        `Failed to query Claude: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse Claude's response into a NavigatorResponse
   *
   * Extracts JSON from the response text and validates it against the schema.
   */
  parseResponse(rawResponse: string, query: string): NavigatorResponse {
    // Try to extract JSON from code blocks
    const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/);

    let jsonText: string;

    if (jsonMatch && jsonMatch[1]) {
      jsonText = jsonMatch[1];
    } else {
      // Try to find JSON object in the text
      const objectMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (objectMatch && objectMatch[0]) {
        jsonText = objectMatch[0];
      } else {
        throw new Error(
          "Could not find JSON in Claude's response. Response should contain a JSON object."
        );
      }
    }

    try {
      const parsed = JSON.parse(jsonText);

      // Ensure query field is set
      if (!parsed.query) {
        parsed.query = query;
      }

      return NavigatorResponseSchema.parse(parsed);
    } catch (error) {
      throw new Error(
        `Failed to parse response: ${error instanceof Error ? error.message : String(error)}\n\nRaw response:\n${rawResponse}`
      );
    }
  }

  /**
   * Validate a NavigatorResponse
   *
   * Runs hallucination detection and source verification.
   */
  validate(
    response: NavigatorResponse,
    config: NavigatorConfig,
    knowledgeBasePath?: string
  ): ValidationResult {
    return validateResponse(response, config, knowledgeBasePath);
  }
}

/**
 * Loaded navigator with all necessary context
 */
export interface LoadedNavigator {
  config: NavigatorConfig;
  systemPrompt: string;
  navigatorPath: string;
  knowledgeBasePath: string;
  pluginManager?: PluginManager;
}
