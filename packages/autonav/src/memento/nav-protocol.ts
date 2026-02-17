/**
 * Navigator Protocol for Memento Loop
 *
 * MCP server providing the submit_implementation_plan tool
 * for navigators to submit structured implementation plans.
 */

import { z } from "zod";
import { defineTool } from "../harness/index.js";
import { ImplementationPlanSchema, type ImplementationPlan } from "./types.js";

/**
 * Tool name for plan submission
 */
export const SUBMIT_PLAN_TOOL = "submit_implementation_plan";

/**
 * Result captured from plan submission
 */
export interface PlanSubmissionResult {
  plan: ImplementationPlan;
  submitted: boolean;
}

/**
 * Create an MCP server with the submit_implementation_plan tool
 *
 * The tool validates plans against the ImplementationPlanSchema
 * and returns structured data for the memento loop.
 */
export function createNavProtocolTools() {
  // We'll capture the submitted plan via closure
  let capturedPlan: ImplementationPlan | null = null;

  const tools = [
    defineTool(
      SUBMIT_PLAN_TOOL,
      `Submit your implementation plan for the current iteration. You MUST use this tool to provide your plan.

This tool allows you to:
1. Define concrete implementation steps for the implementer agent
2. Specify validation criteria to verify the implementation
3. Signal when the overall task is complete

When the task is fully complete, set isComplete to true and provide a completionMessage.

Do NOT respond with plain text - always use this tool to submit your plan.`,
      {
        summary: z.string().min(10).describe(
          "Brief summary of what this plan will accomplish in this iteration. Be specific about the goal."
        ),
        steps: z.array(
          z.object({
            description: z.string().min(5).describe("Clear description of what this step accomplishes"),
            files: z.array(z.string()).optional().describe(
              "Specific files to create or modify (relative paths)"
            ),
            commands: z.array(z.string()).optional().describe(
              "Shell commands to run (e.g., 'npm install', 'npm test')"
            ),
          })
        ).min(1).describe(
          "Ordered list of implementation steps. Each step should be atomic and verifiable."
        ),
        validationCriteria: z.array(z.string()).min(1).describe(
          "How to verify the implementation worked. Include specific checks like 'npm test passes' or 'file X exists with content Y'."
        ),
        isComplete: z.boolean().describe(
          "Set to true when the OVERALL TASK is complete and no more iterations are needed. " +
            "Only set this to true when all requirements have been fulfilled."
        ),
        completionMessage: z.string().optional().describe(
          "Message to display when isComplete is true. Summarize what was accomplished."
        ),
      },
      async (args) => {
        // Validate against the full schema
        const plan = ImplementationPlanSchema.parse(args);

        // Capture the plan for extraction
        capturedPlan = plan;

        // Return success message
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                message: plan.isComplete
                  ? "Task marked as complete. Memento loop will end."
                  : `Plan submitted with ${plan.steps.length} steps. Implementer will implement this.`,
                plan,
              }),
            },
          ],
          isError: false,
        };
      }
    ),
  ];

  return {
    tools,
    getCapturedPlan: (): ImplementationPlan | null => capturedPlan,
    resetCapturedPlan: () => {
      capturedPlan = null;
    },
  };
}
