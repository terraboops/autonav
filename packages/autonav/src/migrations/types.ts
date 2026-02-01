/**
 * Migration system types
 *
 * Migrations bring existing navigators up to spec with latest best practices.
 * Each migration is versioned, interactive, and safe.
 */

/**
 * User confirmation function
 * @param action - Brief description of the action
 * @param details - Detailed explanation of what will change
 * @returns Promise resolving to true if user confirms, false otherwise
 */
export type ConfirmFn = (action: string, details: string) => Promise<boolean>;

/**
 * Result of checking if a migration is needed
 */
export interface MigrationCheck {
  /** Whether this migration is needed */
  needed: boolean;
  /** Human-readable reason why it's needed (or why not) */
  reason: string;
  /** Current version detected (if applicable) */
  currentVersion?: string;
}

/**
 * Result of applying a migration
 */
export interface MigrationResult {
  /** Whether the migration succeeded */
  success: boolean;
  /** Human-readable message about what happened */
  message: string;
  /** List of files that were modified */
  filesModified: string[];
  /** List of errors encountered (if any) */
  errors?: string[];
}

/**
 * A migration that can be applied to a navigator
 */
export interface Migration {
  /** Semver version this migration brings the navigator to */
  version: string;

  /** Human-readable description of what this migration does */
  description: string;

  /**
   * Check if this migration is needed for the given navigator
   * @param navPath - Absolute path to navigator directory
   * @returns Check result indicating if migration is needed
   */
  check: (navPath: string) => Promise<MigrationCheck>;

  /**
   * Apply this migration to the given navigator
   * @param navPath - Absolute path to navigator directory
   * @param confirm - Function to ask user for confirmation before each change
   * @returns Result of the migration
   */
  apply: (navPath: string, confirm: ConfirmFn) => Promise<MigrationResult>;
}
