/**
 * Prompts for Memento Loop
 *
 * System prompts and user prompts for navigator and implementer agents.
 * Uses shared Agent Identity Protocol from communication-layer.
 *
 * Design principle: The IMPLEMENTER forgets between iterations (memento pattern).
 * The NAVIGATOR maintains its own memory and knowledge base - we just provide
 * git history as context about what the implementer has accomplished so far.
 */

import {
  buildAgentIdentityProtocol,
  type NavigatorIdentity,
} from "@autonav/communication-layer";
import type { ImplementationPlan } from "./types.js";

// Re-export for convenience
export type { NavigatorIdentity };

/**
 * A single round of review history for anti-oscillation context.
 */
export interface ReviewRound {
  round: number;
  issues: string;      // The reviewer's feedback text
  fixApplied: string;  // Brief summary of what was fixed (captured from fixer output)
}

/**
 * Minimal context passed to nav prompt (no persisted state)
 */
interface NavPromptContext {
  codeDirectory: string;
  task: string;
  iteration: number;
  maxIterations: number;
  branch?: string;
}

/**
 * Build the prompt for the navigator to provide an implementation plan
 *
 * Uses Agent Identity Protocol when navigator identity is available.
 * Git history is provided as context about what the implementer has done,
 * but the navigator maintains its own knowledge and memory.
 */
export function buildNavPlanPrompt(
  context: NavPromptContext,
  gitLog: string,
  navigatorIdentity?: NavigatorIdentity | null
): string {
  const iterationInfo =
    context.maxIterations > 0
      ? `Iteration ${context.iteration} of ${context.maxIterations}`
      : `Iteration ${context.iteration}`;

  // Agent Identity Protocol: Explicit role identification and mutual acknowledgment
  const identityProtocol = buildAgentIdentityProtocol(navigatorIdentity, {
    name: "Autonav Memento Loop",
    request:
      "The memento loop is coordinating implementation work on behalf of the user. Please provide the next implementation plan using the `submit_implementation_plan` tool.",
  });

  return `${identityProtocol}# Memento Loop - Planning Phase

You are the **Navigator** guiding a memento loop. Your job is to provide the next implementation plan for the worker agent.

## Task

${context.task}

## Current State

- **${iterationInfo}**
- **Code Directory:** ${context.codeDirectory}
- **Branch:** ${context.branch || "(default branch)"}

## Recent Git History (Implementer's Progress)

The implementer agent has made the following commits. Use this to understand what has been implemented so far:

\`\`\`
${gitLog || "(No commits yet)"}
\`\`\`

## Instructions

1. **Analyze** the current state - you may explore the codebase, consult your knowledge base, or use any resources you have
2. **Determine** what work remains to complete the task
3. **Create** a focused implementation plan for the next iteration
4. **Use the submit_implementation_plan tool** to submit your plan

### About the Memento Loop

- The **implementer agent forgets** between iterations (it has no memory of previous work)
- **You** (the navigator) maintain continuity - use your knowledge and judgment
- The git history shows what the implementer has accomplished so far
- Keep plans focused and incremental - the implementer implements one plan at a time
- Set \`isComplete: true\` when the entire task is done
- The implementer agent will implement your plan, not you

Submit your implementation plan now using the \`submit_implementation_plan\` tool.`;
}

/**
 * Build the system prompt for the navigator agent
 */
export function buildNavSystemPrompt(navSystemPrompt: string): string {
  return `${navSystemPrompt}

# Memento Loop Navigator Role

You are acting as the **Navigator** in a memento loop. Your responsibilities:

1. **Analyze** the current state of the codebase
2. **Plan** the next implementation steps
3. **Submit** structured plans via the \`submit_implementation_plan\` tool
4. **Determine** when the task is complete

You do NOT implement code yourself. You provide plans for the worker agent.

## Key Principles

- Be specific and actionable in your plans
- Reference concrete files and commands
- Include clear validation criteria
- Only mark complete when ALL requirements are met
- Use conventional commit style for plan summaries (e.g., "feat: add user auth", "fix: resolve login bug")`;
}

/**
 * Build the prompt for the implementer agent to implement a plan
 */
