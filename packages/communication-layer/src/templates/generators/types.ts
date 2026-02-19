/**
 * Template generator types
 */

export interface NavigatorVars {
  // Core navigator info
  navigatorName: string;
  description?: string;
  version?: string;

  // Timestamps
  createdAt?: string;
  updatedAt?: string;

  // Context and scope
  navigatorContext?: string;
  knowledgeBasePath?: string;
  knowledgePathsSection?: string;
  domainScope?: string;

  // Pack metadata (for pack-based navigators)
  packName?: string;
  packVersion?: string;

  // Sandbox configuration (from interview)
  sandboxAllowedTools?: string[];
}
