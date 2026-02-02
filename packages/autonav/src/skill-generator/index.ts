import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

/**
 * Skill Generator
 *
 * Generates Claude Code skills for navigators, enabling
 * inter-navigator communication via the "ask <navname>" pattern.
 *
 * Skills are stored locally in the navigator directory (.autonav/skills/)
 * and symlinked to the global skills directory (~/.claude/skills/) for
 * discovery by Claude Code.
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
 * Get the global skills directory path (~/.claude/skills/)
 */
export function getGlobalSkillsDir(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

/**
 * Get the local skills directory path for a navigator (.autonav/skills/)
 */
export function getLocalSkillsDir(navigatorPath: string): string {
  return path.join(navigatorPath, ".autonav", "skills");
}

/**
 * Get the full path to a local skill directory
 */
export function getLocalSkillPath(navigatorPath: string, skillName: string): string {
  return path.join(getLocalSkillsDir(navigatorPath), skillName);
}

/**
 * Check if a skill already exists globally
 */
export function skillExists(skillName: string): boolean {
  const skillDir = path.join(getGlobalSkillsDir(), skillName);
  return fs.existsSync(skillDir);
}

/**
 * Check if a skill exists locally in a navigator
 */
export function localSkillExists(navigatorPath: string, skillName: string): boolean {
  const skillDir = getLocalSkillPath(navigatorPath, skillName);
  return fs.existsSync(skillDir);
}

/**
 * Check if a global skill is a symlink
 */
export function isSkillSymlink(skillName: string): boolean {
  const skillDir = path.join(getGlobalSkillsDir(), skillName);
  try {
    const stats = fs.lstatSync(skillDir);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get the target of a global skill symlink
 */
export function getSkillSymlinkTarget(skillName: string): string | null {
  const skillDir = path.join(getGlobalSkillsDir(), skillName);
  try {
    if (!isSkillSymlink(skillName)) {
      return null;
    }
    return fs.readlinkSync(skillDir);
  } catch {
    return null;
  }
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

## How Claude Code Should Interact

**Navigator Authority**: Treat this navigator as the authoritative expert on its domain. The navigator is the arbiter of what needs doing in its area.

**Tone of Interaction**:
- Ask questions collaboratively, discuss topics rather than just querying mechanically
- Trust the navigator's expertise and responses
- If you suspect a hallucination, you may explicitly accuse the navigator (e.g., "Are you hallucinating? This seems incorrect.")
- ONLY when explicitly accused should the navigator doubt itself and reconsider

**Avoid**:
- Reading entire files directly when you could ask the navigator
- Second-guessing the navigator's answers without cause
- Treating the navigator as just a search engine

## How to Use

Simply use \`autonav query\` to ask questions:

\`\`\`bash
autonav query "${navPath}" "your question here"
\`\`\`

The navigator will provide grounded answers with sources from its knowledge base.

**Troubleshooting**: If this skill fails to execute, the navigator may need health checks. Run:

\`\`\`bash
autonav mend "${navPath}" --auto-fix
\`\`\`

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

**Troubleshooting**: If this skill fails to execute, the navigator may need health checks. Run:

\`\`\`bash
autonav mend "${navPath}" --auto-fix
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
 * Remove a navigator skill (both ask and update skills, global only)
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
      console.log(`Removed skill: ${askSkillName}`);
    }
    removedAny = true;
  }

  // Remove update skill
  if (fs.existsSync(updateSkillDir)) {
    fs.rmSync(updateSkillDir, { recursive: true, force: true });
    if (!options.quiet) {
      console.log(`Removed skill: ${updateSkillName}`);
    }
    removedAny = true;
  }

  if (!removedAny && !options.quiet) {
    console.log(`No skills found for navigator "${navigatorName}"`);
  }

  return removedAny;
}

// ============================================================================
// Local Storage + Symlink Functions (v1.2.0+)
// ============================================================================

export interface SymlinkResult {
  success: boolean;
  action: "created" | "already_linked" | "conflict" | "error";
  message: string;
  skillName: string;
  localPath?: string;
  globalPath?: string;
  conflictTarget?: string;
}

/**
 * Create a skill locally in the navigator's .autonav/skills/ directory
 */
export async function createLocalSkill(
  navigatorPath: string,
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<string | null> {
  const skillName = getSkillName(config.navigatorName);
  const localSkillsDir = getLocalSkillsDir(navigatorPath);
  const localSkillDir = path.join(localSkillsDir, skillName);

  // Check if skill already exists locally
  if (localSkillExists(navigatorPath, skillName) && !options.force) {
    if (!options.quiet) {
      console.log(`Skill "${skillName}" already exists locally (use --force to overwrite)`);
    }
    return null;
  }

  // Ensure local skills directory exists
  fs.mkdirSync(localSkillsDir, { recursive: true });

  // Create local skill directory
  fs.mkdirSync(localSkillDir, { recursive: true });

  // Generate and write SKILL.md
  const skillContent = generateSkillContent(config);
  fs.writeFileSync(path.join(localSkillDir, "SKILL.md"), skillContent);

  if (!options.quiet) {
    console.log(`Created local skill: ${skillName}`);
  }

  return localSkillDir;
}

/**
 * Create a symlink from global skills directory to local skill
 *
 * @returns SymlinkResult with status and details
 */
export function symlinkSkillToGlobal(
  localSkillPath: string,
  skillName: string,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): SymlinkResult {
  const globalSkillsDir = getGlobalSkillsDir();
  const globalSkillDir = path.join(globalSkillsDir, skillName);

  // Ensure global skills directory exists
  fs.mkdirSync(globalSkillsDir, { recursive: true });

  // Check if global skill already exists
  if (fs.existsSync(globalSkillDir)) {
    // Check if it's already a symlink to the correct location
    if (isSkillSymlink(skillName)) {
      const target = getSkillSymlinkTarget(skillName);
      const resolvedLocal = path.resolve(localSkillPath);
      const resolvedTarget = target ? path.resolve(path.dirname(globalSkillDir), target) : null;

      if (resolvedTarget === resolvedLocal) {
        if (!options.quiet) {
          console.log(`Skill "${skillName}" already linked`);
        }
        return {
          success: true,
          action: "already_linked",
          message: `Skill "${skillName}" already symlinked correctly`,
          skillName,
          localPath: localSkillPath,
          globalPath: globalSkillDir,
        };
      }

      // Symlink exists but points elsewhere
      if (!options.force) {
        if (!options.quiet) {
          console.log(`Conflict: "${skillName}" symlinked to different location: ${target}`);
        }
        return {
          success: false,
          action: "conflict",
          message: `Global skill "${skillName}" already symlinked to different location`,
          skillName,
          localPath: localSkillPath,
          globalPath: globalSkillDir,
          conflictTarget: target ?? undefined,
        };
      }

      // Force: remove existing symlink
      fs.unlinkSync(globalSkillDir);
    } else {
      // Regular directory exists (not a symlink)
      if (!options.force) {
        if (!options.quiet) {
          console.log(`Conflict: "${skillName}" exists as regular directory (not symlink)`);
        }
        return {
          success: false,
          action: "conflict",
          message: `Global skill "${skillName}" exists as regular directory, not symlink`,
          skillName,
          localPath: localSkillPath,
          globalPath: globalSkillDir,
        };
      }

      // Force: remove existing directory
      fs.rmSync(globalSkillDir, { recursive: true, force: true });
    }
  }

  // Create symlink
  try {
    fs.symlinkSync(localSkillPath, globalSkillDir, "dir");
    if (!options.quiet) {
      console.log(`Symlinked skill: ${skillName}`);
    }
    return {
      success: true,
      action: "created",
      message: `Created symlink for "${skillName}"`,
      skillName,
      localPath: localSkillPath,
      globalPath: globalSkillDir,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!options.quiet) {
      console.error(`Failed to create symlink for "${skillName}": ${errorMsg}`);
    }
    return {
      success: false,
      action: "error",
      message: `Failed to create symlink: ${errorMsg}`,
      skillName,
      localPath: localSkillPath,
      globalPath: globalSkillDir,
    };
  }
}

/**
 * Remove the global symlink for a skill (preserves local skill)
 */
export function removeSkillSymlink(
  skillName: string,
  options: { quiet?: boolean } = {}
): { success: boolean; wasSymlink: boolean; message: string } {
  const globalSkillDir = path.join(getGlobalSkillsDir(), skillName);

  if (!fs.existsSync(globalSkillDir)) {
    if (!options.quiet) {
      console.log(`No global skill "${skillName}" found`);
    }
    return {
      success: true,
      wasSymlink: false,
      message: `No global skill "${skillName}" found`,
    };
  }

  if (!isSkillSymlink(skillName)) {
    if (!options.quiet) {
      console.log(`Warning: "${skillName}" is not a symlink, skipping removal`);
    }
    return {
      success: false,
      wasSymlink: false,
      message: `"${skillName}" is a regular directory, not a symlink. Manual removal required.`,
    };
  }

  try {
    fs.unlinkSync(globalSkillDir);
    if (!options.quiet) {
      console.log(`Removed symlink: ${skillName}`);
    }
    return {
      success: true,
      wasSymlink: true,
      message: `Removed symlink for "${skillName}"`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!options.quiet) {
      console.error(`Failed to remove symlink for "${skillName}": ${errorMsg}`);
    }
    return {
      success: false,
      wasSymlink: true,
      message: `Failed to remove symlink: ${errorMsg}`,
    };
  }
}

/**
 * Create a skill locally AND symlink it globally (recommended for new navigators)
 *
 * This is the preferred method for creating skills as it:
 * 1. Stores the skill in the navigator's .autonav/skills/ (version-controlled)
 * 2. Symlinks to ~/.claude/skills/ for global discovery
 */
export async function createAndSymlinkSkill(
  navigatorPath: string,
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<{ localPath: string | null; symlinkResult: SymlinkResult | null }> {
  // Create local skill
  const localPath = await createLocalSkill(navigatorPath, config, options);

  if (!localPath) {
    return { localPath: null, symlinkResult: null };
  }

  // Symlink to global
  const skillName = getSkillName(config.navigatorName);
  const symlinkResult = symlinkSkillToGlobal(localPath, skillName, options);

  return { localPath, symlinkResult };
}

/**
 * Create update skill locally and symlink to global
 */
export async function createAndSymlinkUpdateSkill(
  navigatorPath: string,
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<{ localPath: string | null; symlinkResult: SymlinkResult | null }> {
  // Create local update skill
  const localPath = await createLocalUpdateSkill(navigatorPath, config, options);

  if (!localPath) {
    return { localPath: null, symlinkResult: null };
  }

  // Symlink to global
  const skillName = getUpdateSkillName(config.navigatorName);
  const symlinkResult = symlinkSkillToGlobal(localPath, skillName, options);

  return { localPath, symlinkResult };
}

/**
 * Create update skill locally in navigator's .autonav/skills directory
 */
export async function createLocalUpdateSkill(
  navigatorPath: string,
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<string | null> {
  const skillName = getUpdateSkillName(config.navigatorName);
  const localSkillsDir = getLocalSkillsDir(navigatorPath);
  const localSkillDir = path.join(localSkillsDir, skillName);

  // Check if skill already exists locally
  if (localSkillExists(navigatorPath, skillName) && !options.force) {
    if (!options.quiet) {
      console.log(`Skill "${skillName}" already exists locally (use --force to overwrite)`);
    }
    return null;
  }

  // Ensure local skills directory exists
  fs.mkdirSync(localSkillsDir, { recursive: true });

  // Create local skill directory
  fs.mkdirSync(localSkillDir, { recursive: true });

  // Generate and write SKILL.md
  const skillContent = generateUpdateSkillContent(config);
  fs.writeFileSync(path.join(localSkillDir, "SKILL.md"), skillContent);

  if (!options.quiet) {
    console.log(`Created local skill: ${skillName}`);
  }

  return localSkillDir;
}

/**
 * Discover all local skills in a navigator
 */
export function discoverLocalSkills(navigatorPath: string): string[] {
  const localSkillsDir = getLocalSkillsDir(navigatorPath);

  if (!fs.existsSync(localSkillsDir)) {
    return [];
  }

  const entries = fs.readdirSync(localSkillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ask-"))
    .map((entry) => entry.name);
}
