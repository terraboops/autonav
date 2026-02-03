/**
 * Communication Layer Prompt Templates
 *
 * Reusable prompt templates for navigator interactions
 */

// Identity Protocol (shared building block)
export {
  buildAgentIdentityProtocol,
  type NavigatorIdentity,
  type CallerContext,
} from "./identity-protocol.js";

// Prompt Templates
export {
  GROUNDING_RULES,
  SELF_CONFIG_RULES,
  createAnswerQuestionPrompt,
  createConfidencePrompt,
  createExtractSourcesPrompt,
  createNavigatorSystemPrompt,
} from "./templates.js";
