/**
 * Navigator Health Check and Repair (Mend)
 *
 * Validates navigator configuration and health, auto-fixes issues when possible.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  NavigatorConfigSchema,
  getSkillName,
  getUpdateSkillName,
  localSkillExists,
  skillExists,
  isSkillSymlink,
  createAndSymlinkSkill,
  createAndSymlinkUpdateSkill,
  type SkillConfig,
} from "@autonav/communication-layer";
import { reviewClaudeMd } from "./llm-review.js";

export interface MendCheckResult {
  check: string;
  status: "pass" | "fail" | "warning";
  message: string;
  details?: string;
  autoFixable: boolean;
}

export interface MendResult {
  healthy: boolean;
  checks: MendCheckResult[];
  fixes: Array<{ check: string; action: string; success: boolean }>;
}

/**
 * Run all health checks on a navigator
 */
export async function checkNavigatorHealth(navPath: string): Promise<MendResult> {
  const checks: MendCheckResult[] = [];
  const fixes: Array<{ check: string; action: string; success: boolean }> = [];

  // 1. Check navigator directory exists
  if (!fs.existsSync(navPath)) {
    checks.push({
      check: "Navigator directory",
      status: "fail",
      message: "Navigator directory does not exist",
      details: `Path: ${navPath}`,
      autoFixable: false,
    });
    return { healthy: false, checks, fixes };
  }

  // 2. Check config.json exists and is valid
  const configPath = path.join(navPath, "config.json");
  let config: any = null;

  if (!fs.existsSync(configPath)) {
    checks.push({
      check: "config.json",
      status: "fail",
      message: "config.json not found",
      autoFixable: false,
    });
  } else {
    try {
      const configContent = fs.readFileSync(configPath, "utf-8");
      config = JSON.parse(configContent);

      // Validate against schema
      const parseResult = NavigatorConfigSchema.safeParse(config);
      if (!parseResult.success) {
        checks.push({
          check: "config.json schema",
          status: "fail",
          message: "config.json schema validation failed",
          details: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join("; "),
          autoFixable: false,
        });
      } else {
        checks.push({
          check: "config.json",
          status: "pass",
          message: "Valid configuration",
          autoFixable: false,
        });
      }
    } catch (error) {
      checks.push({
        check: "config.json",
        status: "fail",
        message: "Failed to parse config.json",
        details: error instanceof Error ? error.message : String(error),
        autoFixable: false,
      });
    }
  }

  if (!config) {
    return { healthy: false, checks, fixes };
  }

  // 3. Check CLAUDE.md exists
  const claudeMdPath = path.join(navPath, "CLAUDE.md");
  let claudeMdContent: string | null = null;

  if (!fs.existsSync(claudeMdPath)) {
    checks.push({
      check: "CLAUDE.md",
      status: "fail",
      message: "CLAUDE.md not found",
      autoFixable: false,
    });
  } else {
    // Check for required sections
    claudeMdContent = fs.readFileSync(claudeMdPath, "utf-8");
    const requiredSections = ["## Grounding Rules"];
    const missingSections = requiredSections.filter(section => !claudeMdContent!.includes(section));

    if (missingSections.length > 0) {
      checks.push({
        check: "CLAUDE.md sections",
        status: "warning",
        message: "Missing recommended sections",
        details: `Missing: ${missingSections.join(", ")}`,
        autoFixable: false,
      });
    } else {
      checks.push({
        check: "CLAUDE.md",
        status: "pass",
        message: "CLAUDE.md exists with required sections",
        autoFixable: false,
      });
    }

    // 3a. Check CLAUDE.md doesn't have submit_answer instructions
    // (submit_answer is injected at query-time by createAnswerQuestionPrompt)
    if (claudeMdContent.includes("submit_answer")) {
      checks.push({
        check: "submit_answer in CLAUDE.md",
        status: "warning",
        message: "CLAUDE.md contains submit_answer instructions",
        details: "submit_answer is injected at query-time and should not be in CLAUDE.md. Run 'autonav migrate' to fix, or manually remove the references.",
        autoFixable: false, // Migration v1.3.1 handles this
      });
    } else {
      checks.push({
        check: "submit_answer in CLAUDE.md",
        status: "pass",
        message: "CLAUDE.md correctly omits submit_answer (injected at query-time)",
        autoFixable: false,
      });
    }

    // 3b. Check CLAUDE.md has autonav mend instruction
    if (!claudeMdContent.includes("autonav mend")) {
      checks.push({
        check: "autonav mend instruction",
        status: "warning",
        message: "CLAUDE.md missing 'autonav mend' instruction",
        details: "Navigators should remind users to run mend after config changes. Consider regenerating CLAUDE.md or adding the instruction manually.",
        autoFixable: false,
      });
    } else {
      checks.push({
        check: "autonav mend instruction",
        status: "pass",
        message: "CLAUDE.md includes mend instruction",
        autoFixable: false,
      });
    }
  }

  // 4. Check knowledge base directory exists
  const knowledgePath = config.knowledgeBasePath
    ? path.join(navPath, config.knowledgeBasePath)
    : path.join(navPath, "knowledge");

  if (!fs.existsSync(knowledgePath)) {
    checks.push({
      check: "Knowledge base",
      status: "fail",
      message: "Knowledge base directory not found",
      details: `Expected at: ${knowledgePath}`,
      autoFixable: true,
    });
  } else {
    // Check if it has any content
    const files = fs.readdirSync(knowledgePath);
    if (files.length === 0) {
      checks.push({
        check: "Knowledge base",
        status: "warning",
        message: "Knowledge base is empty",
        autoFixable: false,
      });
    } else {
      checks.push({
        check: "Knowledge base",
        status: "pass",
        message: `Knowledge base has ${files.length} file(s)`,
        autoFixable: false,
      });
    }
  }

  // 5. Check ask-<nav> skill exists
  const askSkillName = getSkillName(config.name);
  const askSkillLocalExists = localSkillExists(navPath, askSkillName);
  const askSkillGlobalExists = skillExists(askSkillName);
  const askSkillIsSymlink = askSkillGlobalExists && isSkillSymlink(askSkillName);

  if (!askSkillLocalExists) {
    checks.push({
      check: `ask-${config.name} skill (local)`,
      status: "fail",
      message: "Local skill not found",
      details: `Expected in ${navPath}/.autonav/skills/${askSkillName}`,
      autoFixable: true,
    });
  } else if (!askSkillGlobalExists) {
    checks.push({
      check: `ask-${config.name} skill (global)`,
      status: "fail",
      message: "Global skill not found (symlink missing)",
      autoFixable: true,
    });
  } else if (!askSkillIsSymlink) {
    checks.push({
      check: `ask-${config.name} skill (symlink)`,
      status: "warning",
      message: "Global skill exists but is not a symlink",
      details: "Should be a symlink to local skill for version control",
      autoFixable: false,
    });
  } else {
    checks.push({
      check: `ask-${config.name} skill`,
      status: "pass",
      message: "Skill exists and is properly symlinked",
      autoFixable: false,
    });
  }

  // 6. Check update-<nav> skill exists
  const updateSkillName = getUpdateSkillName(config.name);
  const updateSkillLocalExists = localSkillExists(navPath, updateSkillName);
  const updateSkillGlobalExists = skillExists(updateSkillName);
  const updateSkillIsSymlink = updateSkillGlobalExists && isSkillSymlink(updateSkillName);

  if (!updateSkillLocalExists) {
    checks.push({
      check: `update-${config.name} skill (local)`,
      status: "fail",
      message: "Local skill not found",
      details: `Expected in ${navPath}/.autonav/skills/${updateSkillName}`,
      autoFixable: true,
    });
  } else if (!updateSkillGlobalExists) {
    checks.push({
      check: `update-${config.name} skill (global)`,
      status: "fail",
      message: "Global skill not found (symlink missing)",
      autoFixable: true,
    });
  } else if (!updateSkillIsSymlink) {
    checks.push({
      check: `update-${config.name} skill (symlink)`,
      status: "warning",
      message: "Global skill exists but is not a symlink",
      details: "Should be a symlink to local skill for version control",
      autoFixable: false,
    });
  } else {
    checks.push({
      check: `update-${config.name} skill`,
      status: "pass",
      message: "Skill exists and is properly symlinked",
      autoFixable: false,
    });
  }

  // 7. Check .autonav directory exists
  const autonavDir = path.join(navPath, ".autonav");
  if (!fs.existsSync(autonavDir)) {
    checks.push({
      check: ".autonav directory",
      status: "fail",
      message: ".autonav directory not found",
      autoFixable: true,
    });
  } else {
    checks.push({
      check: ".autonav directory",
      status: "pass",
      message: ".autonav directory exists",
      autoFixable: false,
    });
  }

  // Determine overall health
  const hasFailures = checks.some(c => c.status === "fail");
  const healthy = !hasFailures;

  return { healthy, checks, fixes };
}

