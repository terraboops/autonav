/**
 * Platform AI Communication Layer
 *
 * Protocol definitions, schemas, and validation for Platform AI navigators.
 *
 * @packageDocumentation
 */

// Version
export { PROTOCOL_VERSION } from "./version.js";

// Schemas
export {
  SourceSchema,
  NavigatorResponseSchema,
  NavigatorConfigSchema,
  type Source,
  type NavigatorResponse,
  type NavigatorConfig,
  createNavigatorResponse,
  createNavigatorConfig,
} from "./schemas/index.js";

// Prompts
export {
  GROUNDING_RULES,
  createAnswerQuestionPrompt,
  createConfidencePrompt,
  createExtractSourcesPrompt,
  createNavigatorSystemPrompt,
} from "./prompts/index.js";

// Validation
export {
  checkSourcesExist,
  detectHallucinations,
  validateNavigatorResponse,
  formatValidationResult,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
} from "./validation/index.js";
