import { z } from 'zod';

/**
 * Base plugin interface that all plugins must implement.
 * Plugins provide bidirectional communication between navigators and external systems.
 */
export interface Plugin<TConfig = unknown, TEvent = unknown, TAction = unknown> {
  /** Unique plugin identifier (e.g., "slack", "github") */
  readonly name: string;

  /** Semantic version (e.g., "1.0.0") */
  readonly version: string;

  /** Human-readable description */
  readonly description: string;

  /** Zod schema for validating plugin configuration */
  readonly configSchema: z.ZodType<TConfig, any, any>;

  /** Zod schema for validating events (input) */
  readonly eventSchema: z.ZodType<TEvent, any, any>;

  /** Zod schema for validating actions (output) */
  readonly actionSchema: z.ZodType<TAction, any, any>;

  /**
   * Initialize the plugin with validated configuration.
   * Called once when plugin is loaded.
   *
   * @param config - Validated configuration from .claude/plugins.json
   * @throws PluginInitializationError if initialization fails
   */
  initialize(config: TConfig): Promise<void>;

  /**
   * Listen for events from the external system.
   * Called periodically by the plugin manager (or on-demand).
   *
   * @returns Array of events that occurred since last check
   * @throws PluginListenError if listening fails
   */
  listen(): Promise<TEvent[]>;

  /**
   * Execute an action on the external system.
   * Called when navigator requests plugin action.
   *
   * @param action - Validated action to execute
   * @returns Result of the action (plugin-specific)
   * @throws PluginActionError if action execution fails
   */
  execute(action: TAction): Promise<unknown>;

  /**
   * Update plugin configuration.
   * Allows navigators to self-configure via conversation.
   *
   * @param updates - Partial configuration updates
   * @returns Updated full configuration
   * @throws PluginConfigurationError if update fails
   */
  updateConfig(updates: Partial<TConfig>): Promise<TConfig>;

  /**
   * Get current plugin configuration.
   * Used for displaying settings to navigator.
   *
   * @returns Current configuration
   */
  getConfig(): TConfig;

  /**
   * Check if plugin is healthy and operational.
   * Called during health checks.
   *
   * @returns Health status with optional details
   */
  healthCheck(): Promise<PluginHealthStatus>;

  /**
   * Clean up resources when plugin is disabled or navigator shuts down.
   * Called once during shutdown.
   */
  shutdown(): Promise<void>;
}

/**
 * Plugin health status
 */
export interface PluginHealthStatus {
  healthy: boolean;
  message?: string;
  lastError?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Base plugin errors for standardized error handling
 */
export class PluginError extends Error {
  constructor(
    public readonly pluginName: string,
    message: string,
    public readonly originalError?: Error
  ) {
    super(`[${pluginName}] ${message}`);
    this.name = 'PluginError';
  }
}

export class PluginInitializationError extends PluginError {
  constructor(pluginName: string, message: string, originalError?: Error) {
    super(pluginName, `Initialization failed: ${message}`, originalError);
    this.name = 'PluginInitializationError';
  }
}

export class PluginListenError extends PluginError {
  constructor(pluginName: string, message: string, originalError?: Error) {
    super(pluginName, `Listen failed: ${message}`, originalError);
    this.name = 'PluginListenError';
  }
}

export class PluginActionError extends PluginError {
  constructor(pluginName: string, message: string, originalError?: Error) {
    super(pluginName, `Action execution failed: ${message}`, originalError);
    this.name = 'PluginActionError';
  }
}

export class PluginConfigurationError extends PluginError {
  constructor(pluginName: string, message: string, originalError?: Error) {
    super(pluginName, `Configuration update failed: ${message}`, originalError);
    this.name = 'PluginConfigurationError';
  }
}
