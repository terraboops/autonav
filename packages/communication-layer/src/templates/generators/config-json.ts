/**
 * config.json template generator
 */

import type { NavigatorVars } from "./types.js";

export function generateConfigJson(vars: NavigatorVars): string {
  const {
    name,
    description = "A knowledge navigator",
    version = "1.0.0",
    createdAt = new Date().toISOString(),
  } = vars;

  const config = {
    version: "1.4.0", // Autonav framework version
    navigator: {
      name,
      description,
      version,
      createdAt,
    },
    knowledgePack: null as string | null,
  };

  return JSON.stringify(config, null, 2) + "\n";
}
