/**
 * Memento Loop Module
 *
 * Context-clearing iterative development loop that coordinates
 * navigator (planning) and implementer (implementation) agents.
 *
 * Design principle: Git is the only persistent memory. All other
 * state lives in-memory during loop execution.
 *
 * @example
 * ```typescript
 * import { runMementoLoop } from './memento';
 *
 * const result = await runMementoLoop(
 *   './my-code',
 *   './my-navigator',
 *   'Add user authentication',
 *   { maxIterations: 10, branch: 'feature/auth', verbose: true }
 * );
 *
 * console.log(`Completed in ${result.iterations} iterations`);
 * ```
 */

// Types
export {
  type ImplementationStep,
  type ImplementationPlan,
  type ImplementerResult,
  type MementoOptions,
  type MementoResult,
  ImplementationStepSchema,
  ImplementationPlanSchema,
} from "./types.js";

// Git operations
export {
  isGitRepo,
  ensureGitRepo,
  getCurrentBranch,
  createBranch,
  getRecentGitLog,
  getRecentDiff,
  getDiffStats,
  getLastCommitDiffStats,
  hasUncommittedChanges,
  stageAllChanges,
  commitChanges,
  pushBranch,
  createPullRequest,
  isGhAvailable,
  getRemoteUrl,
  type DiffStats,
} from "./git-operations.js";

// Nav protocol
export {
  createNavProtocolMcpServer,
  SUBMIT_PLAN_TOOL,
  type PlanSubmissionResult,
} from "./nav-protocol.js";

// Prompts
export {
  buildNavPlanPrompt,
  buildNavSystemPrompt,
  buildImplementerPrompt,
  buildImplementerSystemPrompt,
  type NavigatorIdentity,
} from "./prompts.js";

// Implementer agent
export {
  runImplementerAgent,
  type ImplementerAgentOptions,
} from "./implementer-agent.js";

// Main loop
export {
  runMementoLoop,
  type MementoLoopOptions,
} from "./loop.js";

// Rate limit handling
export {
  parseRateLimitError,
  isTransientConnectionError,
  formatDuration,
  getBackoffDelay,
  getConnectionRetryDelay,
  waitWithCountdown,
  type RateLimitInfo,
  type RateLimitRetryConfig,
} from "./rate-limit.js";

// Animation
export {
  MatrixAnimation,
  withMatrixAnimation,
  type AnimationStats,
} from "./matrix-animation.js";
