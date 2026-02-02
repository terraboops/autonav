/**
 * config.json template generator
 */

import type { NavigatorVars } from "./types.js";

export function generateConfigJson(vars: NavigatorVars): string {
  const {
    navigatorName,
    description = "A knowledge navigator",
    version = "0.1.0",
    createdAt = new Date().toISOString(),
    updatedAt,
    packName,
    packVersion,
  } = vars;

  const config: Record<string, unknown> = {
    version,
    name: navigatorName,
    description,
    created: createdAt,
  };

  // Add updated timestamp if provided
  if (updatedAt) {
    config.updated = updatedAt;
  }

  // Add pack metadata if present
  if (packName && packVersion) {
    config.knowledgePack = {
      name: packName,
      version: packVersion,
    };
  }

  // Add plugins config reference
  config.plugins = {
    configFile: "./.claude/plugins.json",
  };

  return JSON.stringify(config, null, 2) + "\n";
}
