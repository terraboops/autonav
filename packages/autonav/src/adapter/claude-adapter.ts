import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
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
import { createSelfConfigMcpServer, createResponseMcpServer, SUBMIT_ANSWER_TOOL } from "../tools/index.js";

// Debug logging - enabled via AUTONAV_DEBUG=1 environment variable
const DEBUG = process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1";

function debugLog(context: string, ...args: unknown[]): void {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.error(`[DEBUG ${timestamp}] [${context}]`, ...args);
  }
}

// Default model - using the short form that works in conversation mode
const DEFAULT_MODEL = "claude-sonnet-4-5";

/**
 * Configuration options for Claude Adapter
 */
export interface ClaudeAdapterOptions {
  /**
   * Claude model to use (defaults to claude-sonnet-4-20250514)
   */
  model?: string;

  /**
   * Maximum turns for agentic loop (defaults to 10)
   */
  maxTurns?: number;
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
  pluginsConfigPath?: string;
}

/**
 * Query options
 */
export interface QueryOptions {
  /**
   * Enable self-configuration tools (defaults to true)
   */
  enableSelfConfig?: boolean;

  /**
   * Maximum turns for agentic loop (defaults to 10)
   */
  maxTurns?: number;
}

/**
 * Claude Agent SDK Adapter
 *
 * Bridges Claude Agent SDK to the Communication Layer protocol.
 * Loads navigators, executes queries, and validates responses.
 *
 * @example
 * ```typescript
 * const adapter = new ClaudeAdapter({
 *   model: 'claude-sonnet-4-20250514',
 *   maxTurns: 10
 * });
 *
 * const navigator = adapter.loadNavigator('./my-navigator');
 * const response = await adapter.query(navigator, 'How do I deploy?');
 * ```
 */
export class ClaudeAdapter {
  private readonly options: Required<ClaudeAdapterOptions>;

