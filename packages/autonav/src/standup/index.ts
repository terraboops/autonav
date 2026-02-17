/**
 * Standup Module
 *
 * Multi-navigator stand-up mode that orchestrates parallel status reports
 * and sequential blocker sync across multiple navigators.
 *
 * @example
 * ```typescript
 * import { runStandup } from './standup';
 *
 * const result = await runStandup(
 *   ['./nav-a', './nav-b', './nav-c'],
 *   { verbose: true, model: 'claude-sonnet-4-5' }
 * );
 *
 * console.log(`Standup output: ${result.standupDir}`);
 * ```
 */

// Types
export {
  type Blocker,
  type StatusReport,
  type BlockerResolution,
  type SyncResponse,
  type StandupOptions,
  type StandupResult,
  BlockerSchema,
  StatusReportSchema,
  BlockerResolutionSchema,
  SyncResponseSchema,
} from "./types.js";

// Config
export { resolveConfigDir, createStandupDir } from "./config.js";

// Protocol
export {
  createReportProtocolTools,
  createSyncProtocolTools,
  SUBMIT_STATUS_REPORT_TOOL,
  SUBMIT_SYNC_RESPONSE_TOOL,
} from "./standup-protocol.js";

// Prompts
export {
  buildReportSystemPrompt,
  buildReportPrompt,
  buildSyncSystemPrompt,
  buildSyncPrompt,
  type NavigatorIdentity,
} from "./prompts.js";

// Main loop
export { runStandup, loadNavForStandup } from "./loop.js";
