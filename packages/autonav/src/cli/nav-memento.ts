#!/usr/bin/env node

/**
 * Memento Command CLI
 *
 * Context-clearing iterative development loop that coordinates
 * a navigator (for planning) and a worker (for implementation).
 *
 * Design principle: Git is the only persistent memory. No state files.
 * Each iteration starts fresh with only git history as context.
 *
 * Usage:
 *   autonav memento <code-directory> <nav-directory> [options]
 *
 * Examples:
 *   autonav memento ./my-app ./my-nav --task "Add user auth"
 *   autonav memento ./my-app ./my-nav --branch feature/auth --pr
 *   autonav memento ./my-app ./my-nav --max-iterations 5 --verbose
 */

import { Command } from "commander";
import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import { runMementoLoop } from "../memento/index.js";

/**
 * Command line options
 */
interface MementoCommandOptions {
  pr?: boolean;
  maxIterations?: string;
  promise?: string;
  branch?: string;
  task?: string;
  verbose?: boolean;
  model?: string;
  navModel?: string;
  harness?: string;
}

/**
 * Load task from TASK.md file if it exists
 */
function loadTaskFromFile(codeDirectory: string): string | null {
  const taskPath = path.join(codeDirectory, "TASK.md");

  if (fs.existsSync(taskPath)) {
    return fs.readFileSync(taskPath, "utf-8").trim();
  }

  return null;
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name("autonav memento")
  .description(
    "Context-clearing iterative development loop coordinating navigator and worker agents"
  )
  .version("1.0.0")
  .argument("<code-directory>", "Directory containing code to modify")
  .argument("<nav-directory>", "Directory containing the navigator")
  .option("--pr", "Create and push to a new PR when complete")
  .option(
    "--max-iterations <n>",
    "Maximum iterations (default: 0 = unlimited)",
    "0"
  )
  .option(
    "--promise <text>",
    "Completion signal text",
    "IMPLEMENTATION COMPLETE"
  )
  .option("--branch <name>", "Git branch name for work")
  .option("--task <text>", "Task description (reads TASK.md if not provided)")
  .option("--verbose", "Show detailed logging")
  .option("--model <model>", "Model for worker agent", "claude-haiku-4-5")
  .option("--nav-model <model>", "Model for navigator agent", "claude-opus-4-5")
  .option("--harness <type>", "Agent runtime to use (claude-code|chibi)")
  .action(
    async (
      codeDirectory: string,
      navDirectory: string,
      options: MementoCommandOptions
    ) => {
      await executeMemento(codeDirectory, navDirectory, options);
    }
  );

/**
 * Execute the memento command
 */
async function executeMemento(
  codeDirectory: string,
  navDirectory: string,
  options: MementoCommandOptions
): Promise<void> {
  const verbose = options.verbose ?? false;

  // Resolve paths
  const resolvedCodeDir = path.resolve(codeDirectory);
  const resolvedNavDir = path.resolve(navDirectory);

  // Validate code directory
  if (!fs.existsSync(resolvedCodeDir)) {
    console.error(chalk.red(`Error: Code directory not found: ${resolvedCodeDir}`));
    console.error(chalk.dim(`Create the directory or specify a valid path.`));
    process.exit(1);
  }

  if (!fs.statSync(resolvedCodeDir).isDirectory()) {
    console.error(chalk.red(`Error: Not a directory: ${resolvedCodeDir}`));
    process.exit(1);
  }

  // Validate navigator directory
  if (!fs.existsSync(resolvedNavDir)) {
    console.error(chalk.red(`Error: Navigator directory not found: ${resolvedNavDir}`));
    console.error(chalk.dim(`Use 'autonav init' to create a navigator first.`));
    process.exit(1);
  }

  const claudeMdPath = path.join(resolvedNavDir, "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) {
    console.error(chalk.red(`Error: Navigator CLAUDE.md not found: ${claudeMdPath}`));
    console.error(chalk.dim(`The navigator directory must contain a CLAUDE.md file.`));
    process.exit(1);
  }

  // Get task description
  let task: string | undefined = options.task;

  if (!task) {
    const loadedTask = loadTaskFromFile(resolvedCodeDir);
    if (loadedTask) {
      task = loadedTask;
    }
  }

  // Default task if none provided
  if (!task) {
    task = "Please give me the next unit of work";
  }

  // Parse max iterations
  const maxIterations = parseInt(options.maxIterations || "0", 10);
  if (isNaN(maxIterations) || maxIterations < 0) {
    console.error(chalk.red(`Error: Invalid max-iterations value: ${options.maxIterations}`));
    process.exit(1);
  }

  // Display configuration
  console.log(chalk.bold("\nAutonav Memento Loop"));
  console.log(chalk.dim("─".repeat(40)));
  console.log(`${chalk.blue("Code:")} ${resolvedCodeDir}`);
  console.log(`${chalk.blue("Navigator:")} ${resolvedNavDir}`);
  console.log(`${chalk.blue("Task:")} ${task.substring(0, 80)}${task.length > 80 ? "..." : ""}`);
  if (options.branch) {
    console.log(`${chalk.blue("Branch:")} ${options.branch}`);
  }
  if (maxIterations > 0) {
    console.log(`${chalk.blue("Max iterations:")} ${maxIterations}`);
  }
  if (options.pr) {
    console.log(`${chalk.blue("Create PR:")} Yes`);
  }
  console.log(chalk.dim("─".repeat(40)));

  try {
    // Run the memento loop
    const result = await runMementoLoop(resolvedCodeDir, resolvedNavDir, task, {
      pr: options.pr,
      maxIterations,
      promise: options.promise || "IMPLEMENTATION COMPLETE",
      branch: options.branch,
      verbose,
      model: options.model,
      navModel: options.navModel,
      harness: options.harness,
    });

    // Display results
    console.log(chalk.dim("\n" + "─".repeat(40)));

    if (result.success) {
      console.log(chalk.green.bold("\n✅ Task completed successfully!"));
    } else {
      console.log(chalk.yellow.bold("\n⚠️  Task did not complete"));
    }

    console.log(`${chalk.blue("Iterations:")} ${result.iterations}`);
    console.log(`${chalk.blue("Duration:")} ${formatDuration(result.durationMs)}`);

    if (result.branch) {
      console.log(`${chalk.blue("Branch:")} ${result.branch}`);
    }

    if (result.prUrl) {
      console.log(`${chalk.blue("PR:")} ${result.prUrl}`);
    }

    if (result.completionMessage) {
      console.log(`\n${chalk.green("Message:")} ${result.completionMessage}`);
    }

    if (result.errors && result.errors.length > 0) {
      console.log(chalk.yellow("\nErrors encountered:"));
      for (const error of result.errors) {
        console.log(chalk.dim(`  - ${error}`));
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red("\n❌ Memento loop failed:"));
    console.error(
      chalk.dim(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
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

// Parse and execute
program.parse(process.argv);
