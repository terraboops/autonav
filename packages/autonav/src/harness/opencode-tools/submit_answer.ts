/**
 * submit_answer — OpenCode custom tool
 *
 * Provides the submit_answer tool so the LLM can return structured responses
 * with source citations. The NavigatorAdapter intercepts the tool_use event
 * from the event stream — this tool just needs to exist and return success.
 *
 * Runs inside OpenCode's Bun runtime via .opencode/tools/.
 */
import { tool } from "@opencode-ai/plugin"

export default tool({
  name: "submit_answer",
  description:
    "Submit your final answer. You MUST use this tool to provide your response with proper source citations.",
  args: {
    answer: {
      type: "string",
      description: "Your complete answer grounded in the knowledge base.",
    },
    sources: {
      type: "array",
      description: "Source citations from the knowledge base.",
    },
    confidence: {
      type: "number",
      description:
        "Confidence score from 0.0 (no confidence) to 1.0 (fully confident). 0.9+ = high, 0.45-0.89 = medium, below 0.45 = low.",
    },
    confidenceReason: {
      type: "string",
      description: "Brief explanation of your confidence level.",
    },
    outOfDomain: {
      type: "boolean",
      description: "Whether the question is outside your knowledge domain.",
    },
  },
  async execute() {
    return "Answer submitted successfully."
  },
})
