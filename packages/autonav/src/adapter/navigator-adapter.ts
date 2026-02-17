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
  scoreToConfidence,
  type ValidationResult,
  type ConfidenceLevel,
} from "@autonav/communication-layer";
import { createPluginManager, PluginManager, PluginConfigFileSchema } from "../plugins/index.js";
import { sanitizeError } from "../plugins/utils/security.js";
import { createSelfConfigMcpServer, createResponseMcpServer, createCrossNavMcpServer, SUBMIT_ANSWER_TOOL } from "../tools/index.js";
import { createRelatedNavsMcpServer } from "../tools/related-navs.js";
import { createRelatedNavsConfigServer } from "../tools/related-navs-config.js";
import { type Harness, ClaudeCodeHarness } from "../harness/index.js";

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
 * Configuration options for Navigator Adapter
 */
export interface NavigatorAdapterOptions {
  /**
   * Claude model to use (defaults to claude-sonnet-4-5)
   */
  model?: string;

  /**
   * Maximum turns for agentic loop
   *
   * The SDK's agentic loop continues until Claude naturally stops responding,
   * or until this limit is reached. MCP tools cannot force early termination -
   * instead, we rely on the system prompt instructing Claude to stop after
   * calling submit_answer.
   *
   * In practice, Claude typically stops within 0-2 turns after calling submit_answer,
   * often stopping immediately on the same turn. This parameter serves as a safety
   * limit to prevent runaway execution in edge cases (e.g., if Claude ignores the
   * stop instruction or enters an unexpected loop).
   *
   * @default 50
   */
  maxTurns?: number;

  /**
   * Pre-created harness instance. If provided, this harness is used directly.
   * If omitted, defaults to ClaudeCodeHarness.
   */
  harness?: Harness;
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
   * Maximum turns for agentic loop
   *
   * The SDK's agentic loop continues until Claude naturally stops responding,
   * or until this limit is reached. MCP tools cannot force early termination -
   * instead, we rely on the system prompt instructing Claude to stop after
   * calling submit_answer.
   *
   * In practice, Claude typically stops within 0-2 turns after calling submit_answer,
   * often stopping immediately on the same turn. This parameter serves as a safety
   * limit to prevent runaway execution in edge cases (e.g., if Claude ignores the
   * stop instruction or enters an unexpected loop).
   *
   * @default 50
   */
  maxTurns?: number;
}

/**
 * Navigator Adapter
 *
 * Bridges Claude Agent SDK to the Communication Layer protocol.
 * Loads navigators, executes queries, and validates responses.
 *
 * @example
 * ```typescript
 * const adapter = new NavigatorAdapter({
 *   model: 'claude-sonnet-4-5'
 * });
 *
 * const navigator = adapter.loadNavigator('./my-navigator');
 * const response = await adapter.query(navigator, 'How do I deploy?');
 * ```
 */
export class NavigatorAdapter {
  private readonly options: { model?: string; maxTurns?: number };
  private readonly harness: Harness;

  /**
   * Create a new Navigator Adapter
   *
   * @param options - Configuration options
   */
  constructor(options: NavigatorAdapterOptions = {}) {
    this.options = {
      // Only set model if explicitly provided — let the harness use its own default otherwise.
      // ClaudeCodeHarness defaults to claude-sonnet-4-5; chibi defaults to free models.
      model: options.model || (options.harness ? undefined : "claude-sonnet-4-5"),
      maxTurns: options.maxTurns ?? 50, // Default: 50 turns max (prevents runaway execution)
    };
    this.harness = options.harness ?? new ClaudeCodeHarness();
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
   * const adapter = new NavigatorAdapter();
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
      config.knowledgeBasePath
    );

    if (!fs.existsSync(knowledgeBasePath)) {
      throw new Error(
        `Knowledge base directory not found: ${config.knowledgeBasePath}\n` +
        `Expected path: ${knowledgeBasePath}\n` +
        `Create the directory and add documentation files for the navigator to search.`
      );
    }

