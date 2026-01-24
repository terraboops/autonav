#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ClaudeAdapter } from "../adapter/index.js";
import {
  validateResponse,
  formatResponse,
  formatErrorMessage,
  formatWarningMessage,
  formatSuggestion,
  NavigatorLoadError,
  type OutputFormat,
  type ConfidenceLevel,
} from "../query-engine/index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { debugLog, parseDuration } from "./utils.js";

/**
 * Command line options
 */
interface QueryCommandOptions {
  compact?: boolean;
  json?: boolean;
  noColor?: boolean;
  validate?: boolean;
  confidence?: ConfidenceLevel;
  timeout?: number;
  verbose?: boolean;
}

/**
 * Main CLI program
 */
const program = new Command();

program
  .name("autonav query")
  .description("Query a Platform AI navigator")
  .version("1.0.0")
  .argument("<navigator>", "Path to the navigator directory")
  .argument("<question>", "Question to ask the navigator")
  .option("--compact", "Compact output (answer + minimal sources)")
  .option("--json", "Raw JSON output")
  .option("--no-color", "Disable colored output")
  .option("--validate", "Enable strict source validation (fail on missing sources)")
  .option(
    "--confidence <level>",
    "Minimum acceptable confidence (high|medium|low)"
  )
  .option(
    "--timeout <duration>",
    "Query timeout (e.g., 30s, 1m, 1m30s, or milliseconds)",
    parseDuration,
    30000
  )
  .option("--verbose", "Show additional debug information")
  .action(async (navigator: string, question: string, options: QueryCommandOptions) => {
    await executeQuery(navigator, question, options);
  });

/**
 * Execute the query command
 */
