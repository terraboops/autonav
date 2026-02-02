/**
 * Template generators
 *
 * These functions compose template partials into complete files
 * for navigator scaffolding.
 */

export type { NavigatorVars } from "./types.js";
export { generateClaudeMd } from "./claude-md.js";
export { generateConfigJson } from "./config-json.js";
export { generatePluginsJson } from "./plugins-json.js";
export { generateReadme } from "./readme.js";
export { generateGitignore } from "./gitignore.js";
export { generateSystemConfiguration } from "./system-configuration.js";
