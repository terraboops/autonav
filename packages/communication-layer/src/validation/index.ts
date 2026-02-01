import * as fs from 'fs';
import * as path from 'path';
import type { NavigatorResponse } from '../schemas/response.js';
import type { Source } from '../schemas/source.js';
import {
  SourceNotFoundError,
  HallucinationError,
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
 * Strict hallucination patterns - Always indicate hallucination
 * These patterns reliably identify made-up or template content
 */
const STRICT_HALLUCINATION_PATTERNS = [
  { pattern: /lorem ipsum/i, description: 'Lorem ipsum placeholder text' },
  { pattern: /todo:?\s*replace/i, description: 'TODO replace instruction' },
  { pattern: /\$\{YOUR_[A-Z_]+\}/i, description: 'Shell variable placeholder (${YOUR_...})' },
  { pattern: /\[INSERT[_ ]/i, description: 'Insert placeholder ([INSERT ...])' },
  { pattern: /\[REPLACE[_ ]/i, description: 'Replace placeholder ([REPLACE ...])' },
  { pattern: /\bplaceholder\b/i, description: 'Word "placeholder"' },
];

/**
 * Warning patterns - Might be legitimate documentation
 * These generate warnings but don't fail validation
 */
const WARNING_PATTERNS = [
  { pattern: /\/tmp\/example/i, description: '/tmp/example path (common in docs)' },
  { pattern: /<[a-z-]+-name>/i, description: 'Generic placeholder like <deployment-name>' },
  { pattern: /example\.com/i, description: 'example.com domain (common in docs)' },
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

  // Get navigator root (parent of knowledge base)
  const navigatorRoot = path.dirname(knowledgeBasePath);

  for (const source of response.sources) {
    // Try knowledge base first (for backwards compatibility with knowledge packs)
    let fullPath = path.resolve(knowledgeBasePath, source.file);
    let exists = fs.existsSync(fullPath);

    // If not found in knowledge base, try navigator root
    // This allows navigators like mahdi to cite sources from anywhere in their directory
    if (!exists) {
      fullPath = path.resolve(navigatorRoot, source.file);
      exists = fs.existsSync(fullPath);
    }

    try {
      if (!exists) {
        errors.push(new SourceNotFoundError(source.file, {
          knowledgeBasePath,
          fullPath,
        }));
      } else {
        // Verify file is readable
        const stats = fs.statSync(fullPath);
        if (!stats.isFile()) {
          errors.push(new ValidationError(
            `Source path is not a file: ${source.file}`,
            { fullPath }
          ));
        }
      }
    } catch (error) {
      errors.push(new SourceNotFoundError(source.file, {
        knowledgeBasePath,
        fullPath,
        originalError: error,
      }));
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

  // Check answer text for strict hallucination patterns
  for (const { pattern, description } of STRICT_HALLUCINATION_PATTERNS) {
    const match = response.answer.match(pattern);
    if (match) {
      const snippet = extractSnippet(response.answer, match.index!, match[0].length);
      detectedPatterns.push(`${description}: "${snippet}"`);
    }
  }

  // Check answer text for warning patterns
  for (const { pattern, description } of WARNING_PATTERNS) {
    const match = response.answer.match(pattern);
    if (match) {
      const snippet = extractSnippet(response.answer, match.index!, match[0].length);
      warnings.push(
        `Potential placeholder detected - ${description}: "${snippet}". ` +
        `Verify this is quoted from documentation, not a hallucination.`
      );
    }
  }

  // Check source relevance descriptions for suspicious patterns
  for (const source of response.sources) {
    for (const { pattern, description } of STRICT_HALLUCINATION_PATTERNS) {
      const match = source.relevance.match(pattern);
      if (match) {
        const snippet = extractSnippet(source.relevance, match.index!, match[0].length);
        detectedPatterns.push(`In source ${source.file} relevance - ${description}: "${snippet}"`);
      }
    }

    // Check for suspiciously generic or short relevance explanations
    if (source.relevance.length < 10) {
      warnings.push(
        `Very short relevance explanation for ${source.file} - might not provide enough justification`
      );
    }
  }

  // Check if answer has no citations when making specific claims (unless explicitly out of domain)
  if (response.sources.length === 0 && !response.outOfDomain) {
    const lowInfoAnswers = [
      'i don\'t know',
      'i don\'t have information',
      'not sure',
      'cannot find',
      'no information available',
    ];
    const hasLowInfoAnswer = lowInfoAnswers.some(phrase =>
      response.answer.toLowerCase().includes(phrase)
    );

    if (!hasLowInfoAnswer) {
      errors.push(new HallucinationError(
        'Response has no source citations but makes specific claims',
        ['NO_SOURCES']
      ));
    }
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

  if (hasLowInfoAnswer && response.confidence === 'high') {
    warnings.push(
      'High confidence level with uncertain answer - confidence might be miscalibrated'
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
 * Extract a snippet around a match for debug output
 */
function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const contextChars = 40;
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + matchLength + contextChars);

  let snippet = text.substring(start, end);

  // Add ellipsis if we truncated
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  // Collapse whitespace for readability
  snippet = snippet.replace(/\s+/g, ' ').trim();

  return snippet;
}

/**
 * Validate confidence level is justified
 *
 * @param response - The navigator response to validate
 * @returns Validation result
 */
export function validateConfidence(
  response: NavigatorResponse
): ValidationResult {
  const errors: Error[] = [];
  const warnings: string[] = [];

  // Check that confidenceReason is meaningful
  if (response.confidenceReason.length < 10) {
    warnings.push(
      'Confidence reason is very short - should provide more justification'
    );
  }

  // Heuristic: confidence should correlate with number of sources
  const sourceCount = response.sources.length;

  if (response.confidence === 'high' && sourceCount === 0) {
    warnings.push(
      'High confidence but no sources cited - confidence might be overestimated'
    );
  }

  if (response.confidence === 'low' && sourceCount >= 3) {
    warnings.push(
      'Low confidence despite multiple sources - confidence might be underestimated'
    );
  }

  // Warn on low confidence responses - they may need manual review
  if (response.confidence === 'low') {
    warnings.push(
      `Low confidence response. Reason: ${response.confidenceReason}. Consider manual review.`
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
 * @deprecated Context size is no longer tracked in NavigatorResponse schema
 * This function is kept for backward compatibility but does nothing.
 *
 * @returns Validation result with deprecation warning
 */
export function validateContextSize(): ValidationResult {
  const errors: Error[] = [];
  const warnings: string[] = [];

  // This function is deprecated as contextSize is no longer in the schema
  // Keeping for backward compatibility but it's a no-op
  warnings.push(
    'validateContextSize is deprecated - context size tracking removed from schema'
  );

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
 * @param knowledgeBasePath - Path to knowledge base directory
 * @returns Combined validation result
 */
export function validateResponse(
  response: NavigatorResponse,
  knowledgeBasePath: string
): ValidationResult {
  const results = [
    checkSourcesExist(response, knowledgeBasePath),
    detectHallucinations(response),
    validateConfidence(response),
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

  // Get navigator root (parent of knowledge base)
  const navigatorRoot = path.dirname(knowledgeBasePath);

  // Try knowledge base first, then navigator root
  let fullPath = path.resolve(knowledgeBasePath, source.file);
  let exists = fs.existsSync(fullPath);

  if (!exists) {
    fullPath = path.resolve(navigatorRoot, source.file);
    exists = fs.existsSync(fullPath);
  }

  if (!exists) {
    errors.push(new SourceNotFoundError(source.file, {
      knowledgeBasePath,
      fullPath,
    }));
  }

  // Check for hallucination patterns in relevance description
  for (const { pattern, description } of STRICT_HALLUCINATION_PATTERNS) {
    const match = source.relevance.match(pattern);
    if (match) {
      const snippet = extractSnippet(source.relevance, match.index!, match[0].length);
      warnings.push(`Potential hallucination detected - ${description}: "${snippet}"`);
    }
  }

  // Check that relevance description is meaningful
  if (source.relevance.length < 10) {
    warnings.push('Relevance description is very short - should provide more detail');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
