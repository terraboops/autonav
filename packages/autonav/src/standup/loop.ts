/**
 * Standup Loop Core Logic
 *
 * Orchestrates multi-navigator standups in two phases:
 * 1. Parallel report: All navs simultaneously scan their knowledge and report status
 * 2. Sequential sync: Each nav reviews all reports and resolves blockers
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import chalk from "chalk";
import type {
  StandupOptions,
  StandupResult,
  StatusReport,
  SyncResponse,
} from "./types.js";
import { resolveConfigDir, createStandupDir } from "./config.js";
import {
  createReportProtocolMcpServer,
  createSyncProtocolMcpServer,
} from "./standup-protocol.js";
import {
  buildReportSystemPrompt,
  buildReportPrompt,
  buildSyncSystemPrompt,
  buildSyncPrompt,
  type NavigatorIdentity,
} from "./prompts.js";
import {
  type Harness,
  resolveAndCreateHarness,
} from "../harness/index.js";

const DEBUG = process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1";

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log(chalk.dim("[debug]"), ...args);
  }
}

/**
 * Loaded navigator info
 */
interface LoadedNav {
  directory: string;
  name: string;
  description: string;
  systemPrompt: string;
  knowledgeBasePath: string;
  identity: NavigatorIdentity;
  workingDirectories: string[];
  /** Per-operation sandbox profile from config.json */
  sandboxEnabled: boolean;
}

/**
 * Expand ~ to home directory and resolve relative paths from a base
 */
function resolveNavPath(rawPath: string, baseDir: string): string {
  if (rawPath.startsWith("~")) {
    return path.resolve(rawPath.replace(/^~/, os.homedir()));
  }
  return path.resolve(baseDir, rawPath);
}

/**
 * Load a navigator for standup participation
 */
export function loadNavForStandup(dir: string): LoadedNav {
  const directory = path.resolve(dir);

  if (!fs.existsSync(directory)) {
    throw new Error(`Navigator directory not found: ${directory}`);
  }

  const claudeMdPath = path.join(directory, "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) {
    throw new Error(`Navigator CLAUDE.md not found: ${claudeMdPath}`);
  }

  const systemPrompt = fs.readFileSync(claudeMdPath, "utf-8");

  // Load config.json for identity
  const configPath = path.join(directory, "config.json");
  let name = path.basename(directory);
  let description = "";
  let knowledgeBasePath = path.join(directory, "knowledge");
  let workingDirectories: string[] = [];
  let sandboxEnabled = true; // standup defaults to sandbox enabled

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (config.name) name = config.name;
      if (config.description) description = config.description;
      if (config.knowledgeBasePath) {
        knowledgeBasePath = path.resolve(directory, config.knowledgeBasePath);
      }
      if (Array.isArray(config.workingDirectories)) {
        workingDirectories = config.workingDirectories.map((p: string) =>
          resolveNavPath(p, directory)
        );
      }
      // Read per-operation sandbox profile (standup defaults to enabled)
      if (config.sandbox?.standup?.enabled === false) {
        sandboxEnabled = false;
      }
    } catch {
      // Use defaults on parse error
    }
  }

  return {
    directory,
    name,
    description,
    systemPrompt,
    knowledgeBasePath,
    identity: { name, description },
    workingDirectories,
    sandboxEnabled,
  };
}

/**
 * Run the report phase for a single navigator
 */