async function executeQuery(
  navigatorPath: string,
  question: string,
  options: QueryCommandOptions
): Promise<void> {
  debugLog("executeQuery", "Starting with options:", {
    navigatorPath,
    question: question.substring(0, 50) + (question.length > 50 ? "..." : ""),
    timeout: options.timeout,
    verbose: options.verbose,
  });

  // Disable chalk if noColor is set
  if (options.noColor) {
    chalk.level = 0;
  }

  // Note: No API key check needed - Claude Agent SDK uses Claude Code's OAuth

  // Validate confidence level option
  if (options.confidence) {
    const validLevels: ConfidenceLevel[] = ["high", "medium", "low"];
    if (!validLevels.includes(options.confidence)) {
      console.error(
        formatErrorMessage(
          `Invalid confidence level: ${options.confidence}. Must be one of: ${validLevels.join(", ")}`
        )
      );
      process.exit(1);
    }
  }

  let spinner: ReturnType<typeof ora> | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    // Determine output format
    const format: OutputFormat = options.json
      ? "json"
      : options.compact
        ? "compact"
        : "pretty";

    // Show loading spinner (only in non-JSON mode)
    if (format !== "json") {
      spinner = ora("Loading navigator...").start();
    }

    // Initialize adapter first (we need it for loadNavigator)
    debugLog("executeQuery", "Creating ClaudeAdapter...");
    const adapter = new ClaudeAdapter();

    // Resolve path and validate it exists before loading
    const resolvedPath = path.resolve(navigatorPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new NavigatorLoadError(
        `Navigator directory not found: ${navigatorPath}`,
        { searchedPath: resolvedPath }
      );
    }

    debugLog("executeQuery", "Loading navigator with plugin support...");
    // Load navigator using adapter's method (includes plugin support)
    const navigator = await adapter.loadNavigator(resolvedPath);
    debugLog("executeQuery", "Navigator loaded:", navigator.config.name);

    if (spinner) {
      spinner.succeed(`Loaded: ${chalk.bold(navigator.config.name)}`);
      if (options.verbose) {
        console.error(chalk.dim(`Knowledge base: ${navigator.knowledgeBasePath}`));
      }
      console.error(""); // Blank line
    }

    // Show question (only in non-JSON mode)
    if (format !== "json") {
      console.error(chalk.blue("❓") + " Question: " + chalk.italic(question));
      console.error(""); // Blank line
      spinner = ora("Querying Claude...").start();
    }

    // Execute query with timeout
    debugLog("executeQuery", "Starting query with timeout:", options.timeout, "ms");
    const startTime = Date.now();

    const queryPromise = adapter.query(navigator, question);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        debugLog("executeQuery", "TIMEOUT triggered after", options.timeout, "ms");
        reject(new Error(`Query timed out after ${options.timeout}ms. The query may still be running in the background. Set AUTONAV_DEBUG=1 to see detailed logs.`));
      }, options.timeout);
    });

    const response = await Promise.race([queryPromise, timeoutPromise]);

    // Clear timeout if query completed first
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    const duration = Date.now() - startTime;
    debugLog("executeQuery", "Query completed in", duration, "ms");

    if (spinner) {
      spinner.succeed("Query completed");
      console.error(""); // Blank line
    }

    // Validate response (extended validation from query-engine)
    const validation = validateResponse(response, {
      minimumConfidence: options.confidence,
      strictSourceValidation: options.validate,
      knowledgeBasePath: navigator.knowledgeBasePath,
    });

    // Show warnings (only in non-JSON mode)
    if (format !== "json" && validation.warnings.length > 0) {
      for (const warning of validation.warnings) {
        console.error(formatWarningMessage(warning));
      }
      console.error(""); // Blank line
    }

    // Check if validation failed
    if (!validation.valid) {
      if (format !== "json") {
        console.error(chalk.red.bold("Validation Failed:"));
        console.error("");
        for (const error of validation.errors) {
          console.error(formatErrorMessage(error.message));
        }
        console.error("");

        // Provide helpful suggestions
        if (options.confidence && !validation.confidenceMet) {
          console.error(
            formatSuggestion("Try:", [
              "Rephrase the question more specifically",
              "Check if knowledge base covers this topic",
              `Accept ${validation.confidenceLevel || "lower"} confidence: remove --confidence flag`,
            ])
          );
        }
      }
      process.exit(1);
    }

    // Format and output response
    const formattedOutput = formatResponse(response, {
      format,
      noColor: options.noColor,
      verbose: options.verbose,
    });

    console.log(formattedOutput);

    // Success message (only in non-JSON mode)
    if (format !== "json") {
      console.error(""); // Blank line
      console.error(
        chalk.green("✅") +
          ` Query completed successfully! (${response.sources.length} source${response.sources.length !== 1 ? "s" : ""} cited)`
      );
    }
  } catch (error) {
    // Clear timeout on error
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (spinner) {
      spinner.fail("Query failed");
      console.error(""); // Blank line
    }

    debugLog("executeQuery", "Error caught:", error);

    // Handle different error types
    if (error instanceof NavigatorLoadError) {
      console.error(formatErrorMessage(error.message));
      console.error("");

      // Show helpful suggestions based on error context
      if (error.context?.suggestions) {
        const suggestions = error.context.suggestions as string[];
        if (suggestions.length > 0) {
          console.error(chalk.bold("Did you mean?"));
          for (const suggestion of suggestions) {
            console.error(chalk.dim(`  ./${suggestion}`));
          }
          console.error("");
        }
      }

      if (error.context?.suggestion) {
        console.error(chalk.dim(error.context.suggestion as string));
        console.error("");
      }

      if (error.context?.missingFile === "config.json") {
        console.error(
          formatSuggestion("Create a new navigator:", [
            "autonav init <navigator-name>",
          ])
        );
      }
    } else if (error instanceof Error) {
      console.error(formatErrorMessage(error.message));

      // Timeout error suggestions
      if (error.message.includes("timed out") || timedOut) {
        console.error("");
        console.error(
          formatSuggestion("Try:", [
            `Increase timeout: autonav query "${navigatorPath}" "${question}" --timeout 2m`,
            "Enable debug logging: AUTONAV_DEBUG=1 autonav query ...",
            "Simplify the question",
            "Check knowledge base size",
          ])
        );
      }
    } else {
      console.error(formatErrorMessage(String(error)));
    }

    process.exit(1);
  }
}

// Parse and execute
program.parse(process.argv);
