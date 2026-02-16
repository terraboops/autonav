/**
 * Tools Module
 *
 * Exports tool definitions and handlers for navigator capabilities.
 * Tools use MCP format for integration with Claude Agent SDK.
 */

export {
  createSelfConfigMcpServer,
  CONFIGURABLE_PLUGINS,
  type ConfigurablePlugin,
  type UpdatePluginConfigInput,
  type GetPluginConfigInput,
  type SelfConfigResult,
} from "./self-config.js";

export {
  handleUpdatePluginConfig,
  handleGetPluginConfig,
  processToolCall,
} from "./handler.js";

export {
  createResponseMcpServer,
  SUBMIT_ANSWER_TOOL,
  type SubmitAnswerResult,
} from "./response.js";

export {
  createCrossNavMcpServer,
} from "./cross-nav.js";
