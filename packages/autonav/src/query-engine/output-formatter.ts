import chalk from "chalk";
import { NavigatorResponse } from "@platform-ai/communication-layer";
import { getConfidenceLevel, type ConfidenceLevel } from "./response-validator.js";

/**
 * Output format mode
 */
export type OutputFormat = "pretty" | "compact" | "json";

/**
 * Output formatting options
 */
export interface OutputFormatOptions {
  /**
   * Output format mode
   */
  format: OutputFormat;

  /**
   * Disable colored output
   */
  noColor?: boolean;

  /**
   * Show verbose information (debug mode)
   */
  verbose?: boolean;
}

/**
 * Format a navigator response for display
 *
 * @param response - Navigator response to format
 * @param options - Formatting options
 * @returns Formatted string for display
 */
export function formatResponse(
  response: NavigatorResponse,
  options: OutputFormatOptions
): string {
  // Disable chalk if noColor is set
  if (options.noColor) {
    chalk.level = 0;
  }

  switch (options.format) {
    case "json":
      return formatJSON(response);
    case "compact":
      return formatCompact(response);
    case "pretty":
    default:
      return formatPretty(response, options.verbose);
  }
}

/**
 * Format response as JSON
 */
function formatJSON(response: NavigatorResponse): string {
  return JSON.stringify(response, null, 2);
}

/**
 * Format response in compact mode
 * Answer + minimal source citations in brackets
 */
function formatCompact(response: NavigatorResponse): string {
  const lines: string[] = [];

  // Answer
  lines.push(response.answer);

  // Sources in brackets
  if (response.sources.length > 0) {
    const sourceCitations = response.sources
      .map((source) => source.filePath)
      .join(", ");

    lines.push(`[${sourceCitations}]`);
  }

  return lines.join("\n");
}

/**
 * Format response in pretty mode
 * Clear sections with formatting
 */
function formatPretty(
  response: NavigatorResponse,
  verbose?: boolean
): string {
  const lines: string[] = [];

  // Answer section
  lines.push(chalk.bold.cyan("Answer:"));
  lines.push(response.answer);
  lines.push("");

  // Sources section
  if (response.sources.length > 0) {
    lines.push(chalk.bold.cyan("Sources:"));
    for (const source of response.sources) {
      const filePath = chalk.white(source.filePath);
      const lineInfo = source.lineNumbers
        ? chalk.dim(` (lines ${source.lineNumbers[0]}-${source.lineNumbers[1]})`)
        : "";

      lines.push(`${chalk.green("✓")} ${filePath}${lineInfo}`);

      // Show excerpt if available
      if (source.excerpt) {
        const excerptPreview = source.excerpt.length > 80
          ? source.excerpt.substring(0, 77) + "..."
          : source.excerpt;
        lines.push(chalk.dim(`  "${excerptPreview}"`));
      }

      // Show relevance score if available
      if (source.relevanceScore !== undefined) {
        const scorePercent = (source.relevanceScore * 100).toFixed(0);
        lines.push(chalk.dim(`  Relevance: ${scorePercent}%`));
      }
    }
    lines.push("");
  }

  // Confidence section
  const confidenceLevel = getConfidenceLevel(response.confidence);
  if (confidenceLevel || response.confidence !== undefined) {
    const confidenceColor = getConfidenceColor(confidenceLevel);
    const confidenceText = confidenceLevel || "unknown";
    const confidenceScore = response.confidence !== undefined
      ? ` (${(response.confidence * 100).toFixed(0)}%)`
      : "";

    lines.push(
      `${chalk.bold("Confidence:")} ${confidenceColor(confidenceText)}${confidenceScore}`
    );
    lines.push("");
  }

  // Verbose information
  if (verbose) {
    lines.push(chalk.bold.dim("Debug Information:"));
    lines.push(chalk.dim(`Protocol Version: ${response.protocolVersion}`));
    lines.push(chalk.dim(`Context Size: ${response.contextSize}`));
    if (response.metadata) {
      lines.push(chalk.dim(`Navigator: ${response.metadata.navigatorName || "N/A"}`));
      lines.push(chalk.dim(`Domain: ${response.metadata.domain || "N/A"}`));
      if (response.metadata.responseTimeMs) {
        lines.push(chalk.dim(`Response Time: ${response.metadata.responseTimeMs}ms`));
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Get color function for confidence level
 */
function getConfidenceColor(
  level?: ConfidenceLevel
): typeof chalk.green {
  switch (level) {
    case "high":
      return chalk.green;
    case "medium":
      return chalk.yellow;
    case "low":
      return chalk.red;
    default:
      return chalk.gray;
  }
}

/**
 * Format loading message
 */
export function formatLoadingMessage(navigatorName: string): string {
  return `${chalk.blue("🔍")} Loading navigator: ${chalk.bold(navigatorName)}`;
}

/**
 * Format query message
 */
export function formatQueryMessage(question: string): string {
  return `${chalk.blue("❓")} Question: ${chalk.italic(question)}`;
}

/**
 * Format success message
 */
export function formatSuccessMessage(sourcesCount: number): string {
  return `${chalk.green("✅")} Query completed successfully! (${sourcesCount} source${sourcesCount !== 1 ? "s" : ""} cited)`;
}

/**
 * Format error message
 */
export function formatErrorMessage(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  return `${chalk.red("❌")} Error: ${message}`;
}

/**
 * Format warning message
 */
export function formatWarningMessage(message: string): string {
  return `${chalk.yellow("⚠")} Warning: ${message}`;
}

/**
 * Create a suggestion message with helpful text
 */
export function formatSuggestion(
  title: string,
  suggestions: string[]
): string {
  const lines: string[] = [];
  lines.push(chalk.bold(title));
  for (const suggestion of suggestions) {
    lines.push(`  ${chalk.dim("•")} ${suggestion}`);
  }
  return lines.join("\n");
}
