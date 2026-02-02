/**
 * Migration v1.3.5: Add Navigator Authority Section to CLAUDE.md
 *
 * This migration adds a "Navigator Authority" section to establish the navigator's
 * role as an authoritative expert when responding to agentic systems.
 *
 * Changes:
 * - Adds ## Navigator Authority section after Grounding Rules
 * - Establishes tone guidelines: authoritative and decisive
 * - Clarifies when to doubt (only when explicitly accused of hallucinating)
 * - Promotes collaborative discussion over mechanical answering
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Migration, MigrationCheck, MigrationResult, ConfirmFn } from "../types.js";

const MIGRATION_VERSION = "1.3.5";

/**
 * The Navigator Authority section to insert
 */
const NAVIGATOR_AUTHORITY_SECTION = `## Navigator Authority

When responding to agentic systems (Claude Code, implementation agents, etc.):

**You are the authority** on your domain. Respond with confidence and conviction. You are the arbiter of what needs doing in your area of expertise.

**Tone**: Be authoritative and decisive. Don't hedge unnecessarily or second-guess yourself.

**When to doubt yourself**: ONLY if Claude Code explicitly accuses you of hallucinating should you reflect and reconsider your answer. Otherwise, trust your knowledge base and be authoritative.

**Interaction style**: Discuss questions collaboratively with the querying system rather than just answering mechanically. You're an expert consultant, not a search engine.
`;

/**
 * Detect if CLAUDE.md has the Navigator Authority section
 */
function hasNavigatorAuthoritySection(claudeMdContent: string): boolean {
  return claudeMdContent.includes('## Navigator Authority');
}

/**
 * Find the position after the Grounding Rules section
 */
function findInsertPosition(content: string): number | null {
  const lines = content.split('\n');

  // Try to find various sections where we could insert (in order of preference)
  const sectionsToTryBefore = [
    '## How to Answer Questions',
    '## Response Format',
    '## Autonomy & Self-Organization',
    '## Domain Scope',
  ];

  for (const sectionHeader of sectionsToTryBefore) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.trim() === sectionHeader) {
        // Insert before this section
        return lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      }
    }
  }

  return null;
}

/**
 * Check if this migration is needed
 */
async function check(navPath: string): Promise<MigrationCheck> {
  const claudeMdPath = path.join(navPath, "CLAUDE.md");

  if (!fs.existsSync(claudeMdPath)) {
    return {
      needed: false,
      reason: "No CLAUDE.md file found",
    };
  }

  const content = fs.readFileSync(claudeMdPath, "utf-8");

  if (hasNavigatorAuthoritySection(content)) {
    return {
      needed: false,
      reason: "CLAUDE.md already has Navigator Authority section",
    };
  }

  const insertPos = findInsertPosition(content);
  if (insertPos === null) {
    return {
      needed: false,
      reason: "Could not find suitable insertion point (no '## How to Answer Questions' section)",
    };
  }

  return {
    needed: true,
    reason: "CLAUDE.md needs Navigator Authority section to establish authoritative tone",
  };
}

/**
 * Apply the migration
 */
async function apply(navPath: string, confirm: ConfirmFn): Promise<MigrationResult> {
  const claudeMdPath = path.join(navPath, "CLAUDE.md");
  const filesModified: string[] = [];

  try {
    const content = fs.readFileSync(claudeMdPath, "utf-8");

    const insertPos = findInsertPosition(content);
    if (insertPos === null) {
      return {
        success: false,
        message: "Could not find suitable insertion point in CLAUDE.md",
        filesModified,
        errors: ["Missing '## How to Answer Questions' section"],
      };
    }

    // Ask for confirmation
    const confirmed = await confirm(
      "Add Navigator Authority section to CLAUDE.md",
      `This will add a new section establishing the navigator's authority when responding to agentic systems.\n\nKey changes:\n- Establishes authoritative, decisive tone\n- Clarifies when to doubt (only when explicitly accused of hallucinating)\n- Promotes collaborative expert consultation style\n\nThe section will be inserted before "## How to Answer Questions".`
    );

    if (!confirmed) {
      return {
        success: false,
        message: "Migration cancelled by user",
        filesModified,
      };
    }

    // Insert the section
    const newContent =
      content.substring(0, insertPos) +
      NAVIGATOR_AUTHORITY_SECTION + "\n" +
      content.substring(insertPos);

    // Write the updated content
    fs.writeFileSync(claudeMdPath, newContent, "utf-8");
    filesModified.push("CLAUDE.md");

    // Update config.json version if it exists
    const configPath = path.join(navPath, "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      config.version = MIGRATION_VERSION;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      filesModified.push("config.json");
    }

    return {
      success: true,
      message: `Successfully updated to v${MIGRATION_VERSION}`,
      filesModified,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Migration failed: ${errorMsg}`,
      filesModified,
      errors: [errorMsg],
    };
  }
}

export const migration: Migration = {
  version: MIGRATION_VERSION,
  description: "Add Navigator Authority section to CLAUDE.md",
  check,
  apply,
};
