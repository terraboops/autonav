import { z } from "zod";

/**
 * Source schema - represents a cited source in a navigator response
 *
 * All responses must cite sources from the knowledge base to prevent hallucinations.
 */
export const SourceSchema = z.object({
  /**
   * Relative path to the file from the knowledge-base directory
   * Example: "deployment/ssl-configuration.md"
   */
  filePath: z.string().min(1, "File path cannot be empty"),

  /**
   * Relevant excerpt from the source file
   * Should be a direct quote, not paraphrased
   */
  excerpt: z.string().optional(),

  /**
   * Line number or section where the information was found
   * Helps with source verification
   */
  lineNumber: z.number().int().positive().optional(),

  /**
   * Section heading within the document
   * Example: "## SSL Configuration"
   */
  section: z.string().optional(),
});

export type Source = z.infer<typeof SourceSchema>;
