/**
 * Memento Loop Core Logic
 *
 * The main loop that coordinates navigator planning and worker implementation
 * in a context-clearing iterative development pattern.
 *
 * Design principle: The NAVIGATOR is the persistent memory. The navigator
 * sees git history as its context for what work has been done. Uncommitted
 * changes are invisible to the navigator, so we warn about them upfront.
 */

import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { MementoOptions, MementoResult, ImplementationPlan } from "./types.js";
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
import { buildNavPlanPrompt, buildNavSystemPrompt, type NavigatorIdentity } from "./prompts.js";
import { MatrixAnimation } from "./matrix-animation.js";

/**
 * Options for the memento loop
 */
export interface MementoLoopOptions extends MementoOptions {
  /** Model to use for agents */
  model?: string;

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
 * Handle uncommitted changes in the code directory
 *
 * The navigator's memory is git history - uncommitted changes are invisible
 * to it. We must resolve this before starting the loop.
 */
async function handleUncommittedChanges(
  codeDirectory: string,
  verbose: boolean
): Promise<void> {
  if (!hasUncommittedChanges({ cwd: codeDirectory })) {
    return;
  }

  // Show warning
  console.log("\n⚠️  WARNING: Uncommitted changes detected!\n");
  console.log("The navigator uses git history as its memory. Uncommitted changes");
  console.log("will be INVISIBLE to the navigator and may cause confusion.\n");

  if (verbose) {
    const diff = getRecentDiff({ cwd: codeDirectory });
    if (diff) {
      console.log("Changes detected:");
      console.log("─".repeat(40));
      // Show truncated diff
      const lines = diff.split("\n").slice(0, 20);
      console.log(lines.join("\n"));
      if (diff.split("\n").length > 20) {
        console.log(`... (${diff.split("\n").length - 20} more lines)`);
      }
      console.log("─".repeat(40) + "\n");
    }
  }

  console.log("How would you like to proceed?\n");
  console.log("  [c] Commit changes (recommended)");
  console.log("  [i] Add to .gitignore");
  console.log("  [d] Discard changes (⚠️  DANGEROUS - cannot be undone!)");
  console.log("  [q] Quit\n");

  const answer = await promptUser("Choice [c/i/d/q]: ");

  switch (answer) {
    case "c":
    case "commit": {
      const message = await promptUser("Commit message: ");
      if (!message) {
        throw new Error("Commit message required");
      }
      stageAllChanges({ cwd: codeDirectory });
      const hash = commitChanges(message, { cwd: codeDirectory, verbose });
      if (hash) {
        console.log(`\n✅ Committed: ${hash}\n`);
      }
      break;
    }

    case "i":
    case "ignore": {
      console.log("\nTo gitignore specific files, add them to .gitignore manually.");
      console.log("Then re-run this command.\n");
      throw new Error("Please update .gitignore and re-run");
    }

    case "d":
    case "discard": {
      console.log("\n⚠️  THIS WILL PERMANENTLY DELETE YOUR UNCOMMITTED CHANGES!");
      const confirm = await promptUser("Type 'yes' to confirm: ");
      if (confirm !== "yes") {
        throw new Error("Discard cancelled");
      }
      // Discard all changes
      const { execSync } = await import("node:child_process");
      execSync("git checkout -- . && git clean -fd", {
        cwd: codeDirectory,
        stdio: verbose ? "inherit" : "pipe",
      });
      console.log("\n✅ Changes discarded\n");
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
  const { model = "claude-sonnet-4-5", maxTurns = 50 } = options;

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
  }

  const queryIterator = query({
    prompt,
    options: {
      model,
      maxTurns,
      systemPrompt,
      cwd: navDirectory,
      mcpServers: {
        "autonav-nav-protocol": navProtocol.server,
      },
      permissionMode: "bypassPermissions",
    },
  });

  let resultMessage: SDKResultMessage | undefined;
  let lastTool: string | undefined;

  for await (const message of queryIterator) {
    if (message.type === "assistant") {
      const content = message.message.content;
      for (const block of content) {
        if (block.type === "tool_use") {
          const toolName = block.name.split("__").pop() || block.name;
          lastTool = toolName;

          if (verbose) {
            console.log(`[Nav] Tool: ${toolName}`);
          }

          // Update animation
          animation.setMessage(`Navigator: ${toolName}...`);
          animation.setLastTool(toolName);
        }
      }
    }

    if (message.type === "result") {
      resultMessage = message;
    }
  }

  // Extract token usage from result
  const tokensUsed = (resultMessage as any)?.usage?.input_tokens ?? 0;

  if (!resultMessage || resultMessage.subtype !== "success") {
    const errorDetails =
      resultMessage && "errors" in resultMessage
        ? resultMessage.errors.join(", ")
        : "Unknown error";
    throw new Error(`Navigator query failed: ${errorDetails}`);
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
 * Result from worker with stats
 */
interface WorkerResultWithStats {
  success: boolean;
  summary: string;
  filesModified: string[];
  errors?: string[];
  tokensUsed: number;
  lastTool?: string;
}

/**
 * Run worker agent with stats tracking
 */
async function runWorkerAgentWithStats(
  context: { codeDirectory: string; task: string },
  plan: ImplementationPlan,
  options: { verbose?: boolean; model?: string; maxTurns?: number },
  animation: MatrixAnimation
): Promise<WorkerResultWithStats> {
  const { verbose = false, model = "claude-sonnet-4-5", maxTurns = 50 } = options;

  const { buildWorkerPrompt, buildWorkerSystemPrompt } = await import("./prompts.js");

  const prompt = buildWorkerPrompt(context.codeDirectory, plan);
  const systemPrompt = buildWorkerSystemPrompt(context.codeDirectory);

  if (verbose) {
    console.log("\n[Worker] Starting implementation...");
  }

  const queryIterator = query({
    prompt,
    options: {
      model,
      maxTurns,
      systemPrompt,
      cwd: context.codeDirectory,
      permissionMode: "bypassPermissions",
    },
  });

  const filesModified: string[] = [];
  let lastAssistantText = "";
  let resultMessage: SDKResultMessage | undefined;
  let lastTool: string | undefined;

  for await (const message of queryIterator) {
    if (message.type === "assistant") {
      const content = message.message.content;
      for (const block of content) {
        if (block.type === "tool_use") {
          const toolName = block.name;
          lastTool = toolName;

          if (verbose) {
            console.log(`[Worker] Tool: ${toolName}`);
          }

          // Update animation
          animation.setMessage(`Worker: ${toolName}...`);
          animation.setLastTool(toolName);

          // Track file operations
          if (
            toolName === "Write" ||
            toolName === "Edit" ||
            toolName === "str_replace_based_edit_tool"
          ) {
            const input = block.input as Record<string, unknown>;
            const filePath = input.file_path || input.path;
            if (typeof filePath === "string" && !filesModified.includes(filePath)) {
              filesModified.push(filePath);
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

  const tokensUsed = (resultMessage as any)?.usage?.input_tokens ?? 0;

  if (!resultMessage) {
    return {
      success: false,
      summary: "No result message received",
      filesModified,
      errors: ["No result message received"],
      tokensUsed,
      lastTool,
    };
  }

  if (resultMessage.subtype !== "success") {
    const errorDetails =
      "errors" in resultMessage ? resultMessage.errors.join(", ") : "Unknown error";

    return {
      success: false,
      summary: `Worker failed: ${resultMessage.subtype}`,
      filesModified,
      errors: [errorDetails],
      tokensUsed,
      lastTool,
    };
  }

  return {
    success: true,
    summary: resultMessage.result || lastAssistantText || "Implementation completed",
    filesModified,
    tokensUsed,
    lastTool,
  };
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
  await handleUncommittedChanges(codeDirectory, verbose);

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

      // Get git log for context - this is the nav's "memory"
      const gitLog = getRecentGitLog({ cwd: codeDirectory, count: 20 });

      // Create animation with cumulative stats
      const animation = new MatrixAnimation({
        message: `Consulting ${navIdentity?.name || "navigator"}...`,
        width: 50,
        lines: 3,
      });

      // Initialize animation with cumulative stats
      animation.setStats({
        linesAdded: state.stats.linesAdded,
        linesRemoved: state.stats.linesRemoved,
        tokensUsed: state.stats.tokensUsed,
        lastTool: state.stats.lastTool,
      });

      if (!verbose) {
        animation.start();
      }

      let plan: ImplementationPlan | null = null;
      let iterationTokens = 0;

      try {
        // Query navigator for plan
        const navResult = await queryNavForPlanWithStats(
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
        plan = navResult.plan;
        iterationTokens += navResult.tokensUsed;
        state.stats.tokensUsed += navResult.tokensUsed;
        if (navResult.lastTool) {
          state.stats.lastTool = navResult.lastTool;
        }
        animation.setTokens(state.stats.tokensUsed);

        if (!plan) {
          errors.push(`Iteration ${state.iteration}: Navigator did not provide a plan`);
          break;
        }

        // Record plan in memory (for PR body)
        state.planHistory.push({ iteration: state.iteration, summary: plan.summary });

        // Log if navigator thinks task is complete (advisory only - doesn't stop loop)
        if (plan.isComplete) {
          state.completionMessage = plan.completionMessage;
        }

        // Update animation for worker phase
        animation.setMessage("Worker implementing...");

        // Run worker to implement the plan
        const workerResult = await runWorkerAgentWithStats(
          { codeDirectory, task },
          plan,
          {
            verbose,
            model: options.model,
            maxTurns: options.maxTurns,
          },
          animation
        );

        iterationTokens += workerResult.tokensUsed;
        state.stats.tokensUsed += workerResult.tokensUsed;
        if (workerResult.lastTool) {
          state.stats.lastTool = workerResult.lastTool;
        }
        animation.setTokens(state.stats.tokensUsed);

        if (!workerResult.success) {
          errors.push(
            `Iteration ${state.iteration}: Worker failed - ${workerResult.errors?.join(", ") || "Unknown error"}`
          );
          // Continue to next iteration - navigator can see the state and adjust
        }
      } finally {
        if (!verbose) {
          animation.stop();
        }
      }

      // Commit changes - this becomes part of git history (the nav's memory)
      const commitMessage = `[memento] Iteration ${state.iteration}: ${plan?.summary || "iteration"}`;
      const commitHash = commitChanges(commitMessage, { cwd: codeDirectory, verbose });

      // Get diff stats from the commit
      if (commitHash) {
        const diffStats = getLastCommitDiffStats({ cwd: codeDirectory });
        state.stats.linesAdded += diffStats.linesAdded;
        state.stats.linesRemoved += diffStats.linesRemoved;
      }

      // Print iteration summary
      printIterationSummary(state.iteration, {
        commitHash,
        plan: plan?.summary,
        linesAdded: state.stats.linesAdded,
        linesRemoved: state.stats.linesRemoved,
        tokensUsed: state.stats.tokensUsed,
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
          title: `[memento] ${task.substring(0, 60)}`,
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
