import { z } from 'zod';
import { Plugin, PluginError } from './types.js';

/**
 * Schema for .claude/plugins.json
 */
export const PluginsConfigSchema = z.record(
  z.string(), // Plugin name
  z.object({
    enabled: z.boolean(),
    config: z.record(z.unknown()).optional(), // Plugin-specific config
  })
);

export type PluginsConfig = z.infer<typeof PluginsConfigSchema>;

/**
 * Plugin registry entry
 */
interface PluginRegistration {
  plugin: Plugin;
  enabled: boolean;
  initialized: boolean;
  lastError?: PluginError;
}

/**
 * Manages plugin lifecycle, loading, and coordination.
 */
export class PluginManager {
  private plugins: Map<string, PluginRegistration> = new Map();
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Register a plugin with the manager.
   * Does not initialize it yet.
   *
   * @param plugin - Plugin instance to register
   */
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    this.plugins.set(plugin.name, {
      plugin,
      enabled: false,
      initialized: false,
    });
  }

  /**
   * Load plugin configurations from .claude/plugins.json
   * and initialize all enabled plugins.
   *
   * @param pluginsConfig - Parsed plugins configuration
   */
  async loadPlugins(pluginsConfig: PluginsConfig): Promise<void> {
    for (const [name, config] of Object.entries(pluginsConfig)) {
      const registration = this.plugins.get(name);

      if (!registration) {
        console.warn(`Plugin "${name}" configured but not registered, skipping`);
        continue;
      }

      if (!config.enabled) {
        console.log(`Plugin "${name}" is disabled, skipping`);
        continue;
      }

      try {
        // Validate config against plugin's schema
        const validatedConfig = registration.plugin.configSchema.parse(
          config.config || {}
        );

        // Initialize plugin
        await registration.plugin.initialize(validatedConfig);

        registration.enabled = true;
        registration.initialized = true;
        registration.lastError = undefined;

        console.log(`Plugin "${name}" initialized successfully`);
      } catch (error) {
        const pluginError = new PluginError(
          name,
          `Failed to load: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        );

        registration.lastError = pluginError;
        registration.enabled = false;
        registration.initialized = false;

        console.error(pluginError.message);
        // Continue loading other plugins (fail-safe)
      }
    }
  }

  /**
   * Get all enabled and initialized plugins.
   */
  getEnabledPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
      .filter(reg => reg.enabled && reg.initialized)
      .map(reg => reg.plugin);
  }

  /**
   * Get a specific plugin by name.
   */
  getPlugin(name: string): Plugin | undefined {
    const registration = this.plugins.get(name);
    return registration?.enabled && registration?.initialized
      ? registration.plugin
      : undefined;
  }

  /**
   * Listen to all enabled plugins and gather events.
   * Errors from individual plugins don't fail the entire listen operation.
   */
  async listenAll(): Promise<Map<string, unknown[]>> {
    const events = new Map<string, unknown[]>();

    for (const registration of this.plugins.values()) {
      if (!registration.enabled || !registration.initialized) {
        continue;
      }

      try {
        const pluginEvents = await registration.plugin.listen();
        if (pluginEvents.length > 0) {
          events.set(registration.plugin.name, pluginEvents);
        }
      } catch (error) {
        registration.lastError = new PluginError(
          registration.plugin.name,
          `Listen failed: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        );
        console.error(registration.lastError.message);
        // Continue listening to other plugins
      }
    }

    return events;
  }

  /**
   * Update configuration for a specific plugin.
   * Saves updated config back to .claude/plugins.json.
   */
  async updatePluginConfig(
    name: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const registration = this.plugins.get(name);

    if (!registration) {
      throw new Error(`Plugin "${name}" not found`);
    }

    if (!registration.enabled || !registration.initialized) {
      throw new Error(`Plugin "${name}" is not enabled or initialized`);
    }

    try {
      const updatedConfig = await registration.plugin.updateConfig(updates);

      // Read current plugins.json
      const fs = await import('fs/promises');
      const currentConfig = PluginsConfigSchema.parse(
        JSON.parse(await fs.readFile(this.configPath, 'utf-8'))
      );

      // Update specific plugin config
      currentConfig[name] = {
        enabled: true,
        config: updatedConfig as Record<string, unknown>,
      };

      // Write back
      await fs.writeFile(
        this.configPath,
        JSON.stringify(currentConfig, null, 2),
        'utf-8'
      );

      console.log(`Plugin "${name}" configuration updated`);
    } catch (error) {
      throw new PluginError(
        name,
        `Config update failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Shutdown all plugins gracefully.
   */
  async shutdownAll(): Promise<void> {
    for (const registration of this.plugins.values()) {
      if (registration.initialized) {
        try {
          await registration.plugin.shutdown();
        } catch (error) {
          console.error(
            `Error shutting down plugin "${registration.plugin.name}":`,
            error
          );
        }
      }
    }
  }

  /**
   * Run health checks on all enabled plugins.
   */
  async healthCheckAll(): Promise<Map<string, any>> {
    const statuses = new Map();

    for (const registration of this.plugins.values()) {
      if (registration.enabled && registration.initialized) {
        try {
          const status = await registration.plugin.healthCheck();
          statuses.set(registration.plugin.name, status);
        } catch (error) {
          statuses.set(registration.plugin.name, {
            healthy: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return statuses;
  }
}
