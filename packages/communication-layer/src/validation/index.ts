import * as fs from 'fs';
import * as path from 'path';
import type { NavigatorResponse } from '../schemas/response.js';
import type { Source } from '../schemas/source.js';
import type { NavigatorConfig } from '../schemas/config.js';
import {
  SourceNotFoundError,
  HallucinationError,
  LowConfidenceError,
  ContextOverflowError,
  ValidationError,
} from '../errors/index.js';

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  errors: Error[];
  warnings: string[];
}

/**
 * Hallucination pattern matchers
 */
const HALLUCINATION_PATTERNS = [
  // Made-up AWS ARNs
  /arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d*:[a-z0-9-]+(\/[a-z0-9-]+)*(?!.*\.(md|txt|yml|yaml|json))/i,

  // Suspiciously generic file paths that might not exist
  /\/tmp\/example/i,
  /\/path\/to\//i,
  /your[-_]?file/i,

  // Made-up commands that are too generic
  /\$\{YOUR_/i,
  /\[YOUR[-_]/i,
  /<YOUR[-_]/i,

  // Placeholder text
  /lorem ipsum/i,
  /todo:?\s*replace/i,
  /placeholder/i,
];

/**
 * Check if cited sources actually exist in the knowledge base
 *
 * @param response - The navigator response to validate
 * @param knowledgeBasePath - Path to the knowledge base directory
 * @returns Validation result
 */
export function checkSourcesExist(
  response: NavigatorResponse,
  knowledgeBasePath: string
): ValidationResult {
  const errors: Error[] = [];
  const warnings: string[] = [];

  for (const source of response.sources) {
    const fullPath = path.resolve(knowledgeBasePath, source.filePath);

    try {
      if (!fs.existsSync(fullPath)) {
        errors.push(new SourceNotFoundError(source.filePath, {
          knowledgeBasePath,
          fullPath,
        }));
      } else {
        // Verify file is readable
        const stats = fs.statSync(fullPath);
        if (!stats.isFile()) {
          errors.push(new ValidationError(
            `Source path is not a file: ${source.filePath}`,
            { fullPath }
          ));
        }
      }
    } catch (error) {
      errors.push(new SourceNotFoundError(source.filePath, {
        knowledgeBasePath,
        fullPath,
        originalError: error,
      }));
    }

    // Validate line numbers if provided
    if (source.lineNumbers) {
      const [start, end] = source.lineNumbers;
      if (start > end) {
        warnings.push(
          `Invalid line numbers for ${source.filePath}: start (${start}) > end (${end})`
        );
      }
      if (start < 1) {
        warnings.push(
          `Invalid line numbers for ${source.filePath}: line numbers must be >= 1`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect common hallucination patterns in response
 *
 * @param response - The navigator response to check
 * @returns Validation result
 */
export function detectHallucinations(
  response: NavigatorResponse
): ValidationResult {
  const errors: Error[] = [];
  const warnings: string[] = [];
  const detectedPatterns: string[] = [];

  // Check answer text for hallucination patterns
  for (const pattern of HALLUCINATION_PATTERNS) {
    if (pattern.test(response.answer)) {
      detectedPatterns.push(pattern.source);
    }
  }

  // Check source excerpts
  for (const source of response.sources) {
    for (const pattern of HALLUCINATION_PATTERNS) {
      if (pattern.test(source.excerpt)) {
        detectedPatterns.push(`In source ${source.filePath}: ${pattern.source}`);
      }
    }

    // Check for suspiciously generic excerpts
    if (source.excerpt.length < 10) {
      warnings.push(
        `Very short excerpt in ${source.filePath} - might not provide enough context`
      );
    }

    // Check relevance score is reasonable
    if (source.relevanceScore < 0.3) {
      warnings.push(
        `Low relevance score (${source.relevanceScore}) for ${source.filePath} - consider if this source is truly relevant`
      );
    }
  }

  // Check if answer has no citations but makes specific claims
  if (response.sources.length === 0) {
    errors.push(new HallucinationError(
      'Response has no source citations',
      ['NO_SOURCES']
    ));
  }

  // Check for generic "I don't know" answers with high confidence
  const lowInfoAnswers = [
    'i don\'t know',
    'i don\'t have information',
    'not sure',
    'cannot find',
  ];
  const hasLowInfoAnswer = lowInfoAnswers.some(phrase =>
    response.answer.toLowerCase().includes(phrase)
  );

  if (hasLowInfoAnswer && response.confidence > 0.7) {
    warnings.push(
      'High confidence score with uncertain answer - confidence might be miscalibrated'
    );
  }

  if (detectedPatterns.length > 0) {
    errors.push(new HallucinationError(
      'Detected potential hallucination patterns in response',
      detectedPatterns
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate confidence score is justified
 *
 * @param response - The navigator response to validate
 * @param config - Navigator configuration
 * @returns Validation result
 */
export function validateConfidence(
  response: NavigatorResponse,
  config: NavigatorConfig
): ValidationResult {
  const errors: Error[] = [];
  const warnings: string[] = [];

  // Check against threshold
  if (response.confidence < config.confidenceThreshold) {
    errors.push(new LowConfidenceError(
      response.confidence,
      config.confidenceThreshold,
      { navigatorName: config.name }
    ));
  }

  // Heuristic: confidence should correlate with number of quality sources
  const highQualitySources = response.sources.filter(
    s => s.relevanceScore >= 0.7
  ).length;

  if (response.confidence > 0.8 && highQualitySources === 0) {
    warnings.push(
      'High confidence but no high-quality sources - confidence might be overestimated'
    );
  }

  if (response.confidence < 0.3 && highQualitySources >= 3) {
    warnings.push(
      'Low confidence despite multiple high-quality sources - confidence might be underestimated'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate context size is within limits
 *
 * @param response - The navigator response to validate
 * @param config - Navigator configuration
 * @returns Validation result
 */
export function validateContextSize(
  response: NavigatorResponse,
  config: NavigatorConfig
): ValidationResult {
  const errors: Error[] = [];
  const warnings: string[] = [];

  if (config.maxContextSize && response.contextSize > config.maxContextSize) {
    errors.push(new ContextOverflowError(
      response.contextSize,
      config.maxContextSize,
      { navigatorName: config.name }
    ));
  }

  // Warn if context size is getting close to limit
  if (config.maxContextSize) {
    const percentUsed = (response.contextSize / config.maxContextSize) * 100;
    if (percentUsed > 80) {
      warnings.push(
        `Context size at ${percentUsed.toFixed(1)}% of limit - consider optimizing`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run all validations on a response
 *
 * @param response - The navigator response to validate
 * @param config - Navigator configuration
 * @param knowledgeBasePath - Path to knowledge base (if different from config)
 * @returns Combined validation result
 */
export function validateResponse(
  response: NavigatorResponse,
  config: NavigatorConfig,
  knowledgeBasePath?: string
): ValidationResult {
  const basePath = knowledgeBasePath || config.knowledgeBasePath;

  const results = [
    checkSourcesExist(response, basePath),
    detectHallucinations(response),
    validateConfidence(response, config),
    validateContextSize(response, config),
  ];

  const allErrors = results.flatMap(r => r.errors);
  const allWarnings = results.flatMap(r => r.warnings);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Validate a source without full response context
 *
 * @param source - The source to validate
 * @param knowledgeBasePath - Path to knowledge base
 * @returns Validation result
 */
export function validateSource(
  source: Source,
  knowledgeBasePath: string
): ValidationResult {
  const errors: Error[] = [];
  const warnings: string[] = [];

  const fullPath = path.resolve(knowledgeBasePath, source.filePath);

  if (!fs.existsSync(fullPath)) {
    errors.push(new SourceNotFoundError(source.filePath, {
      knowledgeBasePath,
      fullPath,
    }));
  }

  // Check for hallucination patterns in excerpt
  for (const pattern of HALLUCINATION_PATTERNS) {
    if (pattern.test(source.excerpt)) {
      warnings.push(`Potential hallucination pattern detected: ${pattern.source}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
