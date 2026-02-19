/**
 * Memento Loop Core Logic
 *
 * The main loop that coordinates navigator planning and worker implementation
 * in a context-clearing iterative development pattern.
 *
 * Design principle: The WORKER forgets between iterations (memento pattern).
 * The NAVIGATOR maintains its own memory and knowledge base. We provide git
 * history as context about what the worker has accomplished so far.
 */

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
import {
  type Harness,
  resolveAndCreateHarness,
} from "../harness/index.js";

/**
 * Options for the memento loop
 */
export interface MementoLoopOptions extends MementoOptions {
  /** Model to use for worker agent (default: claude-haiku-4-5) */
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
 * Sandbox profile from navigator config
 */
interface NavSandboxProfile {
  memento?: { enabled: boolean };
}

/**
 * Loaded nav config for memento loop
 */
interface NavConfig {
  identity: NavigatorIdentity | null;
  sandbox?: NavSandboxProfile;
}

/**
 * Load navigator config from config.json
 */
function loadNavConfig(navDirectory: string): NavConfig {
  const configPath = path.join(navDirectory, "config.json");

  if (!fs.existsSync(configPath)) {
    return { identity: null };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const identity = (config.name && config.description)
      ? { name: config.name, description: config.description }
      : null;
    return {
      identity,
      sandbox: config.sandbox,
    };
  } catch {
    // Ignore parse errors
    return { identity: null };
  }
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
 * The memento loop provides git history to the navigator as context about
 * what the worker has accomplished. Uncommitted changes won't appear in
 * that summary, which could cause confusion.
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
  console.log("The memento loop provides git history as context to the navigator.");
  console.log("Uncommitted changes won't appear in that summary.\n");

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
  verbose: boolean,
  harness: Harness
): Promise<NavQueryResult> {
  // Navigator uses opus by default for better planning
  const { navModel: model = "claude-opus-4-5", maxTurns = 50 } = options;

  // Create MCP server with plan submission tool
  const navProtocol = createNavProtocolMcpServer(harness);

  const prompt = buildNavPlanPrompt(
    { codeDirectory, task, iteration, maxIterations, branch: options.branch },
    gitLog,
    navIdentity
  );
  const systemPrompt = buildNavSystemPrompt(navSystemPrompt);

  if (verbose) {
    console.log("\n[Nav] Querying navigator for plan...");
  }

  const session = harness.run(
    {
      model,
      maxTurns,
      systemPrompt,
      cwd: navDirectory,
      mcpServers: {
        "autonav-nav-protocol": navProtocol.server,
      },
      permissionMode: "bypassPermissions",
    },
    prompt
  );

  let lastTool: string | undefined;
  let tokensUsed = 0;
  let success = false;
  let errorText = "";

  for await (const event of session) {
    if (event.type === "tool_use") {
      const toolName = event.name.split("__").pop() || event.name;
      lastTool = toolName;

      if (verbose) {
        console.log(`[Nav] Tool: ${toolName}`);
      }

      // Update animation
      animation.setMessage(`Navigator: ${toolName}...`);
      animation.setLastTool(toolName);
    }

    if (event.type === "result") {
      success = event.success;
      tokensUsed = (event.usage?.inputTokens ?? 0) + (event.usage?.outputTokens ?? 0);
      if (!event.success) {
        errorText = event.text || "Unknown error";
      }
    }
  }

  if (!success) {
    throw new Error(`Navigator query failed: ${errorText}`);
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
  animation: MatrixAnimation,
  harness: Harness
): Promise<WorkerResultWithStats> {
  // Worker uses haiku by default for faster/cheaper implementation
  const { verbose = false, model = "claude-haiku-4-5", maxTurns = 50 } = options;

  const { buildWorkerPrompt, buildWorkerSystemPrompt } = await import("./prompts.js");

  const prompt = buildWorkerPrompt(context.codeDirectory, plan);
  const systemPrompt = buildWorkerSystemPrompt(context.codeDirectory);

  if (verbose) {
    console.log("\n[Worker] Starting implementation...");
  }

  const session = harness.run(
    {
      model,
      maxTurns,
      systemPrompt,
      cwd: context.codeDirectory,
      permissionMode: "bypassPermissions",
    },
    prompt
  );

  const filesModified: string[] = [];
  let lastAssistantText = "";
  let lastTool: string | undefined;
  let tokensUsed = 0;
  let success = false;
  let resultText = "";
  let errorText = "";

  for await (const event of session) {
    if (event.type === "tool_use") {
      const toolName = event.name;
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
        const filePath = event.input.file_path || event.input.path;
        if (typeof filePath === "string" && !filesModified.includes(filePath)) {
          filesModified.push(filePath);
        }
      }
    } else if (event.type === "text") {
      lastAssistantText = event.text;
    } else if (event.type === "result") {
      success = event.success;
      resultText = event.text || "";
      tokensUsed = (event.usage?.inputTokens ?? 0) + (event.usage?.outputTokens ?? 0);
      if (!event.success) {
        errorText = event.text || "Unknown error";
      }
    }
  }

  if (!success) {
    return {
      success: false,
      summary: errorText || "Worker failed",
      filesModified,
      errors: [errorText || "Unknown error"],
      tokensUsed,
      lastTool,
    };
  }

  return {
    success: true,
    summary: resultText || lastAssistantText || "Implementation completed",
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
  const navConfig = loadNavConfig(navDirectory);
  const navIdentity = navConfig.identity;
  const navSystemPrompt = loadNavSystemPrompt(navDirectory);

  // Resolve harness (agent runtime)
  const harness = await resolveAndCreateHarness(options.harness);

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

      // Get git log to show the navigator what the worker has accomplished
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
          verbose,
          harness
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
          animation,
          harness
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

      // Commit changes - nav will see this in git history on next iteration
      // Use plan summary directly - navigator should provide conventional commit style
      const commitMessage = plan?.summary || `memento: iteration ${state.iteration}`;
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
