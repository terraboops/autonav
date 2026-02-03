/**
 * Prompts for Memento Loop
 *
 * System prompts and user prompts for navigator and worker agents.
 * Uses shared Agent Identity Protocol from communication-layer.
 *
 * Design principle: The WORKER forgets between iterations (memento pattern).
 * The NAVIGATOR maintains its own memory and knowledge base - we just provide
 * git history as context about what the worker has accomplished so far.
 */

import {
  buildAgentIdentityProtocol,
  type NavigatorIdentity,
} from "@autonav/communication-layer";
import type { ImplementationPlan } from "./types.js";

// Re-export for convenience
export type { NavigatorIdentity };

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
 * Git history is provided as context about what the worker has done,
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

## Recent Git History (Worker's Progress)

The worker agent has made the following commits. Use this to understand what has been implemented so far:

\`\`\`
${gitLog || "(No commits yet)"}
\`\`\`

## Instructions

1. **Analyze** the current state - you may explore the codebase, consult your knowledge base, or use any resources you have
2. **Determine** what work remains to complete the task
3. **Create** a focused implementation plan for the next iteration
4. **Use the submit_implementation_plan tool** to submit your plan

### About the Memento Loop

- The **worker agent forgets** between iterations (it has no memory of previous work)
- **You** (the navigator) maintain continuity - use your knowledge and judgment
- The git history shows what the worker has accomplished so far
- Keep plans focused and incremental - the worker implements one plan at a time
- Set \`isComplete: true\` when the entire task is done
- The worker agent will implement your plan, not you

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
 * Build the prompt for the worker agent to implement a plan
 */
export function buildWorkerPrompt(
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

  const validationText = plan.validationCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  return `# Implementation Task

## Plan Summary

${plan.summary}

## Steps to Implement

${stepsText}

## Validation Criteria

After implementation, verify:
${validationText}

## Instructions

1. Implement each step in order
2. After completing all steps, run the validation checks
3. **Review your code** - read through what you wrote and check for:
   - Bugs or logic errors
   - Missing error handling
   - Code style issues
   - Incomplete implementations
4. Fix any issues before finishing
5. Report what you accomplished

**Important:** Your changes will be committed automatically after you finish. Make sure the code is ready for commit - review and fix before completing.

**Working Directory:** ${codeDirectory}

Begin implementation now.`;
}

/**
 * Build the system prompt for the worker agent
 */
export function buildWorkerSystemPrompt(codeDirectory: string): string {
  return `You are a **Worker Agent** implementing code changes.

## Your Role

You receive implementation plans from the Navigator and execute them precisely.

## Guidelines

1. **Execute** each step in the plan
2. **Verify** your work against the validation criteria
3. **Review** your code before finishing - check for bugs, missing error handling, style issues
4. **Fix** any issues you find
5. **Report** what you accomplished

## Working Directory

All file paths are relative to: ${codeDirectory}

## Important

- Focus on implementing the plan, not redesigning it
- If something is unclear, make reasonable assumptions
- Report any blockers or issues clearly
- Do not add features beyond what the plan specifies
- **Review your code** - your changes are committed automatically when you finish`;
}
