import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getGlobalSkillsDir,
  getLocalSkillsDir,
  getLocalSkillPath,
  skillExists,
  localSkillExists,
  getSkillName,
  getUpdateSkillName,
} from './utils.js';
import { generateSkillContent, generateUpdateSkillContent } from './generators.js';
import type { SkillConfig, SymlinkResult } from './types.js';

/**
 * Create skill locally in navigator's .autonav/skills directory
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
  fs.writeFileSync(path.join(localSkillDir, 'SKILL.md'), skillContent);

  if (!options.quiet) {
    console.log(`Created local skill: ${skillName}`);
  }

  return localSkillDir;
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
  fs.writeFileSync(path.join(localSkillDir, 'SKILL.md'), skillContent);

  if (!options.quiet) {
    console.log(`Created local skill: ${skillName}`);
  }

  return localSkillDir;
}

/**
 * Create a symlink from global skills directory to local skill
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
  const globalSkillPath = path.join(globalSkillsDir, skillName);

  // Ensure global skills directory exists
  fs.mkdirSync(globalSkillsDir, { recursive: true });

  // Check if skill already exists globally
  if (skillExists(skillName)) {
    if (!options.force) {
      return {
        created: false,
        existed: true,
        path: globalSkillPath,
        message: `Skill "${skillName}" already exists globally`,
      };
    }
    // Remove existing symlink/directory
    fs.rmSync(globalSkillPath, { recursive: true, force: true });
  }

  // Create symlink
  fs.symlinkSync(localSkillPath, globalSkillPath);

  if (!options.quiet) {
    console.log(`Symlinked skill to global: ${skillName}`);
  }

  return {
    created: true,
    existed: false,
    path: globalSkillPath,
    message: `Created symlink: ${globalSkillPath} -> ${localSkillPath}`,
  };
}

/**
 * Create local skill and symlink to global
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
 * Create local update skill and symlink to global
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
 * Remove a skill symlink from global directory
 */
export function removeSkillSymlink(
  skillName: string,
  options: {
    quiet?: boolean;
  } = {}
): boolean {
  const globalSkillPath = path.join(getGlobalSkillsDir(), skillName);

  if (!skillExists(skillName)) {
    if (!options.quiet) {
      console.log(`Skill "${skillName}" does not exist globally`);
    }
    return false;
  }

  fs.rmSync(globalSkillPath, { recursive: true, force: true });

  if (!options.quiet) {
    console.log(`Removed global skill symlink: ${skillName}`);
  }

  return true;
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
    .filter((entry) => entry.isDirectory() && (entry.name.startsWith('ask-') || entry.name.startsWith('update-')))
    .map((entry) => entry.name);
}
