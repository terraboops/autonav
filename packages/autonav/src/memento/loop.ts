/**
 * Memento Loop Core Logic
 *
 * The main loop that coordinates navigator planning and implementer implementation
 * in a context-clearing iterative development pattern.
 *
 * Design principle: The IMPLEMENTER forgets between iterations (memento pattern).
 * The NAVIGATOR maintains its own memory and knowledge base. We provide git
 * history as context about what the implementer has accomplished so far.
 */

import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { MementoOptions, MementoResult, ImplementationPlan } from "./types.js";
import { ClaudeAdapter } from "../adapter/index.js";
import { loadNavigator } from "../query-engine/index.js";
import chalk from "chalk";
import {
  ensureGitRepo,
  createBranch,
  getCurrentBranch,
  getRecentGitLog,
  getRecentDiff,
  getLastCommitDiffStats,
  hasUncommittedChanges,
  stageAllChanges,
  commitChanges,
  pushBranch,
  createPullRequest,
  isGhAvailable,
} from "./git-operations.js";
import { createNavProtocolMcpServer } from "./nav-protocol.js";
import {
  buildNavPlanPrompt,
  buildNavSystemPrompt,
  buildReviewPrompt,
  buildFixPrompt,
  buildFixSystemPrompt,
  type NavigatorIdentity,
} from "./prompts.js";
import { MatrixAnimation } from "./matrix-animation.js";
import {
  parseRateLimitError,
  formatDuration,
  getBackoffDelay,
  getConnectionRetryDelay,
  isTransientConnectionError,
  waitWithCountdown,
  MAX_WAIT_SECONDS,
  type RateLimitInfo,
} from "./rate-limit.js";

const DEBUG = process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1";

/**
 * Filter stderr lines to extract meaningful error information.
 * The SDK emits a "Spawning Claude Code process" line that includes
 * the entire system prompt and all CLI flags, which is enormous noise.
 * We strip that out and keep only actual error/diagnostic lines.
 */
function filterStderr(lines: string[]): string {
  return lines
    .filter((line) => !line.startsWith("Spawning Claude Code process"))
    .join("")
    .trim();
}

// ── Mood message pools ──────────────────────────────────────────────────────

const NAV_START = [
  "Surveying the landscape...",
  "Getting oriented...",
  "Scanning the terrain...",
];

const NAV_EXPLORING = [
  "Deep in thought...",
  "Connecting the dots...",
  "Piecing it together...",
  "Following the thread...",
];

const NAV_THOROUGH = [
  "Leaving no stone unturned...",
  "Thoroughly investigating...",
  "Going deeper...",
];

const NAV_PLANNING = [
  "The plan crystallizes...",
  "Eureka!",
  "I see the path forward...",
];

const NAV_ERROR = [
  "Hmm, that's odd...",
  "Recalibrating...",
  "Unexpected terrain...",
];

const IMPL_START = [
  "Rolling up sleeves...",
  "Let's do this...",
  "Warming up...",
];

const IMPL_READING = [
  "Studying the target...",
  "Reading the blueprints...",
  "Reviewing the plan...",
];

const IMPL_WRITING = [
  "Fingers flying...",
  "In the zone...",
  "Crafting code...",
  "Shaping the solution...",
];

const IMPL_BUILDING = [
  "Moment of truth...",
  "Compiling hopes and dreams...",
  "Building...",
];

const IMPL_TESTING = [
  "Crossing fingers...",
  "Testing fate...",
  "Validating...",
];

const IMPL_FLOWING = [
  "On a roll!",
  "Flow state achieved...",
  "Unstoppable...",
];

const IMPL_ERROR = [
  "Plot twist!",
  "Hmm, let me reconsider...",
  "Not quite...",
  "Adjusting approach...",
];

// Review-fix mood escalation pools (one per round)
const REVIEW_FIX_MOODS: string[][] = [
  // Round 1: gracious
  [
    "Addressing feedback...",
    "Fair point, bestie...",
    "Noted with love...",
    "Okay I see you...",
    "Valid, fixing...",
    "The reviewer has a point...",
    "Constructive! We love to see it...",
    "Taking notes...",
  ],
  // Round 2: slightly sassy
  [
    "Alright alright...",
    "Back at it...",
    "More feedback? Cute.",
    "Revising... again...",
    "We're still doing this? Okay.",
    "Serving second draft realness...",
    "This better be the last time...",
    "Slay... I guess...",
  ],
  // Round 3: frustrated fabulous
  [
    "Oh we're STILL going?",
    "Girl, AGAIN?!",
    "This code is my villain arc...",
    "Is this a personal attack?",
    "Mother is not pleased...",
    "Living my revision fantasy...",
    "Not another round...",
    "The drama of it all...",
  ],
  // Round 4: unhinged
  [
    "ARE YOU KIDDING ME?!",
    "I'm literally going to scream...",
    "This is my 13th reason...",
    "I can't even right now...",
    "The audacity...",
    "I did NOT sign up for this...",
    "Gaslight gatekeep girlboss... code review?",
    "Main character syndrome: reviewer edition...",
  ],
  // Round 5: acceptance / chaos
  [
    "FINE. TAKE IT.",
    "Shipping it. Fight me.",
    "Whatever, it's art.",
    "This is camp now.",
    "It's giving... done.",
    "No thoughts, just commits...",
    "Unhinged and merging...",
    "Period. End of discussion.",
  ],
];

// ── Mood state & helpers ────────────────────────────────────────────────────

interface MoodState {
  toolCount: number;
  lastError: boolean;
  consecutiveSuccess: number;
}

function randomFrom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]!;
}

function isBuildCommand(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName !== "Bash") return false;
  const cmd = (input.command as string) || "";
  return /\b(build|compile|tsc|webpack|esbuild)\b/.test(cmd);
}

function isTestCommand(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName !== "Bash") return false;
  const cmd = (input.command as string) || "";
  return /\b(test|jest|vitest|check|lint)\b/.test(cmd);
}

function isWriteTool(toolName: string): boolean {
  return toolName === "Write" || toolName === "Edit" || toolName === "str_replace_based_edit_tool";
}

function isReadTool(toolName: string): boolean {
  return toolName === "Read" || toolName === "Glob" || toolName === "Grep";
}

