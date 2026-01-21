/**
 * Adapter Factory
 *
 * Creates LLM adapters based on provider selection.
 * Supports multiple providers for the LLM-agnostic vision.
 */

import { ClaudeAdapter, type ClaudeAdapterOptions } from "./claude-adapter.js";
import { OpenCodeAdapter, type OpenCodeAdapterOptions } from "./opencode-adapter.js";
import type { LLMAdapter, Provider, AdapterOptions } from "./types.js";
import { getDefaultModel } from "./types.js";

/**
 * Environment variable for default provider selection
 */
export const PROVIDER_ENV_VAR = "AUTONAV_PROVIDER";

/**
 * Environment variable for model override
 */
export const MODEL_ENV_VAR = "AUTONAV_MODEL";

/**
 * Get the configured provider from environment or default
 */
export function getConfiguredProvider(): Provider {
  const envProvider = process.env[PROVIDER_ENV_VAR]?.toLowerCase();

  if (envProvider === "opencode") {
    return "opencode";
  }

  if (envProvider === "claude") {
    return "claude";
  }

  // Default to Claude
  return "claude";
}

/**
 * Get the configured model from environment or use provider default
 */
export function getConfiguredModel(provider: Provider): string {
  const envModel = process.env[MODEL_ENV_VAR];

  if (envModel) {
    return envModel;
  }

  return getDefaultModel(provider);
}

/**
 * Extended adapter options with provider selection
 */
export interface CreateAdapterOptions extends AdapterOptions {
  /**
   * LLM provider to use
   */
  provider?: Provider;

  /**
   * OpenCode-specific options
   */
  opencode?: Omit<OpenCodeAdapterOptions, keyof AdapterOptions>;

  /**
   * Claude-specific options
   */
  claude?: Omit<ClaudeAdapterOptions, keyof AdapterOptions>;
}

/**
 * Create an LLM adapter based on provider selection
 *
 * Provider selection priority:
 * 1. Explicit `provider` option
 * 2. AUTONAV_PROVIDER environment variable
 * 3. Default: "claude"
 *
 * @param options - Adapter options with optional provider selection
 * @returns Configured LLM adapter
 *
 * @example
 * ```typescript
 * // Use Claude (default)
 * const adapter = createAdapter();
 *
 * // Use OpenCode explicitly
 * const adapter = createAdapter({ provider: 'opencode' });
 *
 * // Use provider from environment
 * process.env.AUTONAV_PROVIDER = 'opencode';
 * const adapter = createAdapter();
 *
 * // With custom model
 * const adapter = createAdapter({
 *   provider: 'opencode',
 *   model: 'openai:gpt-4o'
 * });
 * ```
 */
export function createAdapter(options: CreateAdapterOptions = {}): LLMAdapter {
  const provider = options.provider || getConfiguredProvider();
  const model = options.model || getConfiguredModel(provider);

  switch (provider) {
    case "opencode":
      return new OpenCodeAdapter({
        model,
        maxTurns: options.maxTurns,
        ...options.opencode,
      });

    case "claude":
    default:
      return new ClaudeAdapter({
        model,
        maxTurns: options.maxTurns,
        ...options.claude,
      });
  }
}

/**
 * Check if a provider is available (has required dependencies/CLI)
 *
 * @param provider - Provider to check
 * @returns True if the provider can be used
 */
export async function isProviderAvailable(provider: Provider): Promise<boolean> {
  switch (provider) {
    case "claude":
      // Claude adapter uses the SDK which is bundled
      return true;

    case "opencode":
      // Check if opencode CLI is available
      const { spawn } = await import("node:child_process");
      return new Promise((resolve) => {
        const process = spawn("opencode", ["--version"], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        process.on("close", (code) => {
          resolve(code === 0);
        });

        process.on("error", () => {
          resolve(false);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          process.kill();
          resolve(false);
        }, 5000);
      });

    default:
      return false;
  }
}

/**
 * Get list of all supported providers
 */
export function getSupportedProviders(): Provider[] {
  return ["claude", "opencode"];
}

/**
 * Get human-readable description of a provider
 */
export function getProviderDescription(provider: Provider): string {
  switch (provider) {
    case "claude":
      return "Claude (Anthropic) - via Claude Agent SDK";
    case "opencode":
      return "OpenCode - multi-provider AI CLI tool";
    default:
      return "Unknown provider";
  }
}
