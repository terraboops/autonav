/**
 * Interview module for interactive nav init
 *
 * Exports the runInterviewTUI function which launches an Ink-based
 * conversational interface for creating navigators.
 */

import React from "react";
import { render } from "ink";
import { InterviewApp } from "./App.js";
import type { NavigatorConfig, PackContext } from "./prompts.js";
import type { AnalysisResult } from "../repo-analyzer/index.js";
import type { InterviewProgress } from "./progress.js";

export type { NavigatorConfig, PackContext } from "./prompts.js";
export type { InterviewProgress } from "./progress.js";
export { getInterviewSystemPrompt } from "./prompts.js";
export {
  hasProgress,
  loadProgress,
  clearProgress,
  getProgressSummary,
} from "./progress.js";

/**
 * Options for the interview TUI
 */
export interface InterviewOptions {
  /** Path to the navigator directory */
  navigatorPath: string;
  /** Optional pack context to customize the interview */
  packContext?: PackContext;
  /** Optional analysis context from repository scan */
  analysisContext?: AnalysisResult;
  /** Optional saved progress to resume from */
  savedProgress?: InterviewProgress;
}

/**
 * Check if the current environment supports interactive TTY input
 */
export function isInteractiveTerminal(): boolean {
  return Boolean(
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    process.stdin.setRawMode
  );
}

/**
 * Run the interactive interview TUI
 *
 * @param name - Name of the navigator to create
 * @param options - Interview options (navigatorPath required, pack context, saved progress optional)
 * @returns Promise that resolves with the navigator configuration
 * @throws Error if terminal doesn't support interactive mode
 */
export function runInterviewTUI(
  name: string,
  options: InterviewOptions
): Promise<NavigatorConfig> {
  // Check for TTY support before attempting to render
  if (!isInteractiveTerminal()) {
    return Promise.reject(new Error(
      "Interactive interview requires a TTY terminal. Use --quick to skip the interview."
    ));
  }

  return new Promise((resolve, reject) => {
    let completed = false;

    const handleComplete = (config: NavigatorConfig) => {
      completed = true;
      instance.unmount();
      resolve(config);
    };

    const instance = render(
      React.createElement(InterviewApp, {
        name,
        navigatorPath: options.navigatorPath,
        packContext: options.packContext,
        analysisContext: options.analysisContext,
        initialMessages: options.savedProgress?.messages,
        onComplete: handleComplete,
      })
    );

    // Handle unmount without completion (user cancelled)
    instance.waitUntilExit().then(() => {
      if (!completed) {
        reject(new Error("Interview cancelled by user"));
      }
    });
  });
}
