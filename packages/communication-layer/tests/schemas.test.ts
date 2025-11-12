import { describe, it, expect } from 'vitest';
import {
  SourceSchema,
  NavigatorResponseSchema,
  NavigatorConfigSchema,
  UserQuerySchema,
  NavigatorQuerySchema,
  createSource,
  createNavigatorResponse,
  createNavigatorConfig,
  createUserQuery,
  createNavigatorQuery,
} from '../src/index.js';

describe('Schema Validation', () => {
  describe('SourceSchema', () => {
    it('should validate valid source', () => {
      const source = {
        filePath: 'docs/test.md',
        excerpt: 'Test content',
        relevanceScore: 0.8,
      };

      const result = SourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    });

    it('should reject invalid relevance score', () => {
      const source = {
        filePath: 'docs/test.md',
        excerpt: 'Test content',
        relevanceScore: 1.5, // Invalid: > 1
      };

      const result = SourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });

    it('should accept optional line numbers', () => {
      const source = {
        filePath: 'docs/test.md',
        excerpt: 'Test content',
        relevanceScore: 0.8,
        lineNumbers: [10, 20] as [number, number],
      };

      const result = SourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    });

    it('should reject empty file path', () => {
      const source = {
        filePath: '',
        excerpt: 'Test content',
        relevanceScore: 0.8,
      };

      const result = SourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });
  });

  describe('NavigatorResponseSchema', () => {
    it('should validate valid response', () => {
      const response = {
        protocolVersion: '0.1.0',
        answer: 'Test answer',
        sources: [
          {
            filePath: 'docs/test.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          },
        ],
        confidence: 0.8,
        contextSize: 1000,
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject response without sources', () => {
      const response = {
        protocolVersion: '0.1.0',
        answer: 'Test answer',
        sources: [],
        confidence: 0.8,
        contextSize: 1000,
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject invalid confidence score', () => {
      const response = {
        protocolVersion: '0.1.0',
        answer: 'Test answer',
        sources: [
          {
            filePath: 'docs/test.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          },
        ],
        confidence: -0.5, // Invalid: < 0
        contextSize: 1000,
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should accept optional metadata', () => {
      const response = {
        protocolVersion: '0.1.0',
        answer: 'Test answer',
        sources: [
          {
            filePath: 'docs/test.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          },
        ],
        confidence: 0.8,
        contextSize: 1000,
        metadata: {
          responseTimeMs: 450,
          navigatorName: 'test-nav',
          domain: 'test',
        },
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('NavigatorConfigSchema', () => {
    it('should validate valid config', () => {
      const config = {
        communicationLayerVersion: '0.1.0',
        name: 'test-navigator',
        domain: 'test',
        knowledgeBasePath: './knowledge',
        confidenceThreshold: 0.7,
      };

      const result = NavigatorConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should use default confidence threshold', () => {
      const config = {
        communicationLayerVersion: '0.1.0',
        name: 'test-navigator',
        domain: 'test',
        knowledgeBasePath: './knowledge',
      };

      const result = NavigatorConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidenceThreshold).toBe(0.7);
      }
    });

    it('should accept optional fields', () => {
      const config = {
        communicationLayerVersion: '0.1.0',
        name: 'test-navigator',
        domain: 'test',
        knowledgeBasePath: './knowledge',
        confidenceThreshold: 0.8,
        maxContextSize: 100000,
        relatedDomains: ['aws', 'terraform'],
        dependencies: ['other-navigator'],
        description: 'Test navigator',
      };

      const result = NavigatorConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('UserQuerySchema', () => {
    it('should validate valid user query', () => {
      const query = {
        protocolVersion: '0.1.0',
        actor: {
          type: 'user' as const,
          id: 'user-123',
          name: 'Alice',
        },
        question: 'How do I deploy?',
      };

      const result = UserQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should accept optional metadata', () => {
      const query = {
        protocolVersion: '0.1.0',
        actor: {
          type: 'user' as const,
          id: 'user-123',
        },
        question: 'How do I deploy?',
        category: 'configuration' as const,
        context: 'AWS deployment',
        metadata: {
          sessionId: 'sess-456',
          timestamp: '2024-01-01T00:00:00Z',
          source: 'slack',
        },
      };

      const result = UserQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });
  });

  describe('NavigatorQuerySchema', () => {
    it('should validate inter-navigator query', () => {
      const query = {
        protocolVersion: '0.1.0',
        fromNavigator: 'terraform-nav',
        toNavigator: 'aws-nav',
        question: 'What IAM permissions are needed?',
      };

      const result = NavigatorQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should accept reason field', () => {
      const query = {
        protocolVersion: '0.1.0',
        fromNavigator: 'terraform-nav',
        toNavigator: 'aws-nav',
        question: 'What IAM permissions are needed?',
        reason: 'needs_specialist' as const,
      };

      const result = NavigatorQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('createSource should create valid source', () => {
      const source = createSource({
        filePath: 'docs/test.md',
        excerpt: 'Test content',
        relevanceScore: 0.9,
      });

      expect(source.filePath).toBe('docs/test.md');
      expect(source.relevanceScore).toBe(0.9);
    });

    it('createNavigatorResponse should create valid response', () => {
      const response = createNavigatorResponse({
        answer: 'Test',
        sources: [
          {
            filePath: 'test.md',
            excerpt: 'content',
            relevanceScore: 0.9,
          },
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      expect(response.protocolVersion).toBe('0.1.0');
      expect(response.answer).toBe('Test');
    });

    it('createNavigatorConfig should create valid config', () => {
      const config = createNavigatorConfig({
        name: 'test',
        domain: 'test',
        knowledgeBasePath: './knowledge',
      });

      expect(config.communicationLayerVersion).toBe('0.1.0');
      expect(config.confidenceThreshold).toBe(0.7);
    });

    it('createUserQuery should create valid query', () => {
      const query = createUserQuery({
        actor: {
          type: 'user',
          id: 'user-123',
        },
        question: 'Test question',
      });

      expect(query.protocolVersion).toBe('0.1.0');
      expect(query.question).toBe('Test question');
    });

    it('createNavigatorQuery should create valid navigator query', () => {
      const query = createNavigatorQuery({
        fromNavigator: 'nav1',
        toNavigator: 'nav2',
        question: 'Test',
      });

      expect(query.protocolVersion).toBe('0.1.0');
      expect(query.fromNavigator).toBe('nav1');
    });
  });
});
