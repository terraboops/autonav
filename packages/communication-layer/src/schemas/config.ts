import { z } from 'zod';
import { PROTOCOL_VERSION } from '../version.js';

/**
 * Navigator Configuration Schema
 *
 * Defines the metadata and settings for a navigator instance.
 * This is typically stored in config.json at the navigator root.
 */
export const NavigatorConfigSchema = z.object({
  /**
   * Configuration schema version
   * Follows semantic versioning
   */
  version: z.string().default('1.0.0').describe('Config version'),

  /**
   * Unique name for this navigator
   * Should be descriptive and use kebab-case
   */
  name: z.string().min(1).describe('Navigator name'),

  /**
   * Human-readable description of what this navigator knows about
   */
  description: z.string().optional().describe('Navigator description'),

  /**
   * Communication Layer protocol version this navigator is compatible with
   * Uses npm-style semver range (e.g., "^0.1.0")
   */
  communicationLayerVersion: z.string().default(`^${PROTOCOL_VERSION}`).describe('Communication layer version'),

  /**
   * SDK Adapter version required
   * Uses npm-style semver range
   */
  sdkAdapterVersion: z.string().default('^1.0.0').describe('SDK adapter version'),

  /**
   * Path to the knowledge base directory
   * Relative to the navigator root directory
   */
  knowledgeBasePath: z.string().default('./knowledge').describe('Knowledge base path'),

  /**
   * Path to the instructions file (CLAUDE.md or custom prompt file)
   * Defaults to "CLAUDE.md" if not specified
   */
  instructionsPath: z.string().default('CLAUDE.md').describe('Instructions file path'),

  /**
   * When this navigator was created
   */
  createdAt: z.string().datetime().optional().describe('Creation timestamp'),

  /**
   * When this navigator was last updated
   */
  updatedAt: z.string().datetime().optional().describe('Last update timestamp'),

  /**
   * Additional configuration options
   * For future extensions without breaking changes
   */
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),

  /**
   * Knowledge pack metadata
   * null if navigator was not created from a knowledge pack
   */
  knowledgePack: z.object({
    name: z.string().describe('Knowledge pack name'),
    version: z.string().describe('Knowledge pack version'),
    installedAt: z.string().describe('Installation timestamp'),
  }).nullable().optional().describe('Knowledge pack metadata'),

  /**
   * Additional directories this navigator needs access to (absolute or relative to nav root).
   * Used to sandbox the navigator to only the directories it manages.
   */
  workingDirectories: z.array(z.string()).optional().describe(
    'Additional directories this navigator needs access to (absolute or relative to nav root)'
  ),

  /**
   * Plugin configuration
   */
  plugins: z.object({
    configFile: z.string().describe('Path to plugins config file'),
  }).optional().describe('Plugin configuration'),

  /**
   * Harness (agent runtime) configuration
   */
  harness: z.object({
    type: z.enum(['claude-code', 'chibi', 'opencode']).describe('Agent runtime to use'),
    model: z.string().optional().describe('Model to use (e.g. "opencode/kimi-k2.5-free")'),
  }).optional().describe('Harness configuration'),

  /**
   * Per-operation sandbox profiles.
   *
   * Controls whether kernel-enforced sandboxing is active for each operation.
   * Each harness translates this to its native mechanism:
   *   - ChibiHarness → nono (Landlock/Seatbelt)
   *   - ClaudeCodeHarness → SDK sandbox (Seatbelt/bubblewrap)
   *
   * Defaults: sandbox ON for query/update/chat/standup, OFF for memento.
   * Override per-nav in config.json.
   */
  sandbox: z.object({
    query: z.object({ enabled: z.boolean() }).default({ enabled: true }),
    update: z.object({ enabled: z.boolean() }).default({ enabled: true }),
    chat: z.object({ enabled: z.boolean() }).default({ enabled: true }),
    memento: z.object({ enabled: z.boolean() }).default({ enabled: false }),
    standup: z.object({ enabled: z.boolean() }).default({ enabled: true }),
    /** Tools this navigator always needs, merged into every operation's tool list.
     *  e.g. ["Bash"] to ensure bash is available even in read-only operations,
     *  or ["Bash(linear:*)"] for command-specific patterns. */
    allowedTools: z.array(z.string()).optional().describe('Tools this navigator always needs'),
  }).optional().describe('Per-operation sandbox profiles and navigator tool requirements'),

  /**
   * Related navigators this navigator can query.
   * Names are resolved to paths via the global registry or env vars at runtime.
   */
  relatedNavigators: z.array(z.object({
    name: z.string().min(1).describe('Navigator name (used to generate ask_<name> tool)'),
    description: z.string().optional().describe('What this navigator knows about'),
  })).optional().describe('Navigators this navigator can communicate with'),
});

export type NavigatorConfig = z.infer<typeof NavigatorConfigSchema>;

/**
 * Knowledge Pack Metadata Schema (deprecated - kept for backward compatibility)
 */
export const KnowledgePackMetadataSchema = z.object({
  name: z.string().describe('Knowledge pack name'),
  version: z.string().describe('Knowledge pack version'),
  installedAt: z.string().describe('Installation timestamp'),
});

export type KnowledgePackMetadata = z.infer<typeof KnowledgePackMetadataSchema>;

/**
 * Helper to create a navigator config
 */
export function createNavigatorConfig(params: {
  name: string;
  description?: string;
  knowledgeBasePath?: string;
  instructionsPath?: string;
  metadata?: Record<string, unknown>;
}): NavigatorConfig {
  const now = new Date().toISOString();

  return NavigatorConfigSchema.parse({
    version: '1.0.0',
    name: params.name,
    description: params.description,
    communicationLayerVersion: `^${PROTOCOL_VERSION}`,
    sdkAdapterVersion: '^1.0.0',
    knowledgeBasePath: params.knowledgeBasePath ?? './knowledge',
    instructionsPath: params.instructionsPath ?? 'CLAUDE.md',
    createdAt: now,
    updatedAt: now,
    metadata: params.metadata,
    knowledgePack: null,
    plugins: {
      configFile: './.claude/plugins.json',
    },
  });
}
