/**
 * OpenCode Adapter
 *
 * Bridges OpenCode CLI to the Communication Layer protocol.
 * Uses subprocess spawning since OpenCode is a Go CLI without Node.js SDK.
 *
 * @see https://opencode.ai/
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  NavigatorConfig,
  NavigatorConfigSchema,
  NavigatorResponse,
  NavigatorResponseSchema,
  createAnswerQuestionPrompt,
  validateResponse,
  SELF_CONFIG_RULES,
  type ValidationResult,
} from "@autonav/communication-layer";
import { createPluginManager, PluginManager, PluginConfigFileSchema } from "../plugins/index.js";
import { sanitizeError } from "../plugins/utils/security.js";
import type {
  LLMAdapter,
  AdapterOptions,
  LoadedNavigator,
  QueryOptions,
} from "./types.js";

/**
 * Configuration options for OpenCode Adapter
 */
export interface OpenCodeAdapterOptions extends AdapterOptions {
  /**
   * OpenCode model to use (defaults to anthropic:claude-sonnet-4-20250514)
   * Format: provider:model (e.g., "openai:gpt-4o", "anthropic:claude-sonnet-4-20250514")
   */
  model?: string;

  /**
   * Path to opencode binary (defaults to "opencode" in PATH)
   */
  binaryPath?: string;

  /**
   * Timeout for OpenCode subprocess in milliseconds (defaults to 300000 = 5 minutes)
   */
  timeout?: number;
}

/**
 * OpenCode CLI response structure (JSON output)
 */
interface OpenCodeResponse {
  content?: string;
  error?: string;
  tool_calls?: Array<{
    name: string;
    input: Record<string, unknown>;
  }>;
}

/**
 * OpenCode CLI Adapter
 *
 * Executes OpenCode CLI commands via subprocess to query navigators.
 * OpenCode supports multiple LLM providers (OpenAI, Anthropic, Ollama, etc.)
 * and uses MCP for tool integration.
 *
 * @example
 * ```typescript
 * const adapter = new OpenCodeAdapter({
 *   model: 'anthropic:claude-sonnet-4-20250514'
 * });
 *
 * const navigator = await adapter.loadNavigator('./my-navigator');
 * const response = await adapter.query(navigator, 'How do I deploy?');
 * ```
 */
export class OpenCodeAdapter implements LLMAdapter {
  readonly provider = "opencode" as const;
  private readonly options: Required<OpenCodeAdapterOptions>;

  /**
   * Create a new OpenCode Adapter
   *
   * @param options - Configuration options
   */
  constructor(options: OpenCodeAdapterOptions = {}) {
    this.options = {
      model: options.model || "anthropic:claude-sonnet-4-20250514",
      maxTurns: options.maxTurns || 10,
      binaryPath: options.binaryPath || "opencode",
      timeout: options.timeout || 300000, // 5 minutes
    };
  }

