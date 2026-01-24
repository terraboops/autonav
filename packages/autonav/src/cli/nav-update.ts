#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ClaudeAdapter } from "../adapter/index.js";
import {
  formatErrorMessage,
  NavigatorLoadError,
} from "../query-engine/index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { debugLog, parseDuration } from "./utils.js";

/**
 * Command line options
 */
interface UpdateCommandOptions {
  timeout?: number;
  verbose?: boolean;
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
  debugLog("executeUpdate", "Starting with options:", {
    navigatorPath,
    message: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
    timeout: options.timeout,
    verbose: options.verbose,
  });

  let spinner: ReturnType<typeof ora> | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    // Show loading spinner
    spinner = ora("Loading navigator...").start();

    // Initialize adapter first (we need it for loadNavigator)
    debugLog("executeUpdate", "Creating ClaudeAdapter...");
    const adapter = new ClaudeAdapter();

    // Resolve path and validate it exists before loading
    const resolvedPath = path.resolve(navigatorPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new NavigatorLoadError(
        `Navigator directory not found: ${navigatorPath}`,
        { searchedPath: resolvedPath }
      );
    }

    debugLog("executeUpdate", "Loading navigator with plugin support...");
    // Load navigator using adapter's method (includes plugin support)
    const navigator = await adapter.loadNavigator(resolvedPath);
    debugLog("executeUpdate", "Navigator loaded:", navigator.config.name);

    if (spinner) {
      spinner.succeed(`Loaded: ${chalk.bold(navigator.config.name)}`);
      if (options.verbose) {
        console.error(chalk.dim(`Knowledge base: ${navigator.knowledgeBasePath}`));
      }
      console.error(""); // Blank line
    }

    // Show update message
    console.error(chalk.blue("📝") + " Update: " + chalk.italic(message));
    console.error(""); // Blank line
    spinner = ora("Updating documentation...").start();

    // Execute update with timeout
    debugLog("executeUpdate", "Starting update with timeout:", options.timeout, "ms");
    const startTime = Date.now();

    const updatePromise = adapter.update(navigator, message);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        debugLog("executeUpdate", "TIMEOUT triggered after", options.timeout, "ms");
        reject(new Error(`Update timed out after ${options.timeout}ms. The update may still be running in the background. Set AUTONAV_DEBUG=1 to see detailed logs.`));
      }, options.timeout);
    });

    const result = await Promise.race([updatePromise, timeoutPromise]);

    // Clear timeout if update completed first
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    const duration = Date.now() - startTime;
    debugLog("executeUpdate", "Update completed in", duration, "ms");

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
    // Clear timeout on error
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (spinner) {
      spinner.fail("Update failed");
      console.error(""); // Blank line
    }

    debugLog("executeUpdate", "Error caught:", error);

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
      if (error.message.includes("timed out") || timedOut) {
        console.error("");
        console.error(chalk.bold("Try:"));
        console.error(
          chalk.dim(`  Increase timeout: autonav update "${navigatorPath}" "${message}" --timeout 5m`)
        );
        console.error(chalk.dim("  Enable debug logging: AUTONAV_DEBUG=1 autonav update ..."));
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