/**
 * Auto-fix issues that can be fixed automatically
 */
export async function autoFixNavigator(
  navPath: string,
  checks: MendCheckResult[]
): Promise<Array<{ check: string; action: string; success: boolean }>> {
  const fixes: Array<{ check: string; action: string; success: boolean }> = [];

  // Load config for fixes that need it
  const configPath = path.join(navPath, "config.json");
  let config: any = null;

  try {
    const configContent = fs.readFileSync(configPath, "utf-8");
    config = JSON.parse(configContent);
  } catch {
    return fixes;
  }

  // Fix 1: Create missing .autonav directory
  const autonavDirCheck = checks.find(c => c.check === ".autonav directory" && c.status === "fail");
  if (autonavDirCheck && autonavDirCheck.autoFixable) {
    try {
      const autonavDir = path.join(navPath, ".autonav");
      fs.mkdirSync(autonavDir, { recursive: true });
      fixes.push({
        check: ".autonav directory",
        action: "Created .autonav directory",
        success: true,
      });
    } catch (error) {
      fixes.push({
        check: ".autonav directory",
        action: "Failed to create .autonav directory",
        success: false,
      });
    }
  }

  // Fix 2: Create missing knowledge base directory
  const knowledgeCheck = checks.find(c => c.check === "Knowledge base" && c.status === "fail");
  if (knowledgeCheck && knowledgeCheck.autoFixable) {
    try {
      const knowledgePath = config.knowledgeBasePath
        ? path.join(navPath, config.knowledgeBasePath)
        : path.join(navPath, "knowledge");
      fs.mkdirSync(knowledgePath, { recursive: true });
      fixes.push({
        check: "Knowledge base",
        action: "Created knowledge base directory",
        success: true,
      });
    } catch (error) {
      fixes.push({
        check: "Knowledge base",
        action: "Failed to create knowledge base directory",
        success: false,
      });
    }
  }

  // Fix 3: Create missing skills
  // Skills should be created from navigator's config for proper templating
  const skillConfig: SkillConfig = {
    navigatorName: config.name,
    navigatorPath: navPath,
    description: config.description || "Knowledge navigator",
    scope: config.scope,
    audience: config.audience,
  };

  const askSkillCheck = checks.find(c => c.check.startsWith(`ask-${config.name}`) && c.status === "fail");
  if (askSkillCheck && askSkillCheck.autoFixable) {
    try {
      await createAndSymlinkSkill(navPath, skillConfig, { force: true, quiet: true });
      fixes.push({
        check: `ask-${config.name} skill`,
        action: "Created and symlinked ask skill",
        success: true,
      });
    } catch (error) {
      fixes.push({
        check: `ask-${config.name} skill`,
        action: "Failed to create ask skill",
        success: false,
      });
    }
  }

  // Fix 4: Create missing update skill
  const updateSkillCheck = checks.find(c => c.check.startsWith(`update-${config.name}`) && c.status === "fail");
  if (updateSkillCheck && updateSkillCheck.autoFixable) {
    try {
      await createAndSymlinkUpdateSkill(navPath, skillConfig, { force: true, quiet: true });
      fixes.push({
        check: `update-${config.name} skill`,
        action: "Created and symlinked update skill",
        success: true,
      });
    } catch (error) {
      fixes.push({
        check: `update-${config.name} skill`,
        action: "Failed to create update skill",
        success: false,
      });
    }
  }

  return fixes;
}

