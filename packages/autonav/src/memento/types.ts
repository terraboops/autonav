/**
 * Memento Loop Types
 *
 * Core type definitions for the context-clearing iterative development loop
 * that coordinates navigator (planning) and worker (implementation) agents.
 *
 * Design principle: The WORKER forgets between iterations (memento pattern).
 * The NAVIGATOR maintains its own memory. Git commits track worker progress.
 * All types here are for in-memory use during loop execution.
 */

import { z } from "zod";

/**
 * Schema for implementation plan steps
 */
export const ImplementationStepSchema = z.object({
  description: z.string().describe("What this step accomplishes"),
  files: z.array(z.string()).optional().describe("Files to create or modify"),
  commands: z.array(z.string()).optional().describe("Commands to run"),
});

/**
 * Schema for implementation plan returned by navigator
 */
export const ImplementationPlanSchema = z.object({
  summary: z.string().describe("Brief summary of what this plan will accomplish"),
  steps: z.array(ImplementationStepSchema).describe("Ordered implementation steps"),
  validationCriteria: z.array(z.string()).describe("How to verify the implementation worked"),
  isComplete: z.boolean().describe("True if the overall task is complete and no more iterations needed"),
  completionMessage: z.string().optional().describe("Message to display when isComplete is true"),
});

export type ImplementationStep = z.infer<typeof ImplementationStepSchema>;
export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;

/**
 * Result from worker agent execution
 */
export interface WorkerResult {
  /** Whether the worker completed successfully */
  success: boolean;

  /** Summary of what was done */
  summary: string;

  /** Files that were modified */
  filesModified: string[];

  /** Any errors encountered */
  errors?: string[];

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Command line options for memento command
 */
export interface MementoOptions {
  /** Create and push to a new PR when complete */
  pr?: boolean;

  /** Maximum iterations (0 = unlimited) */
  maxIterations: number;

  /** Completion signal text */
  promise: string;

  /** Git branch name for work */
  branch?: string;

  /** Task description (overrides TASK.md) */
  task?: string;

  /** Show detailed logging */
  verbose?: boolean;
}

/**
 * Final result of memento loop execution
 */
export interface MementoResult {
  /** Whether the task completed successfully */
  success: boolean;

  /** Number of iterations performed */
  iterations: number;

  /** Completion message from nav */
  completionMessage?: string;

  /** PR URL if --pr was used */
  prUrl?: string;

  /** Git branch name */
  branch?: string;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Any errors that occurred */
  errors?: string[];
}