function pickMood(
  phase: "nav" | "impl",
  toolName: string,
  input: Record<string, unknown>,
  state: MoodState
): string {
  if (state.lastError) {
    return randomFrom(phase === "nav" ? NAV_ERROR : IMPL_ERROR);
  }

  if (phase === "nav") {
    if (toolName === "submit_implementation_plan") return randomFrom(NAV_PLANNING);
    if (state.toolCount <= 2) return randomFrom(NAV_START);
    if (state.toolCount >= 10) return randomFrom(NAV_THOROUGH);
    return randomFrom(NAV_EXPLORING);
  }

  // impl phase
  if (state.consecutiveSuccess >= 8) return randomFrom(IMPL_FLOWING);
  if (state.toolCount <= 2) return randomFrom(IMPL_START);
  if (isBuildCommand(toolName, input)) return randomFrom(IMPL_BUILDING);
  if (isTestCommand(toolName, input)) return randomFrom(IMPL_TESTING);
  if (isWriteTool(toolName)) return randomFrom(IMPL_WRITING);
  if (isReadTool(toolName)) return randomFrom(IMPL_READING);
  return randomFrom(IMPL_READING);
}

// ── Rate limit retry wrapper ────────────────────────────────────────────────

/**
 * Check if an error message indicates a rate limit
 */
function isRateLimitError(error: unknown): RateLimitInfo {
  const message = error instanceof Error ? error.message : String(error);
  return parseRateLimitError(message);
}

/**
 * Wait for rate limit to reset with countdown display
 */
async function waitForRateLimit(
  info: RateLimitInfo,
  attempt: number,
  animation: MatrixAnimation | null,
  verbose: boolean
): Promise<void> {
  // Determine wait time: use parsed reset time or exponential backoff
  // Cap at 5h (session limit window) to avoid waiting for weekly resets
  let waitSeconds: number;
  if (info.secondsUntilReset && info.secondsUntilReset > 0) {
    // Add 30 second buffer to parsed reset time, cap at 5h
    waitSeconds = Math.min(info.secondsUntilReset + 30, MAX_WAIT_SECONDS);
  } else {
    waitSeconds = getBackoffDelay(attempt);
  }

  // Stop animation while waiting
  if (animation) {
    animation.stop();
  }

  // Print rate limit info
  console.log("");
  console.log(chalk.yellow("⏳ Rate limited"));
  if (info.resetTimeRaw) {
    console.log(chalk.dim(`   Reset time: ${info.resetTimeRaw}`));
  }
  console.log(
    chalk.dim(`   Waiting ${formatDuration(waitSeconds)} before retry (attempt ${attempt + 1})...`)
  );

  // Wait with countdown
  await waitWithCountdown(waitSeconds, (remaining, formatted) => {
    // Update countdown every 10 seconds or for last 10 seconds
    if (remaining % 10 === 0 || remaining <= 10) {
      process.stdout.write(`\r${chalk.dim(`   Resuming in ${formatted}...`)}${" ".repeat(20)}`);
    }
  });

  console.log(`\r${chalk.green("   Resuming...")}${" ".repeat(30)}`);
  console.log("");

  // Restart animation if it was running
  if (animation && !verbose) {
    animation.start();
  }
}

/**
 * Options for the memento loop
 */
export interface MementoLoopOptions extends MementoOptions {
  /** Model to use for implementer agent (default: claude-haiku-4-5) */
  model?: string;

  /** Model to use for navigator agent (default: claude-opus-4-5) */
  navModel?: string;

  /** Maximum turns per agent call */
  maxTurns?: number;
}

/**
 * In-memory loop state (not persisted)
 */
interface LoopState {
  iteration: number;
  completionMessage?: string; // Last advisory message from nav
  planHistory: Array<{ iteration: number; summary: string }>;
  // Cumulative stats across all iterations
  stats: {
    linesAdded: number;
    linesRemoved: number;
    tokensUsed: number;
    lastTool?: string;
  };
}

/**
 * Load navigator config from config.json
 */
function loadNavConfig(navDirectory: string): NavigatorIdentity | null {
  const configPath = path.join(navDirectory, "config.json");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.name && config.description) {
      return {
        name: config.name,
        description: config.description,
      };
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

/**
 * Load navigator system prompt from CLAUDE.md
 */
function loadNavSystemPrompt(navDirectory: string): string {
  const claudeMdPath = path.join(navDirectory, "CLAUDE.md");

  if (!fs.existsSync(claudeMdPath)) {
    throw new Error(`Navigator CLAUDE.md not found at: ${claudeMdPath}`);
  }

  return fs.readFileSync(claudeMdPath, "utf-8");
}

/**
 * Prompt user for input
 */
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Generate a commit message from the current diff using a quick LLM call
 */
async function generateCommitMessage(codeDirectory: string): Promise<string> {
  const diff = getRecentDiff({ cwd: codeDirectory });
  if (!diff) return "chore: commit uncommitted changes";

  // Truncate diff to avoid huge prompts
  const truncatedDiff = diff.length > 4000
    ? diff.substring(0, 4000) + "\n... (truncated)"
    : diff;

  const prompt = `Generate a single-line conventional commit message (e.g. "feat: ...", "fix: ...", "chore: ...") for these changes. Reply with ONLY the commit message, nothing else.\n\n${truncatedDiff}`;

  try {
    const iter = query({
      prompt,
      options: {
        model: "claude-haiku-4-5",
        maxTurns: 1,
        systemPrompt: "You generate concise conventional commit messages. Reply with only the commit message.",
        cwd: codeDirectory,
        permissionMode: "bypassPermissions",
        allowedTools: [],
      },
    });

    let message = "";
    for await (const msg of iter) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            message += block.text;
          }
        }
      }
    }

    // Clean up: take first line, strip quotes
    const cleaned = message.trim().split("\n")[0]?.replace(/^["']|["']$/g, "").trim();
    return cleaned || "chore: commit uncommitted changes";
  } catch {
    return "chore: commit uncommitted changes";
  }
}

/**
 * Update the navigator's knowledge base with the implementer's summary.
 * Calls the full `autonav update` pipeline (ClaudeAdapter.update) so the
 * navigator agent can write to its own knowledge/ directory.
 */
