/**
 * Configuration for generating skills
 */
export interface SkillConfig {
  navigatorName: string;
  navigatorPath: string;
  description: string;
  scope?: string;
  audience?: string;
}

/**
 * Result of symlinking a skill to global directory
 */
export interface SymlinkResult {
  created: boolean;
  existed: boolean;
  path: string;
  message: string;
}
