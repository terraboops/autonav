import { z } from 'zod';
import { SourceSchema } from './source.js';
import { PROTOCOL_VERSION } from '../version.js';

/**
 * Navigator Response Schema
 *
 * Standard response format for all navigator queries.
 */
export const NavigatorResponseSchema = z.object({
  /**
   * Protocol version for compatibility checking
   */
  protocolVersion: z.string().default(PROTOCOL_VERSION),

  /**
   * The answer to the user's question
   */
  answer: z.string().min(1),

  /**
   * Array of sources that support the answer
   * Must not be empty - all answers require citations
   */
  sources: z.array(SourceSchema).min(1, 'At least one source is required'),

  /**
   * Confidence score (0-1) in the answer's accuracy
   * 0 = no confidence, 1 = very high confidence
   */
  confidence: z.number().min(0).max(1),

  /**
   * Size of context used (in tokens or characters)
   * Useful for context engineering and optimization
   */
  contextSize: z.number().int().nonnegative(),

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
     * Domain of the navigator
     */
    domain: z.string().optional(),

    /**
     * Number of files searched
     */
    filesSearched: z.number().int().nonnegative().optional(),

    /**
     * Query categorization
     */
    queryCategory: z.enum(['informational', 'troubleshooting', 'configuration', 'architectural']).optional(),
  }).optional(),
});

export type NavigatorResponse = z.infer<typeof NavigatorResponseSchema>;

/**
 * Helper to create a navigator response
 */
export function createNavigatorResponse(params: {
  answer: string;
  sources: z.infer<typeof SourceSchema>[];
  confidence: number;
  contextSize: number;
  metadata?: NavigatorResponse['metadata'];
}): NavigatorResponse {
  return NavigatorResponseSchema.parse({
    ...params,
    protocolVersion: PROTOCOL_VERSION,
  });
}

/**
 * Check if response meets minimum confidence threshold
 */
export function meetsConfidenceThreshold(
  response: NavigatorResponse,
  threshold: number
): boolean {
  return response.confidence >= threshold;
}
