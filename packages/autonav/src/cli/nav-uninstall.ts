#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  discoverLocalSkills,
  removeSkillSymlink,
  getSkillSymlinkTarget,
  getLocalSkillPath,
  getGlobalSkillsDir,
} from "@autonav/communication-layer";

/**
 * Command line options
 */
interface UninstallCommandOptions {
  quiet?: boolean;
  noColor?: boolean;
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name("autonav uninstall")
  .description("Uninstall navigator skills by removing global symlinks (preserves local skills)")
  .version("1.0.0")
  .argument("[path]", "Path to the navigator directory (default: current directory)", ".")
  .option("-q, --quiet", "Suppress output")
  .option("--no-color", "Disable colored output")
  .action(async (navigatorPath: string, options: UninstallCommandOptions) => {
    await executeUninstall(navigatorPath, options);
  });

/**
 * Execute the uninstall command
 */
async function executeUninstall(
  navigatorPath: string,
  options: UninstallCommandOptions
): Promise<void> {
  // Disable chalk if noColor is set
  if (options.noColor) {
    chalk.level = 0;
  }

  const resolvedPath = path.resolve(navigatorPath);

  // Validate navigator exists
  const configPath = path.join(resolvedPath, "config.json");
  if (!fs.existsSync(configPath)) {
    if (!options.quiet) {
      console.error(chalk.red("Error:") + ` Not a navigator directory: ${resolvedPath}`);
      console.error(chalk.dim("  Missing config.json"));
    }
    process.exit(1);
  }

  // Discover local skills
  const localSkills = discoverLocalSkills(resolvedPath);

  if (localSkills.length === 0) {
    if (!options.quiet) {
      console.log(chalk.yellow("No local skills found") + ` in ${resolvedPath}`);
      console.log(chalk.dim("  Nothing to uninstall."));
    }
    process.exit(0);
  }

  if (!options.quiet) {
    console.log(chalk.bold(`Uninstalling ${localSkills.length} skill(s) from ${resolvedPath}`));
    console.log("");
  }

  // Track results
  let removed = 0;
  let notLinked = 0;
  let skipped = 0;
  let errors = 0;

  // Uninstall each skill
  for (const skillName of localSkills) {
    const localPath = getLocalSkillPath(resolvedPath, skillName);
    const globalPath = path.join(getGlobalSkillsDir(), skillName);

    // Check if the symlink points to THIS navigator
    const target = getSkillSymlinkTarget(skillName);

    if (!target) {
      // No symlink exists or it's not a symlink
      if (!fs.existsSync(globalPath)) {
        notLinked++;
        if (!options.quiet) {
          console.log(chalk.dim(`  ${skillName}: not linked`));
        }
      } else {
        // Regular directory exists - skip it
        skipped++;
        if (!options.quiet) {
          console.log(
            chalk.yellow(`  ${skillName}: skipped (not a symlink, may belong to another nav)`)
          );
        }
      }
      continue;
    }

    // Check if symlink points to our local path
    const resolvedTarget = path.resolve(path.dirname(globalPath), target);
    if (resolvedTarget !== localPath) {
      skipped++;
      if (!options.quiet) {
        console.log(chalk.yellow(`  ${skillName}: skipped (points to different location)`));
      }
      continue;
    }

    // Remove the symlink
    const success = removeSkillSymlink(skillName, { quiet: options.quiet });

    if (success) {
      removed++;
    } else {
      errors++;
    }
  }

  // Summary
  if (!options.quiet) {
    console.log("");

    if (removed > 0) {
      console.log(chalk.green(`  ${removed} symlink(s) removed`));
    }
    if (notLinked > 0) {
      console.log(chalk.dim(`  ${notLinked} skill(s) were not linked`));
    }
    if (skipped > 0) {
      console.log(chalk.yellow(`  ${skipped} skill(s) skipped`));
    }
    if (errors > 0) {
      console.log(chalk.red(`  ${errors} error(s)`));
    }

    console.log("");
    console.log(chalk.dim("Local skills preserved in .autonav/skills/"));
    console.log(chalk.dim("Re-run 'autonav install' to restore symlinks."));
  }

  if (errors > 0) {
    process.exit(1);
  }
}

/** Run this command with the given args (called by dispatcher) */
export async function run(args: string[]): Promise<void> {
  await program.parseAsync(args, { from: "user" });
}
