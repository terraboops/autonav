/**
 * Standup Types
 *
 * Core type definitions for the multi-navigator stand-up mode
 * that orchestrates parallel status reports and sequential blocker sync.
 */

import { z } from "zod";

/**
 * Schema for a blocker reported by a navigator
 */
export const BlockerSchema = z.object({
  description: z.string().describe("What is blocking progress"),
  needsFrom: z
    .string()
    .optional()
    .describe("Navigator name that can help, or 'any' if anyone could help"),
  severity: z.enum(["critical", "moderate", "minor"]).describe("How severely this blocks progress"),
});

export type Blocker = z.infer<typeof BlockerSchema>;

/**
 * Schema for a status report submitted by a navigator during the report phase
 */
export const StatusReportSchema = z.object({
  navigatorName: z.string().describe("Name of the reporting navigator"),
  currentFocus: z.string().describe("What the navigator is currently working on"),
  recentProgress: z.array(z.string()).describe("Recent accomplishments or progress items"),
  blockers: z.array(BlockerSchema).describe("Current blockers"),
  canHelpWith: z.array(z.string()).describe("Areas where this navigator could help others"),
  knowledgeGaps: z
    .array(z.string())
    .optional()
    .describe("Areas where the navigator lacks knowledge"),
});

export type StatusReport = z.infer<typeof StatusReportSchema>;

/**
 * Schema for a blocker resolution provided during the sync phase
 */
export const BlockerResolutionSchema = z.object({
  navigatorName: z
    .string()
    .describe("Name of the navigator whose blocker is being resolved"),
  blockerDescription: z.string().describe("The blocker being addressed"),
  resolution: z.string().describe("How the blocker was resolved or advice given"),
  artifactPath: z
    .string()
    .optional()
    .describe("Path to any artifact created to help resolve the blocker"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Confidence in the resolution"),
});

export type BlockerResolution = z.infer<typeof BlockerResolutionSchema>;

/**
 * Schema for a sync response submitted by a navigator during the sync phase
 */
export const SyncResponseSchema = z.object({
  navigatorName: z.string().describe("Name of the responding navigator"),
  summary: z.string().describe("Summary of sync contributions"),
  blockerResolutions: z
    .array(BlockerResolutionSchema)
    .describe("Resolutions for other navigators' blockers"),
  newInsights: z
    .array(z.string())
    .optional()
    .describe("New insights discovered while reviewing reports"),
  followUpNeeded: z
    .boolean()
    .describe("Whether further follow-up is needed after this standup"),
});

export type SyncResponse = z.infer<typeof SyncResponseSchema>;

/**
 * Command line options for standup command
 */
export interface StandupOptions {
  /** Global config directory override */
  configDir?: string;

  /** Show detailed logging */
  verbose?: boolean;

  /** Model for agents */
  model?: string;

  /** Max turns per agent */
  maxTurns?: number;

  /** Skip sync phase, only generate reports */
  reportOnly?: boolean;

  /** Max cost per agent in USD */
  maxBudgetUsd?: number;

  /** Agent runtime harness type */
  harness?: string;
}

/**
 * Final result of standup execution
 */
export interface StandupResult {
  /** Whether the standup completed successfully */
  success: boolean;

  /** Path to the standup output directory */
  standupDir: string;

  /** Status reports from each navigator */
  reports: StatusReport[];

  /** Sync responses from each navigator */
  syncResponses: SyncResponse[];

  /** Total duration in milliseconds */
  durationMs: number;

  /** Total cost in USD across all agents */
  totalCostUsd: number;

  /** Context utilization percentage per navigator name */
  contextUtilization: Record<string, number>;

  /** Any errors that occurred */
  errors?: string[];
}
