/**
 * @platform-ai/communication-layer
 *
 * Communication protocol and schemas for Platform AI multi-agent system.
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
  PlatformAIError,
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
  validateLineNumbers,
} from './schemas/source.js';

// Schemas - Response
export {
  NavigatorResponseSchema,
  type NavigatorResponse,
  createNavigatorResponse,
  meetsConfidenceThreshold,
} from './schemas/response.js';

// Schemas - Config
export {
  NavigatorConfigSchema,
  type NavigatorConfig,
  createNavigatorConfig,
  isCompatibleVersion,
} from './schemas/config.js';

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
  detectHallucinations,
  validateConfidence,
  validateContextSize,
  validateResponse,
  validateSource,
} from './validation/index.js';

/**
 * Re-export Zod for convenience
 */
export { z } from 'zod';
