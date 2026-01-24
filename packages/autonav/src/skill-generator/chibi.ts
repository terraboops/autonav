import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

/**
 * Chibi Skill Generator
 *
 * Generates chibi-compatible skills for navigators, enabling
 * autonav integration with the chibi CLI chatbot via the agent-skills plugin.
 *
 * Skills are stored in ~/.chibi/skills/<name>/SKILL.md following the
 * agentskills.io standard format.
 *
 * @see https://github.com/emesal/chibi
 * @see https://github.com/emesal/chibi-plugins/tree/main/agent-skills
 */

export interface ChibiSkillConfig {
  /** Navigator name (used for skill name) */
  navigatorName: string;
  /** Absolute path to the navigator directory */
  navigatorPath: string;
  /** Navigator description/purpose */
  description: string;
  /** Topics the navigator covers */
  scope?: string;
  /** Who uses this navigator */
  audience?: string;
  /** Autonav version for compatibility */
  autonavVersion?: string;
}

/**
 * Get the chibi skills directory path (~/.chibi/skills/)
 */
export function getChibiSkillsDir(): string {
  return path.join(os.homedir(), ".chibi", "skills");
}

/**
 * Get the full path to a chibi skill directory
 */
export function getChibiSkillPath(skillName: string): string {
  return path.join(getChibiSkillsDir(), skillName);
}

/**
 * Check if a chibi skill already exists
 */
export function chibiSkillExists(skillName: string): boolean {
  const skillDir = getChibiSkillPath(skillName);
  return fs.existsSync(skillDir);
}

/**
 * Generate the ask skill name from navigator name
 */
export function getChibiAskSkillName(navigatorName: string): string {
  const normalized = navigatorName.toLowerCase().replace(/[_\s]+/g, "-");
  return `ask-${normalized}`;
}

/**
 * Generate the update skill name from navigator name
 */
export function getChibiUpdateSkillName(navigatorName: string): string {
  const normalized = navigatorName.toLowerCase().replace(/[_\s]+/g, "-");
  return `update-${normalized}`;
}

/**
 * Generate the SKILL.md content for an ask skill (chibi format)
 *
 * Uses the agentskills.io standard format with YAML frontmatter
 */
export function generateChibiAskSkillContent(config: ChibiSkillConfig): string {
  const skillName = getChibiAskSkillName(config.navigatorName);
  const navPath = config.navigatorPath;

  return `---
name: ${skillName}
description: Query the ${config.navigatorName} autonav navigator about ${config.description}
license: MIT
compatibility: chibi
allowed-tools:
  - Bash
  - Read
  - Grep
  - run_skill_script
metadata:
  version: "1.0.0"
  author: autonav
  autonav-version: "${config.autonavVersion || "1.0.0"}"
  navigator-path: "${navPath}"
---

# Ask ${config.navigatorName}

Query the **${config.navigatorName}** autonav navigator for information.

**Navigator Location**: \`${navPath}\`

${config.description}

${config.scope ? `**Scope**: ${config.scope}\n` : ""}
${config.audience ? `**Audience**: ${config.audience}\n` : ""}

## How to Use

Use the Bash tool to run autonav query:

\`\`\`bash
autonav query "${navPath}" "your question here"
\`\`\`

Or use the run_skill_script tool with the provided helper script:

\`\`\`
run_skill_script("${skillName}", "query.sh", ["your question here"])
\`\`\`

## What This Navigator Knows

This navigator specializes in ${config.scope || "its configured domain"} and follows strict grounding rules:
- Always cites sources from the knowledge base
- Never invents information
- Acknowledges uncertainty with confidence scores
- Only references files that actually exist

## Example Queries

- "How do I deploy the application?"
- "What are the main components of this system?"
- "Where is the configuration documented?"

## Notes

- This skill uses autonav's grounded response system
- Responses include source citations and confidence scores
- The navigator only answers questions it has documentation for
`;
}

/**
 * Generate the SKILL.md content for an update skill (chibi format)
 */
export function generateChibiUpdateSkillContent(config: ChibiSkillConfig): string {
  const skillName = getChibiUpdateSkillName(config.navigatorName);
  const navPath = config.navigatorPath;

  return `---
name: ${skillName}
description: Update the ${config.navigatorName} autonav navigator's documentation and knowledge base
license: MIT
compatibility: chibi
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - run_skill_script
metadata:
  version: "1.0.0"
  author: autonav
  autonav-version: "${config.autonavVersion || "1.0.0"}"
  navigator-path: "${navPath}"
---

# Update ${config.navigatorName}

Update the **${config.navigatorName}** autonav navigator's documentation and knowledge base.

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

Use the Bash tool to run autonav update:

\`\`\`bash
autonav update "${navPath}" "your update message"
\`\`\`

Or use the run_skill_script tool with the provided helper script:

\`\`\`
run_skill_script("${skillName}", "update.sh", ["your update message"])
\`\`\`

## Example Updates

Report progress:
\`\`\`bash
autonav update "${navPath}" "Completed feature X. Please document this."
\`\`\`

Log an issue:
\`\`\`bash
autonav update "${navPath}" "Encountered error Y during deployment. Add to troubleshooting."
\`\`\`

## Important

- This command grants **write permissions** to the navigator
- Changes are made directly to files in the knowledge base
- Always review edits before committing to version control
`;
}

/**
 * Generate a helper shell script for query operations
 */
