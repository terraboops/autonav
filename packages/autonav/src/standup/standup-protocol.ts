/**
 * Standup Protocol MCP Servers
 *
 * MCP server factories providing submit_status_report and submit_sync_response
 * tools for the standup report and sync phases respectively.
 */

import { z } from "zod";
import {
  StatusReportSchema,
  SyncResponseSchema,
  type StatusReport,
  type SyncResponse,
} from "./types.js";
import { defineTool, type Harness } from "../harness/index.js";

/**
 * Tool names
 */
export const SUBMIT_STATUS_REPORT_TOOL = "submit_status_report";
export const SUBMIT_SYNC_RESPONSE_TOOL = "submit_sync_response";

const DEBUG = process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1";

/**
 * Recursively strip null values to undefined so Zod .optional() accepts them.
 *
 * Models produce JSON where optional fields are `null` (JSON has no `undefined`).
 * Zod's `.optional()` expects `T | undefined`, rejecting `null`. This mismatch
 * silently breaks MCP tool handlers.
 */
function stripNulls(obj: unknown): unknown {
  if (obj === null) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === "object" && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = stripNulls(value);
    }
    return result;
  }
  return obj;
}

/**
 * Create an MCP server with the submit_status_report tool for the report phase.
 *
 * Each navigator gets its own server instance (separate closure).
 */
export function createReportProtocolMcpServer(harness: Harness) {
  let capturedReport: StatusReport | null = null;

  const submitReportTool = defineTool(
    SUBMIT_STATUS_REPORT_TOOL,
    `Submit your structured status report. This is the ONLY way to deliver your report — the standup loop captures your output exclusively through this tool. Plain text responses are discarded.

Other navigators will read your report in the sync phase to identify blockers they can resolve for you. Be specific: vague blockers cannot be acted on, and vague offers to help will be ignored.`,
    {
      navigatorName: z.string().describe("Your exact navigator name as it appears in config.json"),
      currentFocus: z.string().min(5).describe("Specific feature, system, or problem you are working on right now"),
      recentProgress: z
        .array(z.string())
        .describe("Concrete accomplishments you have evidence for. Each item should be a single sentence."),
      blockers: z
        .array(
          z.object({
            description: z.string().describe("Specific description of what is blocked and why. Include enough detail for another navigator to act on it."),
            needsFrom: z
              .string()
              .nullish()
              .describe(
                "Exact name of the navigator who can help, or 'any' if anyone with relevant expertise could help"
              ),
            severity: z
              .enum(["critical", "moderate", "minor"])
              .describe("critical = completely blocked; moderate = slowed, can work around; minor = inconvenience"),
          })
        )
        .describe("Real blockers preventing progress. Do not include hypothetical risks."),
      canHelpWith: z
        .array(z.string())
        .describe("Concrete capabilities you can offer others. Be specific enough that another navigator can decide whether to ask you."),
      knowledgeGaps: z
        .array(z.string())
        .nullish()
        .describe("Specific areas where you lack knowledge that another navigator might cover"),
    },
    async (args) => {
      if (DEBUG) {
        console.error(`[debug] submit_status_report HANDLER ENTERED`);
        console.error(`[debug] Raw args keys:`, Object.keys(args));
      }
      try {
        const cleaned = stripNulls(args);
        const report = StatusReportSchema.parse(cleaned);
        capturedReport = report;

        const blockerSummary =
          report.blockers.length > 0
            ? `${report.blockers.length} blocker(s) reported.`
            : "No blockers.";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                message: `Status report submitted. ${blockerSummary}`,
                report,
              }),
            },
          ],
          isError: false,
        };
      } catch (error) {
        if (DEBUG) {
          console.error(`[debug] submit_status_report handler error:`, error);
          console.error(`[debug] Raw args:`, JSON.stringify(args, null, 2));
        }
        throw error;
      }
    }
  );

  const { server } = harness.createToolServer("autonav-standup-report", [submitReportTool]);

  return {
    server,
    getCapturedReport: (): StatusReport | null => capturedReport,
    resetCapturedReport: () => {
      capturedReport = null;
    },
  };
}

/**
 * Create an MCP server with the submit_sync_response tool for the sync phase.
 *
 * Each navigator gets its own server instance (separate closure).
 */
export function createSyncProtocolMcpServer(harness: Harness) {
  let capturedSync: SyncResponse | null = null;

  const submitSyncTool = defineTool(
    SUBMIT_SYNC_RESPONSE_TOOL,
    `Submit your structured sync response after reviewing all status reports. This is the ONLY way to deliver your response — the standup loop captures your output exclusively through this tool. Plain text responses are discarded.

Prioritize resolving blockers where \`needsFrom\` matches your name, then those set to "any" that fall in your domain. Assess confidence honestly per resolution.`,
    {
      navigatorName: z.string().describe("Your exact navigator name as it appears in config.json"),
      summary: z.string().min(5).describe("One-paragraph summary of what you contributed in this sync round"),
      blockerResolutions: z
        .array(
          z.object({
            navigatorName: z
              .string()
              .describe("Exact name of the navigator whose blocker you are resolving"),
            blockerDescription: z.string().describe("The blocker description as written in their report, so it can be matched"),
            resolution: z
              .string()
              .describe("Actionable resolution: what the navigator should do, with enough detail to act on immediately"),
            artifactPath: z
              .string()
              .nullish()
              .describe(
                "Absolute path to any artifact you wrote to the standup directory to support this resolution"
              ),
            confidence: z
              .enum(["high", "medium", "low"])
              .describe("high = certain this resolves it; medium = likely helpful, should verify; low = best-effort suggestion"),
          })
        )
        .describe("One entry per blocker you addressed. Do not duplicate resolutions already provided by previous sync responses."),
      newInsights: z
        .array(z.string())
        .nullish()
        .describe("Cross-cutting insights from reviewing all reports together (e.g., conflicting approaches, shared dependencies, collaboration opportunities)"),
      followUpNeeded: z
        .boolean()
        .describe("true only if unresolved critical blockers remain or your resolution requires confirmation from the other navigator"),
    },
    async (args) => {
      try {
        const cleaned = stripNulls(args);
        const sync = SyncResponseSchema.parse(cleaned);
        capturedSync = sync;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                message: `Sync response submitted with ${sync.blockerResolutions.length} blocker resolution(s).`,
                sync,
              }),
            },
          ],
          isError: false,
        };
      } catch (error) {
        if (DEBUG) {
          console.error(`[debug] submit_sync_response handler error:`, error);
          console.error(`[debug] Raw args:`, JSON.stringify(args, null, 2));
        }
        throw error;
      }
    }
  );

  const { server } = harness.createToolServer("autonav-standup-sync", [submitSyncTool]);

  return {
    server,
    getCapturedSync: (): SyncResponse | null => capturedSync,
    resetCapturedSync: () => {
      capturedSync = null;
    },
  };
}
