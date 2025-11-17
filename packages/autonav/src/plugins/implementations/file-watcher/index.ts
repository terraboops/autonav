import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Plugin, PluginHealthStatus } from '../../types.js';
import { watch, FSWatcher } from 'chokidar';
import micromatch from 'micromatch';

// Configuration schema
export const FileWatcherConfigSchema = z.object({
  paths: z.array(z.string()).describe('Directories to watch'),
  patterns: z.array(z.string()).default(['**/*.md']).describe('Glob patterns to match'),
  ignorePatterns: z.array(z.string()).default([
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
  ]).describe('Patterns to ignore'),
  pollInterval: z.number().default(1000).describe('Polling interval in ms'),
});

export type FileWatcherConfig = z.infer<typeof FileWatcherConfigSchema>;

// Event schema
export const FileWatcherEventSchema = z.object({
  type: z.enum(['added', 'changed', 'removed']),
  path: z.string(),
  timestamp: z.string(),
  size: z.number().optional(),
});

export type FileWatcherEvent = z.infer<typeof FileWatcherEventSchema>;

// Action schema (minimal for this plugin)
export const FileWatcherActionSchema = z.object({
  type: z.enum(['refresh', 'clear']),
});

export type FileWatcherAction = z.infer<typeof FileWatcherActionSchema>;

/**
 * Sensitive directories that should never be watched
 */
const FORBIDDEN_PATHS = [
  '/etc',
  '/sys',
  '/proc',
  '/dev',
  '/root',
  '/boot',
  '/var/log',
  '/usr/bin',
  '/usr/sbin',
  '/bin',
  '/sbin',
  process.env.HOME + '/.ssh',
  process.env.HOME + '/.aws',
  process.env.HOME + '/.config',
  '/Windows',
  '/System',
  'C:\\Windows',
  'C:\\System',
];

/**
 * Validate that a path is safe to watch
 * Prevents watching sensitive system directories
 */
function validateSafePath(watchPath: string): void {
  const resolved = path.resolve(watchPath);

  // Check if path starts with any forbidden path
  for (const forbidden of FORBIDDEN_PATHS) {
    if (forbidden && resolved.startsWith(forbidden)) {
      throw new Error(
        `Security: Cannot watch sensitive directory '${watchPath}'. ` +
        `File watcher is restricted to project directories only.`
      );
    }
  }

  // Warn if watching root or very high-level directories
  if (resolved === '/' || resolved === 'C:\\' || resolved.split(path.sep).length <= 2) {
    throw new Error(
      `Security: Cannot watch root or high-level directory '${watchPath}'. ` +
      `Please specify a more specific directory within your project.`
    );
  }
}

/**
 * File System Watcher Plugin
 *
 * Monitors knowledge base files for changes and reports them as events.
 * Useful for keeping navigators aware of documentation updates.
 *
 * Security: Only watches directories within the project scope,
 * prevents watching sensitive system directories.
 */
export class FileWatcherPlugin implements Plugin<
  FileWatcherConfig,
  FileWatcherEvent,
  FileWatcherAction
> {
  readonly name = 'file-watcher';
  readonly version = '1.0.0';
  readonly description = 'Monitor file system changes in knowledge base';
  readonly configSchema = FileWatcherConfigSchema;
  readonly eventSchema = FileWatcherEventSchema;
  readonly actionSchema = FileWatcherActionSchema;

  private config?: FileWatcherConfig;
  private watcher?: FSWatcher;
  private pendingEvents: FileWatcherEvent[] = [];

  async initialize(config: FileWatcherConfig): Promise<void> {
    this.config = config;

    // Validate paths exist and are safe to watch
    for (const watchPath of config.paths) {
      // Security: Validate path is not in sensitive directory
      validateSafePath(watchPath);

      try {
        await fs.access(watchPath);
      } catch {
        throw new Error(`Watch path does not exist: ${watchPath}`);
      }
    }

    // Initialize watcher
    this.watcher = watch(config.paths, {
      ignored: config.ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: config.pollInterval,
      },
    });

    // Set up event listeners
    this.watcher
      .on('add', (filePath) => this.handleEvent('added', filePath))
      .on('change', (filePath) => this.handleEvent('changed', filePath))
      .on('unlink', (filePath) => this.handleEvent('removed', filePath));
  }

  private async handleEvent(type: 'added' | 'changed' | 'removed', filePath: string): Promise<void> {
    // Check if matches patterns
    if (!this.matchesPatterns(filePath)) {
      return;
    }

    let size: number | undefined;
    if (type !== 'removed') {
      try {
        const stats = await fs.stat(filePath);
        size = stats.size;
      } catch {
        // File might have been deleted between event and stat
      }
    }

    this.pendingEvents.push({
      type,
      path: filePath,
      timestamp: new Date().toISOString(),
      size,
    });
  }

  private matchesPatterns(filePath: string): boolean {
    if (!this.config) return false;

    // Use micromatch for efficient and accurate glob pattern matching
    return micromatch.isMatch(filePath, this.config.patterns);
  }

  async listen(): Promise<FileWatcherEvent[]> {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    return events;
  }

  async execute(action: FileWatcherAction): Promise<void> {
    switch (action.type) {
      case 'clear':
        this.pendingEvents = [];
        break;
      case 'refresh':
        // Force re-scan (optional enhancement)
        break;
    }
  }

  async updateConfig(updates: Partial<FileWatcherConfig>): Promise<FileWatcherConfig> {
    if (!this.config) {
      throw new Error('Plugin not initialized');
    }

    const newConfig = { ...this.config, ...updates };

    // Re-initialize with new config
    await this.shutdown();
    await this.initialize(newConfig);

    return newConfig;
  }

  getConfig(): FileWatcherConfig {
    if (!this.config) {
      throw new Error('Plugin not initialized');
    }
    return { ...this.config };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    if (!this.watcher) {
      return {
        healthy: false,
        message: 'Watcher not initialized',
      };
    }

    // Check if watched paths still exist
    const pathsExist = await Promise.all(
      (this.config?.paths || []).map(async (p) => {
        try {
          await fs.access(p);
          return true;
        } catch {
          return false;
        }
      })
    );

    const allPathsExist = pathsExist.every(exists => exists);

    return {
      healthy: allPathsExist,
      message: allPathsExist ? 'All watched paths accessible' : 'Some watched paths missing',
      metadata: {
        watchedPaths: this.config?.paths,
        pendingEvents: this.pendingEvents.length,
      },
    };
  }

  async shutdown(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
    this.pendingEvents = [];
  }
}