async function updateNavigatorKnowledge(
  navDirectory: string,
  summary: string,
  commitHash: string | null,
  verbose: boolean
): Promise<void> {
  const updateMessage = commitHash
    ? `The implementer just completed work and committed ${commitHash}. Summary of what was implemented:\n\n${summary}`
    : `The implementer just completed work (no commit). Summary:\n\n${summary}`;

  try {
    const navigator = loadNavigator(navDirectory);
    const adapter = new ClaudeAdapter();
    await adapter.update(navigator, updateMessage);

    if (verbose) {
      console.log("[Update] Navigator knowledge base updated");
    }
  } catch (err) {
    // Non-fatal — log and continue
    if (verbose) {
      console.log(
        chalk.yellow(
          `[Update] Failed to update navigator: ${err instanceof Error ? err.message : err}`
        )
      );
    }
  }
}

/**
 * Ask the navigator to review uncommitted changes, fix issues, then commit
 */
async function reviewAndFixChanges(
  codeDirectory: string,
  navDirectory: string,
  _navSystemPrompt: string,
  navIdentity: NavigatorIdentity | null,
  options: MementoLoopOptions
): Promise<void> {
  const { verbose = false } = options;
  const diff = getRecentDiff({ cwd: codeDirectory });
  if (!diff) return;

  const truncatedDiff = diff.length > 8000
    ? diff.substring(0, 8000) + "\n... (truncated)"
    : diff;

  const navName = navIdentity?.name || "navigator";

  // Step 1: Ask navigator for review (single-turn, no tool use)
  console.log(chalk.dim(`\nAsking ${navName} to review changes...`));

  const reviewPrompt = `Review the following diff for bugs, correctness issues, or missing error handling. Do NOT use any tools — just read the diff and respond.

Respond in EXACTLY one of these formats:

If no issues: Reply with only "LGTM"

If issues found: Reply with a bullet list, one issue per line:
- [file:line] Issue description. Fix: what to do.
- [file:line] Issue description. Fix: what to do.

Then add a blank line and implementation instructions for an automated agent to fix each issue.

Do NOT suggest style improvements, refactors, or nice-to-haves. Only flag things that are bugs or will cause runtime errors.

\`\`\`diff
${truncatedDiff}
\`\`\``;

  let reviewResult = "";
  try {
    const reviewIter = query({
      prompt: reviewPrompt,
      options: {
        model: options.navModel || "claude-opus-4-5",
        maxTurns: 1, // Single turn — no tool use, just read the diff
        systemPrompt: "You are a code reviewer. Be concise and actionable. Never use tools — respond directly.",
        cwd: navDirectory,
        permissionMode: "bypassPermissions",
        allowedTools: [],
      },
    });

    for await (const msg of reviewIter) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            reviewResult += block.text;
          }
        }
      }
    }
  } catch (err) {
    console.log(chalk.yellow(`\nReview failed: ${err instanceof Error ? err.message : err}`));
    console.log(chalk.dim("Committing as-is."));
    stageAllChanges({ cwd: codeDirectory });
    const commitMsg = await generateCommitMessage(codeDirectory);
    const hash = commitChanges(commitMsg, { cwd: codeDirectory, verbose });
    if (hash) console.log(`\n${chalk.green("Committed:")} ${hash}\n`);
    return;
  }

  // Check if navigator said LGTM
  if (reviewResult.trim().toUpperCase().startsWith("LGTM")) {
    console.log(chalk.green(`\n${navName} says: LGTM`));
    stageAllChanges({ cwd: codeDirectory });
    const commitMsg = await generateCommitMessage(codeDirectory);
    const hash = commitChanges(commitMsg, { cwd: codeDirectory, verbose });
    if (hash) console.log(`${chalk.green("Committed:")} ${hash}\n`);
    return;
  }

  // Step 2: Show bullet points of issues found
  const bulletLines = reviewResult.trim().split("\n").filter(l => l.trim().startsWith("- "));
  console.log(chalk.dim(`\n${navName} found ${bulletLines.length} issue${bulletLines.length !== 1 ? "s" : ""}:`));
  for (const bullet of bulletLines) {
    console.log(chalk.yellow(`  ${bullet}`));
  }
  if (verbose) {
    // Show full review including implementation instructions
    console.log(chalk.dim("\nFull review:"));
    console.log(reviewResult);
  }

  console.log(chalk.dim("\nFixing issues..."));

  const { buildImplementerPrompt, buildImplementerSystemPrompt } = await import("./prompts.js");

  // Build a plan from the review
  const fixPlan: ImplementationPlan = {
    summary: "Fix issues found in code review",
    steps: [{ description: reviewResult }],
    validationCriteria: ["All review issues addressed"],
    isComplete: false,
  };

  const fixPrompt = buildImplementerPrompt(codeDirectory, fixPlan);
  const fixSystemPrompt = buildImplementerSystemPrompt(codeDirectory);

  try {
    const fixIter = query({
      prompt: fixPrompt,
      options: {
        model: options.model || "claude-haiku-4-5",
        maxTurns: options.maxTurns || 50,
        systemPrompt: fixSystemPrompt,
        cwd: codeDirectory,
        permissionMode: "bypassPermissions",
      },
    });

    for await (const msg of fixIter) {
      if (verbose && msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            console.log(`[Fix] Tool: ${block.name}`);
          }
        }
      }
    }
  } catch (err) {
    console.log(chalk.yellow(`\nFix failed: ${err instanceof Error ? err.message : err}`));
    console.log(chalk.dim("Committing as-is."));
  }

  // Step 3: Commit everything (original changes + fixes)
  stageAllChanges({ cwd: codeDirectory });
  const commitMsg = await generateCommitMessage(codeDirectory);
  const hash = commitChanges(commitMsg, { cwd: codeDirectory, verbose });
  if (hash) console.log(`\n${chalk.green("Committed:")} ${hash}\n`);
}

/**
 * Review implementation changes (Phase 3 of the 4-phase iteration loop).
 *
 * Runs up to 5 review-fix cycles:
 *   1. Stage changes and get diff
 *   2. Ask opus to review (single-turn, no tools)
 *   3. If LGTM → done
 *   4. If issues → ask haiku to fix, then re-review
 *
 * Returns whether the review passed and whether fixes were applied.
 */
