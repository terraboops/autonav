import { z } from "zod";
import { SourceSchema } from "./source.js";
import { PROTOCOL_VERSION } from "../version.js";

/**
 * NavigatorResponse schema - structured response from a navigator query
 *
 * All navigator responses must conform to this schema to ensure
 * consistent behavior and enable validation.
 */
export const NavigatorResponseSchema = z.object({
  /**
   * Protocol version used for this response
   * Enables version compatibility checking
   */
  protocolVersion: z.string().default(PROTOCOL_VERSION),

  /**
   * The original question asked
   */
  query: z.string().min(1, "Query cannot be empty"),

  /**
   * The answer to the question, grounded in the knowledge base
   * Should cite sources inline where possible
   */
  answer: z.string().min(1, "Answer cannot be empty"),

  /**
   * List of sources cited in the answer
   * Must contain at least one source unless explicitly stating "no information available"
   */
  sources: z.array(SourceSchema).default([]),

  /**
   * Confidence score (0-1) indicating how well the answer is grounded
   * 1.0 = fully grounded with multiple sources
   * 0.5-0.8 = partially grounded, some uncertainty
   * <0.5 = low confidence, may need human review
   */
  confidence: z.number().min(0).max(1).optional(),

  /**
   * Additional metadata for future extensions
   * Examples: search strategy used, tokens consumed, execution time
   */
  metadata: z.record(z.unknown()).optional(),

  /**
   * Timestamp when the response was generated
   */
  timestamp: z.string().datetime().optional(),
});

export type NavigatorResponse = z.infer<typeof NavigatorResponseSchema>;

/**
 * Helper to create a well-formed NavigatorResponse
 */
export function createNavigatorResponse(
  query: string,
  answer: string,
  sources: z.infer<typeof SourceSchema>[] = [],
  options?: {
    confidence?: number;
    metadata?: Record<string, unknown>;
  }
): NavigatorResponse {
  return NavigatorResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    query,
    answer,
    sources,
    confidence: options?.confidence,
    metadata: options?.metadata,
    timestamp: new Date().toISOString(),
  });
}
