import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Template files available for scaffolding navigators
 */
export interface Templates {
  claudeMd: string;
  claudeMdPack: string;
  configJson: string;
  configJsonPack: string;
  pluginsJson: string;
  gitignore: string;
  readme: string;
  systemConfiguration: string;
}

/**
 * Load all template files
 */
export function loadTemplates(): Templates {
  return {
    claudeMd: fs.readFileSync(
      path.join(__dirname, "CLAUDE.md.template"),
      "utf-8"
    ),
    claudeMdPack: fs.readFileSync(
      path.join(__dirname, "CLAUDE-pack.md.template"),
      "utf-8"
    ),
    configJson: fs.readFileSync(
      path.join(__dirname, "config.json.template"),
      "utf-8"
    ),
    configJsonPack: fs.readFileSync(
      path.join(__dirname, "config-pack.json.template"),
      "utf-8"
    ),
    pluginsJson: fs.readFileSync(
      path.join(__dirname, "plugins.json.template"),
      "utf-8"
    ),
    gitignore: fs.readFileSync(
      path.join(__dirname, ".gitignore.template"),
      "utf-8"
    ),
    readme: fs.readFileSync(
      path.join(__dirname, "README.md.template"),
      "utf-8"
    ),
    systemConfiguration: fs.readFileSync(
      path.join(__dirname, "system-configuration.md.template"),
      "utf-8"
    ),
  };
}

/**
 * Replace template variables in a string
 */
export function replaceTemplateVars(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}
