import * as fs from 'fs';
import * as path from 'path';
import type { NavigatorResponse } from '../schemas/response.js';
import type { Source } from '../schemas/source.js';
import {
  SourceNotFoundError,
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
 * Check if cited sources actually exist in the knowledge base
 *
 * This is the ONLY validation we perform - it's objective and verifiable.
 * Philosophy: Trust the model, validate only objective facts (file existence).
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
 * Validate a navigator response
 *
 * Minimal validation philosophy:
 * - Only check objective facts (file existence)
 * - Trust the model for everything else
 * - Better to allow a hallucination than break user flow
 *
 * @param response - The navigator response to validate
 * @param knowledgeBasePath - Path to knowledge base directory
 * @returns Validation result
 */
export function validateResponse(
  response: NavigatorResponse,
  knowledgeBasePath: string
): ValidationResult {
  // Only validate that cited sources exist
  return checkSourcesExist(response, knowledgeBasePath);
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

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
