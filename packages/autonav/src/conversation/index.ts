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
  /** Whether sandbox is enabled for chat (default: true) */
  sandboxEnabled?: boolean;
  /** Raw config.json content for config-aware prompts */
  configJson?: string;
  /** Model override for the harness. When undefined, the harness uses its own default. */
  model?: string;
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

  // Suppress default SIGINT during the Ink session.
  // In raw mode Ctrl+C goes through useInput, but during startup/teardown
  // SIGINT can still slip through. Double-press within 2s forces immediate exit.
  let lastSigint = 0;
  const sigintHandler = () => {
    const now = Date.now();
    if (now - lastSigint < 2000) {
      process.exit(0);
    }
    lastSigint = now;
  };
  process.on("SIGINT", sigintHandler);

  return new Promise((resolve, reject) => {
    try {
      const instance = render(
        React.createElement(ConversationApp, options),
        { exitOnCtrlC: false }
      );

      // Wait for the app to exit, then restore terminal state
      instance.waitUntilExit().then(() => {
        process.removeListener("SIGINT", sigintHandler);
        instance.cleanup();
        resolve();
      });
    } catch (err) {
      process.removeListener("SIGINT", sigintHandler);
      reject(err);
    }
  });
}
