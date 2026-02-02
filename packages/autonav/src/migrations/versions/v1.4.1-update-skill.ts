/**
 * Migration v1.4.1: Add Missing Update Skills
 *
 * This migration creates the missing "update" skills for navigators that
 * only have "ask" skills. The bug in skill generation caused navigators
 * initialized before v1.4.1 to only get ask skills, preventing write
 * operations through the skill system.
 *
 * Changes:
 * - Creates update-<navname> skill in .autonav/skills/
 * - Symlinks to ~/.claude/skills/ for global discovery
 * - Updates config.json version to 1.4.1
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Migration, MigrationCheck, MigrationResult, ConfirmFn } from "../types.js";
import {
  getLocalSkillsDir,
  localSkillExists,
  getUpdateSkillName,
  generateUpdateSkillContent,
  symlinkSkillToGlobal,
  type SkillConfig,
} from "@autonav/communication-layer";

const MIGRATION_VERSION = "1.4.1";

/**
 * Check if this migration is needed
 */
async function check(navPath: string): Promise<MigrationCheck> {
  const configPath = path.join(navPath, "config.json");

  // Check if config.json exists
  if (!fs.existsSync(configPath)) {
    return {
      needed: false,
      reason: "No config.json file found",
    };
  }

  // Read navigator name from config
  let navigatorName = path.basename(navPath);
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    navigatorName = config.name || navigatorName;
  } catch {
    return {
      needed: false,
      reason: "Unable to read config.json",
    };
  }

  // Check if update skill already exists
  const updateSkillName = getUpdateSkillName(navigatorName);
  if (localSkillExists(navPath, updateSkillName)) {
    return {
      needed: false,
      reason: "Update skill already exists",
    };
  }

  // Check if local skills directory exists (if not, this navigator never had skills)
  const localSkillsDir = getLocalSkillsDir(navPath);
  if (!fs.existsSync(localSkillsDir)) {
    return {
      needed: false,
      reason: "Navigator has no skill system configured",
    };
  }

  return {
    needed: true,
    reason: "Navigator is missing update skill for write operations",
  };
}

/**
 * Apply the migration
 */
async function apply(navPath: string, confirm: ConfirmFn): Promise<MigrationResult> {
  const filesModified: string[] = [];
  const filesCreated: string[] = [];

  try {
    // Read config to get navigator info
    const configPath = path.join(navPath, "config.json");
    let navigatorName = path.basename(navPath);
    let description = "A knowledge navigator";
    let scope: string | undefined;
    let audience: string | undefined;

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      navigatorName = config.name || navigatorName;
      description = config.description || description;
      scope = config.scope;
      audience = config.audience;
    }

    const updateSkillName = getUpdateSkillName(navigatorName);

    // Ask for confirmation
    const confirmed = await confirm(
      "Create missing update skill",
      `This will:\n1. Create ${updateSkillName} skill in .autonav/skills/\n2. Symlink to ~/.claude/skills/ for global discovery\n\nThis enables write operations to the navigator through the skill system.`
    );

    if (!confirmed) {
      return {
        success: false,
        message: "Migration cancelled by user",
        filesModified,
      };
    }

    // Create skill config
    const skillConfig: SkillConfig = {
      navigatorName,
      navigatorPath: navPath,
      description,
      scope,
      audience,
    };

    // Create local update skill directory
    const localSkillsDir = getLocalSkillsDir(navPath);
    const updateSkillDir = path.join(localSkillsDir, updateSkillName);

    fs.mkdirSync(updateSkillDir, { recursive: true });

    // Generate and write SKILL.md
    const updateSkillContent = generateUpdateSkillContent(skillConfig);
    const skillFilePath = path.join(updateSkillDir, "SKILL.md");
    fs.writeFileSync(skillFilePath, updateSkillContent);
    filesCreated.push(`.autonav/skills/${updateSkillName}/SKILL.md`);

    // Symlink to global skills directory
    const symlinkResult = symlinkSkillToGlobal(updateSkillDir, updateSkillName, { quiet: true });

    if (symlinkResult.created || symlinkResult.existed) {
      filesCreated.push(`~/.claude/skills/${updateSkillName} (symlink)`);
    }

    // Update config.json version
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      config.version = MIGRATION_VERSION;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      filesModified.push("config.json");
    }

    return {
      success: true,
      message:
        `Successfully updated to v${MIGRATION_VERSION}\n` +
        `Created: ${filesCreated.join(", ")}\n` +
        `Modified: ${filesModified.join(", ")}`,
      filesModified: [...filesModified, ...filesCreated],
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
  description: "Add missing update skill for write operations",
  check,
  apply,
};
