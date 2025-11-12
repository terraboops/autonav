import * as fs from "node:fs";
import * as path from "node:path";
import type { NavigatorResponse, Source } from "../schemas/index.js";

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: "hallucination" | "missing_source" | "invalid_path" | "schema_error";
  message: string;
  source?: Source;
}

export interface ValidationWarning {
  type: "low_confidence" | "missing_excerpt" | "version_mismatch" | "hallucination";
  message: string;
}

/**
 * Check if cited sources actually exist in the knowledge base
 */
export function checkSourcesExist(
  response: NavigatorResponse,
  knowledgeBasePath: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const source of response.sources) {
    const fullPath = path.join(knowledgeBasePath, source.filePath);

    if (!fs.existsSync(fullPath)) {
      errors.push({
        type: "missing_source",
        message: `Source file does not exist: ${source.filePath}`,
        source,
      });
    } else if (!fs.statSync(fullPath).isFile()) {
      errors.push({
        type: "invalid_path",
        message: `Source path is not a file: ${source.filePath}`,
        source,
      });
    }

    // Warn if excerpt is missing (good practice to include it)
    if (!source.excerpt) {
      warnings.push({
        type: "missing_excerpt",
        message: `Source ${source.filePath} is missing an excerpt`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect common hallucination patterns in responses
 */
export function detectHallucinations(
  response: NavigatorResponse
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Pattern 1: No sources but confident answer
  if (response.sources.length === 0 && response.answer.length > 50) {
    const isAcknowledgingIgnorance =
      response.answer.toLowerCase().includes("don't have") ||
      response.answer.toLowerCase().includes("no information") ||
      response.answer.toLowerCase().includes("not found");

    if (!isAcknowledgingIgnorance) {
      errors.push({
        type: "hallucination",
        message: "Answer provided without citing any sources (possible hallucination)",
      });
    }
  }

  // Pattern 2: Made-up AWS ARNs
  const arnPattern = /arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d*:[a-z0-9-/]+/gi;
  const arns = response.answer.match(arnPattern) || [];
  if (arns.length > 0) {
    warnings.push({
      type: "hallucination",
      message: `Response contains AWS ARN(s). Verify these are from the knowledge base: ${arns.join(", ")}`,
    });
  }

  // Pattern 3: Specific file paths mentioned in answer but not in sources
  const filePathPattern = /(?:^|\s)([\w-]+\/[\w-./]+\.\w+)/g;
  const mentionedPaths = [...response.answer.matchAll(filePathPattern)]
    .map((m) => m[1])
    .filter((path): path is string => path !== undefined);

  const citedPaths = new Set(response.sources.map((s) => s.filePath));

  for (const path of mentionedPaths) {
    if (!citedPaths.has(path)) {
      warnings.push({
        type: "hallucination",
        message: `File path mentioned in answer but not cited as source: ${path}`,
      });
    }
  }

  // Pattern 4: Confident but vague answer (often a sign of hallucination)
  const vagueWords = [
    "typically",
    "usually",
    "generally",
    "probably",
    "might",
    "could be",
  ];
  const vagueCount = vagueWords.filter((word) =>
    response.answer.toLowerCase().includes(word)
  ).length;

  if (vagueCount >= 3 && response.sources.length < 2) {
    warnings.push({
      type: "hallucination",
      message: "Answer uses many hedging words with few sources (may indicate uncertainty)",
    });
  }

  // Pattern 5: Low confidence should trigger warning
  if (response.confidence !== undefined && response.confidence < 0.5) {
    warnings.push({
      type: "low_confidence",
      message: `Low confidence score: ${response.confidence}. Consider manual review.`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Comprehensive validation combining all checks
 */
export function validateNavigatorResponse(
  response: NavigatorResponse,
  knowledgeBasePath: string
): ValidationResult {
  const sourceCheck = checkSourcesExist(response, knowledgeBasePath);
  const hallucinationCheck = detectHallucinations(response);

  return {
    valid: sourceCheck.valid && hallucinationCheck.valid,
    errors: [...sourceCheck.errors, ...hallucinationCheck.errors],
    warnings: [...sourceCheck.warnings, ...hallucinationCheck.warnings],
  };
}

/**
 * Format validation result as human-readable text
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push("✅ Validation passed");
  } else {
    lines.push("❌ Validation failed");
  }

  if (result.errors.length > 0) {
    lines.push("\nErrors:");
    for (const error of result.errors) {
      lines.push(`  - [${error.type}] ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("\nWarnings:");
    for (const warning of result.warnings) {
      lines.push(`  - [${warning.type}] ${warning.message}`);
    }
  }

  return lines.join("\n");
}