async function reviewImplementation(
  codeDirectory: string,
  navDirectory: string,
  options: MementoLoopOptions,
  animation: MatrixAnimation,
  verbose: boolean
): Promise<{ lgtm: boolean; fixApplied: boolean }> {
  const MAX_REVIEW_ROUNDS = 5;
  let fixApplied = false;

  for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
    // Stage and get diff
    stageAllChanges({ cwd: codeDirectory });
    const diff = getRecentDiff({ cwd: codeDirectory });

    if (!diff) {
      // No changes to review
      return { lgtm: true, fixApplied };
    }

    // Update animation for review phase (greenBright bold to stand out)
    animation.setMessageColor(chalk.greenBright.bold);
    animation.setMessage(`Reviewing... (round ${round}/${MAX_REVIEW_ROUNDS})`);
    animation.resetTurns();

    if (verbose) {
      console.log(`\n[Review] Round ${round}/${MAX_REVIEW_ROUNDS}`);
    }

    // Ask opus to review the diff (single-turn, no tools)
    let reviewResult = "";
    try {
      const reviewIter = query({
        prompt: buildReviewPrompt(diff),
        options: {
          model: options.navModel || "claude-opus-4-5",
          maxTurns: 1,
          systemPrompt:
            "You are a code reviewer. Be concise and actionable. Never use tools — respond directly.",
          cwd: navDirectory,
          permissionMode: "bypassPermissions",
          allowedTools: [],
        },
      });

      for await (const msg of reviewIter) {
        if (msg.type === "assistant") {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              reviewResult += block.text;
            }
          }
        }
      }
    } catch (err) {
      if (verbose) {
        console.log(
          chalk.yellow(`\n[Review] Failed: ${err instanceof Error ? err.message : err}`)
        );
      }
      // Review failed — commit as-is
      return { lgtm: false, fixApplied };
    }

    // Check if LGTM
    if (reviewResult.trim().toUpperCase().startsWith("LGTM")) {
      if (verbose) {
        console.log(chalk.green("[Review] LGTM"));
      }
      return { lgtm: true, fixApplied };
    }

    // Show issues found
    const bulletLines = reviewResult
      .trim()
      .split("\n")
      .filter((l) => l.trim().startsWith("- "));

    if (!verbose) {
      animation.stop();
      console.log(
        chalk.dim(
          `  └─ Review round ${round}: ${bulletLines.length} issue${bulletLines.length !== 1 ? "s" : ""}`
        )
      );
      for (const bullet of bulletLines) {
        console.log(chalk.yellow(`     ${bullet}`));
      }
    } else {
      console.log(
        `[Review] Found ${bulletLines.length} issue${bulletLines.length !== 1 ? "s" : ""}:`
      );
      for (const bullet of bulletLines) {
        console.log(chalk.yellow(`  ${bullet}`));
      }
    }

    // Pick mood for fix phase based on round
    const moodPool = REVIEW_FIX_MOODS[round - 1] ?? REVIEW_FIX_MOODS[4]!;
    const fixMood = randomFrom(moodPool);

    if (!verbose) {
      animation.setMessage(fixMood);
      animation.resetTurns();
      animation.start();
    }

    // Ask haiku to fix the issues
    try {
      const fixIter = query({
        prompt: buildFixPrompt(codeDirectory, reviewResult),
        options: {
          model: options.model || "claude-haiku-4-5",
          maxTurns: options.maxTurns || 50,
          systemPrompt: buildFixSystemPrompt(codeDirectory),
          cwd: codeDirectory,
          permissionMode: "bypassPermissions",
        },
      });

      for await (const msg of fixIter) {
        if (msg.type === "assistant") {
          for (const block of msg.message.content) {
            if (block.type === "tool_use") {
              if (verbose) {
                console.log(`[Fix] Tool: ${block.name}`);
              }
              animation.setLastTool(block.name);
              animation.incrementTurns();
            }
          }
        }
      }

      fixApplied = true;
    } catch (err) {
      if (verbose) {
        console.log(
          chalk.yellow(`\n[Fix] Failed: ${err instanceof Error ? err.message : err}`)
        );
      }
      // Fix failed — commit as-is
      return { lgtm: false, fixApplied };
    }
  }

  // Exhausted all rounds without LGTM
  if (verbose) {
    console.log(chalk.yellow("[Review] Max review rounds reached — committing anyway"));
  }
  return { lgtm: false, fixApplied };
}

/**
 * Handle uncommitted changes in the code directory
 *
 * The memento loop provides git history to the navigator as context about
 * what the worker has accomplished. Uncommitted changes won't appear in
 * that summary, which could cause confusion.
 */
async function handleUncommittedChanges(
  codeDirectory: string,
  navDirectory: string,
  navSystemPrompt: string,
  navIdentity: NavigatorIdentity | null,
  options: MementoLoopOptions
): Promise<void> {
  const { verbose = false } = options;

  if (!hasUncommittedChanges({ cwd: codeDirectory })) {
    return;
  }

  const navName = navIdentity?.name || "navigator";

  // Show warning
  console.log(chalk.yellow("\nUncommitted changes detected.\n"));
  console.log(chalk.dim("The memento loop uses git history as context for the navigator."));
  console.log(chalk.dim("Uncommitted changes won't be visible.\n"));

  // Show brief diff summary
  const diff = getRecentDiff({ cwd: codeDirectory });
  if (diff) {
    const lineCount = diff.split("\n").length;
    const addedCount = diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
    const removedCount = diff.split("\n").filter(l => l.startsWith("-") && !l.startsWith("---")).length;
    console.log(chalk.dim(`  ${lineCount} lines changed (${chalk.green(`+${addedCount}`)} ${chalk.red(`-${removedCount}`)})` ));
    console.log("");
  }

  console.log("  [c] Commit (auto-generate message)");
  console.log(`  [r] Ask ${navName} to review, fix issues, then commit`);
  console.log("  [d] Discard changes");
  console.log("  [q] Quit\n");

  const answer = await promptUser("Choice [c/r/d/q]: ");

  switch (answer) {
    case "c":
    case "commit": {
      console.log(chalk.dim("\nGenerating commit message..."));
      stageAllChanges({ cwd: codeDirectory });
      const message = await generateCommitMessage(codeDirectory);
      const hash = commitChanges(message, { cwd: codeDirectory, verbose });
      if (hash) {
        console.log(`${chalk.green("Committed:")} ${hash} - ${message}\n`);
      }
      break;
    }

    case "r":
    case "review": {
      await reviewAndFixChanges(
        codeDirectory,
        navDirectory,
        navSystemPrompt,
        navIdentity,
        options
      );
      break;
    }

    case "d":
    case "discard": {
      console.log(chalk.red("\nThis will permanently delete uncommitted changes!"));
      const confirm = await promptUser("Type 'yes' to confirm: ");
      if (confirm !== "yes") {
        throw new Error("Discard cancelled");
      }
      const { execSync } = await import("node:child_process");
      execSync("git checkout -- . && git clean -fd", {
        cwd: codeDirectory,
        stdio: verbose ? "inherit" : "pipe",
      });
      console.log(chalk.green("\nChanges discarded.\n"));
      break;
    }

    case "q":
    case "quit":
    default:
      throw new Error("Aborted by user");
  }
}

