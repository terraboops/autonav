import {
  NavigatorResponse,
  checkSourcesExist,
  detectHallucinations,
  type ValidationResult,
  type ConfidenceLevel,
} from "@autonav/communication-layer";

/**
 * Response validation options
 */
export interface ResponseValidationOptions {
  /**
   * Minimum acceptable confidence level
   * If set, responses below this level will fail validation
   */
  minimumConfidence?: ConfidenceLevel;

  /**
   * Whether to fail on missing sources (strict mode)
   * Default: false (warnings only)
   */
  strictSourceValidation?: boolean;

  /**
   * Knowledge base path for source validation
   */
  knowledgeBasePath: string;
}

/**
 * Extended validation result with confidence checking
 */
export interface ExtendedValidationResult extends ValidationResult {
  /**
   * Whether confidence level meets minimum requirement
   */
  confidenceMet: boolean;

  /**
   * Confidence level of the response
   */
  confidenceLevel?: ConfidenceLevel;

  /**
   * Minimum required confidence level
   */
  minimumConfidence?: ConfidenceLevel;
}

/**
 * Validate a navigator response with additional checks
 *
 * @param response - Navigator response to validate
 * @param options - Validation options
 * @returns Extended validation result
 */
export function validateResponse(
  response: NavigatorResponse,
  options: ResponseValidationOptions
): ExtendedValidationResult {
  // Run base validation (source existence, hallucination detection)
  const sourceCheck = checkSourcesExist(response, options.knowledgeBasePath);
  const hallucinationCheck = detectHallucinations(response);

  // Combine validation results
  const baseValidation: ValidationResult = {
    valid: sourceCheck.valid && hallucinationCheck.valid,
    errors: [...sourceCheck.errors, ...hallucinationCheck.errors],
    warnings: [...sourceCheck.warnings, ...hallucinationCheck.warnings],
  };

  // Check confidence level (now using enum)
  const confidenceLevel = response.confidence;
  const confidenceMet = checkConfidenceMeetsMinimum(
    confidenceLevel,
    options.minimumConfidence
  );

  // Combine results
  const extendedResult: ExtendedValidationResult = {
    ...baseValidation,
    confidenceMet,
    confidenceLevel,
    minimumConfidence: options.minimumConfidence,
  };

  // Add confidence errors if threshold not met
  if (!confidenceMet && options.minimumConfidence) {
    extendedResult.valid = false;
    extendedResult.errors.push(
      new Error(
        `Response confidence (${confidenceLevel}) is below required minimum (${options.minimumConfidence})`
      )
    );
  }

  // Convert source validation warnings to errors if strict mode
  if (options.strictSourceValidation && baseValidation.warnings.length > 0) {
    const sourceWarnings = baseValidation.warnings.filter((w) =>
      w.includes("Source file does not exist") || w.includes("not a file")
    );

    if (sourceWarnings.length > 0) {
      extendedResult.valid = false;
      extendedResult.errors.push(
        ...sourceWarnings.map((w) => new Error(`[STRICT MODE] ${w}`))
      );
    }
  }

  return extendedResult;
}

/**
 * Check if confidence level meets minimum requirement
 */
function checkConfidenceMeetsMinimum(
  actual: ConfidenceLevel,
  minimum?: ConfidenceLevel
): boolean {
  // If no minimum required, always pass
  if (!minimum) {
    return true;
  }

  const levels: Record<ConfidenceLevel, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  return levels[actual] >= levels[minimum];
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(
  validation: ExtendedValidationResult
): string {
  const lines: string[] = [];

  if (validation.errors.length > 0) {
    lines.push("Validation errors:");
    for (const error of validation.errors) {
      lines.push(`  ❌ ${error.message}`);
    }
  }

  if (validation.warnings.length > 0) {
    lines.push("\nValidation warnings:");
    for (const warning of validation.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format confidence information for display
 */
export function formatConfidenceInfo(
  validation: ExtendedValidationResult
): string {
  const lines: string[] = [];

  if (validation.confidenceLevel) {
    lines.push(`Confidence: ${validation.confidenceLevel}`);

    if (validation.minimumConfidence) {
      lines.push(`Required: ${validation.minimumConfidence}`);
      lines.push(
        `Met: ${validation.confidenceMet ? "✓ Yes" : "✗ No"}`
      );
    }
  }

  return lines.join("\n");
}

// Re-export ConfidenceLevel for convenience
export type { ConfidenceLevel };
