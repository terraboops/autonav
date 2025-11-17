import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  NavigatorConfig,
  NavigatorConfigSchema,
  NavigatorResponse,
  NavigatorResponseSchema,
  validateResponse,
  type ValidationResult,
} from "@platform-ai/communication-layer";

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
      "CLAUDE.md"
    );

    if (!fs.existsSync(actualInstructionsPath)) {
      throw new Error(
        `Instructions file not found: CLAUDE.md`
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

    return {
      config,
      systemPrompt,
      navigatorPath,
      knowledgeBasePath,
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
    // Create the prompt  (simple version - full implementation would use prompt templates)
    const prompt = question;

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
    knowledgeBasePath: string
  ): ValidationResult {
    // Create a minimal config for validation
    const tempConfig: NavigatorConfig = {
      name: "temp",
      domain: "temp",
      communicationLayerVersion: "0.1.0",
      knowledgeBasePath: knowledgeBasePath,
      confidenceThreshold: 0.7,
    };
    return validateResponse(response, tempConfig, knowledgeBasePath);
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
}
