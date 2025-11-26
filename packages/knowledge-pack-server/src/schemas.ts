import { z } from "zod";

/**
 * Knowledge Pack Metadata Schema (v1.0.0)
 *
 * Defines the structure of metadata.json in knowledge packs.
 */
export const PackMetadataSchema = z.object({
  /**
   * Schema version for future compatibility
   */
  $schema: z
    .string()
    .url()
    .default(
      "https://platform-ai.dev/schemas/knowledge-pack-metadata/1.0.0"
    ),

  /**
   * Pack name (must be valid filename: alphanumeric, hyphens, underscores)
   */
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9-_]+$/,
      "Pack name must be lowercase alphanumeric with hyphens or underscores"
    ),

  /**
   * Semantic version (MAJOR.MINOR.PATCH)
   */
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+$/,
      "Version must be semantic version (e.g., 1.0.0)"
    ),

  /**
   * One-sentence description of the pack
   */
  description: z.string().min(10).max(500),

  /**
   * Author name or organization
   */
  author: z.string().optional(),

  /**
   * Pack homepage URL
   */
  homepage: z.string().url().optional(),

  /**
   * Source repository URL
   */
  repository: z.string().url().optional(),

  /**
   * License identifier (SPDX format)
   */
  license: z.string().optional(),

  /**
   * ISO 8601 datetime when pack was first created
   */
  created: z.string().datetime().optional(),

  /**
   * ISO 8601 datetime of last update (required)
   */
  updated: z.string().datetime(),

  /**
   * Compatible Autonav version range (semver)
   * Examples: ">=0.1.0", "^1.0.0", "~1.2.0"
   */
  autonav_version: z.string().optional(),

  /**
   * Categorical tags for discovery
   */
  tags: z.array(z.string()).optional(),

  /**
   * Search keywords
   */
  keywords: z.array(z.string()).optional(),
});

export type PackMetadata = z.infer<typeof PackMetadataSchema>;

/**
 * Version information returned by /versions endpoint
 */
export const VersionInfoSchema = z.object({
  version: z.string(),
  released: z.string().datetime(),
  size: z.number().int().positive(),
  autonav_version: z.string().optional(),
  description: z.string().optional(),
});

export type VersionInfo = z.infer<typeof VersionInfoSchema>;

/**
 * Response from /versions endpoint
 */
export const VersionsResponseSchema = z.object({
  pack: z.string(),
  versions: z.array(VersionInfoSchema),
});

export type VersionsResponse = z.infer<typeof VersionsResponseSchema>;

/**
 * Error response format
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.enum([
    "PACK_NOT_FOUND",
    "VERSION_NOT_FOUND",
    "INVALID_PACK_NAME",
    "INVALID_VERSION",
    "SERVER_ERROR",
  ]),
  message: z.string(),
  pack: z.string().optional(),
  version: z.string().optional(),
  availableVersions: z.array(z.string()).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Helper to create error responses
 */
export function createErrorResponse(
  code: ErrorResponse["code"],
  message: string,
  pack?: string,
  version?: string,
  availableVersions?: string[]
): ErrorResponse {
  return {
    error: code.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" "),
    code,
    message,
    pack,
    version,
    availableVersions,
  };
}

/**
 * Validate pack name format
 */
export function isValidPackName(name: string): boolean {
  return /^[a-z0-9-_]+$/.test(name);
}

/**
 * Validate semantic version format
 */
export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Parse and compare semantic versions
 */
export function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
  const [bMajor, bMinor, bPatch] = b.split(".").map(Number);

  if (aMajor !== bMajor && aMajor !== undefined && bMajor !== undefined) return aMajor - bMajor;
  if (aMinor !== bMinor && aMinor !== undefined && bMinor !== undefined) return aMinor - bMinor;
  if (aPatch !== undefined && bPatch !== undefined) return aPatch - bPatch;
  return 0;
}

/**
 * Get the latest version from a list
 */
export function getLatestVersion(versions: string[]): string | null {
  if (versions.length === 0) return null;
  const sorted = [...versions].sort(compareVersions).reverse();
  return sorted[0] || null;
}
