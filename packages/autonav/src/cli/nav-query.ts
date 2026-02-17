#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { NavigatorAdapter } from "../adapter/index.js";
import {
  loadNavigator,
  validateResponse,
  formatResponse,
  formatErrorMessage,
  formatWarningMessage,
  formatSuggestion,
  NavigatorLoadError,
  type OutputFormat,
  type ConfidenceLevel,
} from "../query-engine/index.js";
import { HallucinationError } from "@autonav/communication-layer";
import { resolveAndCreateHarness } from "../harness/index.js";

/**
 * Command line options
 */
interface QueryCommandOptions {
  compact?: boolean;
  json?: boolean;
  raw?: boolean;
  noColor?: boolean;
  validate?: boolean;
  confidence?: ConfidenceLevel;
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
  .name("autonav query")
  .description("Query a Platform AI navigator")
  .version("1.0.0")
  .argument("<navigator>", "Path to the navigator directory")
  .argument("<question>", "Question to ask the navigator")
  .option("--compact", "Compact output (answer + minimal sources)")
  .option("--json", "Full JSON output with all response fields")
  .option("--raw", "Output only the answer text, nothing else (for agent-to-agent use)")
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
    300000
  )
  .option("--verbose", "Show additional debug information")
  .option("--harness <type>", "Agent runtime to use (claude-code|chibi)")
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
  // Disable chalk if noColor is set
  if (options.noColor) {
    chalk.level = 0;
  }

  // Check for conflicting format options
  if (options.raw && (options.json || options.compact)) {
    console.error("Error: --raw cannot be combined with --json or --compact");
    process.exit(1);
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

  // Determine output format (needed in both try and catch blocks)
  const format: OutputFormat = options.raw
    ? "raw"
    : options.json
      ? "json"
      : options.compact
        ? "compact"
        : "pretty";

  // Determine if we should show UI elements (spinners, question echo, etc.)
  const showUI = format !== "json" && format !== "raw";

  let spinner: ReturnType<typeof ora> | undefined;

  try {
    // Show loading spinner (only in interactive mode)
    if (showUI) {
      spinner = ora("Loading navigator...").start();
    }

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

    // Show question (only in interactive mode)
    if (showUI) {
      console.error(chalk.blue("❓") + " Question: " + chalk.italic(question));
      console.error(""); // Blank line
      spinner = ora(`Asking ${harness.displayName}...`).start();
    }

    // Execute query with timeout
    const queryPromise = adapter.query(navigator, question);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timed out after ${options.timeout}ms`));
      }, options.timeout);
    });

    const response = await Promise.race([queryPromise, timeoutPromise]);

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

    // Show warnings (only in interactive mode)
    if (showUI && validation.warnings.length > 0) {
      for (const warning of validation.warnings) {
        console.error(formatWarningMessage(warning));
      }
      console.error(""); // Blank line
    }

    // Check if validation failed
    if (!validation.valid) {
      if (showUI) {
        console.error(chalk.red.bold("❌ Validation Failed:"));
        console.error("");
        for (const error of validation.errors) {
          console.error(formatErrorMessage(error.message));

          // Show detected patterns for hallucination errors
          if (error instanceof HallucinationError && error.detectedPatterns.length > 0) {
            console.error("");
            console.error(chalk.yellow("  Detected hallucination patterns:"));
            for (const pattern of error.detectedPatterns) {
              console.error(chalk.dim(`    • ${pattern}`));
            }
          }
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

    // Success message (only in interactive mode)
    if (showUI) {
      console.error(""); // Blank line
      console.error(
        chalk.green("✅") +
          ` Query completed successfully! (${response.sources.length} source${response.sources.length !== 1 ? "s" : ""} cited)`
      );
    }

    // Explicitly exit to terminate any lingering SDK/MCP handles
    process.exit(0);
  } catch (error) {
    // For raw mode, output minimal error to stderr
    if (format === "raw") {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }

    if (spinner) {
      spinner.fail("Query failed");
      console.error(""); // Blank line
    }

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
      if (error.message.includes("timed out")) {
        console.error("");
        console.error(
          formatSuggestion("Try:", [
            `Increase timeout: autonav query "${navigatorPath}" "${question}" --timeout 1m`,
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

/** Run this command with the given args (called by dispatcher) */
export async function run(args: string[]): Promise<void> {
  await program.parseAsync(args, { from: "user" });
}