async function runReportPhase(
  nav: LoadedNav,
  otherNavNames: string[],
  standupDir: string,
  options: StandupOptions,
  harness: Harness
): Promise<{ report: StatusReport; costUsd: number }> {
  const {
    model = "claude-sonnet-4-5",
    maxTurns = 15,
    maxBudgetUsd,
    verbose = false,
  } = options;

  const protocol = createReportProtocolMcpServer(harness);

  const systemPrompt = buildReportSystemPrompt(nav.systemPrompt);
  const prompt = buildReportPrompt(
    {
      navDirectory: nav.directory,
      knowledgeBasePath: nav.knowledgeBasePath,
      otherNavigators: otherNavNames,
    },
    nav.identity
  );

  if (verbose) {
    console.log(`[Report] Querying ${nav.name}...`);
  }

  const agentConfig = {
    model,
    maxTurns,
    systemPrompt,
    cwd: nav.directory,
    additionalDirectories: [...nav.workingDirectories, standupDir],
    permissionMode: "acceptEdits",
    allowedTools: [
      "Read", "Glob", "Grep", "Bash",
      "mcp__autonav-standup-report__submit_status_report",
    ],
    mcpServers: {
      "autonav-standup-report": protocol.server,
    },
    ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
    // Per-nav sandbox: report phase is read-only
    ...(nav.sandboxEnabled ? {
      sandbox: {
        readPaths: [nav.directory, nav.knowledgeBasePath, ...nav.workingDirectories],
      },
    } : {}),
  };

  debug(`[Report:${nav.name}] Agent config:`, JSON.stringify({
    model: agentConfig.model,
    maxTurns: agentConfig.maxTurns,
    cwd: agentConfig.cwd,
    additionalDirectories: agentConfig.additionalDirectories,
    permissionMode: agentConfig.permissionMode,
    mcpServers: Object.keys(agentConfig.mcpServers),
    maxBudgetUsd: agentConfig.maxBudgetUsd,
  }, null, 2));

  const session = harness.run(agentConfig, prompt);

  let costUsd = 0;
  let success = false;
  let errorText = "";

  for await (const event of session) {
    if (event.type === "tool_use") {
      const shortToolName = event.name.split("__").pop() || event.name;
      if (verbose) {
        console.log(`[Report:${nav.name}] Tool: ${shortToolName}`);
      }
      debug(`[Report:${nav.name}] Full tool name: ${event.name}`);
    } else if (event.type === "tool_result") {
      if (event.isError) {
        debug(`[Report:${nav.name}] Tool ERROR result:`, event.content.substring(0, 500));
      } else if (DEBUG) {
        debug(`[Report:${nav.name}] Tool result:`, event.content.substring(0, 300));
      }
    } else if (event.type === "result") {
      success = event.success;
      costUsd = event.costUsd ?? 0;
      if (!event.success) {
        errorText = event.text || "Unknown error";
      }
      debug(`[Report:${nav.name}] Result: success=${event.success}, cost=$${costUsd.toFixed(4)}`);
    }
  }

  debug(`[Report:${nav.name}] Captured report: ${protocol.getCapturedReport() ? "YES" : "NO"}`);

  if (!success) {
    throw new Error(`${nav.name} report failed: ${errorText || "Unknown error"}`);
  }

  const report = protocol.getCapturedReport();
  if (!report) {
    throw new Error(
      `${nav.name} did not submit a status report. Navigator must use the submit_status_report tool.`
    );
  }

  // Write report to file
  const reportPath = path.join(standupDir, "reports", `${nav.name}.md`);
  fs.writeFileSync(reportPath, formatReportMarkdown(report), "utf-8");

  if (verbose) {
    console.log(
      `[Report:${nav.name}] Complete - ${report.blockers.length} blocker(s), cost: $${costUsd.toFixed(4)}`
    );
  }

  return { report, costUsd };
}

/**
 * Run the sync phase for a single navigator
 */