  /**
   * Load a navigator from a directory
   *
   * @param navigatorPath - Path to the navigator directory
   * @returns Loaded navigator with config, system prompt, paths, and optional plugin manager
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
        `Use 'autonav init' to create a new navigator with the required structure.`
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

    // Load instructions file (CLAUDE.md, OPENCODE.md, or custom)
    // Try multiple instruction file names for compatibility
    const instructionFiles = [
      config.instructionsPath,
      "OPENCODE.md",
      "CLAUDE.md",
    ].filter(Boolean) as string[];

    let systemPrompt: string | undefined;
    let instructionsFile: string | undefined;

    for (const file of instructionFiles) {
      const actualPath = path.join(navigatorPath, file);
      if (fs.existsSync(actualPath)) {
        systemPrompt = fs.readFileSync(actualPath, "utf-8");
        instructionsFile = file;
        break;
      }
    }

    if (!systemPrompt || !instructionsFile) {
      throw new Error(
        `Instructions file not found. Tried: ${instructionFiles.join(", ")}\n` +
        `Create a CLAUDE.md or OPENCODE.md file with the navigator's system prompt.`
      );
    }

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

        // Actually initialize the plugins
        await pluginManager.loadPlugins(pluginsConfig);
      } catch (error) {
        // Sanitize error to prevent credential leakage in logs
        const safeMessage = sanitizeError(error instanceof Error ? error.message : String(error));

        console.warn(`Warning: Failed to load plugins: ${safeMessage}`);
        console.warn("   Continuing without plugins...");
        pluginManager = undefined;
      }
    }

    return {
      config,
      systemPrompt,
      navigatorPath,
      knowledgeBasePath,
      pluginManager,
      pluginsConfigPath,
    };
  }

  /**
   * Execute OpenCode CLI command
   *
   * @param prompt - Prompt to send to OpenCode
   * @param cwd - Working directory
   * @param systemPrompt - System prompt for context
   * @returns OpenCode response
   */
  private async executeOpenCode(
    prompt: string,
    cwd: string,
    systemPrompt?: string
  ): Promise<OpenCodeResponse> {
    return new Promise((resolve, reject) => {
      // Build the full prompt with system context
      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n---\n\nUser request:\n${prompt}`
        : prompt;

      // Build command arguments
      const args = [
        "-p", fullPrompt,
        "-f", "json",
        "-q", // Suppress spinner for non-interactive use
      ];

      // Spawn OpenCode process
      const process = spawn(this.options.binaryPath, args, {
        cwd,
        env: {
          ...globalThis.process.env,
          // Pass through relevant environment variables
          HOME: globalThis.process.env.HOME,
          PATH: globalThis.process.env.PATH,
          OPENCODE_MODEL: this.options.model,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        process.kill("SIGTERM");
        reject(new Error(`OpenCode command timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);

      process.on("close", (code) => {
        clearTimeout(timeoutId);

        if (code !== 0) {
          // Check for common errors
          if (stderr.includes("command not found") || stderr.includes("not found")) {
            reject(new Error(
              `OpenCode CLI not found. Please install it:\n` +
              `  curl -fsSL https://opencode.ai/install | bash\n\n` +
              `Or specify the binary path in adapter options.`
            ));
            return;
          }

          if (stderr.includes("API key") || stderr.includes("authentication")) {
            reject(new Error(
              `OpenCode authentication failed. Configure your API key:\n` +
              `  opencode config\n\n` +
              `Or set the appropriate environment variable for your provider.`
            ));
            return;
          }

          reject(new Error(`OpenCode exited with code ${code}: ${stderr || stdout}`));
          return;
        }

        try {
          // Parse JSON response
          const response = JSON.parse(stdout) as OpenCodeResponse;
          resolve(response);
        } catch {
          // If JSON parsing fails, treat as text response
          resolve({ content: stdout.trim() });
        }
      });

      process.on("error", (err) => {
        clearTimeout(timeoutId);
        if (err.message.includes("ENOENT")) {
          reject(new Error(
            `OpenCode CLI not found at "${this.options.binaryPath}".\n` +
            `Install OpenCode: curl -fsSL https://opencode.ai/install | bash`
          ));
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Execute a query using OpenCode CLI
   *
   * @param navigator - Loaded navigator to query
   * @param question - Question to ask
   * @param options - Query options
   * @returns Validated navigator response
   */
  async query(
    navigator: LoadedNavigator,
    question: string,
    options: QueryOptions = {}
  ): Promise<NavigatorResponse> {
    const { enableSelfConfig = true } = options;

    // Validate inputs
    if (!question || question.trim().length === 0) {
      throw new Error("Question cannot be empty");
    }

    // Create the prompt with structured output instructions
    const basePrompt = createAnswerQuestionPrompt(question);
    const structuredOutputInstructions = `
${basePrompt}

IMPORTANT: You MUST respond with a valid JSON object in this exact format:
\`\`\`json
{
  "answer": "Your detailed answer here",
  "sources": [
    {
      "file": "relative/path/to/file.md",
      "section": "Section name or heading",
      "relevance": "Why this source is relevant"
    }
  ],
  "confidence": 0.85
}
\`\`\`

Rules:
- answer: Comprehensive response to the question based on the knowledge base
- sources: Array of files from the knowledge base that support your answer
- confidence: Number between 0 and 1 indicating how confident you are in the answer
- You must cite actual files from the knowledge/ directory
- If you cannot find relevant information, set confidence below 0.5 and explain`;

    // Build system prompt with self-config rules if enabled
    let systemPrompt = navigator.systemPrompt;
    if (enableSelfConfig && !systemPrompt.includes("Self-Configuration Capabilities")) {
      systemPrompt = `${navigator.systemPrompt}\n\n${SELF_CONFIG_RULES}`;
    }

    try {
      // Execute OpenCode
      const response = await this.executeOpenCode(
        structuredOutputInstructions,
        navigator.navigatorPath,
        systemPrompt
      );

      if (response.error) {
        throw new Error(`OpenCode error: ${response.error}`);
      }

      const responseText = response.content || "";

      if (!responseText) {
        throw new Error("No response received from OpenCode.");
      }

      // Parse the response
      const navigatorResponse = this.parseResponse(responseText, question);

      // Validate the response
      const validation = this.validate(
        navigatorResponse,
        navigator.knowledgeBasePath
      );

      // Log warnings but don't throw
      if (validation.warnings.length > 0) {
        console.warn("Warning: Validation warnings:");
        for (const warning of validation.warnings) {
          console.warn(`  - ${warning}`);
        }
      }

      // Throw on errors
      if (!validation.valid) {
        console.error("Validation failed:");
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
        `Failed to query OpenCode: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update navigator documentation using OpenCode
   *
   * @param navigator - Loaded navigator to update
   * @param message - Update message
   * @param options - Query options
   * @returns Text response describing what was updated
   */
  async update(
    navigator: LoadedNavigator,
    message: string,
    _options: QueryOptions = {}
  ): Promise<string> {
    // Validate inputs
    if (!message || message.trim().length === 0) {
      throw new Error("Update message cannot be empty");
    }

    // Build update prompt
    const updatePrompt = `You are in UPDATE MODE with write permissions enabled.

The user wants to update the navigator's documentation.

When updating documentation:
- Edit existing files or create new files in the knowledge/ directory
- Be specific about what you're changing and why
- Maintain consistent formatting and style
- Cite which files you modified in your response

Your task: ${message}

After making changes, describe what you updated.`;

    try {
      const response = await this.executeOpenCode(
        updatePrompt,
        navigator.navigatorPath,
        navigator.systemPrompt
      );

      if (response.error) {
        throw new Error(`OpenCode error: ${response.error}`);
      }

      return response.content || "Update completed (no response text)";
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(
        `Failed to update navigator: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse OpenCode's response into a NavigatorResponse
   *
   * @param rawResponse - Raw text response from OpenCode
   * @param query - Original query
   * @returns Parsed NavigatorResponse
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
          "Could not find JSON in OpenCode's response. Response should contain a JSON object."
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
   * @param response - Navigator response to validate
   * @param knowledgeBasePath - Path to knowledge base directory
   * @returns Validation result
   */
  validate(
    response: NavigatorResponse,
    knowledgeBasePath: string
  ): ValidationResult {
    return validateResponse(response, knowledgeBasePath);
  }
}