export function generateChibiQueryScript(navPath: string): string {
  return `#!/usr/bin/env bash
# Helper script for querying autonav navigator
# Usage: ./query.sh "your question"

set -e

if [ -z "$1" ]; then
  echo "Usage: ./query.sh 'your question'" >&2
  exit 1
fi

exec autonav query "${navPath}" "$1"
`;
}

/**
 * Generate a helper shell script for update operations
 */
export function generateChibiUpdateScript(navPath: string): string {
  return `#!/usr/bin/env bash
# Helper script for updating autonav navigator
# Usage: ./update.sh "your update message"

set -e

if [ -z "$1" ]; then
  echo "Usage: ./update.sh 'your update message'" >&2
  exit 1
fi

exec autonav update "${navPath}" "$1"
`;
}

/**
 * Create chibi skills for a navigator
 *
 * @param config - Skill configuration
 * @param options - Options for skill creation
 * @returns Object with paths to created skills, or null if skipped
 */
export async function createChibiSkills(
  config: ChibiSkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<{ askSkillDir: string | null; updateSkillDir: string | null }> {
  const askSkillName = getChibiAskSkillName(config.navigatorName);
  const updateSkillName = getChibiUpdateSkillName(config.navigatorName);
  const skillsDir = getChibiSkillsDir();
  const askSkillDir = path.join(skillsDir, askSkillName);
  const updateSkillDir = path.join(skillsDir, updateSkillName);

  // Ensure chibi skills directory exists
  fs.mkdirSync(skillsDir, { recursive: true });

  let createdAsk: string | null = null;
  let createdUpdate: string | null = null;

  // Create "ask" skill
  if (chibiSkillExists(askSkillName) && !options.force) {
    if (!options.quiet) {
      console.log(`  Chibi skill "${askSkillName}" already exists (use --force to overwrite)`);
    }
  } else {
    // Create skill directory
    fs.mkdirSync(askSkillDir, { recursive: true });

    // Create scripts directory
    const scriptsDir = path.join(askSkillDir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });

    // Write SKILL.md
    const askSkillContent = generateChibiAskSkillContent(config);
    fs.writeFileSync(path.join(askSkillDir, "SKILL.md"), askSkillContent);

    // Write helper script
    const queryScript = generateChibiQueryScript(config.navigatorPath);
    const queryScriptPath = path.join(scriptsDir, "query.sh");
    fs.writeFileSync(queryScriptPath, queryScript);
    fs.chmodSync(queryScriptPath, 0o755);

    if (!options.quiet) {
      console.log(`  Created chibi skill: ${askSkillName}`);
    }
    createdAsk = askSkillDir;
  }

  // Create "update" skill
  if (chibiSkillExists(updateSkillName) && !options.force) {
    if (!options.quiet) {
      console.log(`  Chibi skill "${updateSkillName}" already exists (use --force to overwrite)`);
    }
  } else {
    // Create skill directory
    fs.mkdirSync(updateSkillDir, { recursive: true });

    // Create scripts directory
    const scriptsDir = path.join(updateSkillDir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });

    // Write SKILL.md
    const updateSkillContent = generateChibiUpdateSkillContent(config);
    fs.writeFileSync(path.join(updateSkillDir, "SKILL.md"), updateSkillContent);

    // Write helper script
    const updateScript = generateChibiUpdateScript(config.navigatorPath);
    const updateScriptPath = path.join(scriptsDir, "update.sh");
    fs.writeFileSync(updateScriptPath, updateScript);
    fs.chmodSync(updateScriptPath, 0o755);

    if (!options.quiet) {
      console.log(`  Created chibi skill: ${updateSkillName}`);
    }
    createdUpdate = updateSkillDir;
  }

  return { askSkillDir: createdAsk, updateSkillDir: createdUpdate };
}

/**
 * Remove chibi skills for a navigator
 */
export function removeChibiSkills(
  navigatorName: string,
  options: { quiet?: boolean } = {}
): boolean {
  const askSkillName = getChibiAskSkillName(navigatorName);
  const updateSkillName = getChibiUpdateSkillName(navigatorName);
  const skillsDir = getChibiSkillsDir();
  const askSkillDir = path.join(skillsDir, askSkillName);
  const updateSkillDir = path.join(skillsDir, updateSkillName);

  let removedAny = false;

  // Remove ask skill
  if (fs.existsSync(askSkillDir)) {
    fs.rmSync(askSkillDir, { recursive: true, force: true });
    if (!options.quiet) {
      console.log(`  Removed chibi skill: ${askSkillName}`);
    }
    removedAny = true;
  }

  // Remove update skill
  if (fs.existsSync(updateSkillDir)) {
    fs.rmSync(updateSkillDir, { recursive: true, force: true });
    if (!options.quiet) {
      console.log(`  Removed chibi skill: ${updateSkillName}`);
    }
    removedAny = true;
  }

  if (!removedAny && !options.quiet) {
    console.log(`  No chibi skills found for navigator "${navigatorName}"`);
  }

  return removedAny;
}

/**
 * List all installed chibi skills
 */
export function listChibiSkills(): string[] {
  const skillsDir = getChibiSkillsDir();

  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      // Check if it has a SKILL.md file
      const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
      return fs.existsSync(skillMdPath);
    })
    .map((entry) => entry.name);
}

/**
 * Check if chibi is available (agent-skills plugin installed)
 */
export function isChibiAvailable(): boolean {
  const chibiDir = path.join(os.homedir(), ".chibi");
  return fs.existsSync(chibiDir);
}
