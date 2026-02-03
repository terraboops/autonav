/**
 * Migration v1.5.1: Add autonav mend instruction to CLAUDE.md
 *
 * This migration adds the "Critical Maintenance Instructions" section to CLAUDE.md
 * so navigators remind users to run `autonav mend` after configuration changes.
 *
 * Changes:
 * - Appends Critical Maintenance Instructions section to CLAUDE.md (if missing)
 * - Bumps version to 1.5.1
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Migration, MigrationCheck, MigrationResult, ConfirmFn } from "../types.js";

const MIGRATION_VERSION = "1.5.1";

/**
 * The maintenance instructions section to add
 */
const MAINTENANCE_INSTRUCTIONS = `

## Critical Maintenance Instructions

**IMPORTANT**: After debugging or modifying system configurations (CLAUDE.md, config.json, system-configuration.md), you ABSOLUTELY MUST run:

\`\`\`bash
autonav mend <navigator-path>
\`\`\`

This validates your navigator's health and detects configuration issues. If problems are found, use \`--auto-fix\` to repair them:

\`\`\`bash
autonav mend <navigator-path> --auto-fix
\`\`\`

For deeper analysis, use \`--review\` to run LLM-powered quality checks:

\`\`\`bash
autonav mend <navigator-path> --review
\`\`\`
`;

/**
 * Check if CLAUDE.md has the mend instruction
 */
function hasMendInstruction(claudeMdContent: string): boolean {
  return claudeMdContent.includes("autonav mend");
}

/**
 * Check if this migration is needed
 */
async function check(navPath: string): Promise<MigrationCheck> {
  const configPath = path.join(navPath, "config.json");
  const claudeMdPath = path.join(navPath, "CLAUDE.md");

  if (!fs.existsSync(configPath)) {
    return {
      needed: false,
      reason: "No config.json found",
    };
  }

  // Parse config
  let config: any;
  try {
    const configContent = fs.readFileSync(configPath, "utf-8");
    config = JSON.parse(configContent);
  } catch (error) {
    return {
      needed: false,
      reason: "Could not parse config.json",
    };
  }

  // Check if already at or past this version
  if (config.version === "1.5.1" || (config.version && config.version > "1.5.1")) {
    return {
      needed: false,
      reason: `Navigator already at version ${config.version}`,
    };
  }

  // Check if CLAUDE.md exists and needs the instruction
  if (!fs.existsSync(claudeMdPath)) {
    return {
      needed: false,
      reason: "No CLAUDE.md found",
    };
  }

  const claudeMdContent = fs.readFileSync(claudeMdPath, "utf-8");

  if (hasMendInstruction(claudeMdContent)) {
    // Already has the instruction, just bump version
    return {
      needed: true,
      reason: "Version bump needed (mend instruction already present)",
    };
  }

  return {
    needed: true,
    reason: "CLAUDE.md missing 'autonav mend' maintenance instruction",
  };
}

/**
 * Apply the migration
 */
async function apply(
  navPath: string,
  confirm: ConfirmFn
): Promise<MigrationResult> {
  const configPath = path.join(navPath, "config.json");
  const claudeMdPath = path.join(navPath, "CLAUDE.md");
  const filesModified: string[] = [];
  const changes: string[] = [];

  // Load config
  const configContent = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(configContent);

  // Load CLAUDE.md
  let claudeMdContent = fs.readFileSync(claudeMdPath, "utf-8");

  // Add mend instruction if missing
  if (!hasMendInstruction(claudeMdContent)) {
    // Ask for confirmation
    const shouldAdd = await confirm(
      "Add Critical Maintenance Instructions",
      "This will add a section to CLAUDE.md reminding to run 'autonav mend' after configuration changes."
    );

    if (!shouldAdd) {
      return {
        success: false,
        message: "User declined to add maintenance instructions",
        filesModified: [],
      };
    }

    // Find a good place to insert - before the final "---" separator if it exists
    // or at the end of the file
    const lastSeparatorIndex = claudeMdContent.lastIndexOf("\n---\n");

    if (lastSeparatorIndex !== -1) {
      // Insert before the last separator
      claudeMdContent =
        claudeMdContent.slice(0, lastSeparatorIndex) +
        MAINTENANCE_INSTRUCTIONS +
        claudeMdContent.slice(lastSeparatorIndex);
    } else {
      // Append to end
      claudeMdContent = claudeMdContent.trimEnd() + MAINTENANCE_INSTRUCTIONS;
    }

    fs.writeFileSync(claudeMdPath, claudeMdContent);
    filesModified.push(claudeMdPath);
    changes.push("Added Critical Maintenance Instructions section to CLAUDE.md");
  }

  // Bump version
  config.version = MIGRATION_VERSION;
  config.updatedAt = new Date().toISOString();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  filesModified.push(configPath);
  changes.push(`Bumped version to ${MIGRATION_VERSION}`);

  return {
    success: true,
    message: changes.join("; "),
    filesModified,
  };
}

export const migration: Migration = {
  version: MIGRATION_VERSION,
  description: "Add 'autonav mend' maintenance instruction to CLAUDE.md",
  check,
  apply,
};