/**
 * Result from nav query with stats
 */
interface NavQueryResult {
  plan: ImplementationPlan | null;
  tokensUsed: number;
  lastTool?: string;
}

/**
 * Query the navigator for an implementation plan (with stats tracking)
 */
async function queryNavForPlanWithStats(
  codeDirectory: string,
  navDirectory: string,
  task: string,
  iteration: number,
  maxIterations: number,
  navSystemPrompt: string,
  navIdentity: NavigatorIdentity | null,
  gitLog: string,
  options: MementoLoopOptions,
  animation: MatrixAnimation,
  verbose: boolean
): Promise<NavQueryResult> {
  // Navigator uses opus by default for better planning
  const { navModel: model = "claude-opus-4-5", maxTurns = 50 } = options;

  // Create MCP server with plan submission tool
  const navProtocol = createNavProtocolMcpServer();

  const prompt = buildNavPlanPrompt(
    { codeDirectory, task, iteration, maxIterations, branch: options.branch },
    gitLog,
    navIdentity
  );
  const systemPrompt = buildNavSystemPrompt(navSystemPrompt);

  if (verbose) {
    console.log("\n[Nav] Querying navigator for plan...");
    console.log(`[Nav] Model: ${model}`);
  }

  // Capture stderr from Claude Code process for diagnostics
  const stderrLines: string[] = [];
  const queryIterator = query({
    prompt,
    options: {
      model,
      maxTurns,
      systemPrompt,
      cwd: navDirectory,
      additionalDirectories: [codeDirectory],
      mcpServers: {
        "autonav-nav-protocol": navProtocol.server,
      },
      permissionMode: "bypassPermissions",
      disallowedTools: ["Write", "Edit", "Bash"],
      stderr: (data: string) => {
        stderrLines.push(data);
        if (DEBUG) {
          process.stderr.write(`[Nav stderr] ${data}`);
        }
      },
    },
  });

  let resultMessage: SDKResultMessage | undefined;
  let lastTool: string | undefined;
  const mood: MoodState = { toolCount: 0, lastError: false, consecutiveSuccess: 0 };

  try {
    for await (const message of queryIterator) {
      // Detect errors from tool results
      if (message.type === "user") {
        const msg = message as Record<string, unknown>;
        if (msg.tool_use_result !== undefined) {
          const result = msg.tool_use_result;
          if (typeof result === "string" && /^(Error:|error:)/i.test(result)) {
            mood.lastError = true;
            mood.consecutiveSuccess = 0;
            animation.setMessage(pickMood("nav", lastTool || "", {}, mood));
          }
        }
      }

      if (message.type === "assistant") {
        // Check for rate limit error on the message itself
        if (message.error === "rate_limit") {
          const stderr = filterStderr(stderrLines);
          throw new Error(
            `Rate limit reached during navigator query${stderr ? `\nStderr:\n${stderr}` : ""}`
          );
        }

        const content = message.message.content;
        for (const block of content) {
          if (block.type === "tool_use") {
            const toolName = block.name.split("__").pop() || block.name;
            lastTool = toolName;
            mood.toolCount += 1;
            if (!mood.lastError) {
              mood.consecutiveSuccess += 1;
            }
            mood.lastError = false;

            if (verbose) {
              console.log(`[Nav] Tool: ${toolName}`);
            }

            const input = (block.input as Record<string, unknown>) || {};
            animation.setMessage(pickMood("nav", toolName, input, mood));
            animation.setLastTool(toolName);
            animation.incrementTurns();
          }
        }
      }

      if (message.type === "result") {
        resultMessage = message;
      }
    }
  } catch (err) {
    // SDK throws when the Claude Code process crashes (e.g. exit code 1).
    // Enrich the error with filtered stderr (strip the noisy spawn command line).
    const stderr = filterStderr(stderrLines);
    const base = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Navigator query failed: ${base}${stderr ? `\nStderr:\n${stderr}` : ""}`
    );
  }

  // Extract token usage from result (input + output = total)
  const usage = resultMessage?.usage;
  const tokensUsed = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

  if (verbose) {
    console.log(`[Nav] Result message type: ${resultMessage?.type}, subtype: ${resultMessage?.subtype}`);
    console.log(`[Nav] Usage: input=${usage?.input_tokens}, output=${usage?.output_tokens}, total=${tokensUsed}`);
    // Show per-model breakdown if available
    const modelUsage = (resultMessage as any)?.modelUsage;
    if (modelUsage) {
      console.log(`[Nav] Model usage breakdown:`);
      for (const [model, stats] of Object.entries(modelUsage)) {
        const s = stats as any;
        console.log(`  ${model}: in=${s.inputTokens}, out=${s.outputTokens}, cost=$${s.costUSD?.toFixed(4)}`);
      }
    }
    console.log(`[Nav] Total cost: $${(resultMessage as any)?.total_cost_usd?.toFixed(4) || "?"}`);
  }

  if (!resultMessage || resultMessage.subtype !== "success") {
    const errorDetails =
      resultMessage && "errors" in resultMessage
        ? resultMessage.errors.join(", ")
        : "Unknown error";
    const stderr = filterStderr(stderrLines);
    throw new Error(
      `Navigator query failed: ${errorDetails}${stderr ? `\nStderr:\n${stderr}` : ""}`
    );
  }

  // Get the captured plan from the MCP server
  const plan = navProtocol.getCapturedPlan();

  if (!plan) {
    throw new Error(
      "Navigator did not submit a plan. The navigator must use the submit_implementation_plan tool."
    );
  }

  if (verbose) {
    console.log(`[Nav] Plan received: ${plan.summary}`);
    console.log(`[Nav] Steps: ${plan.steps.length}`);
    console.log(`[Nav] Complete: ${plan.isComplete}`);
  }

  return { plan, tokensUsed, lastTool };
}

/**
 * Result from implementer with stats
 */
interface ImplementerResultWithStats {
  success: boolean;
  summary: string;
  filesModified: string[];
  errors?: string[];
  tokensUsed: number;
  lastTool?: string;
}

/**
 * Run implementer agent with stats tracking.
 *
 * Retries internally on rate limits and transient errors rather than
 * bailing out. The implementer keeps going until it succeeds or
 * Retries forever with exponential backoff (capped at 4h).
 */
async function runImplementerAgentWithStats(
  context: { codeDirectory: string; task: string },
  plan: ImplementationPlan,
  options: { verbose?: boolean; model?: string; maxTurns?: number },
  animation: MatrixAnimation
): Promise<ImplementerResultWithStats> {
  // Implementer uses haiku by default for faster/cheaper implementation
  const { verbose = false, model = "claude-haiku-4-5", maxTurns = 50 } = options;

  const { buildImplementerPrompt, buildImplementerSystemPrompt } = await import("./prompts.js");

  const prompt = buildImplementerPrompt(context.codeDirectory, plan);
  const systemPrompt = buildImplementerSystemPrompt(context.codeDirectory);

  if (verbose) {
    console.log("\n[Implementer] Starting implementation...");
    console.log(`[Implementer] Model: ${model}`);
  }

  // Accumulate across retries
  const allFilesModified: string[] = [];
  let totalTokensUsed = 0;
  let lastTool: string | undefined;
  let lastAssistantText = "";

  for (let attempt = 0; ; attempt++) {
    // Capture stderr from Claude Code process for diagnostics
    const implStderrLines: string[] = [];
    const queryIterator = query({
      prompt,
      options: {
        model,
        maxTurns,
        systemPrompt,
        cwd: context.codeDirectory,
        permissionMode: "bypassPermissions",
        stderr: (data: string) => {
          implStderrLines.push(data);
          if (DEBUG) {
            process.stderr.write(`[Impl stderr] ${data}`);
          }
        },
      },
    });

    let resultMessage: SDKResultMessage | undefined;
    let rateLimitSeen = false;
    const mood: MoodState = { toolCount: 0, lastError: false, consecutiveSuccess: 0 };

    try {
      for await (const message of queryIterator) {
        // Detect errors from tool results
        if (message.type === "user") {
          const msg = message as Record<string, unknown>;
          if (msg.tool_use_result !== undefined) {
            const result = msg.tool_use_result;
            if (typeof result === "string" && /^(Error:|error:)/i.test(result)) {
              mood.lastError = true;
              mood.consecutiveSuccess = 0;
              animation.setMessage(pickMood("impl", lastTool || "", {}, mood));
            }
          }
        }

        if (message.type === "assistant") {
          // Track rate limit errors on messages (don't bail, just note it)
          if (message.error === "rate_limit") {
            rateLimitSeen = true;
          }

          const content = message.message.content;
          for (const block of content) {
            if (block.type === "tool_use") {
              const toolName = block.name;
              lastTool = toolName;
              mood.toolCount += 1;
              if (!mood.lastError) {
                mood.consecutiveSuccess += 1;
              }
              mood.lastError = false;

              if (verbose) {
                console.log(`[Implementer] Tool: ${toolName}`);
              }

              const input = (block.input as Record<string, unknown>) || {};
              animation.setMessage(pickMood("impl", toolName, input, mood));
              animation.setLastTool(toolName);
              animation.incrementTurns();

              // Track file operations
              if (isWriteTool(toolName)) {
                const filePath = input.file_path || input.path;
                if (typeof filePath === "string" && !allFilesModified.includes(filePath)) {
                  allFilesModified.push(filePath);
                }
              }
            } else if (block.type === "text") {
              lastAssistantText = block.text;
            }
          }
        }

        if (message.type === "result") {
          resultMessage = message;
        }
      }
    } catch (err) {
      // SDK throws when the Claude Code process crashes.
      // Check if it's a rate limit — if so, wait and retry.
      const stderr = filterStderr(implStderrLines);
      const base = err instanceof Error ? err.message : String(err);
      const errorText = `${base}${stderr ? `\n${stderr}` : ""}`;
      const rateLimitInfo = isRateLimitError(errorText);

      if (rateLimitInfo.isRateLimited) {
        await waitForRateLimit(rateLimitInfo, attempt, animation, verbose);
        animation.setMessage("Implementer retrying...");
        animation.setTokens(totalTokensUsed);
        continue;
      }

      // Check for transient connection errors (stale connections, CGNAT, etc.)
      if (isTransientConnectionError(errorText)) {
        const waitSec = getConnectionRetryDelay(attempt);
        animation.stop();
        console.log("");
        console.log(chalk.yellow(`⚡ Connection error (attempt ${attempt + 1})`));
        console.log(chalk.dim(`   ${base}`));
        console.log(chalk.dim(`   Reconnecting in ${formatDuration(waitSec)}...`));
        await waitWithCountdown(waitSec, (remaining, formatted) => {
          if (remaining % 5 === 0 || remaining <= 5) {
            process.stdout.write(`\r${chalk.dim(`   Reconnecting in ${formatted}...`)}${" ".repeat(20)}`);
          }
        });
        console.log(`\r${chalk.green("   Reconnecting...")}${" ".repeat(30)}`);
        if (!verbose) animation.start();
        animation.setMessage("Implementer retrying...");
        animation.setTokens(totalTokensUsed);
        continue;
      }

      // Non-retryable error (auth, billing, etc.)
      return {
        success: false,
        summary: `Implementer crashed: ${base}`,
        filesModified: allFilesModified,
        errors: [errorText],
        tokensUsed: totalTokensUsed,
        lastTool,
      };
    }

    // Extract token usage
    const usage = resultMessage?.usage;
    const iterTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
    totalTokensUsed += iterTokens;

    if (verbose) {
      console.log(`[Implementer] Result: ${resultMessage?.type}, subtype: ${resultMessage?.subtype}`);
      console.log(`[Implementer] Usage: input=${usage?.input_tokens}, output=${usage?.output_tokens}, total=${iterTokens}`);
      const modelUsage = (resultMessage as any)?.modelUsage;
      if (modelUsage) {
        console.log(`[Implementer] Model usage breakdown:`);
        for (const [m, stats] of Object.entries(modelUsage)) {
          const s = stats as any;
          console.log(`  ${m}: in=${s.inputTokens}, out=${s.outputTokens}, cost=$${s.costUSD?.toFixed(4)}`);
        }
      }
      console.log(`[Implementer] Total cost: $${(resultMessage as any)?.total_cost_usd?.toFixed(4) || "?"}`);
    }

    const implStderr = filterStderr(implStderrLines);

    // Check if the run failed due to rate limits — if so, wait and retry
    if (!resultMessage || resultMessage.subtype !== "success" || rateLimitSeen) {
      const errorDetails = resultMessage
        ? ("errors" in resultMessage ? resultMessage.errors.join(", ") : resultMessage.subtype)
        : "No result message received";
      const fullError = `${errorDetails}${implStderr ? `\nStderr: ${implStderr}` : ""}`;

      // Check if this failure is rate-limit related
      const rateLimitInfo = isRateLimitError(fullError);
      const isRateLimit = rateLimitInfo.isRateLimited || rateLimitSeen;

      if (isRateLimit) {
        // Use parsed info if available, otherwise check stderr
        const stderrInfo = !rateLimitInfo.isRateLimited
          ? parseRateLimitError(implStderr || "rate_limit")
          : rateLimitInfo;
        await waitForRateLimit(stderrInfo, attempt, animation, verbose);
        animation.setMessage("Implementer retrying...");
        animation.setTokens(totalTokensUsed);
        continue;
      }

      // Non-retryable failure or max retries exhausted
      return {
        success: false,
        summary: resultMessage
          ? `Implementer failed: ${resultMessage.subtype}`
          : "No result message received",
        filesModified: allFilesModified,
        errors: [fullError],
        tokensUsed: totalTokensUsed,
        lastTool,
      };
    }

    // Success!
    return {
      success: true,
      summary: resultMessage.result || lastAssistantText || "Implementation completed",
      filesModified: allFilesModified,
      tokensUsed: totalTokensUsed,
      lastTool,
    };
  }

  // Unreachable — infinite loop above always returns
  throw new Error("Unreachable");
}

/**
 * Print iteration summary
 */
function printIterationSummary(
  iteration: number,
  data: {
    commitHash: string | null;
    plan?: string;
    linesAdded: number;
    linesRemoved: number;
    tokensUsed: number;
    lastTool?: string;
    isComplete?: boolean;
    completionMessage?: string;
  }
): void {
  const added = data.linesAdded > 0 ? chalk.green(`+${data.linesAdded}`) : chalk.dim("+0");
  const removed = data.linesRemoved > 0 ? chalk.red(`-${data.linesRemoved}`) : chalk.dim("-0");

  console.log(chalk.dim("─".repeat(50)));
  console.log(
    `${chalk.bold(`Iteration ${iteration}`)} │ ` +
    `${chalk.dim("Diff:")} ${added}/${removed} │ ` +
    `${chalk.dim("Tokens:")} ${chalk.cyan(data.tokensUsed.toLocaleString())} │ ` +
    `${chalk.dim("Tool:")} ${chalk.yellow(data.lastTool || "--")}`
  );

  if (data.commitHash) {
    console.log(`${chalk.dim("Commit:")} ${chalk.green(data.commitHash)} - ${data.plan || ""}`);
  } else {
    console.log(`${chalk.dim("No changes committed")}`);
  }

  if (data.isComplete && data.completionMessage) {
    console.log(`\n${chalk.blue("📋 Navigator:")} ${data.completionMessage}`);
    console.log(chalk.dim("   (Loop continues - use --max-iterations to limit)"));
  }

  console.log("");
}

/**
 * Run the memento loop
 *
 * Coordinates navigator planning and worker implementation in iterations
 * until the task is complete or max iterations reached.
 *
 * All state is in-memory. Git history is the only persistent context
 * visible to the agents.
 */
export async function runMementoLoop(
  codeDirectory: string,
  navDirectory: string,
  task: string,
  options: MementoLoopOptions
): Promise<MementoResult> {
  const startTime = Date.now();
  const { verbose = false, pr = false, maxIterations = 0 } = options;

  // Resolve paths
  codeDirectory = path.resolve(codeDirectory);
  navDirectory = path.resolve(navDirectory);

  // Validate directories exist
  if (!fs.existsSync(codeDirectory)) {
    throw new Error(`Code directory not found: ${codeDirectory}`);
  }
  if (!fs.existsSync(navDirectory)) {
    throw new Error(`Navigator directory not found: ${navDirectory}`);
  }

  // Load navigator config and system prompt
  const navIdentity = loadNavConfig(navDirectory);
  const navSystemPrompt = loadNavSystemPrompt(navDirectory);

  // In-memory state
  const state: LoopState = {
    iteration: 0,
    planHistory: [],
    stats: {
      linesAdded: 0,
      linesRemoved: 0,
      tokensUsed: 0,
    },
  };

  if (verbose) {
    console.log(`\n[Memento] Starting loop`);
    console.log(`[Memento] Task: ${task.substring(0, 100)}...`);
    console.log(`[Memento] Code dir: ${codeDirectory}`);
    console.log(`[Memento] Nav dir: ${navDirectory}`);
  }

  // Ensure code directory is a git repo
  ensureGitRepo({ cwd: codeDirectory, verbose });

  // Check for uncommitted changes - navigator can't see them!
  await handleUncommittedChanges(codeDirectory, navDirectory, navSystemPrompt, navIdentity, options);

  // Create or switch to branch if specified
  if (options.branch) {
    createBranch(options.branch, { cwd: codeDirectory, verbose });
  }

  const errors: string[] = [];

  try {
    // Main loop - only max-iterations stops the loop (0 = unlimited = run forever)
    while (maxIterations === 0 || state.iteration < maxIterations) {
      state.iteration += 1;

      if (verbose) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`[Memento] Iteration ${state.iteration}`);
        console.log(`${"=".repeat(60)}`);
      } else {
        console.log(`\nIteration ${state.iteration}...`);
      }

      // Get git log to show the navigator what the implementer has accomplished
      const gitLog = getRecentGitLog({ cwd: codeDirectory, count: 20 });

      // Create animation with cumulative stats
      const animation = new MatrixAnimation({
        message: `Consulting ${navIdentity?.name || "navigator"}...`,
        width: 50,
        lines: 3,
      });

      // Initialize animation with cumulative diff stats and models
      // Token counter starts at 0 - will show implementer tokens once that phase begins
      const implementerModel = options.model || "claude-haiku-4-5";
      const navigatorModel = options.navModel || "claude-opus-4-5";

      animation.setStats({
        iteration: state.iteration,
        maxIterations: maxIterations || undefined,
        linesAdded: state.stats.linesAdded,
        linesRemoved: state.stats.linesRemoved,
        tokensUsed: 0, // Start fresh - will show implementer tokens
        lastTool: state.stats.lastTool,
      });
      animation.setModels(implementerModel, navigatorModel);

      if (!verbose) {
        animation.start();
      }

      let plan: ImplementationPlan | null = null;
      let iterationTokens = 0;
      let implementerTokens = 0;
      let implementerSummary = "";

      try {
        // Query navigator for plan (with rate limit retry)
        let navResult: Awaited<ReturnType<typeof queryNavForPlanWithStats>> | null = null;
        let navRateLimitAttempt = 0;

        while (navResult === null) {
          try {
            navResult = await queryNavForPlanWithStats(
              codeDirectory,
              navDirectory,
              task,
              state.iteration,
              maxIterations,
              navSystemPrompt,
              navIdentity,
              gitLog,
              options,
              animation,
              verbose
            );
          } catch (navError) {
            const rateLimitInfo = isRateLimitError(navError);
            if (rateLimitInfo.isRateLimited) {
              await waitForRateLimit(rateLimitInfo, navRateLimitAttempt, animation, verbose);
              navRateLimitAttempt++;
              continue;
            }
            // Not a rate limit or max retries exceeded - re-throw
            throw navError;
          }
        }

        plan = navResult.plan;
        iterationTokens += navResult.tokensUsed;
        state.stats.tokensUsed += navResult.tokensUsed;
        if (navResult.lastTool) {
          state.stats.lastTool = navResult.lastTool;
        }
        if (!plan) {
          errors.push(`Iteration ${state.iteration}: Navigator did not provide a plan`);
          break;
        }

        // Record plan in memory (for PR body)
        state.planHistory.push({ iteration: state.iteration, summary: plan.summary });

        // Show what the implementer will be working on (truncate to ~60 chars)
        const shortSummary = plan.summary.length > 60
          ? plan.summary.substring(0, 57) + "..."
          : plan.summary;
        if (!verbose) {
          // Stop animation, print plan summary, restart below it
          animation.stop();
          console.log(chalk.dim(`  └─ ${shortSummary}`));
          animation.start();
        } else {
          console.log(`[Plan] ${plan.summary}`);
        }

        // Log if navigator thinks task is complete (advisory only - doesn't stop loop)
        if (plan.isComplete) {
          state.completionMessage = plan.completionMessage;
        }

        // Update animation for implementer phase
        // Reset counters for fresh implementer session (implementer forgets between iterations)
        animation.setMessage("Implementer implementing...");
        animation.setTokens(0);
        animation.resetTurns();

        // Run implementer to implement the plan
        // Rate limit retries are handled internally by runImplementerAgentWithStats
        const implementerResult = await runImplementerAgentWithStats(
          { codeDirectory, task },
          plan,
          {
            verbose,
            model: options.model,
            maxTurns: options.maxTurns,
          },
          animation
        );

        implementerTokens = implementerResult.tokensUsed;
        implementerSummary = implementerResult.summary;
        iterationTokens += implementerResult.tokensUsed;
        state.stats.tokensUsed += implementerResult.tokensUsed;
        if (implementerResult.lastTool) {
          state.stats.lastTool = implementerResult.lastTool;
        }
        // Show only implementer tokens (fresh session each iteration)
        animation.setTokens(implementerTokens);

        if (!implementerResult.success) {
          const errDetail = implementerResult.errors?.join("; ") || "Unknown error";
          // Truncate long error messages (stderr can be very large)
          const truncated = errDetail.length > 500
            ? errDetail.substring(0, 500) + "... (truncated)"
            : errDetail;
          errors.push(`Iteration ${state.iteration}: Implementer failed - ${truncated}`);
          // Continue to next iteration - navigator can see the state and adjust
        }
        // Phase 3: Review
        // Animation is still running — reviewImplementation manages stop/start internally
        await reviewImplementation(codeDirectory, navDirectory, options, animation, verbose);
      } finally {
        if (!verbose) {
          animation.stop();
        }
      }

      // Phase 4: Commit with LLM-generated message
      stageAllChanges({ cwd: codeDirectory });
      const commitMessage = await generateCommitMessage(codeDirectory);
      const commitHash = commitChanges(commitMessage, { cwd: codeDirectory, verbose });

      // Get diff stats from the commit
      if (commitHash) {
        const diffStats = getLastCommitDiffStats({ cwd: codeDirectory });
        state.stats.linesAdded += diffStats.linesAdded;
        state.stats.linesRemoved += diffStats.linesRemoved;
      }

      // Update navigator knowledge base with what was implemented
      if (implementerSummary) {
        await updateNavigatorKnowledge(navDirectory, implementerSummary, commitHash, verbose);
      }

      // Print iteration summary (show implementer tokens for this iteration)
      printIterationSummary(state.iteration, {
        commitHash,
        plan: plan?.summary,
        linesAdded: state.stats.linesAdded,
        linesRemoved: state.stats.linesRemoved,
        tokensUsed: implementerTokens,
        lastTool: state.stats.lastTool,
        isComplete: plan?.isComplete,
        completionMessage: plan?.completionMessage,
      });
    }

    // Loop exited - must have hit max iterations
    console.log(`\nMax iterations (${maxIterations}) reached.`);

    // Handle PR creation if requested
    let prUrl: string | undefined;

    if (pr && options.branch) {
      if (!isGhAvailable()) {
        console.warn(
          "\nWarning: gh CLI not available. Cannot create PR. Install and authenticate gh CLI."
        );
      } else {
        console.log("\nCreating pull request...");

        // Push branch
        pushBranch(options.branch, {
          cwd: codeDirectory,
          verbose,
          setUpstream: true,
        });

        // Create PR
        const prBody = `## Summary

${state.completionMessage || task}

## Iterations

${state.planHistory.map((h) => `- **${h.iteration}**: ${h.summary}`).join("\n")}

---
*Created by autonav memento loop*`;

        prUrl = createPullRequest({
          cwd: codeDirectory,
          verbose,
          title: task.length > 70 ? `${task.substring(0, 67)}...` : task,
          body: prBody,
        });

        console.log(`PR created: ${prUrl}`);
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true, // Completed max iterations without fatal error
      iterations: state.iteration,
      completionMessage: state.completionMessage,
      prUrl,
      branch: options.branch || getCurrentBranch({ cwd: codeDirectory }),
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);

    return {
      success: false,
      iterations: state.iteration,
      branch: options.branch || getCurrentBranch({ cwd: codeDirectory }),
      durationMs,
      errors,
    };
  }
}
