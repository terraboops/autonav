/**
 * Conversation module for interactive nav management
 *
 * Exports the runConversationTUI function which launches an Ink-based
 * conversational interface for managing navigators.
 */

import React from "react";
import { render } from "ink";
import { ConversationApp } from "./App.js";
import type { Harness } from "../harness/index.js";

export { buildConversationSystemPrompt } from "./prompts.js";

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
 * Options for running the conversation TUI
 */
export interface ConversationOptions {
  navigatorName: string;
  navigatorPath: string;
  navigatorSystemPrompt: string;
  knowledgeBasePath: string;
  harness?: Harness;
  mcpServers?: Record<string, unknown>;
}

/**
 * Run the interactive conversation TUI
 *
 * @param options - Navigator configuration for the conversation
 * @returns Promise that resolves when conversation ends
 * @throws Error if terminal doesn't support interactive mode
 */
export function runConversationTUI(options: ConversationOptions): Promise<void> {
  // Check for TTY support before attempting to render
  if (!isInteractiveTerminal()) {
    return Promise.reject(new Error(
      "Interactive conversation requires a TTY terminal."
    ));
  }

  return new Promise((resolve, reject) => {
    try {
      const instance = render(
        React.createElement(ConversationApp, options)
      );

      // Wait for the app to exit
      instance.waitUntilExit().then(() => {
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}
