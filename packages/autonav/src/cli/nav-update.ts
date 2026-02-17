#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { NavigatorAdapter } from "../adapter/index.js";
import {
  loadNavigator,
  formatErrorMessage,
  NavigatorLoadError,
} from "../query-engine/index.js";
import { resolveAndCreateHarness } from "../harness/index.js";

/**
 * Command line options
 */
interface UpdateCommandOptions {
  timeout?: number;
  verbose?: boolean;
  harness?: string;
}

/**
 * Parse a human-readable duration string into milliseconds
 * Supports formats: "30s", "1m", "1m30s", "90", "90000" (plain ms)
 * Max timeout: 10 minutes (600000ms) to prevent overflow issues
 */
function parseDuration(input: string): number {
  const MAX_TIMEOUT_MS = 600000; // 10 minutes

  // Try plain number first (milliseconds)
  const plainNumber = Number(input);
  if (!isNaN(plainNumber) && Number.isFinite(plainNumber)) {
    const ms = Math.floor(plainNumber);
    if (ms <= 0) {
      throw new Error("Timeout must be positive");
    }
    return Math.min(ms, MAX_TIMEOUT_MS);
  }

  // Parse human-readable format: 1m30s, 30s, 2m, etc.
  const pattern = /^(?:(\d+)m)?(?:(\d+)s)?$/i;
  const match = input.trim().match(pattern);

  if (!match || (!match[1] && !match[2])) {
    throw new Error(
      `Invalid duration format: "${input}". Use formats like: 30s, 1m, 1m30s, or milliseconds`
    );
  }

  const minutes = match[1] ? parseInt(match[1], 10) : 0;
  const seconds = match[2] ? parseInt(match[2], 10) : 0;

  // Calculate total milliseconds with overflow protection
  const totalMs = (minutes * 60 + seconds) * 1000;

  if (totalMs <= 0) {
    throw new Error("Timeout must be positive");
  }

  if (totalMs > MAX_TIMEOUT_MS) {
    console.error(`Warning: Timeout capped at 10 minutes (was ${input})`);
    return MAX_TIMEOUT_MS;
  }

  return totalMs;
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name("autonav update")
  .description("Update a Platform AI navigator's documentation")
  .version("1.0.0")
  .argument("<navigator>", "Path to the navigator directory")
  .argument("<message>", "Update message or report")
  .option(
    "--timeout <duration>",
    "Update timeout (e.g., 30s, 1m, 1m30s, or milliseconds)",
    parseDuration,
    120000 // 2 minutes default (longer than query since it may need to write files)
  )
  .option("--verbose", "Show additional debug information")
  .option("--harness <type>", "Agent runtime to use (claude-code|chibi|opencode)")
  .action(async (navigator: string, message: string, options: UpdateCommandOptions) => {
    await executeUpdate(navigator, message, options);
  });

/**
 * Execute the update command
 */
async function executeUpdate(
  navigatorPath: string,
  message: string,
  options: UpdateCommandOptions
): Promise<void> {
  let spinner: ReturnType<typeof ora> | undefined;

  try {
    // Show loading spinner
    spinner = ora("Loading navigator...").start();

    // Load navigator (sync, from query-engine)
    const navigator = loadNavigator(navigatorPath);

    if (spinner) {
      spinner.succeed(`Loaded: ${chalk.bold(navigator.config.name)}`);
      if (options.verbose) {
        console.error(chalk.dim(`Knowledge base: ${navigator.knowledgeBasePath}`));
      }
      console.error(""); // Blank line
    }

    // Initialize adapter with resolved harness
    const harness = await resolveAndCreateHarness(options.harness);
    const adapter = new NavigatorAdapter({ harness });

    // Show update message
    console.error(chalk.blue("📝") + " Update: " + chalk.italic(message));
    console.error(""); // Blank line
    spinner = ora(`${harness.displayName} is updating documentation...`).start();

    // Execute update with timeout
    const updatePromise = adapter.update(navigator, message);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Update timed out after ${options.timeout}ms`));
      }, options.timeout);
    });

    const result = await Promise.race([updatePromise, timeoutPromise]);

    if (spinner) {
      spinner.succeed("Update completed");
      console.error(""); // Blank line
    }

    // Output the result
    console.log(result);

    // Success message
    console.error(""); // Blank line
    console.error(chalk.green("✅") + " Documentation updated successfully!");
  } catch (error) {
    if (spinner) {
      spinner.fail("Update failed");
      console.error(""); // Blank line
    }

    // Handle different error types
    if (error instanceof NavigatorLoadError) {
      console.error(formatErrorMessage(error.message));
      console.error("");

      if (error.context?.missingFile === "config.json") {
        console.error(chalk.dim("Create a new navigator:"));
        console.error(chalk.dim("  autonav init <navigator-name>"));
      }
    } else if (error instanceof Error) {
      console.error(formatErrorMessage(error.message));

      // Timeout error suggestions
      if (error.message.includes("timed out")) {
        console.error("");
        console.error(chalk.bold("Try:"));
        console.error(
          chalk.dim(`  Increase timeout: autonav update "${navigatorPath}" "${message}" --timeout 3m`)
        );
        console.error(chalk.dim("  Simplify the update"));
      }
    } else {
      console.error(formatErrorMessage(String(error)));
    }

    process.exit(1);
  }
}

// Parse and execute
program.parse(process.argv);
