import chalk from "chalk";
import { NavigatorResponse, type ConfidenceLevel } from "@autonav/communication-layer";

/**
 * Output format mode
 */
export type OutputFormat = "pretty" | "compact" | "json" | "raw";

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
    case "raw":
      return response.answer;
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

  // Sources in brackets (using file field)
  if (response.sources.length > 0) {
    const sourceCitations = response.sources
      .map((source) => source.file)
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
      const filePath = chalk.white(source.file);
      const sectionInfo = chalk.dim(` (${source.section})`);

      lines.push(`${chalk.green("✓")} ${filePath}${sectionInfo}`);

      // Show relevance
      if (source.relevance) {
        lines.push(chalk.dim(`  Relevance: ${source.relevance}`));
      }
    }
    lines.push("");
  }

  // Confidence section (using enum value directly)
  const confidenceColor = getConfidenceColor(response.confidence);

  lines.push(
    `${chalk.bold("Confidence:")} ${confidenceColor(response.confidence)}`
  );
  if (response.confidenceReason) {
    lines.push(chalk.dim(`  Reason: ${response.confidenceReason}`));
  }
  lines.push("");

  // Out of domain warning
  if (response.outOfDomain) {
    lines.push(chalk.yellow("⚠ This question is outside the navigator's domain"));
    lines.push("");
  }

  // Related topics
  if (response.relatedTopics && response.relatedTopics.length > 0) {
    lines.push(chalk.bold.cyan("Related Topics:"));
    for (const topic of response.relatedTopics) {
      lines.push(`  ${chalk.dim("•")} ${topic}`);
    }
    lines.push("");
  }

  // Verbose information
  if (verbose) {
    lines.push(chalk.bold.dim("Debug Information:"));
    lines.push(chalk.dim(`Protocol Version: ${response.protocolVersion}`));
    if (response.metadata) {
      lines.push(chalk.dim(`Navigator: ${response.metadata.navigatorName || "N/A"}`));
      if (response.metadata.responseTimeMs) {
        lines.push(chalk.dim(`Response Time: ${response.metadata.responseTimeMs}ms`));
      }
      if (response.metadata.filesSearched !== undefined) {
        lines.push(chalk.dim(`Files Searched: ${response.metadata.filesSearched}`));
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
  level: ConfidenceLevel
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
