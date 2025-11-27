import { z } from 'zod';
import { SourceSchema } from './source.js';
import { PROTOCOL_VERSION } from '../version.js';

/**
 * Confidence Level Schema
 *
 * Represents the navigator's confidence in its answer.
 * This enum-based approach is optimized for Structured Outputs.
 */
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']).describe('Confidence level');

export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * Navigator Response Schema
 *
 * Standard response format for all navigator queries.
 * Optimized for use with Claude's Structured Outputs feature.
 *
 * This schema enforces grounding rules and citation requirements.
 */
export const NavigatorResponseSchema = z.object({
  /**
   * Protocol version for compatibility checking
   * Auto-populated, not required from Claude
   */
  protocolVersion: z.string().default(PROTOCOL_VERSION),

  /**
   * The original query/question (optional for backwards compatibility)
   */
  query: z.string().optional(),

  /**
   * Direct answer to the question
   * Must be grounded in sources from the knowledge base
   */
  answer: z.string().min(1).describe('Direct answer to the question'),

  /**
   * Sources cited in the answer
   * Empty array is allowed when explicitly stating lack of information
   */
  sources: z.array(SourceSchema).describe('Sources cited in answer'),

  /**
   * Confidence level (high, medium, or low)
   * High: Direct answer found in sources, clear and unambiguous
   * Medium: Answer requires synthesizing multiple sources, some interpretation needed
   * Low: Sources partially relevant but answer requires inference, or sources conflict
   */
  confidence: ConfidenceLevelSchema,

  /**
   * Explanation of why this confidence level was chosen
   * Must provide justification for the confidence rating
   */
  confidenceReason: z.string().min(10).describe('Why this confidence level'),

  /**
   * Related topics the user might want to ask about
   * Helps guide follow-up questions
   */
  relatedTopics: z.array(z.string()).optional().describe('Related topics user might ask about'),

  /**
   * Whether this question is outside the navigator's domain
   * True when the question clearly falls outside the knowledge base scope
   */
  outOfDomain: z.boolean().describe('Is this question outside navigator domain'),

  /**
   * Optional metadata about the response
   */
  metadata: z.object({
    /**
     * Time taken to generate the response (ms)
     */
    responseTimeMs: z.number().optional(),

    /**
     * Navigator that generated this response
     */
    navigatorName: z.string().optional(),

    /**
     * Number of files searched
     */
    filesSearched: z.number().int().nonnegative().optional(),
  }).optional(),
});

export type NavigatorResponse = z.infer<typeof NavigatorResponseSchema>;

/**
 * Helper to create a navigator response
 */
export function createNavigatorResponse(params: {
  answer: string;
  sources: z.infer<typeof SourceSchema>[];
  confidence: ConfidenceLevel;
  confidenceReason: string;
  outOfDomain: boolean;
  query?: string;
  relatedTopics?: string[];
  metadata?: NavigatorResponse['metadata'];
}): NavigatorResponse {
  return NavigatorResponseSchema.parse({
    ...params,
    protocolVersion: PROTOCOL_VERSION,
  });
}

/**
 * Convert confidence level enum to numeric score for backward compatibility
 */
export function confidenceToScore(confidence: ConfidenceLevel): number {
  switch (confidence) {
    case 'high':
      return 0.9;
    case 'medium':
      return 0.6;
    case 'low':
      return 0.3;
    default:
      // This should never happen due to Zod validation
      throw new Error(`Invalid confidence level: ${confidence}`);
  }
}

/**
 * Convert numeric confidence score to level enum
 */
export function scoreToConfidence(score: number): ConfidenceLevel {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}
