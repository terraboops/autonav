/**
 * Standard Error Types for Platform AI Communication Layer
 *
 * These errors represent common failure modes in the navigation system.
 */

/**
 * Base class for all Platform AI errors
 */
export class PlatformAIError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when a cited source file doesn't exist in the knowledge base
 */
export class SourceNotFoundError extends PlatformAIError {
  constructor(filePath: string, details?: unknown) {
    super(
      `Source file not found: ${filePath}`,
      'SOURCE_NOT_FOUND',
      details
    );
  }
}

/**
 * Thrown when navigator confidence is below threshold
 */
export class LowConfidenceError extends PlatformAIError {
  public readonly confidence: number;
  public readonly threshold: number;

  constructor(confidence: number, threshold: number, details?: unknown) {
    super(
      `Navigator confidence ${confidence} below threshold ${threshold}`,
      'LOW_CONFIDENCE',
      details
    );
    this.confidence = confidence;
    this.threshold = threshold;
  }
}

/**
 * Thrown when a question is outside the navigator's domain
 */
export class OutOfDomainError extends PlatformAIError {
  public readonly question: string;
  public readonly navigatorDomain: string;

  constructor(question: string, navigatorDomain: string, details?: unknown) {
    super(
      `Question "${question}" is outside navigator domain: ${navigatorDomain}`,
      'OUT_OF_DOMAIN',
      details
    );
    this.question = question;
    this.navigatorDomain = navigatorDomain;
  }
}

/**
 * Thrown when context size exceeds limits
 */
export class ContextOverflowError extends PlatformAIError {
  public readonly contextSize: number;
  public readonly maxContextSize: number;

  constructor(contextSize: number, maxContextSize: number, details?: unknown) {
    super(
      `Context size ${contextSize} exceeds maximum ${maxContextSize}`,
      'CONTEXT_OVERFLOW',
      details
    );
    this.contextSize = contextSize;
    this.maxContextSize = maxContextSize;
  }
}

/**
 * Thrown when validation detects hallucinated content
 */
export class HallucinationError extends PlatformAIError {
  public readonly detectedPatterns: string[];

  constructor(message: string, detectedPatterns: string[], details?: unknown) {
    super(message, 'HALLUCINATION_DETECTED', details);
    this.detectedPatterns = detectedPatterns;
  }
}

/**
 * Thrown when protocol version mismatch is detected
 */
export class VersionMismatchError extends PlatformAIError {
  public readonly expectedVersion: string;
  public readonly actualVersion: string;

  constructor(expectedVersion: string, actualVersion: string, details?: unknown) {
    super(
      `Protocol version mismatch: expected ${expectedVersion}, got ${actualVersion}`,
      'VERSION_MISMATCH',
      details
    );
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Thrown when schema validation fails
 */
export class ValidationError extends PlatformAIError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
  }
}
