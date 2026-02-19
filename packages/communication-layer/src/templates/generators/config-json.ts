/**
 * config.json template generator
 */

import type { NavigatorVars } from "./types.js";
import { PROTOCOL_VERSION } from "../../version.js";

export function generateConfigJson(vars: NavigatorVars): string {
  const {
    navigatorName,
    description = "A knowledge navigator",
    version = "1.0.0",
    createdAt = new Date().toISOString(),
    updatedAt,
    knowledgeBasePath = "./knowledge",
    packName,
    packVersion,
    sandboxAllowedTools,
  } = vars;

  const config: Record<string, unknown> = {
    version,
    name: navigatorName,
    description,
    communicationLayerVersion: `^${PROTOCOL_VERSION}`,
    sdkAdapterVersion: "^1.0.0",
    knowledgeBasePath,
    instructionsPath: "CLAUDE.md",
    createdAt,
    plugins: {
      configFile: "./.claude/plugins.json",
    },
  };

  // Add updated timestamp if provided
  if (updatedAt) {
    config.updatedAt = updatedAt;
  }

  // Add knowledge pack metadata if provided
  if (packName && packVersion) {
    config.knowledgePack = {
      name: packName,
      version: packVersion,
      installedAt: createdAt,
    };
  } else {
    config.knowledgePack = null;
  }

  // Add sandbox config if allowed tools were specified (e.g., from interview)
  if (sandboxAllowedTools && sandboxAllowedTools.length > 0) {
    config.sandbox = {
      allowedTools: sandboxAllowedTools,
    };
  }

  return JSON.stringify(config, null, 2) + "\n";
}
