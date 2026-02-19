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
    sandboxAllowedUrls,
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

  // Add sandbox config if allowed tools or URLs were specified (e.g., from interview)
  const hasSandboxTools = sandboxAllowedTools && sandboxAllowedTools.length > 0;
  const hasSandboxUrls = sandboxAllowedUrls && sandboxAllowedUrls.length > 0;
  if (hasSandboxTools || hasSandboxUrls) {
    const sandbox: Record<string, unknown> = {};
    if (hasSandboxTools) sandbox.allowedTools = sandboxAllowedTools;
    if (hasSandboxUrls) sandbox.allowedUrls = sandboxAllowedUrls;
    config.sandbox = sandbox;
  }

  return JSON.stringify(config, null, 2) + "\n";
}
