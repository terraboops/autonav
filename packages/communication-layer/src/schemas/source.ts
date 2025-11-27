import { z } from 'zod';

/**
 * Source Citation Schema
 *
 * Represents a source citation in a navigator response.
 * All responses must cite sources to prevent hallucination.
 *
 * This schema is optimized for use with Structured Outputs,
 * using descriptive field names that guide Claude's generation.
 */
export const SourceSchema = z.object({
  /**
   * Filename from knowledge base
   * Should be a relative path from the knowledge base root
   */
  file: z.string().min(1).describe('Filename from knowledge base'),

  /**
   * Specific section or heading within the file
   * Helps pinpoint the exact location of the information
   */
  section: z.string().min(1).describe('Specific section or heading'),

  /**
   * Why this source is relevant to answering the question
   * A brief explanation of the connection
   */
  relevance: z.string().min(1).describe('Why this source is relevant'),
});

export type Source = z.infer<typeof SourceSchema>;

/**
 * Helper to create a source citation
 */
export function createSource(params: {
  file: string;
  section: string;
  relevance: string;
}): Source {
  return SourceSchema.parse(params);
}
