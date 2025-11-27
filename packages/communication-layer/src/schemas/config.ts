import { z } from 'zod';

/**
 * Knowledge Pack Metadata Schema
 *
 * Information about an installed knowledge pack
 */
export const KnowledgePackMetadataSchema = z.object({
  /**
   * Name of the knowledge pack
   */
  name: z.string().describe('Knowledge pack name'),

  /**
   * Version of the knowledge pack
   */
  version: z.string().describe('Knowledge pack version'),

  /**
   * When this knowledge pack was installed
   */
  installedAt: z.string().describe('Installation timestamp'),
});

export type KnowledgePackMetadata = z.infer<typeof KnowledgePackMetadataSchema>;

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
  version: z.string().describe('Config version'),

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
   * When this navigator was created
   */
  created: z.string().describe('Creation timestamp'),

  /**
   * Knowledge pack metadata if one is installed
   * Null if using custom knowledge base
   */
  knowledgePack: KnowledgePackMetadataSchema.nullable().describe('Installed knowledge pack'),

  /**
   * Path to the knowledge base directory
   * Relative to the navigator root directory
   */
  knowledgeBase: z.string().describe('Knowledge base path'),

  /**
   * Path to the instructions file (CLAUDE.md or custom prompt file)
   * Defaults to "CLAUDE.md" if not specified
   */
  instructionsPath: z.string().optional(),

  /**
   * Optional path to system configuration file
   * Used for domain-specific instructions from knowledge packs
   */
  systemConfiguration: z.string().optional().describe('System configuration file path'),

  /**
   * Minimum confidence threshold for responses (0-1)
   * Responses below this threshold may trigger warnings
   */
  confidenceThreshold: z.number().min(0).max(1).optional(),

  /**
   * Plugin configuration settings
   */
  plugins: z.object({
    /**
     * Path to the plugins configuration file
     * Defaults to .claude/plugins.json
     */
    configFile: z.string().describe('Plugin config file path'),
  }).describe('Plugin settings'),
});

export type NavigatorConfig = z.infer<typeof NavigatorConfigSchema>;

/**
 * Helper to create a navigator config
 */
export function createNavigatorConfig(params: {
  name: string;
  description?: string;
  knowledgeBase: string;
  knowledgePack?: KnowledgePackMetadata | null;
  instructionsPath?: string;
  systemConfiguration?: string;
  confidenceThreshold?: number;
  pluginConfigFile?: string;
}): NavigatorConfig {
  const now = new Date().toISOString();

  return NavigatorConfigSchema.parse({
    version: '1.0.0',
    name: params.name,
    description: params.description,
    created: now,
    knowledgePack: params.knowledgePack ?? null,
    knowledgeBase: params.knowledgeBase,
    instructionsPath: params.instructionsPath,
    systemConfiguration: params.systemConfiguration,
    confidenceThreshold: params.confidenceThreshold,
    plugins: {
      configFile: params.pluginConfigFile ?? '.claude/plugins.json',
    },
  });
}
