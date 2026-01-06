import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

/**
 * Skill Generator
 *
 * Generates global Claude Code skills for navigators, enabling
 * inter-navigator communication via the "ask <navname>" pattern.
 */

export interface SkillConfig {
  /** Navigator name (used for skill name: ask-<navname>) */
  navigatorName: string;
  /** Absolute path to the navigator directory */
  navigatorPath: string;
  /** Navigator description/purpose */
  description: string;
  /** Topics the navigator covers */
  scope?: string;
  /** Who uses this navigator */
  audience?: string;
}

/**
 * Get the global skills directory path
 */
export function getGlobalSkillsDir(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

/**
 * Check if a skill already exists
 */
export function skillExists(skillName: string): boolean {
  const skillDir = path.join(getGlobalSkillsDir(), skillName);
  return fs.existsSync(skillDir);
}

/**
 * Generate the skill name from navigator name
 */
export function getSkillName(navigatorName: string): string {
  // Convert to lowercase, replace spaces/underscores with hyphens
  const normalized = navigatorName.toLowerCase().replace(/[_\s]+/g, "-");
  return `ask-${normalized}`;
}

/**
 * Generate the update skill name from navigator name
 */
export function getUpdateSkillName(navigatorName: string): string {
  // Convert to lowercase, replace spaces/underscores with hyphens
  const normalized = navigatorName.toLowerCase().replace(/[_\s]+/g, "-");
  return `update-${normalized}`;
}

/**
 * Generate the SKILL.md content for a navigator
 */
export function generateSkillContent(config: SkillConfig): string {
  const skillName = getSkillName(config.navigatorName);
  const navPath = config.navigatorPath;

  return `---
name: ${skillName}
description: Query ${config.navigatorName} navigator about ${config.description}. Use when user asks to "ask ${config.navigatorName}" or needs information from this knowledge base.
---

# Ask ${config.navigatorName}

Query the **${config.navigatorName}** navigator for information.

**Navigator Location**: \`${navPath}\`

${config.description}

${config.scope ? `**Scope**: ${config.scope}\n` : ""}
${config.audience ? `**Audience**: ${config.audience}\n` : ""}

## How to Use

Simply use \`autonav query\` to ask questions:

\`\`\`bash
autonav query "${navPath}" "your question here"
\`\`\`

The navigator will provide grounded answers with sources from its knowledge base.

## What This Navigator Knows

This navigator specializes in ${config.scope || 'its configured domain'} and follows strict grounding rules:
- Always cites sources from the knowledge base
- Never invents information
- Acknowledges uncertainty with confidence scores
- Only references files that actually exist
`;
}

/**
 * Generate the update skill content for a navigator (with write permissions)
 */
export function generateUpdateSkillContent(config: SkillConfig): string {
  const skillName = getUpdateSkillName(config.navigatorName);
  const navPath = config.navigatorPath;

  return `---
name: ${skillName}
description: Update ${config.navigatorName} navigator's documentation and knowledge base. Use when reporting implementation progress, documenting issues, or updating knowledge about ${config.description}.
---

# Update ${config.navigatorName}

Update the **${config.navigatorName}** navigator's documentation and knowledge base.

**Navigator Location**: \`${navPath}\`

${config.description}

${config.scope ? `**Scope**: ${config.scope}\n` : ""}
${config.audience ? `**Audience**: ${config.audience}\n` : ""}

## When to Use

Use this skill to:
- Report implementation progress or issues
- Update documentation after making changes
- Add new knowledge or learnings
- Document troubleshooting steps
- Create status reports or logs

## How to Use

Simply use \`autonav update\` to send an update message:

\`\`\`bash
autonav update "${navPath}" "your update message"
\`\`\`

**Example updates:**

Report progress:
\`\`\`bash
autonav update "${navPath}" "I completed feature X. Please document this in the knowledge base."
\`\`\`

Log an issue:
\`\`\`bash
autonav update "${navPath}" "Encountered error Y during deployment. Add this to troubleshooting docs."
\`\`\`

## Important

- This command grants **write permissions** to the navigator
- Changes are made directly to files in the knowledge base
- Always review edits before committing to version control
`;
}

/**
 * Create a global skill for a navigator
 *
 * @param config - Skill configuration
 * @param options - Options for skill creation
 * @returns Path to the created skill directory, or null if skipped
 */
export async function createNavigatorSkill(
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<string | null> {
  const askSkillName = getSkillName(config.navigatorName);
  const updateSkillName = getUpdateSkillName(config.navigatorName);
  const skillsDir = getGlobalSkillsDir();
  const askSkillDir = path.join(skillsDir, askSkillName);
  const updateSkillDir = path.join(skillsDir, updateSkillName);

  // Ensure skills directory exists
  fs.mkdirSync(skillsDir, { recursive: true });

  // Create "ask" skill
  if (skillExists(askSkillName) && !options.force) {
    if (!options.quiet) {
      console.log(`⏭️  Skill "${askSkillName}" already exists (use --force to overwrite)`);
    }
  } else {
    fs.mkdirSync(askSkillDir, { recursive: true });
    const askSkillContent = generateSkillContent(config);
    fs.writeFileSync(path.join(askSkillDir, "SKILL.md"), askSkillContent);
    if (!options.quiet) {
      console.log(`✓ Created global skill: ${askSkillName}`);
    }
  }

  // Create "update" skill
  if (skillExists(updateSkillName) && !options.force) {
    if (!options.quiet) {
      console.log(`⏭️  Skill "${updateSkillName}" already exists (use --force to overwrite)`);
    }
  } else {
    fs.mkdirSync(updateSkillDir, { recursive: true });
    const updateSkillContent = generateUpdateSkillContent(config);
    fs.writeFileSync(path.join(updateSkillDir, "SKILL.md"), updateSkillContent);
    if (!options.quiet) {
      console.log(`✓ Created global skill: ${updateSkillName}`);
    }
  }

  return askSkillDir;
}

/**
 * Remove a navigator skill (both ask and update skills)
 */
export function removeNavigatorSkill(
  navigatorName: string,
  options: { quiet?: boolean } = {}
): boolean {
  const askSkillName = getSkillName(navigatorName);
  const updateSkillName = getUpdateSkillName(navigatorName);
  const skillsDir = getGlobalSkillsDir();
  const askSkillDir = path.join(skillsDir, askSkillName);
  const updateSkillDir = path.join(skillsDir, updateSkillName);

  let removedAny = false;

  // Remove ask skill
  if (fs.existsSync(askSkillDir)) {
    fs.rmSync(askSkillDir, { recursive: true, force: true });
    if (!options.quiet) {
      console.log(`✓ Removed skill: ${askSkillName}`);
    }
    removedAny = true;
  }

  // Remove update skill
  if (fs.existsSync(updateSkillDir)) {
    fs.rmSync(updateSkillDir, { recursive: true, force: true });
    if (!options.quiet) {
      console.log(`✓ Removed skill: ${updateSkillName}`);
    }
    removedAny = true;
  }

  if (!removedAny && !options.quiet) {
    console.log(`⚠️  No skills found for navigator "${navigatorName}"`);
  }

  return removedAny;
}
