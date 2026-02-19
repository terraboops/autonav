/**
 * @autonav/communication-layer
 *
 * Communication protocol and schemas for Autonav multi-agent system.
 * This package defines HOW agents communicate, not what they do.
 *
 * @packageDocumentation
 */

// Version
export { COMMUNICATION_LAYER_VERSION, PROTOCOL_VERSION } from './version.js';

// Actor Types
export {
  UserActorSchema,
  OperatorActorSchema,
  AgentActorSchema,
  ActorSchema,
  ActorCapabilities,
  type UserActor,
  type OperatorActor,
  type AgentActor,
  type Actor,
} from './types/actors.js';

// Errors
export {
  AutonavError,
  SourceNotFoundError,
  LowConfidenceError,
  OutOfDomainError,
  ContextOverflowError,
  HallucinationError,
  VersionMismatchError,
  ValidationError,
} from './errors/index.js';

// Schemas - Source
export {
  SourceSchema,
  type Source,
  createSource,
} from './schemas/source.js';

// Schemas - Response
export {
  NavigatorResponseSchema,
  ConfidenceLevelSchema,
  type NavigatorResponse,
  type ConfidenceLevel,
  createNavigatorResponse,
  confidenceToScore,
  scoreToConfidence,
} from './schemas/response.js';

// Schemas - Config
export {
  NavigatorConfigSchema,
  KnowledgePackMetadataSchema,
  type NavigatorConfig,
  type KnowledgePackMetadata,
  createNavigatorConfig,
} from './schemas/config.js';

// Schemas - Config Description
export {
  describeConfigSchema,
} from './schemas/config-describe.js';

// Schemas - Plugin Config
export {
  PluginConfigSchema,
  SlackPluginSchema,
  SignalPluginSchema,
  type PluginConfig,
  type SlackPlugin,
  type SignalPlugin,
  createDefaultPluginConfig,
  validatePluginConfig,
} from './schemas/plugin-config.js';

// Schemas - Query
export {
  QueryCategorySchema,
  UserQuerySchema,
  NavigatorQuerySchema,
  type QueryCategory,
  type UserQuery,
  type NavigatorQuery,
  createUserQuery,
  createNavigatorQuery,
} from './schemas/query.js';

// Schemas - Metrics
export {
  ContextMetricsSchema,
  SourceUsageSchema,
  QualityCorrelationSchema,
  type ContextMetrics,
  type SourceUsage,
  type QualityCorrelation,
  createContextMetrics,
  createSourceUsage,
} from './schemas/metrics.js';

// Validation
export {
  type ValidationResult,
  checkSourcesExist,
  validateResponse,
  validateSource,
} from './validation/index.js';

// Prompts
export {
  // Identity Protocol
  buildAgentIdentityProtocol,
  type NavigatorIdentity,
  type CallerContext,
  // Templates
  GROUNDING_RULES,
  SELF_CONFIG_RULES,
  createAnswerQuestionPrompt,
  createConfidencePrompt,
  createExtractSourcesPrompt,
  createNavigatorSystemPrompt,
} from './prompts/index.js';

/**
 * Re-export Zod for convenience
 */
export { z } from 'zod';

// Template generation
export {
  // Partials
  // Note: GROUNDING_RULES already exported above from prompts
  RESPONSE_FORMAT,
  NAVIGATOR_AUTHORITY,
  CONFIDENCE_LEVELS,
} from './templates/partials/index.js';

export {
  // Generators
  generateClaudeMd,
  generateConfigJson,
  generatePluginsJson,
  generateReadme,
  generateGitignore,
  generateSystemConfiguration,
  type NavigatorVars,
} from './templates/generators/index.js';

// Skill management
export {
  // Types
  type SkillConfig,
  type SymlinkResult,
  // Utilities
  getGlobalSkillsDir,
  getLocalSkillsDir,
  getLocalSkillPath,
  skillExists,
  localSkillExists,
  isSkillSymlink,
  getSkillSymlinkTarget,
  getSkillName,
  getUpdateSkillName,
  // Generators
  generateSkillContent,
  generateUpdateSkillContent,
  // Management
  createLocalSkill,
  createLocalUpdateSkill,
  symlinkSkillToGlobal,
  createAndSymlinkSkill,
  createAndSymlinkUpdateSkill,
  removeSkillSymlink,
  discoverLocalSkills,
} from './skills/index.js';
