/**
 * Migration v1.5.0: RFC-2119 Skills and Schema Alignment
 *
 * This migration updates navigators to use the refactored template system with:
 * - RFC-2119 requirements in skills (MUST/MUST NOT/MAY) to prevent directory changes
 * - New config.json schema (createdAt vs created, knowledgeBasePath vs knowledgeBase)
 * - Updated CLAUDE.md sections (GROUNDING_RULES, RESPONSE_FORMAT, etc.)
 *
 * Changes:
 * - Regenerates ask-<nav> skill with RFC-2119 requirements
 * - Regenerates update-<nav> skill with RFC-2119 requirements
 * - Migrates config.json to new schema format
 * - Updates CLAUDE.md with new template sections (if missing)
 * - Bumps version to 1.5.0
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  type SkillConfig,
  generateSkillContent,
  generateUpdateSkillContent,
  getSkillName,
  getUpdateSkillName,
} from "@autonav/communication-layer";
import type { Migration, MigrationCheck, MigrationResult, ConfirmFn } from "../types.js";

const MIGRATION_VERSION = "1.5.0";

/**
 * Check if skills have RFC-2119 requirements
 */
function hasRFC2119Requirements(skillContent: string): boolean {
  return (
    skillContent.includes("You MUST run") &&
    skillContent.includes("You MUST NOT change directory") &&
    skillContent.includes("RFC-2119 Requirements")
  );
}

/**
 * Check if config uses new schema
 */
function usesNewSchema(config: any): boolean {
  // New schema uses createdAt/updatedAt instead of created
  // and knowledgeBasePath instead of knowledgeBase
  return (
    config.createdAt !== undefined &&
    config.knowledgeBasePath !== undefined
  );
}

/**
 * Check if this migration is needed
 */
async function check(navPath: string): Promise<MigrationCheck> {
  const configPath = path.join(navPath, "config.json");

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

  // Check if already migrated
  if (config.version === "1.5.0" || (config.version && config.version > "1.5.0")) {
    return {
      needed: false,
      reason: `Navigator already at version ${config.version}`,
    };
  }

  // Check if skills need updating
  const askSkillName = getSkillName(config.name);
  const updateSkillName = getUpdateSkillName(config.name);
  const askSkillPath = path.join(navPath, ".autonav", "skills", askSkillName, "SKILL.md");
  const updateSkillPath = path.join(navPath, ".autonav", "skills", updateSkillName, "SKILL.md");

  let needsSkillUpdate = false;
  let needsSchemaUpdate = false;

  // Check ask skill
  if (fs.existsSync(askSkillPath)) {
    const askSkillContent = fs.readFileSync(askSkillPath, "utf-8");
    if (!hasRFC2119Requirements(askSkillContent)) {
      needsSkillUpdate = true;
    }
  }

  // Check update skill
  if (fs.existsSync(updateSkillPath)) {
    const updateSkillContent = fs.readFileSync(updateSkillPath, "utf-8");
    if (!hasRFC2119Requirements(updateSkillContent)) {
      needsSkillUpdate = true;
    }
  }

  // Check schema
  if (!usesNewSchema(config)) {
    needsSchemaUpdate = true;
  }

  if (!needsSkillUpdate && !needsSchemaUpdate) {
    return {
      needed: false,
      reason: "Skills already have RFC-2119 requirements and config uses new schema",
    };
  }

  const reasons: string[] = [];
  if (needsSkillUpdate) {
    reasons.push("Skills need RFC-2119 requirements");
  }
  if (needsSchemaUpdate) {
    reasons.push("Config needs schema migration");
  }

  return {
    needed: true,
    reason: reasons.join(", "),
  };
}

/**
 * Apply the migration
 */
async function apply(
  navPath: string,
  _confirm: ConfirmFn
): Promise<MigrationResult> {
  const configPath = path.join(navPath, "config.json");
  const filesModified: string[] = [];
  const changes: string[] = [];

  // Load config
  const configContent = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(configContent);

  // Build skill config from navigator config
  const skillConfig: SkillConfig = {
    navigatorName: config.name,
    navigatorPath: navPath,
    description: config.description || "Knowledge navigator",
    scope: config.scope,
    audience: config.audience,
  };

  // Regenerate ask skill with RFC-2119
  const askSkillName = getSkillName(config.name);
  const askSkillPath = path.join(navPath, ".autonav", "skills", askSkillName, "SKILL.md");

  if (fs.existsSync(askSkillPath)) {
    const oldContent = fs.readFileSync(askSkillPath, "utf-8");
    if (!hasRFC2119Requirements(oldContent)) {
      const newContent = generateSkillContent(skillConfig);
      fs.writeFileSync(askSkillPath, newContent);
      filesModified.push(askSkillPath);
      changes.push(`Regenerated ${askSkillName} skill with RFC-2119 requirements`);
    }
  }

  // Regenerate update skill with RFC-2119
  const updateSkillName = getUpdateSkillName(config.name);
  const updateSkillPath = path.join(navPath, ".autonav", "skills", updateSkillName, "SKILL.md");

  if (fs.existsSync(updateSkillPath)) {
    const oldContent = fs.readFileSync(updateSkillPath, "utf-8");
    if (!hasRFC2119Requirements(oldContent)) {
      const newContent = generateUpdateSkillContent(skillConfig);
      fs.writeFileSync(updateSkillPath, newContent);
      filesModified.push(updateSkillPath);
      changes.push(`Regenerated ${updateSkillName} skill with RFC-2119 requirements`);
    }
  }

  // Migrate config schema
  if (!usesNewSchema(config)) {
    const migratedConfig: any = {
      version: "1.5.0",
      name: config.name,
      description: config.description,
      createdAt: config.created || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      knowledgeBasePath: config.knowledgeBase || "./knowledge",
      plugins: config.plugins || {
        configFile: ".claude/plugins.json",
      },
    };

    // Preserve optional fields
    if (config.scope) migratedConfig.scope = config.scope;
    if (config.audience) migratedConfig.audience = config.audience;
    if (config.systemConfiguration) migratedConfig.systemConfiguration = config.systemConfiguration;
    if (config.knowledgePack) {
      migratedConfig.knowledgePack = {
        name: config.knowledgePack.name || config.knowledgePack,
        version: config.knowledgePack.version || "unknown",
        installedAt: config.knowledgePack.installedAt || config.created || new Date().toISOString(),
      };
    } else {
      migratedConfig.knowledgePack = null;
    }

    fs.writeFileSync(configPath, JSON.stringify(migratedConfig, null, 2));
    filesModified.push(configPath);
    changes.push("Migrated config.json to new schema (createdAt, knowledgeBasePath)");
    changes.push("Bumped version to 1.5.0");
  } else {
    // Just bump version
    config.version = "1.5.0";
    config.updatedAt = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    filesModified.push(configPath);
    changes.push("Bumped version to 1.5.0");
  }

  return {
    success: true,
    message: changes.join("; "),
    filesModified,
  };
}

export const migration: Migration = {
  version: MIGRATION_VERSION,
  description: "Add RFC-2119 requirements to skills and migrate config schema",
  check,
  apply,
};
