/**
 * Interview progress persistence
 *
 * Saves interview state after each user reply to prevent data loss on failure.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface InterviewProgress {
  /** Navigator name */
  navigatorName: string;
  /** Conversation messages */
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  /** Pack context if provided */
  packContext?: {
    packName: string;
    packVersion: string;
    initGuide?: string;
  };
  /** Analysis context if provided */
  analysisContext?: {
    purpose: string;
    scope: string;
    audience: string;
    suggestedKnowledgePaths: string[];
    confidence: number;
  };
  /** Timestamp of last save */
  lastSaved: string;
}

const PROGRESS_FILENAME = ".autonav-init-progress.json";

/**
 * Get the path to the progress file for a navigator
 */
export function getProgressPath(navigatorPath: string): string {
  return path.join(navigatorPath, PROGRESS_FILENAME);
}

/**
 * Check if a progress file exists for a navigator
 */
export function hasProgress(navigatorPath: string): boolean {
  return fs.existsSync(getProgressPath(navigatorPath));
}

/**
 * Save interview progress to disk
 */
export function saveProgress(
  navigatorPath: string,
  progress: InterviewProgress
): void {
  const progressPath = getProgressPath(navigatorPath);

  // Ensure directory exists
  fs.mkdirSync(navigatorPath, { recursive: true });

  // Save with pretty formatting for readability
  const content = JSON.stringify(
    {
      ...progress,
      lastSaved: new Date().toISOString(),
    },
    null,
    2
  );

  fs.writeFileSync(progressPath, content, "utf-8");
}

/**
 * Load interview progress from disk
 */
export function loadProgress(navigatorPath: string): InterviewProgress | null {
  const progressPath = getProgressPath(navigatorPath);

  if (!fs.existsSync(progressPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(progressPath, "utf-8");
    return JSON.parse(content) as InterviewProgress;
  } catch (error) {
    // If parsing fails, return null (corrupted file)
    console.warn(
      `Warning: Could not parse progress file: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Delete progress file after successful completion
 */
export function clearProgress(navigatorPath: string): void {
  const progressPath = getProgressPath(navigatorPath);

  if (fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
  }
}

/**
 * Get a summary of saved progress for display to user
 */
export function getProgressSummary(progress: InterviewProgress): string {
  const messageCount = progress.messages.length;
  const lastSaved = new Date(progress.lastSaved);
  const timeAgo = getTimeAgo(lastSaved);

  return `Found saved progress from ${timeAgo} (${messageCount} message${messageCount === 1 ? "" : "s"})`;
}

/**
 * Helper to get human-readable time difference
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}
