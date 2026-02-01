/**
 * Migration system
 *
 * Manages versioned migrations that bring navigators up to spec with
 * latest best practices.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Migration, MigrationCheck, MigrationResult } from "./types.js";
import { migration as v1_3_1_submitAnswer } from "./versions/v1.3.1-submit-answer.js";

/**
 * All available migrations in order
 */
const MIGRATIONS: Migration[] = [
  v1_3_1_submitAnswer,
];

/**
 * Get the current version of a navigator
 */
export function getNavigatorVersion(navPath: string): string | null {
  const configPath = path.join(navPath, "config.json");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config.version || null;
  } catch {
    return null;
  }
}

/**
 * Check which migrations are needed for a navigator
 */
export async function checkMigrations(navPath: string): Promise<Array<{ migration: Migration; check: MigrationCheck }>> {
  const needed: Array<{ migration: Migration; check: MigrationCheck }> = [];

  for (const migration of MIGRATIONS) {
    const check = await migration.check(navPath);
    if (check.needed) {
      needed.push({ migration, check });
    }
  }

  return needed;
}

/**
 * Apply a specific migration to a navigator
 */
export async function applyMigration(
  navPath: string,
  migration: Migration,
  confirm: (action: string, details: string) => Promise<boolean>
): Promise<MigrationResult> {
  return migration.apply(navPath, confirm);
}

/**
 * Apply all needed migrations to a navigator
 */
export async function applyAllMigrations(
  navPath: string,
  confirm: (action: string, details: string) => Promise<boolean>
): Promise<{ results: Array<{ migration: Migration; result: MigrationResult }>; success: boolean }> {
  const needed = await checkMigrations(navPath);
  const results: Array<{ migration: Migration; result: MigrationResult }> = [];

  for (const { migration } of needed) {
    const result = await applyMigration(navPath, migration, confirm);
    results.push({ migration, result });

    // Stop if a migration fails
    if (!result.success) {
      break;
    }
  }

  const success = results.every(({ result }) => result.success);

  return { results, success };
}

/**
 * Get all available migrations
 */
export function getAllMigrations(): Migration[] {
  return [...MIGRATIONS];
}

// Re-export types
export type { Migration, MigrationCheck, MigrationResult, ConfirmFn } from "./types.js";
