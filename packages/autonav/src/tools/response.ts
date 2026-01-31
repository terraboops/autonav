/**
 * Response Tools for Autonav Navigators
 *
 * These tools allow navigators to submit structured responses
 * using Zod-validated schemas, providing the benefits of
 * Claude's Structured Outputs through tool use.
 *
 * Uses MCP format for integration with Claude Agent SDK.
 */

import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import {
  NavigatorResponseSchema,
  PROTOCOL_VERSION,
} from "@autonav/communication-layer";

/**
 * Result type returned when submit_answer tool is called
 */
export interface SubmitAnswerResult {
  success: boolean;
  message: string;
}

/**
 * Create an MCP server with response tools
 *
 * The submit_answer tool allows Claude to submit structured responses
 * that are validated against the NavigatorResponse schema.
 * This achieves the same result as Claude's Structured Outputs
 * but works within the Claude Agent SDK's tool use flow.
 */
export function createResponseMcpServer() {
  const submitAnswerTool = tool(
    "submit_answer",
    `Submit your final answer to the user's question. You MUST use this tool to provide your response.

This ensures your answer follows the required structure with proper source citations.
Do NOT respond with plain text - always use this tool to submit your answer.`,
    {
      answer: z.string().min(1).describe(
        "Your complete answer to the question, grounded in the knowledge base. Include relevant details and cite sources inline where helpful."
      ),
      sources: z.array(
        z.object({
          file: z.string().min(1).describe("Filename from knowledge base (relative path)"),
          section: z.string().min(1).describe("Specific section or heading in the file"),
          relevance: z.string().min(1).describe("Brief explanation of why this source supports the answer"),
        })
      ).describe(
        "List of sources from the knowledge base that support your answer. Can be empty array if explicitly stating lack of information."
      ),
      confidence: z.enum(['high', 'medium', 'low']).describe(
        "Confidence level: 'high' for direct answers from clear sources, 'medium' for synthesized answers, 'low' for inferred or uncertain answers."
      ),
      confidenceReason: z.string().min(10).describe(
        "Explanation of why you chose this confidence level. Justify your rating based on source quality and directness."
      ),
      outOfDomain: z.boolean().describe(
        "Is this question outside the navigator's domain? Set to true only if the question clearly falls outside the knowledge base scope."
      ),
    },
    async (args) => {
      // Validate against the full schema (adds protocolVersion, timestamp, etc.)
      const response = NavigatorResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        query: "", // Will be populated by ClaudeAdapter
        answer: args.answer,
        sources: args.sources,
        confidence: args.confidence,
        confidenceReason: args.confidenceReason,
        outOfDomain: args.outOfDomain,
      });

      // Return success - the ClaudeAdapter will extract the response
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: "Answer submitted successfully",
              response,
            }),
          },
        ],
        isError: false,
      };
    }
  );

  return createSdkMcpServer({
    name: "autonav-response",
    version: "1.0.0",
    tools: [submitAnswerTool],
  });
}

/**
 * Tool name constant for detection in ClaudeAdapter
 */
export const SUBMIT_ANSWER_TOOL = "submit_answer";
