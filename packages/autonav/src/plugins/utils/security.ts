/**
 * Security utilities for protecting sensitive data in plugins
 */

/**
 * Patterns for detecting sensitive tokens and credentials
 */
const SENSITIVE_PATTERNS = [
  // API tokens
  /xoxb-[a-zA-Z0-9-]+/gi, // Slack bot tokens
  /xoxp-[a-zA-Z0-9-]+/gi, // Slack user tokens
  /ghp_[a-zA-Z0-9]+/gi, // GitHub personal access tokens
  /gho_[a-zA-Z0-9]+/gi, // GitHub OAuth tokens
  /ghs_[a-zA-Z0-9]+/gi, // GitHub server tokens

  // Generic patterns
  /sk-[a-zA-Z0-9]{20,}/gi, // OpenAI/Anthropic style keys
  /Bearer\s+[a-zA-Z0-9_\-\.]+/gi, // Bearer tokens
  /api[_-]?key['":\s=]+[a-zA-Z0-9_\-]+/gi, // API keys
  /token['":\s=]+[a-zA-Z0-9_\-]+/gi, // Generic tokens

  // AWS credentials
  /AKIA[0-9A-Z]{16}/gi, // AWS access key IDs
  /aws_secret_access_key['":\s=]+[a-zA-Z0-9\/\+]{40}/gi, // AWS secret keys
];

/**
 * Sanitize a string by masking sensitive tokens and credentials
 *
 * @param text - Text that may contain sensitive data
 * @returns Sanitized text with credentials masked
 */
export function sanitizeCredentials(text: string): string {
  let sanitized = text;

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Keep first 4 and last 4 characters, mask the middle
      if (match.length <= 12) {
        return '***REDACTED***';
      }
      const prefix = match.substring(0, 4);
      const suffix = match.substring(match.length - 4);
      const maskedLength = Math.min(match.length - 8, 20);
      return `${prefix}${'*'.repeat(maskedLength)}${suffix}`;
    });
  }

  return sanitized;
}

/**
 * Sanitize an error message before logging or throwing
 *
 * @param error - Error object or message
 * @returns Sanitized error message
 */
export function sanitizeError(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message;
  return sanitizeCredentials(message);
}

/**
 * Sanitize a configuration object for safe logging
 * Never log the actual config - only structure
 *
 * @param config - Configuration object
 * @returns Sanitized config summary
 */
export function sanitizeConfigForLogging(config: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    // Always mask these fields
    const sensitiveKeys = ['token', 'password', 'secret', 'key', 'apiKey', 'apiSecret', 'accessToken'];
    const isSensitive = sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()));

    if (isSensitive && typeof value === 'string') {
      sanitized[key] = value.length > 0 ? '***SET***' : '***EMPTY***';
    } else if (Array.isArray(value)) {
      sanitized[key] = `Array(${value.length})`;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = '[Object]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create a safe error for external display
 * Strips sensitive information and provides sanitized message
 *
 * @param error - Original error
 * @param context - Additional context (will be sanitized)
 * @returns Safe error object
 */
export function createSafeError(
  error: Error | string,
  context?: Record<string, unknown>
): Error {
  const message = sanitizeError(error);
  const safeError = new Error(message);

  if (context) {
    // Attach sanitized context
    (safeError as any).context = sanitizeConfigForLogging(context);
  }

  return safeError;
}

/**
 * Validate that a string doesn't contain obvious sensitive data
 * Throws if sensitive data is detected
 *
 * @param text - Text to validate
 * @param fieldName - Name of the field being validated (for error message)
 */
export function assertNoCredentialsInText(text: string, fieldName: string): void {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(
        `Potential credential detected in ${fieldName}. ` +
        `Please do not include tokens, API keys, or passwords in user-facing content.`
      );
    }
  }
}
