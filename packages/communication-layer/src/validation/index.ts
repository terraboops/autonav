/**
 * Communication Layer Validation Utilities
 *
 * Functions to validate navigator responses and detect hallucinations
 */

export {
  checkSourcesExist,
  detectHallucinations,
  validateNavigatorResponse,
  formatValidationResult,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
} from "./validators.js";