async function runSyncPhase(
  nav: LoadedNav,
  allReports: StatusReport[],
  previousSyncResponses: SyncResponse[],
  standupDir: string,
  otherNavNames: string[],
  options: StandupOptions,
  harness: Harness
): Promise<{ sync: SyncResponse; costUsd: number }> {
  const {
    model = "claude-sonnet-4-5",
    maxTurns = 30,
    maxBudgetUsd,
    verbose = false,
  } = options;

  const protocol = createSyncProtocolMcpServer(harness);

  const systemPrompt = buildSyncSystemPrompt(nav.systemPrompt);
  const prompt = buildSyncPrompt(
    {
      navDirectory: nav.directory,
      knowledgeBasePath: nav.knowledgeBasePath,
      standupDir,
      allReports,
      previousSyncResponses,
      otherNavigators: otherNavNames,
    },
    nav.identity
  );

  if (verbose) {
    console.log(`[Sync] Querying ${nav.name}...`);
  }

  const agentConfig = {
    model,
    maxTurns,
    systemPrompt,
    cwd: nav.directory,
    additionalDirectories: [...nav.workingDirectories, standupDir],
    permissionMode: "acceptEdits",
    allowedTools: [
      "Read", "Write", "Edit", "Glob", "Grep", "Bash",
      "mcp__autonav-standup-sync__submit_sync_response",
    ],
    mcpServers: {
      "autonav-standup-sync": protocol.server,
    },
    ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
    // Per-nav sandbox: sync phase needs write access
    ...(nav.sandboxEnabled ? {
      sandbox: {
        writePaths: [nav.directory, nav.knowledgeBasePath, standupDir],
        readPaths: [...nav.workingDirectories],
      },
    } : {}),
  };

  debug(`[Sync:${nav.name}] Agent config:`, JSON.stringify({
    model: agentConfig.model,
    maxTurns: agentConfig.maxTurns,
    cwd: agentConfig.cwd,
    additionalDirectories: agentConfig.additionalDirectories,
    permissionMode: agentConfig.permissionMode,
    mcpServers: Object.keys(agentConfig.mcpServers),
    maxBudgetUsd: agentConfig.maxBudgetUsd,
  }, null, 2));

  const session = harness.run(agentConfig, prompt);

  let costUsd = 0;
  let success = false;
  let errorText = "";

  for await (const event of session) {
    if (event.type === "tool_use") {
      const shortToolName = event.name.split("__").pop() || event.name;
      if (verbose) {
        console.log(`[Sync:${nav.name}] Tool: ${shortToolName}`);
      }
      debug(`[Sync:${nav.name}] Full tool name: ${event.name}`);
    } else if (event.type === "result") {
      success = event.success;
      costUsd = event.costUsd ?? 0;
      if (!event.success) {
        errorText = event.text || "Unknown error";
      }
      debug(`[Sync:${nav.name}] Result: success=${event.success}, cost=$${costUsd.toFixed(4)}`);
      debug(`[Sync:${nav.name}] Captured sync: ${protocol.getCapturedSync() ? "YES" : "NO"}`);
    }
  }

  if (!success) {
    throw new Error(`${nav.name} sync failed: ${errorText || "Unknown error"}`);
  }

  const sync = protocol.getCapturedSync();
  if (!sync) {
    throw new Error(
      `${nav.name} did not submit a sync response. Navigator must use the submit_sync_response tool.`
    );
  }

  // Write sync response to file
  const syncPath = path.join(standupDir, "sync", `${nav.name}-sync.md`);
  fs.writeFileSync(syncPath, formatSyncMarkdown(sync), "utf-8");

  if (verbose) {
    console.log(
      `[Sync:${nav.name}] Complete - ${sync.blockerResolutions.length} resolution(s), cost: $${costUsd.toFixed(4)}`
    );
  }

  return { sync, costUsd };
}

/**
 * Run a full multi-navigator standup
 */
