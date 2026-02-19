#!/usr/bin/env node

/**
 * autonav migrate - Migrate navigators to latest version
 *
 * Brings existing navigators up to spec with latest best practices.
 * Migrations are versioned, interactive, and safe.
 *
 * Usage:
 *   autonav migrate <navigator-path> [options]
 *
 * Options:
 *   --yes, -y     Auto-confirm all migrations (use with caution)
 *   --dry-run     Show what would be migrated without making changes
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  checkMigrations,
  applyMigration,
  getNavigatorVersion,
  type Migration,
} from "../migrations/index.js";

interface MigrateOptions {
  yes?: boolean;
  dryRun?: boolean;
}

function printUsage() {
  console.log(`
Usage: autonav migrate <navigator-path> [options]

Migrate a navigator to the latest version.

Options:
  --yes, -y      Auto-confirm all migrations (use with caution)
  --dry-run      Show what would be migrated without making changes
  --help, -h     Show this help message

Examples:
  autonav migrate ~/my-navigator
  autonav migrate ./platform-nav --dry-run
  autonav migrate ~/my-nav --yes
`);
}

/**
 * Ask user for confirmation
 */
async function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Run a migration interactively
 */
async function runMigration(
  navPath: string,
  migration: Migration,
  options: MigrateOptions
): Promise<boolean> {
  console.log(`\n${migration.version} - ${migration.description}`);

  // Create confirm function
  const confirm = async (action: string, details: string): Promise<boolean> => {
    if (options.dryRun) {
      console.log(`  [DRY RUN] Would perform: ${action}`);
      console.log(`  Details: ${details}`);
      return false; // Don't actually apply in dry run
    }

    if (options.yes) {
      console.log(`  ✓ Auto-confirmed: ${action}`);
      return true;
    }

    console.log(`\n  ${action}`);
    console.log(`  ${details}\n`);
    return askConfirm("  Apply this change?");
  };

  // Apply migration
  const result = await applyMigration(navPath, migration, confirm);

  if (options.dryRun) {
    console.log(`  [DRY RUN] Migration complete (no changes made)`);
    return true;
  }

  if (result.success) {
    console.log(`  ✓ ${result.message}`);
    if (result.filesModified.length > 0) {
      console.log(`  Modified: ${result.filesModified.join(", ")}`);
    }
    return true;
  }

  console.error(`  ❌ ${result.message}`);
  if (result.errors && result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`     ${error}`);
    }
  }
  return false;
}

/** Run this command with the given args (called by dispatcher) */
export async function run(args: string[]): Promise<void> {

  // Handle help
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Parse options
  const options: MigrateOptions = {
    yes: args.includes("--yes") || args.includes("-y"),
    dryRun: args.includes("--dry-run"),
  };

  // Get navigator path
  const navPathArg = args.find((arg) => !arg.startsWith("-"));
  if (!navPathArg) {
    console.error("Error: Navigator path required\n");
    printUsage();
    process.exit(1);
  }

  const navPath = path.resolve(navPathArg);

  // Validate navigator
  if (!fs.existsSync(navPath)) {
    console.error(`Error: Navigator not found: ${navPath}`);
    process.exit(1);
  }

  const configPath = path.join(navPath, "config.json");
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Not a valid navigator (missing config.json): ${navPath}`);
    process.exit(1);
  }

  // Get current version
  const currentVersion = getNavigatorVersion(navPath);
  const navName = path.basename(navPath);

  console.log(`\nChecking navigator: ${navName} ${currentVersion ? `(v${currentVersion})` : "(no version)"}`);

  // Check what migrations are needed
  const needed = await checkMigrations(navPath);

  if (needed.length === 0) {
    console.log("\n✓ Navigator is up to date, no migrations needed");
    process.exit(0);
  }

  // Show migrations
  console.log(`\nFound ${needed.length} migration(s) to apply:\n`);
  for (let i = 0; i < needed.length; i++) {
    const item = needed[i];
    if (!item) continue;
    const { migration, check } = item;
    console.log(`${i + 1}. v${migration.version} - ${migration.description}`);
    console.log(`   ${check.reason}`);
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN MODE - No changes will be made]\n");
  }

  // Confirm proceeding
  if (!options.yes && !options.dryRun) {
    console.log();
    const proceed = await askConfirm("Apply these migrations?");
    if (!proceed) {
      console.log("Migration cancelled");
      process.exit(0);
    }
  }

  // Apply migrations
  let allSucceeded = true;
  for (const { migration } of needed) {
    const success = await runMigration(navPath, migration, options);
    if (!success) {
      allSucceeded = false;
      break;
    }
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] No actual changes were made");
    process.exit(0);
  }

  if (allSucceeded) {
    const finalVersion = getNavigatorVersion(navPath);
    console.log(`\n✓ Navigator updated to v${finalVersion}`);
    process.exit(0);
  } else {
    console.log("\n❌ Migration failed");
    process.exit(1);
  }
}
