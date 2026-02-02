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
        file: 'docs/test.md',
        section: 'Test Section',
        relevance: 'Contains information about the topic',
      };

      const result = SourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    });

    it('should reject empty file path', () => {
      const source = {
        file: '',
        section: 'Test Section',
        relevance: 'Contains information',
      };

      const result = SourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });

    it('should reject empty section', () => {
      const source = {
        file: 'docs/test.md',
        section: '',
        relevance: 'Contains information',
      };

      const result = SourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });

    it('should reject empty relevance', () => {
      const source = {
        file: 'docs/test.md',
        section: 'Test Section',
        relevance: '',
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
            file: 'docs/test.md',
            section: 'Test Section',
            relevance: 'Contains the answer to the question',
          },
        ],
        confidence: 'high' as const,
        confidenceReason: 'Direct answer found in documentation',
        outOfDomain: false,
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should accept response with empty sources array', () => {
      const response = {
        protocolVersion: '0.1.0',
        answer: "I don't have information about that",
        sources: [],
        confidence: 'low' as const,
        confidenceReason: 'No relevant information found in knowledge base',
        outOfDomain: true,
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid confidence level', () => {
      const response = {
        protocolVersion: '0.1.0',
        answer: 'Test answer',
        sources: [
          {
            file: 'docs/test.md',
            section: 'Test Section',
            relevance: 'Contains information',
          },
        ],
        confidence: 'invalid' as any,
        confidenceReason: 'Test reason',
        outOfDomain: false,
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject short confidence reason', () => {
      const response = {
        protocolVersion: '0.1.0',
        answer: 'Test answer',
        sources: [
          {
            file: 'docs/test.md',
            section: 'Test Section',
            relevance: 'Contains information',
          },
        ],
        confidence: 'high' as const,
        confidenceReason: 'Short', // Too short (< 10 chars)
        outOfDomain: false,
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
            file: 'docs/test.md',
            section: 'Test Section',
            relevance: 'Contains information',
          },
        ],
        confidence: 'high' as const,
        confidenceReason: 'Direct answer found',
        outOfDomain: false,
        metadata: {
          responseTimeMs: 450,
          navigatorName: 'test-nav',
          filesSearched: 5,
        },
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should accept optional relatedTopics', () => {
      const response = {
        protocolVersion: '0.1.0',
        answer: 'Test answer',
        sources: [
          {
            file: 'docs/test.md',
            section: 'Test Section',
            relevance: 'Contains information',
          },
        ],
        confidence: 'medium' as const,
        confidenceReason: 'Answer requires synthesis',
        outOfDomain: false,
        relatedTopics: ['deployment', 'configuration', 'monitoring'],
      };

      const result = NavigatorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('NavigatorConfigSchema', () => {
    it('should validate valid config', () => {
      const config = {
        version: '1.0.0',
        name: 'test-navigator',
        description: 'Test navigator for validation',
        created: new Date().toISOString(),
        knowledgePack: null,
        knowledgeBase: './knowledge',
        confidenceThreshold: 0.7,
        plugins: {
          configFile: '.claude/plugins.json',
        },
      };

      const result = NavigatorConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate config with knowledge pack', () => {
      const config = {
        version: '1.0.0',
        name: 'test-navigator',
        created: new Date().toISOString(),
        knowledgePack: {
          name: 'aws-platform',
          version: '1.2.0',
          installedAt: new Date().toISOString(),
        },
        knowledgeBase: './knowledge',
        plugins: {
          configFile: '.claude/plugins.json',
        },
      };

      const result = NavigatorConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const config = {
        version: '1.0.0',
        name: 'test-navigator',
        description: 'Test navigator',
        created: new Date().toISOString(),
        knowledgePack: null,
        knowledgeBase: './knowledge',
        instructionsPath: 'custom-prompt.md',
        systemConfiguration: 'system-config.json',
        confidenceThreshold: 0.8,
        plugins: {
          configFile: '.claude/plugins.json',
        },
      };

      const result = NavigatorConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept config without knowledgeBasePath (has default)', () => {
      const config = {
        version: '1.0.0',
        name: 'test-navigator',
        createdAt: new Date().toISOString(),
        knowledgePack: null,
        plugins: {
          configFile: '.claude/plugins.json',
        },
      };

      const result = NavigatorConfigSchema.safeParse(config);
      // knowledgeBasePath has default value './knowledge', so it's optional
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.knowledgeBasePath).toBe('./knowledge');
      }
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
        file: 'docs/test.md',
        section: 'Test Section',
        relevance: 'Contains relevant information',
      });

      expect(source.file).toBe('docs/test.md');
      expect(source.section).toBe('Test Section');
      expect(source.relevance).toBe('Contains relevant information');
    });

    it('createNavigatorResponse should create valid response', () => {
      const response = createNavigatorResponse({
        answer: 'Test',
        sources: [
          {
            file: 'test.md',
            section: 'Test Section',
            relevance: 'Contains the answer',
          },
        ],
        confidence: 'high',
        confidenceReason: 'Direct answer found in documentation',
        outOfDomain: false,
      });

      expect(response.protocolVersion).toBe('0.1.0');
      expect(response.answer).toBe('Test');
      expect(response.confidence).toBe('high');
      expect(response.outOfDomain).toBe(false);
    });

    it('createNavigatorConfig should create valid config', () => {
      const config = createNavigatorConfig({
        name: 'test',
        knowledgeBasePath: './knowledge',
      });

      expect(config.version).toBe('1.0.0');
      expect(config.name).toBe('test');
      expect(config.knowledgeBasePath).toBe('./knowledge');
      expect(config.knowledgePack).toBe(null);
      expect(config.plugins.configFile).toBe('./.claude/plugins.json');
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
