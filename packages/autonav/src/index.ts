/**
 * Platform AI Autonav
 *
 * CLI tools and Claude SDK Adapter for building and querying navigators
 *
 * @packageDocumentation
 */

// Export adapter
export {
  ClaudeAdapter,
  type ClaudeAdapterOptions,
  type LoadedNavigator,
} from "./adapter/index.js";

// Export templates utilities (for programmatic use)
export {
  loadTemplates,
  replaceTemplateVars,
  type Templates,
} from "./templates/index.js";

// Export plugin system
export {
  // Core plugin types
  type Plugin,
  type PluginHealthStatus,
  PluginError,
  PluginInitializationError,
  PluginListenError,
  PluginActionError,
  PluginConfigurationError,
  // Plugin manager
  PluginManager,
  type PluginsConfig,
  createPluginManager,
  // Plugin implementations
  FileWatcherPlugin,
  SlackPlugin,
  GitHubPlugin,
  // Configuration schema
  PluginConfigFileSchema,
  type PluginConfigFile,
} from "./plugins/index.js";

// Export query engine
export * from "./query-engine/index.js";
