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
  createChibiSkills,
  isChibiAvailable,
} from "../skill-generator/index.js";

/**
 * Command line options
 */
interface InstallCommandOptions {
  force?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  chibi?: boolean;
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
  .option("--chibi", "Also create chibi-compatible skills in ~/.chibi/skills/")
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

    if (!result.success && result.action !== "already_linked") {
      hasErrors = true;
    }
  }

  // Summary
  if (!options.quiet) {
    console.log("");

    const created = results.filter((r) => r.action === "created").length;
    const alreadyLinked = results.filter((r) => r.action === "already_linked").length;
    const conflicts = results.filter((r) => r.action === "conflict").length;
    const errors = results.filter((r) => r.action === "error").length;

    if (created > 0) {
      console.log(chalk.green(`  ${created} skill(s) installed`));
    }
    if (alreadyLinked > 0) {
      console.log(chalk.dim(`  ${alreadyLinked} skill(s) already linked`));
    }
    if (conflicts > 0) {
      console.log(chalk.yellow(`  ${conflicts} conflict(s) - use --force to overwrite`));
    }
    if (errors > 0) {
      console.log(chalk.red(`  ${errors} error(s)`));
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  // Handle chibi skill installation if requested
  if (options.chibi) {
    if (!options.quiet) {
      console.log("");
      console.log(chalk.bold("Installing chibi skills..."));
    }

    // Check if chibi is available
    if (!isChibiAvailable()) {
      if (!options.quiet) {
        console.log(chalk.yellow("Note:") + " ~/.chibi directory not found. Creating it anyway.");
        console.log(chalk.dim("  Install chibi and agent-skills plugin for full functionality."));
        console.log(chalk.dim("  See: https://github.com/emesal/chibi"));
      }
    }

    // Load navigator config to get description
    let navigatorName = path.basename(resolvedPath);
    let description = `Knowledge navigator for ${navigatorName}`;
    let scope: string | undefined;
    let audience: string | undefined;

    try {
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);
      if (config.name) navigatorName = config.name;
      if (config.description) description = config.description;
      if (config.scope) scope = config.scope;
      if (config.audience) audience = config.audience;
    } catch {
      // Use defaults if config can't be parsed
    }

    try {
      const chibiResult = await createChibiSkills(
        {
          navigatorName,
          navigatorPath: resolvedPath,
          description,
          scope,
          audience,
        },
        { force: options.force, quiet: options.quiet }
      );

      if (!options.quiet) {
        const created =
          (chibiResult.askSkillDir ? 1 : 0) +
          (chibiResult.updateSkillDir ? 1 : 0);
        if (created > 0) {
          console.log(chalk.green(`  ${created} chibi skill(s) installed`));
        }
      }
    } catch (error) {
      if (!options.quiet) {
        console.log(
          chalk.red("  Error creating chibi skills:") +
            ` ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

// Parse and execute
program.parse(process.argv);
