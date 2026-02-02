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
  };

  // Add updated timestamp if provided
  if (updatedAt) {
    config.updatedAt = updatedAt;
  }

  return JSON.stringify(config, null, 2) + "\n";
}