  /**
   * Create a new Claude Adapter
   *
   * @param options - Configuration options
   */
  constructor(options: ClaudeAdapterOptions = {}) {
    this.options = {
      model: options.model || DEFAULT_MODEL,
      maxTurns: options.maxTurns || 10,
    };
    debugLog("ClaudeAdapter", "Initialized with options:", this.options);
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
    debugLog("loadNavigator", "Loading navigator from:", navigatorPath);
    const configPath = path.join(navigatorPath, "config.json");

    // Validate directory exists
    if (!fs.existsSync(navigatorPath)) {
      debugLog("loadNavigator", "Directory not found:", navigatorPath);
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
      debugLog("loadNavigator", "Found plugins config at:", pluginsConfigPath);
      try {
        const pluginsConfigContent = fs.readFileSync(pluginsConfigPath, "utf-8");
        const pluginsConfig = PluginConfigFileSchema.parse(JSON.parse(pluginsConfigContent));
        debugLog("loadNavigator", "Parsed plugins config:", Object.keys(pluginsConfig));

        // Create plugin manager
        pluginManager = createPluginManager(pluginsConfigPath);

        // Actually initialize the plugins
        await pluginManager.loadPlugins(pluginsConfig);
        debugLog("loadNavigator", "Plugins loaded successfully");
      } catch (error) {
        // Sanitize error to prevent credential leakage in logs
        const safeMessage = sanitizeError(error instanceof Error ? error.message : String(error));
        debugLog("loadNavigator", "Failed to load plugins:", safeMessage);

        console.warn(`⚠️  Failed to load plugins: ${safeMessage}`);
        console.warn("   Continuing without plugins...");
        // Continue without plugins (fail-safe)
        pluginManager = undefined;
      }
    } else {
      debugLog("loadNavigator", "No plugins config found at:", pluginsConfigPath);
    }

    debugLog("loadNavigator", "Navigator loaded successfully:", config.name);
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
   * Execute a query using Claude Agent SDK
   *
   * Sends the question to Claude with the navigator's system prompt,
   * handles tool use via the built-in agentic loop, parses the response,
   * and validates it against the knowledge base.
   *
   * @param navigator - Loaded navigator to query
   * @param question - Question to ask
   * @param options - Query options (enableSelfConfig, maxTurns)
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
    question: string,
    options: QueryOptions = {}
  ): Promise<NavigatorResponse> {
    const {
      enableSelfConfig = true,
      maxTurns = this.options.maxTurns,
    } = options;

    debugLog("query", "Starting query:", { question: question.substring(0, 100), enableSelfConfig, maxTurns });

    // Validate inputs
    if (!question || question.trim().length === 0) {
      throw new Error('Question cannot be empty');
    }

    // Create the prompt
    const prompt = createAnswerQuestionPrompt(question);
    debugLog("query", "Created prompt, length:", prompt.length);

    // Build system prompt with self-config rules if enabled
    let systemPrompt = navigator.systemPrompt;
    if (enableSelfConfig && !systemPrompt.includes("Self-Configuration Capabilities")) {
      systemPrompt = `${navigator.systemPrompt}\n\n${SELF_CONFIG_RULES}`;
    }
    debugLog("query", "System prompt length:", systemPrompt.length);

    // Set up MCP servers - wrapped in try-catch to prevent hangs
    let mcpServers: Record<string, ReturnType<typeof createSelfConfigMcpServer>> | undefined;

    try {
      debugLog("query", "Setting up MCP servers...");
      const servers: Record<string, ReturnType<typeof createSelfConfigMcpServer>> = {};

      // Always add response tools for structured output
      servers["autonav-response"] = createResponseMcpServer();
      debugLog("query", "Created response MCP server");

      // Add self-config tools if enabled
      if (enableSelfConfig && navigator.pluginsConfigPath) {
        servers["autonav-self-config"] = createSelfConfigMcpServer(
          navigator.pluginManager,
          navigator.pluginsConfigPath
        );
        debugLog("query", "Created self-config MCP server");
      }

      mcpServers = Object.keys(servers).length > 0 ? servers : undefined;
      debugLog("query", "MCP servers ready:", mcpServers ? Object.keys(mcpServers) : "none");
    } catch (mcpError) {
      debugLog("query", "Failed to set up MCP servers:", mcpError);
      console.warn("⚠️  Failed to set up MCP servers, continuing without them");
      mcpServers = undefined;
    }

    try {
      debugLog("query", "Calling Claude Agent SDK query()...");
      debugLog("query", "SDK options:", {
        model: this.options.model,
        maxTurns,
        cwd: navigator.navigatorPath,
        hasMcpServers: !!mcpServers,
      });

      // Execute query using Claude Agent SDK
      // The SDK handles the agentic loop automatically
      const queryIterator = query({
        prompt,
        options: {
          model: this.options.model,
          maxTurns,
          systemPrompt,
          cwd: navigator.navigatorPath,
          mcpServers,
          // Allow the SDK to handle permissions
          permissionMode: "bypassPermissions",
        },
      });

      debugLog("query", "SDK query iterator created, starting iteration...");

      // Collect messages and find the result
      let resultMessage: SDKResultMessage | undefined;
      let lastAssistantText = "";
      let submitAnswerInput: { answer: string; sources: Array<{ file: string; section: string; relevance: string }>; confidence: number } | undefined;
      let messageCount = 0;

      for await (const message of queryIterator) {
        messageCount++;
        debugLog("query", `Received message #${messageCount}, type:`, message.type);

        // Log tool usage for debugging
        if (message.type === "assistant") {
          const content = message.message.content;
          for (const block of content) {
            if (block.type === "tool_use") {
              debugLog("query", "Tool use detected:", block.name);
              // Check if this is the submit_answer tool
              if (block.name === SUBMIT_ANSWER_TOOL) {
                // Extract the structured response from tool input
                submitAnswerInput = block.input as typeof submitAnswerInput;
                debugLog("query", "submit_answer tool called with confidence:", submitAnswerInput?.confidence);
              }
            } else if (block.type === "text") {
              lastAssistantText = block.text;
              debugLog("query", "Text block received, length:", block.text.length);
            }
          }
        }

        // Capture the result message
        if (message.type === "result") {
          debugLog("query", "Result message received, subtype:", message.subtype);
          resultMessage = message;
        }
      }

      debugLog("query", "Iteration complete, total messages:", messageCount);

      // Check for errors
      if (!resultMessage) {
        debugLog("query", "ERROR: No result message received");
        throw new Error("No result message received from Claude Agent SDK");
      }

      if (resultMessage.subtype !== "success") {
        const errorDetails = "errors" in resultMessage
          ? resultMessage.errors.join(", ")
          : "Unknown error";
        debugLog("query", "ERROR: Query failed:", resultMessage.subtype, errorDetails);
        throw new Error(`Query failed: ${resultMessage.subtype} - ${errorDetails}`);
      }

      // Build the navigator response
      let navigatorResponse: NavigatorResponse;

      if (submitAnswerInput) {
        debugLog("query", "Building response from submit_answer tool");
        // Use structured output from tool call (preferred)
        navigatorResponse = NavigatorResponseSchema.parse({
          query: question,
          answer: submitAnswerInput.answer,
          sources: submitAnswerInput.sources,
          confidence: submitAnswerInput.confidence,
          timestamp: new Date().toISOString(),
        });
      } else {
        debugLog("query", "Falling back to text parsing");
        // Fall back to parsing text response (legacy path)
        const finalText = resultMessage.result || lastAssistantText;

        if (!finalText) {
          debugLog("query", "ERROR: No response text available");
          throw new Error("No response received from Claude. Expected submit_answer tool call or text response.");
        }

        // Parse the response from text
        navigatorResponse = this.parseResponse(finalText, question);
      }

      debugLog("query", "Response built, validating...");

      // Validate the response
      const validation = this.validate(
        navigatorResponse,
        navigator.knowledgeBasePath
      );

      // Log warnings but don't throw
      if (validation.warnings.length > 0) {
        debugLog("query", "Validation warnings:", validation.warnings);
        console.warn("⚠️  Validation warnings:");
        for (const warning of validation.warnings) {
          console.warn(`  - ${warning}`);
        }
      }

      // Throw on errors
      if (!validation.valid) {
        debugLog("query", "Validation failed:", validation.errors);
        console.error("❌ Validation failed:");
        for (const error of validation.errors) {
          console.error(`  - ${error.message}`);
        }
        throw new Error(
          "Response validation failed. See errors above for details."
        );
      }

      debugLog("query", "Query completed successfully");
      return navigatorResponse;
    } catch (error) {
      debugLog("query", "ERROR in query:", error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(
        `Failed to query Claude: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update navigator documentation
   *
   * Sends an update message to Claude with write permissions enabled.
   * Claude can edit files in the knowledge base to document progress,
   * add troubleshooting steps, or update existing documentation.
   *
   * @param navigator - Loaded navigator to update
   * @param message - Update message or report
   * @param options - Query options (maxTurns)
   * @returns Text response from Claude describing what was updated
   * @throws {Error} If API call fails or update fails
   *
   * @example
   * ```typescript
   * const result = await adapter.update(
   *   navigator,
   *   'I completed feature X. Please document this in the knowledge base.'
   * );
   * console.log(result);
   * ```
   */
  async update(
    navigator: LoadedNavigator,
    message: string,
    options: QueryOptions = {}
  ): Promise<string> {
    const { maxTurns = this.options.maxTurns } = options;

    debugLog("update", "Starting update:", { message: message.substring(0, 100), maxTurns });

    // Validate inputs
    if (!message || message.trim().length === 0) {
      throw new Error('Update message cannot be empty');
    }

    // Build system prompt with update-specific instructions
    const systemPrompt = `${navigator.systemPrompt}

# Update Mode

You are in UPDATE MODE with write permissions enabled. The user wants to update the navigator's documentation.

When updating documentation:
- Edit existing files or create new files in the knowledge/ directory
- Be specific about what you're changing and why
- Maintain consistent formatting and style
- Cite which files you modified in your response

Your task: ${message}`;

    debugLog("update", "System prompt prepared, length:", systemPrompt.length);

    try {
      debugLog("update", "Calling Claude Agent SDK query()...");
      debugLog("update", "SDK options:", {
        model: this.options.model,
        maxTurns,
        cwd: navigator.navigatorPath,
      });

      // Execute update using Claude Agent SDK with write permissions
      const queryIterator = query({
        prompt: message,
        options: {
          model: this.options.model,
          maxTurns,
          systemPrompt,
          cwd: navigator.navigatorPath,
          // Allow file writes in the navigator directory
          permissionMode: "bypassPermissions",
        },
      });

      debugLog("update", "SDK query iterator created, starting iteration...");

      // Collect the result
      let resultMessage: SDKResultMessage | undefined;
      let lastAssistantText = "";
      let messageCount = 0;

      for await (const message of queryIterator) {
        messageCount++;
        debugLog("update", `Received message #${messageCount}, type:`, message.type);

        if (message.type === "assistant") {
          const content = message.message.content;
          for (const block of content) {
            if (block.type === "text") {
              lastAssistantText = block.text;
              debugLog("update", "Text block received, length:", block.text.length);
            } else if (block.type === "tool_use") {
              debugLog("update", "Tool use detected:", block.name);
            }
          }
        }

        if (message.type === "result") {
          debugLog("update", "Result message received, subtype:", message.subtype);
          resultMessage = message;
        }
      }

      debugLog("update", "Iteration complete, total messages:", messageCount);

      // Check for errors
      if (!resultMessage) {
        debugLog("update", "ERROR: No result message received");
        throw new Error("No result message received from Claude Agent SDK");
      }

      if (resultMessage.subtype !== "success") {
        const errorDetails = "errors" in resultMessage
          ? resultMessage.errors.join(", ")
          : "Unknown error";
        debugLog("update", "ERROR: Update failed:", resultMessage.subtype, errorDetails);
        throw new Error(`Update failed: ${resultMessage.subtype} - ${errorDetails}`);
      }

      const result = resultMessage.result || lastAssistantText || "Update completed (no response text)";
      debugLog("update", "Update completed successfully, response length:", result.length);

      // Return the final response text
      return result;
    } catch (error) {
      debugLog("update", "ERROR in update:", error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(
        `Failed to update navigator: ${error instanceof Error ? error.message : String(error)}`
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
