#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  discoverLocalSkills,
  getLocalSkillPath,
  symlinkSkillToGlobal,
  type SymlinkResult,
} from "@autonav/communication-layer";

/**
 * Command line options
 */
interface InstallCommandOptions {
  force?: boolean;
  quiet?: boolean;
  noColor?: boolean;
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name("autonav install")
  .description("Install navigator skills by symlinking local skills to global location")
  .version("1.0.0")
  .argument("[path]", "Path to the navigator directory (default: current directory)", ".")
  .option("-f, --force", "Overwrite existing skills if conflicts detected")
  .option("-q, --quiet", "Suppress output")
  .option("--no-color", "Disable colored output")
  .action(async (navigatorPath: string, options: InstallCommandOptions) => {
    await executeInstall(navigatorPath, options);
  });

/**
 * Execute the install command
 */
async function executeInstall(
  navigatorPath: string,
  options: InstallCommandOptions
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
      console.error("");
      console.error(chalk.dim("To create a new navigator:"));
      console.error(chalk.dim("  autonav init <name>"));
    }
    process.exit(1);
  }

  // Discover local skills
  const localSkills = discoverLocalSkills(resolvedPath);

  if (localSkills.length === 0) {
    if (!options.quiet) {
      console.log(chalk.yellow("No local skills found") + ` in ${resolvedPath}`);
      console.log(chalk.dim("  Skills should be in .autonav/skills/ask-*/"));
      console.log("");
      console.log(chalk.dim("If this navigator was created with an older version:"));
      console.log(chalk.dim("  Skills may only exist globally at ~/.claude/skills/"));
      console.log(chalk.dim("  Re-run 'autonav init' to migrate to local storage."));
    }
    process.exit(0);
  }

  if (!options.quiet) {
    console.log(chalk.bold(`Installing ${localSkills.length} skill(s) from ${resolvedPath}`));
    console.log("");
  }

  // Track results
  const results: SymlinkResult[] = [];
  let hasErrors = false;

  // Install each skill
  for (const skillName of localSkills) {
    const localPath = getLocalSkillPath(resolvedPath, skillName);
    const result = symlinkSkillToGlobal(localPath, skillName, {
      force: options.force,
      quiet: options.quiet,
    });

    results.push(result);

    if (!result.created && result.existed && !options.force) {
      hasErrors = true;
    }
  }

  // Summary
  if (!options.quiet) {
    console.log("");

    const created = results.filter((r) => r.created).length;
    const alreadyLinked = results.filter((r) => r.existed && !r.created).length;

    if (created > 0) {
      console.log(chalk.green(`  ${created} skill(s) installed`));
    }
    if (alreadyLinked > 0) {
      console.log(chalk.dim(`  ${alreadyLinked} skill(s) already linked`));
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

// Parse and execute
program.parse(process.argv);
