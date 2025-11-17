import { PluginManager } from './plugin-manager.js';
import { SlackPlugin } from './implementations/slack/index.js';
import { GitHubPlugin } from './implementations/github/index.js';
import { FileWatcherPlugin } from './implementations/file-watcher/index.js';

// Export types
export * from './types.js';
export * from './plugin-manager.js';
export * from './config-schema.js';

// Export plugin implementations
export { FileWatcherPlugin } from './implementations/file-watcher/index.js';
export { SlackPlugin } from './implementations/slack/index.js';
export { GitHubPlugin } from './implementations/github/index.js';

/**
 * Registry of all available plugins.
 * Extend this to add new built-in plugins.
 */
export const DEFAULT_PLUGINS = [
  FileWatcherPlugin,
  SlackPlugin,
  GitHubPlugin,
] as const;

/**
 * Create a plugin manager with all default plugins registered.
 *
 * @param configPath - Path to .claude/plugins.json
 * @returns Configured PluginManager instance
 */
export function createPluginManager(configPath: string): PluginManager {
  const manager = new PluginManager(configPath);

  for (const PluginClass of DEFAULT_PLUGINS) {
    manager.register(new PluginClass());
  }

  return manager;
}
