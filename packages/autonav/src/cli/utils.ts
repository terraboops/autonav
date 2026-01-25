/**
 * CLI Utilities
 *
 * Shared utilities for CLI commands.
 */

// Debug logging - enabled via AUTONAV_DEBUG=1 environment variable
const DEBUG = process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1";

/**
 * Log debug information to stderr when AUTONAV_DEBUG=1 is set
 */
export function debugLog(context: string, ...args: unknown[]): void {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.error(`[DEBUG ${timestamp}] [${context}]`, ...args);
  }
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return DEBUG;
}

/**
 * Parse a human-readable duration string into milliseconds
 * Supports formats: "30s", "1m", "1m30s", "90", "90000" (plain ms)
 * Max timeout: 10 minutes (600000ms) to prevent overflow issues
 *
 * @param input - Duration string (e.g., "30s", "1m", "1m30s", or milliseconds)
 * @returns Duration in milliseconds
 * @throws {Error} If format is invalid or timeout is non-positive
 */
export function parseDuration(input: string): number {
  const MAX_TIMEOUT_MS = 600000; // 10 minutes

  // Try plain number first (milliseconds)
  const plainNumber = Number(input);
  if (!isNaN(plainNumber) && Number.isFinite(plainNumber)) {
    const ms = Math.floor(plainNumber);
    if (ms <= 0) {
      throw new Error("Timeout must be positive");
    }
    return Math.min(ms, MAX_TIMEOUT_MS);
  }

  // Parse human-readable format: 1m30s, 30s, 2m, etc.
  const pattern = /^(?:(\d+)m)?(?:(\d+)s)?$/i;
  const match = input.trim().match(pattern);

  if (!match || (!match[1] && !match[2])) {
    throw new Error(
      `Invalid duration format: "${input}". Use formats like: 30s, 1m, 1m30s, or milliseconds`
    );
  }

  const minutes = match[1] ? parseInt(match[1], 10) : 0;
  const seconds = match[2] ? parseInt(match[2], 10) : 0;

  // Calculate total milliseconds with overflow protection
  const totalMs = (minutes * 60 + seconds) * 1000;

  if (totalMs <= 0) {
    throw new Error("Timeout must be positive");
  }

  if (totalMs > MAX_TIMEOUT_MS) {
    console.error(`Warning: Timeout capped at 10 minutes (was ${input})`);
    return MAX_TIMEOUT_MS;
  }

  return totalMs;
}
