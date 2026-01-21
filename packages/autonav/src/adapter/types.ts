/**
 * Adapter Types
 *
 * Common interfaces and types for LLM adapters.
 * This abstraction allows Autonav to support multiple LLM providers.
 */

import type {
  NavigatorConfig,
  NavigatorResponse,
  ValidationResult,
} from "@autonav/communication-layer";
import type { PluginManager } from "../plugins/index.js";

/**
 * Supported LLM providers
 */
export type Provider = "claude" | "opencode";

/**
 * Base adapter configuration options
 */
export interface AdapterOptions {
  /**
   * Model to use for queries (provider-specific format)
   */
  model?: string;

  /**
   * Maximum turns/iterations for agentic loop
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
   * Maximum turns for agentic loop
   */
  maxTurns?: number;
}

/**
 * Message from the LLM during query execution
 */
export interface StreamMessage {
  type: "thinking" | "tool" | "text" | "result" | "error";
  content?: string;
  toolName?: string;
  error?: string;
}

/**
 * Callback for receiving streaming messages during query execution
 */
export type StreamCallback = (message: StreamMessage) => void;

/**
 * Extended query options with streaming support
 */
export interface StreamingQueryOptions extends QueryOptions {
  /**
   * Callback for receiving streaming messages
   */
  onMessage?: StreamCallback;
}

/**
 * LLM Adapter Interface
 *
 * All LLM adapters must implement this interface to be compatible
 * with Autonav's navigator system.
 */
export interface LLMAdapter {
  /**
   * Provider name for identification
   */
  readonly provider: Provider;

  /**
   * Load a navigator from a directory
   *
   * Reads and validates config.json and instructions file.
   * Verifies that the knowledge base directory exists.
   * If .claude/plugins.json exists, initializes configured plugins.
   *
   * @param navigatorPath - Path to the navigator directory
   * @returns Loaded navigator with config, system prompt, paths, and optional plugin manager
   */
  loadNavigator(navigatorPath: string): Promise<LoadedNavigator>;

  /**
   * Execute a query using the LLM
   *
   * Sends the question to the LLM with the navigator's system prompt,
   * handles tool use via the agentic loop, parses the response,
   * and validates it against the knowledge base.
   *
   * @param navigator - Loaded navigator to query
   * @param question - Question to ask
   * @param options - Query options
   * @returns Validated navigator response with answer and sources
   */
  query(
    navigator: LoadedNavigator,
    question: string,
    options?: QueryOptions
  ): Promise<NavigatorResponse>;

  /**
   * Update navigator documentation
   *
   * Sends an update message to the LLM with write permissions enabled.
   * The LLM can edit files in the knowledge base to document progress,
   * add troubleshooting steps, or update existing documentation.
   *
   * @param navigator - Loaded navigator to update
   * @param message - Update message or report
   * @param options - Query options
   * @returns Text response describing what was updated
   */
  update(
    navigator: LoadedNavigator,
    message: string,
    options?: QueryOptions
  ): Promise<string>;

  /**
   * Parse raw response into a NavigatorResponse
   *
   * Extracts JSON from the response text and validates it.
   *
   * @param rawResponse - Raw text response from LLM
   * @param query - Original query
   * @returns Parsed NavigatorResponse
   */
  parseResponse(rawResponse: string, query: string): NavigatorResponse;

  /**
   * Validate a NavigatorResponse
   *
   * Runs comprehensive validation including source checks.
   *
   * @param response - Navigator response to validate
   * @param knowledgeBasePath - Path to knowledge base directory
   * @returns Validation result with errors and warnings
   */
  validate(response: NavigatorResponse, knowledgeBasePath: string): ValidationResult;
}

/**
 * Adapter factory function type
 */
export type AdapterFactory = (options?: AdapterOptions) => LLMAdapter;

/**
 * Default models for each provider
 */
export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: "claude-sonnet-4-20250514",
  opencode: "anthropic:claude-sonnet-4-20250514", // OpenCode uses provider:model format
};

/**
 * Get the default model for a provider
 */
export function getDefaultModel(provider: Provider): string {
  return DEFAULT_MODELS[provider];
}
