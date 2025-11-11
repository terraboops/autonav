import { z } from "zod";
import { PROTOCOL_VERSION } from "../version.js";

/**
 * NavigatorConfig schema - configuration for a navigator instance
 *
 * This is typically stored in config.json at the root of a navigator directory.
 */
export const NavigatorConfigSchema = z.object({
  /**
   * Navigator configuration version
   * Follows semantic versioning
   */
  version: z.string().default("1.0.0"),

  /**
   * Unique name for this navigator
   * Should be descriptive and kebab-case
   * Example: "platform-engineering-navigator"
   */
  name: z.string().min(1, "Navigator name is required"),

  /**
   * Human-readable description of what this navigator knows about
   */
  description: z.string().optional(),

  /**
   * Communication Layer protocol version this navigator is compatible with
   * Uses npm-style semver range (e.g., "^1.0.0")
   */
  communicationLayerVersion: z.string().default(`^${PROTOCOL_VERSION}`),

  /**
   * SDK Adapter version required
   * Uses npm-style semver range
   */
  sdkAdapterVersion: z.string().default("^1.0.0"),

  /**
   * Path to the knowledge base directory (relative to navigator root)
   * Defaults to "knowledge-base"
   */
  knowledgeBasePath: z.string().default("knowledge-base"),

  /**
   * Path to the CLAUDE.md instructions file (relative to navigator root)
   * Defaults to "CLAUDE.md"
   */
  instructionsPath: z.string().default("CLAUDE.md"),

  /**
   * When this navigator was created
   */
  createdAt: z.string().datetime().optional(),

  /**
   * When this navigator was last updated
   */
  updatedAt: z.string().datetime().optional(),

  /**
   * Additional configuration options
   * For future extensions without breaking changes
   */
  metadata: z.record(z.unknown()).optional(),
});

export type NavigatorConfig = z.infer<typeof NavigatorConfigSchema>;

/**
 * Helper to create a new NavigatorConfig
 */
export function createNavigatorConfig(
  name: string,
  description?: string,
  options?: Partial<NavigatorConfig>
): NavigatorConfig {
  const now = new Date().toISOString();

  return NavigatorConfigSchema.parse({
    version: "1.0.0",
    name,
    description,
    communicationLayerVersion: `^${PROTOCOL_VERSION}`,
    sdkAdapterVersion: "^1.0.0",
    knowledgeBasePath: "knowledge-base",
    instructionsPath: "CLAUDE.md",
    createdAt: now,
    updatedAt: now,
    ...options,
  });
}