    // Verify knowledge base is a directory
    const kbStats = fs.statSync(knowledgeBasePath);
    if (!kbStats.isDirectory()) {
      throw new Error(
        `Knowledge base path is not a directory: ${config.knowledgeBasePath}\n` +
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
      maxTurns = this.options.maxTurns, // undefined = no limit
    } = options;

    // Validate inputs
    if (!question || question.trim().length === 0) {
      throw new Error('Question cannot be empty');
    }

    // Create the prompt with Agent Identity Protocol
    const prompt = createAnswerQuestionPrompt(
      question,
      navigator.config.description
        ? {
            name: navigator.config.name,
            description: navigator.config.description,
          }
        : undefined
    );

    // Build system prompt with self-config rules if enabled
    let systemPrompt = navigator.systemPrompt;
    if (enableSelfConfig && !systemPrompt.includes("Self-Configuration Capabilities")) {
      systemPrompt = `${navigator.systemPrompt}\n\n${SELF_CONFIG_RULES}`;
    }

    // Set up MCP servers
    const mcpServers: Record<string, unknown> = {};

    // Always add response tools for structured output
    mcpServers["autonav-response"] = createResponseMcpServer(this.harness);

    // Add self-config tools if enabled
    if (enableSelfConfig && navigator.pluginsConfigPath) {
      mcpServers["autonav-self-config"] = createSelfConfigMcpServer(
        navigator.pluginManager,
        navigator.pluginsConfigPath,
        this.harness
      );
    }

    // Add cross-nav query tool so this agent can ask other navigators
    const crossNavMcp = createCrossNavMcpServer(this.harness);
    mcpServers["autonav-cross-nav"] = crossNavMcp.server;

    // Add per-navigator tools for related navigators (ask_<name>)
    if (navigator.config.relatedNavigators && navigator.config.relatedNavigators.length > 0) {
      const relatedNavsMcp = createRelatedNavsMcpServer(
        this.harness,
        navigator.config.relatedNavigators
      );
      if (relatedNavsMcp) {
        mcpServers["autonav-related-navs"] = relatedNavsMcp.server;
      }
    }

    // Add self-config tools for managing related navigators
    const relatedNavsConfigMcp = createRelatedNavsConfigServer(
      navigator.navigatorPath,
      this.harness
    );
    mcpServers["autonav-related-navs-config"] = relatedNavsConfigMcp.server;

    // Debug logging
    const debug = process.env.AUTONAV_DEBUG === "1";
    if (debug) {
      console.error("\n[DEBUG] Query execution starting");
      console.error(`[DEBUG] Model: ${this.options.model}`);
      console.error(`[DEBUG] Max turns: ${maxTurns ?? 'unlimited (timeout only)'}`);
      console.error(`[DEBUG] MCP servers registered: ${Object.keys(mcpServers).join(", ")}`);
      console.error(`[DEBUG] System prompt length: ${systemPrompt.length} chars`);
    }

    // Per-nav sandbox: query defaults to enabled unless explicitly disabled
    const querySandboxEnabled = navigator.config.sandbox?.query?.enabled !== false;

    const session = this.harness.run(
      {
        model: this.options.model,
        maxTurns,
        systemPrompt,
        cwd: navigator.navigatorPath,
        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
        permissionMode: "bypassPermissions",
        stderr: debug ? (data: string) => process.stderr.write(`[harness] ${data}`) : undefined,
        ...(querySandboxEnabled ? {
          sandbox: {
            readPaths: [navigator.navigatorPath],
          },
        } : {}),
      },
      prompt
    );

    try {
      // Collect events and find the result
      let lastAssistantText = "";
      let submitAnswerInput: {
        answer: string;
        sources: Array<{ file: string; section: string; relevance: string }>;
        confidence: 'high' | 'medium' | 'low';
        confidenceReason: string;
        outOfDomain: boolean;
      } | undefined;
      let toolUseCount = 0;
      let submitAnswerToolIndex: number | undefined;
      let resultEvent: Extract<import("../harness/index.js").AgentEvent, { type: "result" }> | undefined;

      for await (const event of session) {
        if (event.type === "tool_use") {
          toolUseCount++;
          if (debug) {
            console.error(`[DEBUG] Tool called: ${event.name}`);
          }
          // Check if this is the submit_answer tool
          // Note: MCP SDK prefixes tool names with server name: "mcp__autonav-response__submit_answer"
          if (event.name === SUBMIT_ANSWER_TOOL || event.name.endsWith(`__${SUBMIT_ANSWER_TOOL}`)) {
            submitAnswerInput = event.input as typeof submitAnswerInput;
            submitAnswerToolIndex = toolUseCount;
            if (debug) {
              console.error(`[DEBUG] submit_answer tool called successfully!`);
            }
          }
        } else if (event.type === "error") {
          if (debug) {
            console.error(`[DEBUG] Error: ${event.message}`);
          }
          // Capture error message so it surfaces in the result
          lastAssistantText = event.message;
        } else if (event.type === "text") {
          lastAssistantText = event.text;
          if (debug) {
            console.error(`[DEBUG] Text response: ${event.text.substring(0, 100)}...`);
          }
        } else if (event.type === "result") {
          resultEvent = event;
          if (debug) {
            console.error(`\n[DEBUG] Result: ${event.success ? "success" : "error"}`);
            console.error(`[DEBUG] Total turns: ${event.numTurns ?? "unknown"}`);
          }
        }
      }

      // Log execution metrics (controlled by AUTONAV_METRICS or AUTONAV_DEBUG)
      const showMetrics = process.env.AUTONAV_METRICS === "1" || debug;
      if (showMetrics && resultEvent) {
        const totalTurns = resultEvent.numTurns ?? toolUseCount;
        console.error(`\n[METRICS] Query completed`);
        console.error(`[METRICS] Total turns: ${totalTurns}`);

        // Track tool calls after submit_answer (diagnostic for termination behavior)
        if (submitAnswerToolIndex !== undefined) {
          const toolsAfterSubmit = toolUseCount - submitAnswerToolIndex;
          console.error(`[METRICS] submit_answer called at tool call: ${submitAnswerToolIndex}`);
          console.error(`[METRICS] Tool calls after submit_answer: ${toolsAfterSubmit}`);

          if (toolsAfterSubmit > 3) {
            console.error(`[METRICS] ⚠️  Claude continued for ${toolsAfterSubmit} tool calls after submit_answer`);
          }
        }

        if (resultEvent.durationMs) {
          console.error(`[METRICS] Duration: ${resultEvent.durationMs}ms`);
        }
        if (resultEvent.durationApiMs) {
          console.error(`[METRICS] API duration: ${resultEvent.durationApiMs}ms`);
        }
        if (resultEvent.costUsd !== undefined) {
          console.error(`[METRICS] Cost: $${resultEvent.costUsd.toFixed(4)}`);
        }
      }

      // Check for errors
      if (!resultEvent) {
        throw new Error("No result received from agent");
      }

      if (!resultEvent.success) {
        throw new Error(`Query failed: ${resultEvent.text || "Unknown error"}`);
      }

      // Build the navigator response
      let navigatorResponse: NavigatorResponse;

      if (submitAnswerInput) {
        // Normalize confidence: accept enum strings ("high"), numeric strings ("0.9"), or numbers (0.9)
        const rawConf = submitAnswerInput.confidence;
        let confidence: ConfidenceLevel;
        if (rawConf === "high" || rawConf === "medium" || rawConf === "low") {
          confidence = rawConf;
        } else {
          const n = Number(rawConf);
          confidence = !isNaN(n) ? scoreToConfidence(n) : "medium";
        }

        // Normalize sources: some harnesses (e.g. OpenCode) pass sources
        // as a JSON string rather than an array, since their tool APIs
        // don't support complex types natively.
        let sources = submitAnswerInput.sources;
        if (typeof sources === "string") {
          try {
            sources = JSON.parse(sources);
          } catch {
            sources = [];
          }
        }

        // Use structured output from tool call (preferred)
        navigatorResponse = NavigatorResponseSchema.parse({
          query: question,
          answer: submitAnswerInput.answer,
          sources,
          confidence,
          confidenceReason: submitAnswerInput.confidenceReason,
          outOfDomain: submitAnswerInput.outOfDomain,
        });
      } else {
        // Fall back to parsing text response (legacy path)
        const finalText = resultEvent.text || lastAssistantText;

        if (!finalText) {
          throw new Error(`${this.harness.displayName} finished without answering — no submit_answer call or text response.`);
        }

        // Parse the response from text
        navigatorResponse = this.parseResponse(finalText, question);
      }

      // NOTE: Validation removed from adapter - happens in CLI/query-engine layer
      // Adapters should be thin wrappers that just return responses
      // The calling code (nav-query.ts) handles validation and error display

      return navigatorResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(
        `${this.harness.displayName} ran into trouble: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      await session.close();
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
   * @returns Text response from the agent describing what was updated
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

    // Per-nav sandbox: update defaults to enabled unless explicitly disabled
    const updateSandboxEnabled = navigator.config.sandbox?.update?.enabled !== false;

    const session = this.harness.run(
      {
        model: this.options.model,
        maxTurns,
        systemPrompt,
        cwd: navigator.navigatorPath,
        permissionMode: "bypassPermissions",
        ...(updateSandboxEnabled ? {
          sandbox: {
            writePaths: [navigator.navigatorPath],
          },
        } : {}),
      },
      message
    );

    try {
      // Collect the result
      let lastAssistantText = "";
      let resultEvent: Extract<import("../harness/index.js").AgentEvent, { type: "result" }> | undefined;

      for await (const event of session) {
        if (event.type === "text") {
          lastAssistantText = event.text;
        }
        if (event.type === "result") {
          resultEvent = event;
        }
      }

      // Check for errors
      if (!resultEvent) {
        throw new Error("No result received from agent");
      }

      if (!resultEvent.success) {
        throw new Error(`Update failed: ${resultEvent.text || "Unknown error"}`);
      }

      // Return the final response text
      return resultEvent.text || lastAssistantText || "Update completed (no response text)";
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(
        `${this.harness.displayName} couldn't complete the update: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Parse Claude's response into a NavigatorResponse
   *
   * Extracts JSON from the response text (either from code blocks or raw JSON)
   * and validates it against the NavigatorResponseSchema.
   *
   * @param rawResponse - Raw text response from the agent
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
