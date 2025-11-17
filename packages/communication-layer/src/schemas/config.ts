import { z } from 'zod';
import { COMMUNICATION_LAYER_VERSION } from '../version.js';

/**
 * Navigator Configuration Schema
 *
 * Defines the metadata and settings for a navigator instance.
 */
export const NavigatorConfigSchema = z.object({
  /**
   * Communication layer protocol version this navigator uses
   */
  communicationLayerVersion: z.string().default(COMMUNICATION_LAYER_VERSION),

  /**
   * Unique name for this navigator
   */
  name: z.string().min(1),

  /**
   * Domain this navigator specializes in
   * Examples: "terraform", "kubernetes", "aws", "security", "monitoring"
   */
  domain: z.string().min(1),

  /**
   * Description of what this navigator can help with
   */
  description: z.string().optional(),

  /**
   * Path to the knowledge base directory
   */
  knowledgeBasePath: z.string().min(1),

  /**
   * Path to the instructions file (CLAUDE.md or custom prompt file)
   * Defaults to "CLAUDE.md" if not specified
   */
  instructionsPath: z.string().optional(),

  /**
   * Minimum confidence threshold for responses (0-1)
   * Responses below this threshold trigger LowConfidenceError
   */
  confidenceThreshold: z.number().min(0).max(1).default(0.7),

  /**
   * Maximum context size (in tokens or characters)
   */
  maxContextSize: z.number().int().positive().optional(),

  /**
   * Related domains this navigator can partially answer questions about
   */
  relatedDomains: z.array(z.string()).optional(),

  /**
   * Dependencies on other navigators
   */
  dependencies: z.array(z.string()).optional(),

  /**
   * Custom metadata for operator use
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type NavigatorConfig = z.infer<typeof NavigatorConfigSchema>;

/**
 * Helper to create a navigator config
 */
export function createNavigatorConfig(params: {
  name: string;
  domain: string;
  knowledgeBasePath: string;
  instructionsPath?: string;
  confidenceThreshold?: number;
  description?: string;
  maxContextSize?: number;
  relatedDomains?: string[];
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}): NavigatorConfig {
  return NavigatorConfigSchema.parse({
    ...params,
    communicationLayerVersion: COMMUNICATION_LAYER_VERSION,
  });
}

/**
 * Check if a navigator config is compatible with the current protocol version
 */
export function isCompatibleVersion(config: NavigatorConfig): boolean {
  // For MVP, just log warnings rather than block
  // In future, implement proper semver checking
  return config.communicationLayerVersion === COMMUNICATION_LAYER_VERSION;
}