export function buildImplementerPrompt(
  codeDirectory: string,
  plan: ImplementationPlan
): string {
  const stepsText = plan.steps
    .map(
      (step, i) =>
        `### Step ${i + 1}: ${step.description}
${step.files?.length ? `- Files: ${step.files.join(", ")}` : ""}
${step.commands?.length ? `- Commands: ${step.commands.join(", ")}` : ""}`
    )
    .join("\n\n");

  return `# Implementation Task

## Plan Summary

${plan.summary}

## Steps to Implement

${stepsText}

## Instructions

1. Implement each step in order
2. Report what you accomplished

**Working Directory:** ${codeDirectory}

Begin implementation now.`;
}

/**
 * Build the system prompt for the implementer agent
 */
export function buildImplementerSystemPrompt(codeDirectory: string): string {
  return `You are an **Implementer Agent** implementing code changes.

## Your Role

You receive implementation plans from the Navigator and execute them precisely.

## Guidelines

1. **Execute** each step in the plan
2. **Report** what you accomplished

## Working Directory

All file paths are relative to: ${codeDirectory}

## Important

- Focus on implementing the plan, not redesigning it
- If something is unclear, make reasonable assumptions
- Report any blockers or issues clearly
- Do not add features beyond what the plan specifies`;
}

/**
 * Build the prompt for the reviewer (navigator/opus) to review a diff.
 * Single-turn, no tools — just read the diff and respond.
 *
 * When reviewHistory is provided, previous rounds are included to prevent
 * oscillation (reviewer contradicting its own earlier feedback).
 */
export function buildReviewPrompt(diff: string, reviewHistory?: ReviewRound[]): string {
  const truncatedDiff =
    diff.length > 8000 ? diff.substring(0, 8000) + "\n... (truncated)" : diff;

  let historySection = "";
  if (reviewHistory && reviewHistory.length > 0) {
    const rounds = reviewHistory
      .map(
        (r) =>
          `### Round ${r.round}\nIssues flagged:\n${r.issues}\n${r.fixApplied ? `Fix applied: ${r.fixApplied}` : "(fix pending)"}`
      )
      .join("\n\n");

    historySection = `## Previous Review Rounds

The following reviews have already been conducted on this code. You MUST maintain consistency with your previous feedback. Do NOT contradict or reverse guidance from earlier rounds. Only flag NEW issues or issues that were not properly fixed.

${rounds}

## Current Diff

`;
  }

  return `${historySection}Review the following diff for bugs, correctness issues, or missing error handling. Do NOT use any tools — just read the diff and respond.

Respond in EXACTLY one of these formats:

If no issues: Reply with only "LGTM"

If issues found: Reply with a bullet list, one issue per line:
- [file:line] Issue description. Fix: what to do.
- [file:line] Issue description. Fix: what to do.

Do NOT suggest style improvements, refactors, or nice-to-haves. Only flag things that are bugs or will cause runtime errors.

\`\`\`diff
${truncatedDiff}
\`\`\``;
}

/**
 * Build the prompt for the fixer (implementer/haiku) to fix review issues.
 *
 * When reviewHistory is provided, previous rounds are included so the fixer
 * knows what was already addressed and avoids reverting earlier fixes.
 */
export function buildFixPrompt(
  codeDirectory: string,
  reviewResult: string,
  reviewHistory?: ReviewRound[]
): string {
  let historySection = "";
  if (reviewHistory && reviewHistory.length > 0) {
    const rounds = reviewHistory
      .map(
        (r) =>
          `### Round ${r.round}\nIssues flagged:\n${r.issues}\n${r.fixApplied ? `Fix applied: ${r.fixApplied}` : "(fix pending)"}`
      )
      .join("\n\n");

    historySection = `## Previous Review History

These issues were flagged and fixed in earlier rounds. Do NOT undo or revert these fixes:

${rounds}

`;
  }

  return `# Fix Review Issues

${historySection}Fix the following issues found during code review:

${reviewResult}

## Instructions

1. Fix each issue listed above
2. Report what you fixed

**Working Directory:** ${codeDirectory}

Begin fixing now.`;
}

/**
 * Build the system prompt for the fixer agent
 */
export function buildFixSystemPrompt(codeDirectory: string): string {
  return `You are a **Code Fixer Agent** fixing issues found during code review.

## Your Role

You receive a list of issues from a code reviewer and fix them precisely.

## Working Directory

All file paths are relative to: ${codeDirectory}

## Important

- Fix only the issues listed — do not refactor or add features
- If something is unclear, make a reasonable assumption
- Report what you fixed`;
}
