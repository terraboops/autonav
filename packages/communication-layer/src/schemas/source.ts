import { z } from 'zod';

/**
 * Source Schema
 *
 * Represents a source citation in a navigator response.
 * All responses must cite sources to prevent hallucination.
 */
export const SourceSchema = z.object({
  /**
   * Relative or absolute path to the source file
   */
  filePath: z.string().min(1),

  /**
   * Optional line number range [start, end] for precise citation
   */
  lineNumbers: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),

  /**
   * Excerpt from the source that supports the answer
   */
  excerpt: z.string().min(1),

  /**
   * Relevance score (0-1) indicating how well this source answers the question
   */
  relevanceScore: z.number().min(0).max(1),
});

export type Source = z.infer<typeof SourceSchema>;

/**
 * Helper to create a source citation
 */
export function createSource(params: {
  filePath: string;
  excerpt: string;
  relevanceScore: number;
  lineNumbers?: [number, number];
}): Source {
  return SourceSchema.parse(params);
}

/**
 * Helper to validate line numbers are in correct order
 */
export function validateLineNumbers(lineNumbers?: [number, number]): boolean {
  if (!lineNumbers) return true;
  return lineNumbers[0] <= lineNumbers[1];
}
