import { z } from 'zod';

/**
 * Context Metrics Schema
 *
 * Tracks usage patterns and performance for operator insights.
 */
export const ContextMetricsSchema = z.object({
  /**
   * Navigator name
   */
  navigatorName: z.string(),

  /**
   * Time period for these metrics
   */
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),

  /**
   * Total queries processed
   */
  totalQueries: z.number().int().nonnegative(),

  /**
   * Average context size across all queries (tokens/characters)
   */
  averageContextSize: z.number().nonnegative(),

  /**
   * Distribution of context sizes
   */
  contextSizeDistribution: z.object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
    median: z.number().nonnegative(),
    p95: z.number().nonnegative(),
    p99: z.number().nonnegative(),
  }).optional(),

  /**
   * Most frequently used sources
   */
  topSources: z.array(z.object({
    filePath: z.string(),
    usageCount: z.number().int().positive(),
    averageRelevanceScore: z.number().min(0).max(1),
  })).optional(),

  /**
   * Average confidence scores
   */
  averageConfidence: z.number().min(0).max(1),

  /**
   * Confidence score distribution
   */
  confidenceDistribution: z.object({
    belowThreshold: z.number().int().nonnegative(),
    aboveThreshold: z.number().int().nonnegative(),
  }).optional(),

  /**
   * Query categories breakdown
   */
  categoryBreakdown: z.object({
    informational: z.number().int().nonnegative(),
    troubleshooting: z.number().int().nonnegative(),
    configuration: z.number().int().nonnegative(),
    architectural: z.number().int().nonnegative(),
  }).optional(),

  /**
   * Performance metrics
   */
  performance: z.object({
    averageResponseTimeMs: z.number().nonnegative(),
    p95ResponseTimeMs: z.number().nonnegative().optional(),
    p99ResponseTimeMs: z.number().nonnegative().optional(),
  }).optional(),

  /**
   * Error rates
   */
  errorRates: z.object({
    sourceNotFound: z.number().int().nonnegative(),
    lowConfidence: z.number().int().nonnegative(),
    outOfDomain: z.number().int().nonnegative(),
    contextOverflow: z.number().int().nonnegative(),
    hallucination: z.number().int().nonnegative(),
  }).optional(),
});

export type ContextMetrics = z.infer<typeof ContextMetricsSchema>;

/**
 * Source Usage Schema
 *
 * Tracks how often a source is used and its effectiveness.
 */
export const SourceUsageSchema = z.object({
  filePath: z.string(),
  usageCount: z.number().int().nonnegative(),
  lastUsed: z.string().datetime().optional(),
  averageRelevanceScore: z.number().min(0).max(1),
  queryCategories: z.array(z.enum(['informational', 'troubleshooting', 'configuration', 'architectural'])).optional(),
});

export type SourceUsage = z.infer<typeof SourceUsageSchema>;

/**
 * Quality Correlation Schema
 *
 * Tracks correlation between context size and response quality.
 */
export const QualityCorrelationSchema = z.object({
  /**
   * Correlation coefficient between context size and confidence (-1 to 1)
   */
  contextSizeVsConfidence: z.number().min(-1).max(1),

  /**
   * Correlation coefficient between context size and response time
   */
  contextSizeVsResponseTime: z.number().min(-1).max(1),

  /**
   * Optimal context size range (if identifiable)
   */
  optimalContextRange: z.object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
  }).optional(),

  /**
   * Sample size for correlations
   */
  sampleSize: z.number().int().positive(),
});

export type QualityCorrelation = z.infer<typeof QualityCorrelationSchema>;

/**
 * Helper to create context metrics
 */
export function createContextMetrics(params: {
  navigatorName: string;
  period: { start: string; end: string };
  totalQueries: number;
  averageContextSize: number;
  averageConfidence: number;
}): ContextMetrics {
  return ContextMetricsSchema.parse(params);
}

/**
 * Helper to track source usage
 */
export function createSourceUsage(params: {
  filePath: string;
  usageCount: number;
  averageRelevanceScore: number;
  lastUsed?: string;
}): SourceUsage {
  return SourceUsageSchema.parse(params);
}
