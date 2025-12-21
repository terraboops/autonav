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

/**
 * Optional LangSmith integration for tracing Claude Agent SDK calls
 */
let langsmithTraceable: any = null;
let langsmithInitialized = false;

/**
 * Lazily initialize LangSmith tracing if enabled via environment variables
 */
async function initializeLangSmith(): Promise<boolean> {
  if (langsmithInitialized) {
    return !!langsmithTraceable;
  }

  langsmithInitialized = true;

  // Check if LangSmith tracing is enabled via environment variable
  const tracingEnabled = process.env.LANGSMITH_TRACING === "true";
  const hasApiKey = !!process.env.LANGSMITH_API_KEY;

  if (!tracingEnabled || !hasApiKey) {
    return false;
  }

  try {
    // Dynamically import langsmith (optional peer dependency)
    // Using dynamic import with string to avoid TypeScript compile-time resolution
    const moduleName = "langsmith/traceable";
    const langsmith = await import(moduleName);
    langsmithTraceable = langsmith.traceable;

    console.log("✅ LangSmith tracing enabled");
    if (process.env.LANGSMITH_PROJECT) {
      console.log(`   Project: ${process.env.LANGSMITH_PROJECT}`);
    }

    return true;
  } catch (error) {
    // langsmith not installed or import failed - continue without tracing
    console.warn("⚠️  LangSmith tracing requested but langsmith package not found.");
    console.warn("   Install with: npm install langsmith");
    return false;
  }
}

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
      model: options.model || "claude-sonnet-4-20250514",
      maxTurns: options.maxTurns || 10,
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
    // Initialize LangSmith if needed
    const tracingEnabled = await initializeLangSmith();

    // Wrap the query execution with LangSmith tracing if enabled
    if (tracingEnabled && langsmithTraceable) {
      const tracedQuery = langsmithTraceable(
        this.executeQuery.bind(this),
        {
          name: "autonav_query",
          run_type: "chain",
          metadata: {
            navigator: navigator.config.name,
            model: this.options.model,
          },
        }
      );
      return tracedQuery(navigator, question, options);
    }

    // Execute query without tracing
    return this.executeQuery(navigator, question, options);
  }

  /**
   * Internal method to execute the query
   * Separated to allow for LangSmith tracing wrapper
   *
   * @internal
   */
  private async executeQuery(
    navigator: LoadedNavigator,
    question: string,
    options: QueryOptions = {}
  ): Promise<NavigatorResponse> {
    const {
      enableSelfConfig = true,
      maxTurns = this.options.maxTurns,
    } = options;

    // Validate inputs
    if (!question || question.trim().length === 0) {
      throw new Error('Question cannot be empty');
    }

    // Create the prompt
    const prompt = createAnswerQuestionPrompt(question);

    // Build system prompt with self-config rules if enabled
    let systemPrompt = navigator.systemPrompt;
    if (enableSelfConfig && !systemPrompt.includes("Self-Configuration Capabilities")) {
      systemPrompt = `${navigator.systemPrompt}\n\n${SELF_CONFIG_RULES}`;
    }

    // Set up MCP servers
    const mcpServers: Record<string, ReturnType<typeof createSelfConfigMcpServer>> = {};

    // Always add response tools for structured output
    mcpServers["autonav-response"] = createResponseMcpServer();

    // Add self-config tools if enabled
    if (enableSelfConfig && navigator.pluginsConfigPath) {
      mcpServers["autonav-self-config"] = createSelfConfigMcpServer(
        navigator.pluginManager,
        navigator.pluginsConfigPath
      );
    }

    try {
      // Execute query using Claude Agent SDK
      // The SDK handles the agentic loop automatically
      const queryIterator = query({
        prompt,
        options: {
          model: this.options.model,
          maxTurns,
          systemPrompt,
          cwd: navigator.navigatorPath,
          mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
          // Don't load user/project settings - we control everything
          settingSources: [],
          // Allow the SDK to handle permissions
          permissionMode: "bypassPermissions",
        },
      });

      // Collect messages and find the result
      let resultMessage: SDKResultMessage | undefined;
      let lastAssistantText = "";
      let submitAnswerInput: { answer: string; sources: Array<{ file: string; section: string; relevance: string }>; confidence: number } | undefined;

      for await (const message of queryIterator) {
        // Log tool usage for debugging
        if (message.type === "assistant") {
          const content = message.message.content;
          for (const block of content) {
            if (block.type === "tool_use") {
              // Check if this is the submit_answer tool
              if (block.name === SUBMIT_ANSWER_TOOL) {
                // Extract the structured response from tool input
                submitAnswerInput = block.input as typeof submitAnswerInput;
              }
            } else if (block.type === "text") {
              lastAssistantText = block.text;
            }
          }
        }

        // Capture the result message
        if (message.type === "result") {
          resultMessage = message;
        }
      }

      // Check for errors
      if (!resultMessage) {
        throw new Error("No result message received from Claude Agent SDK");
      }

      if (resultMessage.subtype !== "success") {
        const errorDetails = "errors" in resultMessage
          ? resultMessage.errors.join(", ")
          : "Unknown error";
        throw new Error(`Query failed: ${resultMessage.subtype} - ${errorDetails}`);
      }

      // Build the navigator response
      let navigatorResponse: NavigatorResponse;

      if (submitAnswerInput) {
        // Use structured output from tool call (preferred)
        navigatorResponse = NavigatorResponseSchema.parse({
          query: question,
          answer: submitAnswerInput.answer,
          sources: submitAnswerInput.sources,
          confidence: submitAnswerInput.confidence,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Fall back to parsing text response (legacy path)
        const finalText = resultMessage.result || lastAssistantText;

        if (!finalText) {
          throw new Error("No response received from Claude. Expected submit_answer tool call or text response.");
        }

        // Parse the response from text
        navigatorResponse = this.parseResponse(finalText, question);
      }

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
