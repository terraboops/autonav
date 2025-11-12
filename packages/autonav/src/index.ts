/**
 * Platform AI Autonav
 *
 * CLI tools and Claude SDK Adapter for building and querying navigators
 *
 * @packageDocumentation
 */

// Export adapter
export { ClaudeAdapter, type LoadedNavigator } from "./adapter/index.js";

// Export templates utilities (for programmatic use)
export { loadTemplates, replaceTemplateVars, type Templates } from "./templates/index.js";
