import { z } from 'zod';
import { ActorSchema } from '../types/actors.js';
import { PROTOCOL_VERSION } from '../version.js';

/**
 * Query Category
 *
 * Classifies question types for routing and analytics.
 */
export const QueryCategorySchema = z.enum([
  'informational',      // "What is X?"
  'troubleshooting',    // "Why isn't X working?"
  'configuration',      // "How do I configure X?"
  'architectural',      // "How should I design X?"
]);

export type QueryCategory = z.infer<typeof QueryCategorySchema>;

/**
 * User Query Schema
 *
 * Represents a question from a user to a navigator.
 */
export const UserQuerySchema = z.object({
  /**
   * Protocol version
   */
  protocolVersion: z.string().default(PROTOCOL_VERSION),

  /**
   * The user asking the question
   */
  actor: ActorSchema,

  /**
   * The question being asked
   */
  question: z.string().min(1),

  /**
   * Optional category hint (can be auto-detected)
   */
  category: QueryCategorySchema.optional(),

  /**
   * Optional context to help answer the question
   */
  context: z.string().optional(),

  /**
   * Optional metadata
   */
  metadata: z.object({
    /**
     * Session ID for tracking related queries
     */
    sessionId: z.string().optional(),

    /**
     * Timestamp of the query
     */
    timestamp: z.string().datetime().optional(),

    /**
     * Source of the query (e.g., "slack", "cli", "web")
     */
    source: z.string().optional(),
  }).optional(),
});

export type UserQuery = z.infer<typeof UserQuerySchema>;

/**
 * Inter-Navigator Query Schema
 *
 * For navigators to query each other (future feature).
 */
export const NavigatorQuerySchema = z.object({
  /**
   * Protocol version
   */
  protocolVersion: z.string().default(PROTOCOL_VERSION),

  /**
   * The navigator making the query
   */
  fromNavigator: z.string().min(1),

  /**
   * The navigator being queried
   */
  toNavigator: z.string().min(1),

  /**
   * The question being asked
   */
  question: z.string().min(1),

  /**
   * Context from the original query
   */
  context: z.string().optional(),

  /**
   * Reason for delegation
   */
  reason: z.enum([
    'out_of_domain',
    'needs_specialist',
    'requires_cross_domain_knowledge',
  ]).optional(),
});

export type NavigatorQuery = z.infer<typeof NavigatorQuerySchema>;

/**
 * Helper to create a user query
 */
export function createUserQuery(params: {
  actor: z.infer<typeof ActorSchema>;
  question: string;
  category?: QueryCategory;
  context?: string;
  metadata?: UserQuery['metadata'];
}): UserQuery {
  return UserQuerySchema.parse({
    ...params,
    protocolVersion: PROTOCOL_VERSION,
  });
}

/**
 * Helper to create a navigator query
 */
export function createNavigatorQuery(params: {
  fromNavigator: string;
  toNavigator: string;
  question: string;
  context?: string;
  reason?: NavigatorQuery['reason'];
}): NavigatorQuery {
  return NavigatorQuerySchema.parse({
    ...params,
    protocolVersion: PROTOCOL_VERSION,
  });
}