export async function runStandup(
  navDirs: string[],
  options: StandupOptions = {}
): Promise<StandupResult> {
  const startTime = Date.now();
  const { verbose = false, reportOnly = false } = options;

  // Create harness
  const harness = await resolveAndCreateHarness(options.harness);

  // Resolve config and create standup directory
  const configDir = resolveConfigDir(options.configDir);
  const standupDir = createStandupDir(configDir);

  if (verbose) {
    console.log(`[Standup] Config dir: ${configDir}`);
    console.log(`[Standup] Standup dir: ${standupDir}`);
  }

  // Load all navigators
  const navs = navDirs.map((dir) => loadNavForStandup(dir));
  const navNames = navs.map((n) => n.name);
  const errors: string[] = [];
  let totalCostUsd = 0;

  // === Phase 1: Parallel Report ===
  console.log(
    chalk.bold.blue("\n--- Phase 1: Status Reports ---\n")
  );

  const reportResults = await Promise.allSettled(
    navs.map((nav) => {
      const otherNames = navNames.filter((n) => n !== nav.name);
      return runReportPhase(nav, otherNames, standupDir, options, harness);
    })
  );

  const reports: StatusReport[] = [];

  for (let i = 0; i < reportResults.length; i++) {
    const result = reportResults[i]!;
    const nav = navs[i]!;

    if (result.status === "fulfilled") {
      const { report, costUsd } = result.value;
      reports.push(report);
      totalCostUsd += costUsd;

      console.log(
        `  ${chalk.green("+")} ${chalk.bold(nav.name)} - ` +
          `${report.blockers.length} blocker(s), ` +
          `cost: ${chalk.yellow("$" + costUsd.toFixed(4))}`
      );
    } else {
      const reason = result.reason;
      const errorMsg = `${nav.name} report failed: ${reason instanceof Error ? reason.message : String(reason)}`;
      errors.push(errorMsg);
      console.log(`  ${chalk.red("x")} ${chalk.bold(nav.name)} - ${chalk.red("FAILED")}`);
      if (verbose) {
        console.log(`    ${chalk.dim(errorMsg)}`);
      }
    }
  }

  // Count total blockers
  const totalBlockers = reports.reduce((sum, r) => sum + r.blockers.length, 0);

  // === Phase 2: Sequential Sync ===
  const syncResponses: SyncResponse[] = [];

  if (reportOnly) {
    console.log(chalk.dim("\n  Sync phase skipped (--report-only)\n"));
  } else if (totalBlockers === 0) {
    console.log(chalk.dim("\n  No blockers reported - sync phase skipped\n"));
  } else {
    console.log(
      chalk.bold.blue(`\n--- Phase 2: Sync (${totalBlockers} blocker(s) to resolve) ---\n`)
    );

    for (const nav of navs) {
      const otherNames = navNames.filter((n) => n !== nav.name);

      try {
        const result = await runSyncPhase(
          nav,
          reports,
          syncResponses, // accumulating - each nav sees previous syncs
          standupDir,
          otherNames,
          options,
          harness
        );

        syncResponses.push(result.sync);
        totalCostUsd += result.costUsd;

        console.log(
          `  ${chalk.green("+")} ${chalk.bold(nav.name)} - ` +
            `${result.sync.blockerResolutions.length} resolution(s), ` +
            `cost: ${chalk.yellow("$" + result.costUsd.toFixed(4))}`
        );
      } catch (error) {
        const errorMsg = `${nav.name} sync failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.log(`  ${chalk.red("x")} ${chalk.bold(nav.name)} - ${chalk.red("FAILED")}`);
        if (verbose) {
          console.log(`    ${chalk.dim(errorMsg)}`);
        }
      }
    }
  }

  // Generate summary
  const summaryPath = path.join(standupDir, "summary.md");
  fs.writeFileSync(
    summaryPath,
    formatSummaryMarkdown(reports, syncResponses, totalCostUsd, Date.now() - startTime),
    "utf-8"
  );

  const durationMs = Date.now() - startTime;

  return {
    success: errors.length === 0,
    standupDir,
    reports,
    syncResponses,
    durationMs,
    totalCostUsd,
    contextUtilization: {},
    errors: errors.length > 0 ? errors : undefined,
  };
}

// === Markdown Formatters ===

/**
 * Format a status report as a markdown file
 */
function formatReportMarkdown(report: StatusReport): string {
  const blockersList =
    report.blockers.length > 0
      ? report.blockers
          .map(
            (b) =>
              `- **[${b.severity}]** ${b.description}${b.needsFrom ? ` _(needs: ${b.needsFrom})_` : ""}`
          )
          .join("\n")
      : "_No blockers_";

  const canHelpList =
    report.canHelpWith.length > 0
      ? report.canHelpWith.map((h) => `- ${h}`).join("\n")
      : "_Nothing specific_";

  const gapsSection =
    report.knowledgeGaps && report.knowledgeGaps.length > 0
      ? `\n## Knowledge Gaps\n\n${report.knowledgeGaps.map((g) => `- ${g}`).join("\n")}\n`
      : "";

  return `# Status Report: ${report.navigatorName}

## Current Focus

${report.currentFocus}

## Recent Progress

${report.recentProgress.map((p) => `- ${p}`).join("\n")}

## Blockers

${blockersList}

## Can Help With

${canHelpList}
${gapsSection}`;
}

/**
 * Format a sync response as a markdown file
 */
function formatSyncMarkdown(sync: SyncResponse): string {
  const resolutions =
    sync.blockerResolutions.length > 0
      ? sync.blockerResolutions
          .map(
            (r) =>
              `### For ${r.navigatorName}\n\n` +
              `**Blocker:** ${r.blockerDescription}\n\n` +
              `**Resolution:** ${r.resolution}\n\n` +
              `**Confidence:** ${r.confidence}` +
              (r.artifactPath ? `\n\n**Artifact:** ${r.artifactPath}` : "")
          )
          .join("\n\n---\n\n")
      : "_No blocker resolutions provided_";

  const insights =
    sync.newInsights && sync.newInsights.length > 0
      ? `\n## New Insights\n\n${sync.newInsights.map((i) => `- ${i}`).join("\n")}\n`
      : "";

  return `# Sync Response: ${sync.navigatorName}

## Summary

${sync.summary}

## Blocker Resolutions

${resolutions}
${insights}
## Follow-up Needed

${sync.followUpNeeded ? "Yes - further coordination recommended" : "No - all addressed"}
`;
}

/**
 * Format the summary markdown combining all reports and sync responses
 */
function formatSummaryMarkdown(
  reports: StatusReport[],
  syncResponses: SyncResponse[],
  totalCostUsd: number,
  durationMs: number
): string {
  const participants = reports.map((r) => r.navigatorName).join(", ");

  // Count blockers and resolutions
  const totalBlockers = reports.reduce((sum, r) => sum + r.blockers.length, 0);
  const totalResolutions = syncResponses.reduce(
    (sum, s) => sum + s.blockerResolutions.length,
    0
  );
  const followUpNeeded = syncResponses.some((s) => s.followUpNeeded);

  // Format duration
  const durationStr =
    durationMs < 60000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;

  // Build blocker summary
  let blockerSummary = "";
  if (totalBlockers > 0) {
    blockerSummary = "\n## Blockers\n\n";
    for (const report of reports) {
      for (const blocker of report.blockers) {
        // Check if resolved
        const resolution = syncResponses
          .flatMap((s) => s.blockerResolutions)
          .find(
            (r) =>
              r.navigatorName === report.navigatorName &&
              r.blockerDescription === blocker.description
          );

        const status = resolution
          ? `RESOLVED [${resolution.confidence}]`
          : "UNRESOLVED";

        blockerSummary +=
          `- **${report.navigatorName}**: ${blocker.description} [${blocker.severity}] - **${status}**\n`;
      }
    }
  }

  return `# Standup Summary

**Date:** ${new Date().toISOString().split("T")[0]}
**Participants:** ${participants}
**Duration:** ${durationStr}
**Total Cost:** $${totalCostUsd.toFixed(4)}

## Overview

- **Reports:** ${reports.length}
- **Blockers reported:** ${totalBlockers}
- **Resolutions provided:** ${totalResolutions}
- **Follow-up needed:** ${followUpNeeded ? "Yes" : "No"}
${blockerSummary}
## Reports

${reports.map((r) => `### ${r.navigatorName}\n\n**Focus:** ${r.currentFocus}\n\n**Progress:**\n${r.recentProgress.map((p) => `- ${p}`).join("\n")}`).join("\n\n")}

${syncResponses.length > 0 ? `## Sync Contributions\n\n${syncResponses.map((s) => `### ${s.navigatorName}\n\n${s.summary}`).join("\n\n")}` : ""}

---
_Generated by autonav standup_
`;
}
