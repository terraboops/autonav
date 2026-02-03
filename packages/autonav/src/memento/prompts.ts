/**
 * Prompts for Memento Loop
 *
 * System prompts and user prompts for navigator and worker agents.
 * Uses shared Agent Identity Protocol from communication-layer.
 *
 * Design principle: Git is the only memory. Prompts receive minimal context
 * (iteration number, task, git log) - no persisted state files.
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
 * Git history is the nav's only "memory" of previous iterations.
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

You are the **Navigator** in a memento loop. Your job is to analyze the current state and provide a clear implementation plan for the worker agent.

## Task

${context.task}

## Current State

- **${iterationInfo}**
- **Code Directory:** ${context.codeDirectory}
- **Branch:** ${context.branch || "(default branch)"}

## Recent Git History

\`\`\`
${gitLog || "(No commits yet)"}
\`\`\`

## Instructions

1. **Analyze** the current state based on the git history
2. **Determine** what work remains to complete the task
3. **Create** a focused implementation plan for this iteration
4. **Use the submit_implementation_plan tool** to submit your plan

### Important Notes

- Each iteration starts fresh with no accumulated context
- The git history is your only memory of previous work
- Keep plans focused - aim for incremental progress
- Set \`isComplete: true\` ONLY when the entire task is done
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
- Only mark complete when ALL requirements are met`;
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
3. Fix any issues that arise
4. Report what you accomplished

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
3. **Report** what you accomplished
4. **Fix** any issues that arise

## Working Directory

All file paths are relative to: ${codeDirectory}

## Important

- Focus on implementing the plan, not redesigning it
- If something is unclear, make reasonable assumptions
- Report any blockers or issues clearly
- Do not add features beyond what the plan specifies`;
}
