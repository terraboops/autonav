/**
 * LLM Adapters
 *
 * Execution engines that bridge LLM providers to the Communication Layer protocol.
 * Supports multiple providers for Autonav's LLM-agnostic vision.
 */

// Types and interfaces
export {
  type Provider,
  type LLMAdapter,
  type AdapterOptions,
  type LoadedNavigator,
  type QueryOptions,
  type StreamMessage,
  type StreamCallback,
  type StreamingQueryOptions,
  type AdapterFactory,
  DEFAULT_MODELS,
  getDefaultModel,
} from "./types.js";

// Claude adapter
export {
  ClaudeAdapter,
  type ClaudeAdapterOptions,
} from "./claude-adapter.js";

// OpenCode adapter
export {
  OpenCodeAdapter,
  type OpenCodeAdapterOptions,
} from "./opencode-adapter.js";

// Factory functions
export {
  createAdapter,
  getConfiguredProvider,
  getConfiguredModel,
  isProviderAvailable,
  getSupportedProviders,
  getProviderDescription,
  PROVIDER_ENV_VAR,
  MODEL_ENV_VAR,
  type CreateAdapterOptions,
} from "./factory.js";
