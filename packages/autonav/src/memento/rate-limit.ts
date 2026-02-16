/**
 * Rate Limit Handling for Memento Loop
 *
 * Detects rate limits and implements retry with countdown.
 */

import chalk from "chalk";

/**
 * Parsed rate limit info from an error message
 */
export interface RateLimitInfo {
  /** Whether this is a rate limit error */
  isRateLimited: boolean;
  /** Parsed reset time if available */
  resetTime?: Date;
  /** Raw reset time string from error */
  resetTimeRaw?: string;
  /** Seconds until reset (if we could calculate it) */
  secondsUntilReset?: number;
}

/**
 * Parse a rate limit error message to extract reset time
 *
 * Looks for patterns like:
 * - "resets Feb 4, 9pm"
 * - "resets in 2 hours"
 * - "try again at 2026-02-04T21:00:00Z"
 * - "retry after 3600 seconds"
 */
export function parseRateLimitError(errorMessage: string): RateLimitInfo {
  const lowerMessage = errorMessage.toLowerCase();

  // Check if this is a rate limit error
  const isRateLimited =
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("rate_limit") ||
    lowerMessage.includes("usage limit") ||
    lowerMessage.includes("limit reached") ||
    lowerMessage.includes("you've hit your limit");

  if (!isRateLimited) {
    return { isRateLimited: false };
  }

  // Try to parse reset time
  let resetTime: Date | undefined;
  let resetTimeRaw: string | undefined;
  let secondsUntilReset: number | undefined;

  // Pattern: "resets Feb 4, 9pm" or "resets February 4, 9:00 PM"
  const resetsDateMatch = errorMessage.match(
    /resets?\s+([A-Za-z]+\s+\d{1,2},?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
  );
  if (resetsDateMatch?.[1]) {
    resetTimeRaw = resetsDateMatch[1];
    const parsed = parseFuzzyDateTime(resetTimeRaw);
    if (parsed) {
      resetTime = parsed;
      secondsUntilReset = Math.max(0, Math.floor((parsed.getTime() - Date.now()) / 1000));
    }
  }

  // Pattern: "resets in X hours/minutes"
  const resetsInMatch = errorMessage.match(
    /resets?\s+in\s+(\d+)\s*(hours?|minutes?|mins?|hrs?|seconds?|secs?)/i
  );
  if (resetsInMatch && !resetTime) {
    const amount = parseInt(resetsInMatch[1]!, 10);
    const unit = resetsInMatch[2]!.toLowerCase();
    let seconds = amount;
    if (unit.startsWith("hour") || unit.startsWith("hr")) {
      seconds = amount * 3600;
    } else if (unit.startsWith("min")) {
      seconds = amount * 60;
    }
    secondsUntilReset = seconds;
    resetTime = new Date(Date.now() + seconds * 1000);
    resetTimeRaw = `in ${amount} ${unit}`;
  }

  // Pattern: "retry after X seconds"
  const retryAfterMatch = errorMessage.match(/retry\s+after\s+(\d+)\s*(?:seconds?|secs?)?/i);
  if (retryAfterMatch && !resetTime) {
    const seconds = parseInt(retryAfterMatch[1]!, 10);
    secondsUntilReset = seconds;
    resetTime = new Date(Date.now() + seconds * 1000);
    resetTimeRaw = `${seconds} seconds`;
  }

  // Pattern: ISO datetime "2026-02-04T21:00:00Z"
  const isoMatch = errorMessage.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
  if (isoMatch && !resetTime) {
    const parsed = new Date(isoMatch[1]!);
    if (!isNaN(parsed.getTime())) {
      resetTime = parsed;
      resetTimeRaw = isoMatch[1];
      secondsUntilReset = Math.max(0, Math.floor((parsed.getTime() - Date.now()) / 1000));
    }
  }

  return {
    isRateLimited: true,
    resetTime,
    resetTimeRaw,
    secondsUntilReset,
  };
}

/**
 * Parse a fuzzy date/time string like "Feb 4, 9pm"
 */
function parseFuzzyDateTime(str: string): Date | null {
  try {
    // Add current year if not present
    const now = new Date();
    let dateStr = str.trim();

    // Normalize PM/AM
    dateStr = dateStr.replace(/(\d)\s*(pm|am)/i, "$1 $2");

    // Try parsing with current year
    const withYear = `${dateStr} ${now.getFullYear()}`;
    let parsed = new Date(withYear);

    // If that didn't work, try next year (for dates that wrapped)
    if (isNaN(parsed.getTime())) {
      parsed = new Date(`${dateStr} ${now.getFullYear() + 1}`);
    }

    // If the date is in the past, assume it's next occurrence
    if (parsed.getTime() < now.getTime()) {
      // Try adding a day, week, month, or year
      parsed = new Date(parsed.getTime() + 24 * 60 * 60 * 1000); // +1 day
      if (parsed.getTime() < now.getTime()) {
        parsed = new Date(`${dateStr} ${now.getFullYear() + 1}`);
      }
    }

    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Format seconds as human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Maximum wait time: 4 hours (just under session limit window)
 */
export const MAX_WAIT_SECONDS = 4 * 60 * 60; // 14400

/**
 * Exponential backoff delays (in seconds), capped at 4h
 */
export const BACKOFF_DELAYS = [
  60,      // 1 minute
  300,     // 5 minutes
  1800,    // 30 minutes
  7200,    // 2 hours
  14400,   // 4 hours (cap)
];

/**
 * Get the backoff delay for a given retry attempt
 */
export function getBackoffDelay(attempt: number): number {
  const index = Math.min(attempt, BACKOFF_DELAYS.length - 1);
  return BACKOFF_DELAYS[index]!;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait with countdown display
 *
 * @param seconds - Seconds to wait
 * @param onTick - Called every second with remaining time
 * @returns Promise that resolves when wait is complete
 */
export async function waitWithCountdown(
  seconds: number,
  onTick?: (remaining: number, formatted: string) => void
): Promise<void> {
  let remaining = seconds;

  while (remaining > 0) {
    if (onTick) {
      onTick(remaining, formatDuration(remaining));
    }
    await sleep(1000);
    remaining -= 1;
  }
}

/**
 * Print rate limit waiting message
 */
export function printRateLimitWait(info: RateLimitInfo, attempt: number): void {
  const waitTime = info.secondsUntilReset ?? getBackoffDelay(attempt);
  const formatted = formatDuration(waitTime);

  console.log("");
  console.log(chalk.yellow("⏳ Rate limited"));
  if (info.resetTimeRaw) {
    console.log(chalk.dim(`   Reset time: ${info.resetTimeRaw}`));
  }
  console.log(chalk.dim(`   Waiting ${formatted} before retry (attempt ${attempt + 1})...`));
}

/**
 * Check if an error is a transient connection error worth retrying.
 * These are common on flaky networks, CGNAT, or when connections go stale.
 */
export function isTransientConnectionError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused") ||
    lower.includes("epipe") ||
    lower.includes("ehostunreach") ||
    lower.includes("enetunreach") ||
    lower.includes("connection") && lower.includes("timeout") ||
    lower.includes("socket hang up") ||
    lower.includes("apiconnectiontimeouterror") ||
    lower.includes("apiconnectionerror") ||
    lower.includes("network") && lower.includes("error") ||
    lower.includes("fetch failed") ||
    lower.includes("aborted")
  );
}

/** Short delays for connection retries (seconds) — no need to wait long */
export const CONNECTION_RETRY_DELAYS = [
  5,    // 5 seconds
  15,   // 15 seconds
  30,   // 30 seconds
  60,   // 1 minute
  120,  // 2 minutes
];

/**
 * Get retry delay for a connection error attempt
 */
export function getConnectionRetryDelay(attempt: number): number {
  const index = Math.min(attempt, CONNECTION_RETRY_DELAYS.length - 1);
  return CONNECTION_RETRY_DELAYS[index]!;
}

/**
 * Configuration for rate limit retry behavior
 */
export interface RateLimitRetryConfig {
  /** Maximum number of retry attempts (default: 4) */
  maxRetries?: number;
  /** Whether to use parsed reset time or always use backoff (default: true) */
  useResetTime?: boolean;
  /** Callback for countdown updates */
  onCountdown?: (remaining: number, formatted: string) => void;
  /** Callback when rate limit is detected */
  onRateLimited?: (info: RateLimitInfo, attempt: number) => void;
}
