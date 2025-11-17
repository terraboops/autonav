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
import { sanitizeError } from "../plugins/utils/security.js";

/**
 * Configuration options for Claude Adapter
 */
export interface ClaudeAdapterOptions {
  /**
   * Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
   */
  apiKey?: string;

  /**
   * Claude model to use (defaults to claude-sonnet-4-20250514)
   */
  model?: string;

  /**
   * Maximum tokens in response (defaults to 4096)
   */
  maxTokens?: number;

  /**
   * Request timeout in milliseconds (defaults to 60000ms = 1 minute)
   */
  timeout?: number;
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

/**
 * Claude SDK Adapter
 *
 * Bridges Claude API to the Communication Layer protocol.
 * Loads navigators, executes queries, and validates responses.
 *
 * @example
 * ```typescript
 * const adapter = new ClaudeAdapter({
 *   model: 'claude-sonnet-4-20250514',
 *   maxTokens: 8192
 * });
 *
 * const navigator = adapter.loadNavigator('./my-navigator');
 * const response = await adapter.query(navigator, 'How do I deploy?');
 * ```
 */
export class ClaudeAdapter {
  private client: Anthropic;
  private readonly options: Required<ClaudeAdapterOptions>;

  /**
   * Create a new Claude Adapter
   *
   * @param options - Configuration options
   * @throws {Error} If API key is not provided and ANTHROPIC_API_KEY env var is not set
   */
  constructor(options: ClaudeAdapterOptions = {}) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Anthropic API key is required. Provide it via options.apiKey or ANTHROPIC_API_KEY environment variable.'
      );
    }

    this.client = new Anthropic({ apiKey });

    this.options = {
      apiKey,
      model: options.model || "claude-sonnet-4-20250514",
      maxTokens: options.maxTokens || 4096,
      timeout: options.timeout || 60000,
    };
  }

  /**
   * Load a navigator from a directory
   *
   * Reads and validates config.json and CLAUDE.md (or custom instructions file).
   * Verifies that the knowledge base directory exists.
   * If .claude/plugins.json exists, initializes configured plugins.
   *
   * @param navigatorPath - Path to the navigator directory
   * @returns Loaded navigator with config, system prompt, paths, and optional plugin manager
   * @throws {Error} If directory doesn't exist, config is invalid, or required files are missing
   *
   * @example
   * ```typescript
   * const adapter = new ClaudeAdapter();
   * const navigator = await adapter.loadNavigator('./my-navigator');
   * console.log(`Loaded: ${navigator.config.name}`);
   * ```
   */
  async loadNavigator(navigatorPath: string): Promise<LoadedNavigator> {
    const configPath = path.join(navigatorPath, "config.json");

    // Validate directory exists
    if (!fs.existsSync(navigatorPath)) {
      throw new Error(
        `Navigator directory not found: ${navigatorPath}\n` +
        `Make sure the path is correct and the navigator exists.`
      );
    }

    // Verify it's a directory
    const pathStats = fs.statSync(navigatorPath);
    if (!pathStats.isDirectory()) {
      throw new Error(
        `Path is not a directory: ${navigatorPath}\n` +
        `Navigator path must point to a directory containing config.json`
      );
    }

    // Load and validate config.json
    if (!fs.existsSync(configPath)) {
      throw new Error(
        `config.json not found in ${navigatorPath}\n` +
        `Expected file: ${configPath}\n` +
        `Use 'nav-init' to create a new navigator with the required structure.`
      );
    }

    const configContent = fs.readFileSync(configPath, "utf-8");
    let config: NavigatorConfig;

    try {
      const configJson = JSON.parse(configContent);
      config = NavigatorConfigSchema.parse(configJson);
    } catch (error) {
      throw new Error(
        `Invalid config.json in ${navigatorPath}:\n` +
        `${error instanceof Error ? error.message : String(error)}\n\n` +
        `Config file must match the NavigatorConfig schema.`
      );
    }

    // Load instructions file (CLAUDE.md or custom)
    const instructionsFile = config.instructionsPath || "CLAUDE.md";
    const actualInstructionsPath = path.join(navigatorPath, instructionsFile);

    if (!fs.existsSync(actualInstructionsPath)) {
      throw new Error(
        `Instructions file not found: ${instructionsFile}\n` +
        `Expected path: ${actualInstructionsPath}\n` +
        `Create a ${instructionsFile} file with the navigator's system prompt.`
      );
    }

    const systemPrompt = fs.readFileSync(actualInstructionsPath, "utf-8");

    // Validate knowledge base exists
    const knowledgeBasePath = path.join(
      navigatorPath,
      config.knowledgeBase
    );

    if (!fs.existsSync(knowledgeBasePath)) {
      throw new Error(
        `Knowledge base directory not found: ${config.knowledgeBase}\n` +
        `Expected path: ${knowledgeBasePath}\n` +
        `Create the directory and add documentation files for the navigator to search.`
      );
    }

    // Verify knowledge base is a directory
    const kbStats = fs.statSync(knowledgeBasePath);
    if (!kbStats.isDirectory()) {
      throw new Error(
        `Knowledge base path is not a directory: ${config.knowledgeBase}\n` +
        `The knowledge base must be a directory containing documentation files.`
      );
    }

    // Load and initialize plugins if .claude/plugins.json exists
    let pluginManager: PluginManager | undefined;
    const pluginsConfigPath = path.join(navigatorPath, ".claude", "plugins.json");

    if (fs.existsSync(pluginsConfigPath)) {
      try {
        const pluginsConfigContent = fs.readFileSync(pluginsConfigPath, "utf-8");
        const pluginsConfig = PluginConfigFileSchema.parse(JSON.parse(pluginsConfigContent));

        // Create plugin manager
        pluginManager = createPluginManager(pluginsConfigPath);

        // Actually initialize the plugins (CRITICAL FIX)
        await pluginManager.loadPlugins(pluginsConfig);

        console.log("✓ Plugins initialized successfully");
      } catch (error) {
        // Sanitize error to prevent credential leakage in logs
        const safeMessage = sanitizeError(error instanceof Error ? error.message : String(error));

        console.warn(`⚠️  Failed to load plugins: ${safeMessage}`);
        console.warn("   Continuing without plugins...");
        // Continue without plugins (fail-safe)
        pluginManager = undefined;
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
   * Sends the question to Claude with the navigator's system prompt,
   * parses the response, and validates it against the knowledge base.
   *
   * @param navigator - Loaded navigator to query
   * @param question - Question to ask
   * @returns Validated navigator response with answer and sources
   * @throws {Error} If API call fails, response parsing fails, or validation fails
   *
   * @example
   * ```typescript
   * const response = await adapter.query(navigator, 'How do I deploy?');
   * console.log(response.answer);
   * console.log(`Confidence: ${response.confidence}`);
   * console.log(`Sources: ${response.sources.map(s => s.filePath).join(', ')}`);
   * ```
   */
  async query(
    navigator: LoadedNavigator,
    question: string
  ): Promise<NavigatorResponse> {
    // Validate inputs
    if (!question || question.trim().length === 0) {
      throw new Error('Question cannot be empty');
    }

    // Create the prompt
    const prompt = createAnswerQuestionPrompt(question);

    try {
      // Call Claude API with configured options
      const response = await this.client.messages.create({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
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
        .filter((block: Anthropic.ContentBlock): block is Anthropic.TextBlock => block.type === "text")
        .map((block: Anthropic.TextBlock) => block.text)
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
   * Extracts JSON from the response text (either from code blocks or raw JSON)
   * and validates it against the NavigatorResponseSchema.
   *
   * @param rawResponse - Raw text response from Claude
   * @param query - Original query (used to populate missing query field)
   * @returns Parsed and validated NavigatorResponse
   * @throws {Error} If JSON cannot be extracted or schema validation fails
   *
   * @internal
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
   * Runs comprehensive validation including:
   * - Source file existence checks
   * - Hallucination pattern detection
   * - Confidence level validation
   *
   * @param response - Navigator response to validate
   * @param knowledgeBasePath - Path to knowledge base directory
   * @returns Validation result with errors and warnings
   *
   * @internal
   */
  validate(
    response: NavigatorResponse,
    knowledgeBasePath: string
  ): ValidationResult {
    return validateResponse(response, knowledgeBasePath);
  }
}
