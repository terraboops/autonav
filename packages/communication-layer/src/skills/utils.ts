import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Get the global skills directory (~/.claude/skills)
 */
export function getGlobalSkillsDir(): string {
  return path.join(os.homedir(), '.claude', 'skills');
}

/**
 * Get the local skills directory for a navigator
 */
export function getLocalSkillsDir(navigatorPath: string): string {
  return path.join(navigatorPath, '.autonav', 'skills');
}

/**
 * Get the path to a specific local skill
 */
export function getLocalSkillPath(navigatorPath: string, skillName: string): string {
  return path.join(getLocalSkillsDir(navigatorPath), skillName);
}

/**
 * Check if a skill exists in the global directory
 */
export function skillExists(skillName: string): boolean {
  const skillPath = path.join(getGlobalSkillsDir(), skillName);
  return fs.existsSync(skillPath);
}

/**
 * Check if a skill exists in the local directory
 */
export function localSkillExists(navigatorPath: string, skillName: string): boolean {
  const skillPath = getLocalSkillPath(navigatorPath, skillName);
  return fs.existsSync(skillPath);
}

/**
 * Check if a global skill is a symlink
 */
export function isSkillSymlink(skillName: string): boolean {
  const skillPath = path.join(getGlobalSkillsDir(), skillName);
  try {
    const stats = fs.lstatSync(skillPath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get the target of a skill symlink
 */
export function getSkillSymlinkTarget(skillName: string): string | null {
  const skillPath = path.join(getGlobalSkillsDir(), skillName);
  try {
    return fs.readlinkSync(skillPath);
  } catch {
    return null;
  }
}

/**
 * Get the skill name for a navigator (ask-<name>)
 */
export function getSkillName(navigatorName: string): string {
  const normalized = navigatorName.toLowerCase().replace(/[_\s]+/g, '-');
  return `ask-${normalized}`;
}

/**
 * Get the update skill name for a navigator (update-<name>)
 */
export function getUpdateSkillName(navigatorName: string): string {
  const normalized = navigatorName.toLowerCase().replace(/[_\s]+/g, '-');
  return `update-${normalized}`;
}