/**
 * Run LLM-powered quality review on CLAUDE.md
 * Uses Claude Opus to check for contradictions, best practices, hallucination risks, etc.
 */
export async function reviewNavigatorQuality(navPath: string): Promise<MendCheckResult[]> {
  const checks: MendCheckResult[] = [];
  const claudeMdPath = path.join(navPath, "CLAUDE.md");

  if (!fs.existsSync(claudeMdPath)) {
    return checks; // Skip review if no CLAUDE.md
  }

  const content = fs.readFileSync(claudeMdPath, "utf-8");
  const review = await reviewClaudeMd(content);

  if (review.passed && review.issues.length === 0) {
    checks.push({
      check: "CLAUDE.md quality review",
      status: "pass",
      message: review.summary,
      autoFixable: false,
    });
  } else {
    // Add a check for each issue
    for (const issue of review.issues) {
      checks.push({
        check: `CLAUDE.md: ${issue.category}`,
        status: issue.severity === "error" ? "fail" : "warning",
        message: issue.description,
        details: issue.suggestion
          ? `${issue.location ? `Location: ${issue.location}. ` : ""}Suggestion: ${issue.suggestion}`
          : issue.location,
        autoFixable: false,
      });
    }

    // Add summary as info
    if (review.summary) {
      checks.push({
        check: "CLAUDE.md quality summary",
        status: review.passed ? "pass" : "warning",
        message: review.summary,
        autoFixable: false,
      });
    }
  }

  return checks;
}

/**
 * Run full mend operation: check health and auto-fix issues
 */
export async function mendNavigator(
  navPath: string,
  options: {
    autoFix?: boolean;
    quiet?: boolean;
    review?: boolean;
  } = {}
): Promise<MendResult> {
  // Run health checks
  const result = await checkNavigatorHealth(navPath);

  // Auto-fix if requested and there are fixable issues
  if (options.autoFix) {
    const fixableChecks = result.checks.filter(c => c.status === "fail" && c.autoFixable);

    if (fixableChecks.length > 0) {
      const fixes = await autoFixNavigator(navPath, result.checks);
      result.fixes = fixes;

      // Re-run health checks to verify fixes
      const recheckResult = await checkNavigatorHealth(navPath);
      result.healthy = recheckResult.healthy;
      result.checks = recheckResult.checks;
    }
  }

  // Run LLM quality review if requested
  if (options.review) {
    const reviewChecks = await reviewNavigatorQuality(navPath);
    result.checks.push(...reviewChecks);

    // Re-evaluate overall health (review errors can affect health)
    result.healthy = !result.checks.some(c => c.status === "fail");
  }

  return result;
}
