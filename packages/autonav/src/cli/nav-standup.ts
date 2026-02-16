#!/usr/bin/env node

/**
 * Standup Command CLI
 *
 * Multi-navigator stand-up mode that orchestrates parallel status reports
 * and sequential blocker sync across multiple navigators.
 *
 * Usage:
 *   autonav standup <nav-dirs...> [options]
 *
 * Examples:
 *   autonav standup ./nav-a ./nav-b --verbose
 *   autonav standup ./nav-a ./nav-b ./nav-c --report-only
 *   autonav standup ./nav-a ./nav-b --max-budget 0.50 --model claude-haiku-4-5
 */

import { Command } from "commander";
import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import { runStandup } from "../standup/index.js";

/**
 * Command line options
 */
interface StandupCommandOptions {
  configDir?: string;
  verbose?: boolean;
  model?: string;
  maxTurns?: string;
  maxBudget?: string;
  reportOnly?: boolean;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name("autonav standup")
  .description(
    "Multi-navigator stand-up: parallel status reports + sequential blocker sync"
  )
  .version("1.0.0")
  .argument("<nav-dirs...>", "Navigator directories (at least 2)")
  .option("--config-dir <path>", "Global config directory (default: ~/.config/autonav)")
  .option("--verbose", "Show detailed logging")
  .option("--model <model>", "Model for agents", "claude-sonnet-4-5")
  .option("--max-turns <n>", "Max turns per agent", "30")
  .option("--max-budget <usd>", "Max cost per agent in USD", "1.0")
  .option("--report-only", "Skip sync phase, only generate reports")
  .action(async (navDirs: string[], options: StandupCommandOptions) => {
    await executeStandup(navDirs, options);
  });

/**
 * Execute the standup command
 */
async function executeStandup(
  navDirs: string[],
  options: StandupCommandOptions
): Promise<void> {
  const verbose = options.verbose ?? false;

  // Validate at least 2 navigators
  if (navDirs.length < 2) {
    console.error(
      chalk.red("Error: Standup requires at least 2 navigators.")
    );
    console.error(
      chalk.dim("Usage: autonav standup <nav1> <nav2> [nav3...] [options]")
    );
    process.exit(1);
  }

  // Resolve and validate directories
  const resolvedDirs = navDirs.map((d) => path.resolve(d));

  for (const dir of resolvedDirs) {
    if (!fs.existsSync(dir)) {
      console.error(chalk.red(`Error: Navigator directory not found: ${dir}`));
      process.exit(1);
    }

    const claudeMdPath = path.join(dir, "CLAUDE.md");
    if (!fs.existsSync(claudeMdPath)) {
      console.error(
        chalk.red(`Error: Navigator CLAUDE.md not found: ${claudeMdPath}`)
      );
      console.error(
        chalk.dim("Each navigator directory must contain a CLAUDE.md file.")
      );
      process.exit(1);
    }
  }

  // Parse numeric options
  const maxTurns = parseInt(options.maxTurns || "30", 10);
  if (isNaN(maxTurns) || maxTurns < 1) {
    console.error(
      chalk.red(`Error: Invalid max-turns value: ${options.maxTurns}`)
    );
    process.exit(1);
  }

  const maxBudgetUsd = parseFloat(options.maxBudget || "1.0");
  if (isNaN(maxBudgetUsd) || maxBudgetUsd <= 0) {
    console.error(
      chalk.red(`Error: Invalid max-budget value: ${options.maxBudget}`)
    );
    process.exit(1);
  }

  // Display config summary
  console.log(chalk.bold("\nAutonav Standup"));
  console.log(chalk.dim("-".repeat(40)));
  console.log(
    `${chalk.blue("Navigators:")} ${resolvedDirs.map((d) => path.basename(d)).join(", ")}`
  );
  console.log(`${chalk.blue("Model:")} ${options.model || "claude-sonnet-4-5"}`);
  console.log(`${chalk.blue("Max turns:")} ${maxTurns}`);
  console.log(`${chalk.blue("Max budget:")} $${maxBudgetUsd.toFixed(2)}/agent`);
  if (options.reportOnly) {
    console.log(`${chalk.blue("Mode:")} Report only (no sync)`);
  }
  if (options.configDir) {
    console.log(`${chalk.blue("Config dir:")} ${options.configDir}`);
  }
  console.log(chalk.dim("-".repeat(40)));

  try {
    const result = await runStandup(resolvedDirs, {
      configDir: options.configDir,
      verbose,
      model: options.model,
      maxTurns,
      maxBudgetUsd,
      reportOnly: options.reportOnly,
    });

    // Print final summary
    console.log(chalk.dim("\n" + "-".repeat(40)));

    if (result.success) {
      console.log(chalk.green.bold("\nStandup complete!"));
    } else {
      console.log(chalk.yellow.bold("\nStandup completed with errors"));
    }

    console.log(`${chalk.blue("Duration:")} ${formatDuration(result.durationMs)}`);
    console.log(`${chalk.blue("Reports:")} ${result.reports.length}`);
    console.log(`${chalk.blue("Sync responses:")} ${result.syncResponses.length}`);

    // Blocker stats
    const totalBlockers = result.reports.reduce(
      (sum, r) => sum + r.blockers.length,
      0
    );
    const totalResolutions = result.syncResponses.reduce(
      (sum, s) => sum + s.blockerResolutions.length,
      0
    );
    console.log(
      `${chalk.blue("Blockers:")} ${totalBlockers} reported, ${totalResolutions} resolved`
    );

    console.log(
      `${chalk.blue("Total cost:")} ${chalk.yellow("$" + result.totalCostUsd.toFixed(4))}`
    );
    console.log(`${chalk.blue("Output:")} ${result.standupDir}`);

    if (result.errors && result.errors.length > 0) {
      console.log(chalk.yellow("\nErrors:"));
      for (const error of result.errors) {
        console.log(chalk.dim(`  - ${error}`));
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red("\nStandup failed:"));
    console.error(
      chalk.dim(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}

/** Run this command with the given args (called by dispatcher) */
export async function run(args: string[]): Promise<void> {
  await program.parseAsync(args, { from: "user" });
}
