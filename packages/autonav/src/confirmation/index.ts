import * as readline from "node:readline";
import type { AnalysisResult } from "../repo-analyzer/index.js";
import type { ScanStats } from "../repo-scanner/index.js";

/**
 * Confirmation Module
 *
 * Simple terminal prompt for confirming repository analysis results.
 */

export type ConfirmationResult =
  | { action: "confirm"; analysis: AnalysisResult }
  | { action: "edit" }
  | { action: "abort" };

export type ExistingClaudeMdAction = "integrate" | "overwrite" | "skip";

/**
 * Format the analysis summary for display
 */
function formatAnalysisSummary(
  analysis: AnalysisResult,
  stats: ScanStats
): string {
  const lines = [
    "",
    "I analyzed your repository and found:",
    "",
    `  Purpose: ${analysis.purpose}`,
    `  Scope: ${analysis.scope}`,
    `  Audience: ${analysis.audience}`,
    `  Knowledge paths: ${analysis.suggestedKnowledgePaths.join(", ") || "(none detected)"}`,
    "",
  ];

  // Add stats info
  const strategyInfo =
    stats.strategy === "full"
      ? `Scanned all ${stats.scannedFiles} files`
      : stats.strategy === "truncated"
        ? `Scanned ${stats.scannedFiles}/${stats.totalFiles} files (some truncated)`
        : `Sampled ${stats.scannedFiles}/${stats.totalFiles} files`;
  lines.push(`  (${strategyInfo})`);

  // Add confidence warning if low
  if (analysis.confidence < 0.5) {
    lines.push("");
    lines.push("  ⚠️  Low confidence analysis - repository may lack documentation");
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * Read a single line from stdin
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Show analysis summary and get user confirmation
 *
 * @param analysis - The analysis result from repo-analyzer
 * @param stats - Scan statistics from repo-scanner
 * @returns User's decision: confirm, edit, or abort
 */
export async function confirmAnalysis(
  analysis: AnalysisResult,
  stats: ScanStats
): Promise<ConfirmationResult> {
  // Check if we're in a TTY
  if (!process.stdin.isTTY) {
    // Non-interactive: just return confirm with the analysis
    console.log(formatAnalysisSummary(analysis, stats));
    console.log("Non-interactive mode: proceeding with analysis.\n");
    return { action: "confirm", analysis };
  }

  console.log(formatAnalysisSummary(analysis, stats));

  const answer = await prompt("Does this look correct? [Y/n/edit] ");
  const normalized = answer.trim().toLowerCase();

  if (normalized === "" || normalized === "y" || normalized === "yes") {
    return { action: "confirm", analysis };
  }

  if (normalized === "n" || normalized === "no") {
    return { action: "abort" };
  }

  if (normalized === "edit" || normalized === "e") {
    return { action: "edit" };
  }

  // Default to confirm for unrecognized input
  console.log("Unrecognized input, proceeding with confirmation.\n");
  return { action: "confirm", analysis };
}

/**
 * Prompt user about what to do with an existing CLAUDE.md file
 *
 * @returns User's decision: integrate, overwrite, or skip
 */
export async function promptExistingClaudeMd(): Promise<ExistingClaudeMdAction> {
  console.log("\n⚠️  This repository already has a CLAUDE.md file.\n");
  console.log("How would you like to handle it?");
  console.log("  [i] Integrate - Add autonav reference section to existing file");
  console.log("  [o] Overwrite - Replace with full autonav template");
  console.log("  [s] Skip - Don't modify CLAUDE.md (default)\n");

  // Check if we're in a TTY
  if (!process.stdin.isTTY) {
    console.log("Non-interactive mode: skipping CLAUDE.md modification.\n");
    return "skip";
  }

  const answer = await prompt("Your choice? [i/o/S] ");
  const normalized = answer.trim().toLowerCase();

  if (normalized === "i" || normalized === "integrate") {
    return "integrate";
  }

  if (normalized === "o" || normalized === "overwrite") {
    return "overwrite";
  }

  // Default to skip
  return "skip";
}
