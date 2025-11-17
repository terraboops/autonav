import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ClaudeAdapter, type ClaudeAdapterOptions } from '../src/index.js';

describe('ClaudeAdapter', () => {
  let testNavigatorPath: string;

  beforeAll(() => {
    // Create a test navigator directory
    testNavigatorPath = path.join(__dirname, 'test-navigator');
    fs.mkdirSync(testNavigatorPath, { recursive: true });
    fs.mkdirSync(path.join(testNavigatorPath, 'knowledge-base'), {
      recursive: true,
    });

    // Create test config.json
    const config = {
      version: '1.0.0',
      name: 'test-navigator',
      description: 'Test navigator',
      created: new Date().toISOString(),
      knowledgePack: null,
      knowledgeBase: 'knowledge-base',
      instructionsPath: 'CLAUDE.md',
      confidenceThreshold: 0.7,
      plugins: {
        configFile: '.claude/plugins.json',
      },
    };

    fs.writeFileSync(
      path.join(testNavigatorPath, 'config.json'),
      JSON.stringify(config, null, 2)
    );

    // Create test CLAUDE.md
    fs.writeFileSync(
      path.join(testNavigatorPath, 'CLAUDE.md'),
      '# Test Navigator\n\nTest system prompt for testing.'
    );

    // Create a test knowledge base file
    fs.writeFileSync(
      path.join(testNavigatorPath, 'knowledge-base', 'test.md'),
      '# Test Document\n\nThis is a test document.'
    );
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testNavigatorPath)) {
      fs.rmSync(testNavigatorPath, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should throw error if API key is not provided', () => {
      // Clear env var temporarily
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      expect(() => new ClaudeAdapter()).toThrow(
        'Anthropic API key is required'
      );

      // Restore env var
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      }
    });

    it('should accept API key via options', () => {
      const adapter = new ClaudeAdapter({ apiKey: 'test-key' });
      expect(adapter).toBeInstanceOf(ClaudeAdapter);
    });

    it('should use default options when not provided', () => {
      const adapter = new ClaudeAdapter({ apiKey: 'test-key' });
      expect(adapter).toBeDefined();
    });

    it('should accept custom options', () => {
      const options: ClaudeAdapterOptions = {
        apiKey: 'test-key',
        model: 'claude-opus-4-20250514',
        maxTokens: 8192,
        timeout: 120000,
      };

      const adapter = new ClaudeAdapter(options);
      expect(adapter).toBeInstanceOf(ClaudeAdapter);
    });
  });

  describe('loadNavigator', () => {
    let adapter: ClaudeAdapter;

    beforeAll(() => {
      adapter = new ClaudeAdapter({ apiKey: 'test-key' });
    });

    it('should load a valid navigator', () => {
      const navigator = adapter.loadNavigator(testNavigatorPath);

      expect(navigator).toBeDefined();
      expect(navigator.config.name).toBe('test-navigator');
      expect(navigator.config.domain).toBe('testing');
      expect(navigator.systemPrompt).toContain('Test Navigator');
      expect(navigator.navigatorPath).toBe(testNavigatorPath);
      expect(navigator.knowledgeBase).toBe(
        path.join(testNavigatorPath, 'knowledge-base')
      );
    });

    it('should throw error if directory does not exist', () => {
      expect(() =>
        adapter.loadNavigator('/nonexistent/path')
      ).toThrow('Navigator directory not found');
    });

    it('should throw error if path is not a directory', () => {
      const filePath = path.join(testNavigatorPath, 'config.json');
      expect(() => adapter.loadNavigator(filePath)).toThrow(
        'Path is not a directory'
      );
    });

    it('should throw error if config.json is missing', () => {
      const invalidPath = path.join(__dirname, 'invalid-navigator');
      fs.mkdirSync(invalidPath, { recursive: true });

      try {
        expect(() => adapter.loadNavigator(invalidPath)).toThrow(
          'config.json not found'
        );
      } finally {
        fs.rmSync(invalidPath, { recursive: true, force: true });
      }
    });

    it('should throw error if config.json is invalid JSON', () => {
      const invalidPath = path.join(__dirname, 'invalid-json-navigator');
      fs.mkdirSync(invalidPath, { recursive: true });
      fs.writeFileSync(
        path.join(invalidPath, 'config.json'),
        'invalid json {'
      );

      try {
        expect(() => adapter.loadNavigator(invalidPath)).toThrow(
          'Invalid config.json'
        );
      } finally {
        fs.rmSync(invalidPath, { recursive: true, force: true });
      }
    });

    it('should throw error if CLAUDE.md is missing', () => {
      const invalidPath = path.join(__dirname, 'no-claude-md-navigator');
      fs.mkdirSync(invalidPath, { recursive: true });
      fs.mkdirSync(path.join(invalidPath, 'knowledge-base'), {
        recursive: true,
      });

      const config = {
        version: '0.1.0',
        name: 'test',
        domain: 'test',
        knowledgeBase: 'knowledge-base',
      };

      fs.writeFileSync(
        path.join(invalidPath, 'config.json'),
        JSON.stringify(config)
      );

      try {
        expect(() => adapter.loadNavigator(invalidPath)).toThrow(
          'Instructions file not found'
        );
      } finally {
        fs.rmSync(invalidPath, { recursive: true, force: true });
      }
    });

    it('should throw error if knowledge base directory is missing', () => {
      const invalidPath = path.join(__dirname, 'no-kb-navigator');
      fs.mkdirSync(invalidPath, { recursive: true });

      const config = {
        version: '0.1.0',
        name: 'test',
        domain: 'test',
        knowledgeBase: 'knowledge-base',
      };

      fs.writeFileSync(
        path.join(invalidPath, 'config.json'),
        JSON.stringify(config)
      );

      fs.writeFileSync(
        path.join(invalidPath, 'CLAUDE.md'),
        'Test prompt'
      );

      try {
        expect(() => adapter.loadNavigator(invalidPath)).toThrow(
          'Knowledge base directory not found'
        );
      } finally {
        fs.rmSync(invalidPath, { recursive: true, force: true });
      }
    });

    it('should support custom instructions path', () => {
      const customPath = path.join(__dirname, 'custom-instructions-navigator');
      fs.mkdirSync(customPath, { recursive: true });
      fs.mkdirSync(path.join(customPath, 'knowledge-base'), {
        recursive: true,
      });

      const config = {
        version: '0.1.0',
        name: 'test',
        domain: 'test',
        knowledgeBase: 'knowledge-base',
        instructionsPath: 'custom-prompt.md',
      };

      fs.writeFileSync(
        path.join(customPath, 'config.json'),
        JSON.stringify(config)
      );

      fs.writeFileSync(
        path.join(customPath, 'custom-prompt.md'),
        'Custom prompt'
      );

      try {
        const navigator = adapter.loadNavigator(customPath);
        expect(navigator.systemPrompt).toBe('Custom prompt');
      } finally {
        fs.rmSync(customPath, { recursive: true, force: true });
      }
    });
  });

  describe('parseResponse', () => {
    let adapter: ClaudeAdapter;

    beforeAll(() => {
      adapter = new ClaudeAdapter({ apiKey: 'test-key' });
    });

    it('should parse JSON from code block', () => {
      const rawResponse = `
Here's the answer:

\`\`\`json
{
  "answer": "Test answer",
  "sources": [
    {
      "file": "test.md",
      "section": "Test excerpt",
      "relevance": 0.9
    }
  ],
  "confidence": 0.8,
  "contextSize": 1000
}
\`\`\`
      `;

      const result = adapter.parseResponse(rawResponse, 'Test question');
      expect(result.answer).toBe('Test answer');
      expect(result.sources).toHaveLength(1);
      expect(result.confidence).toBe(0.8);
    });

    it('should parse JSON from raw object', () => {
      const rawResponse = `{
        "answer": "Test answer",
        "sources": [
          {
            "file": "test.md",
            "section": "Test excerpt",
            "relevance": 0.9
          }
        ],
        "confidence": 0.8,
        "contextSize": 1000
      }`;

      const result = adapter.parseResponse(rawResponse, 'Test question');
      expect(result.answer).toBe('Test answer');
    });

    it('should throw error if no JSON found', () => {
      const rawResponse = 'This is just plain text without JSON';

      expect(() =>
        adapter.parseResponse(rawResponse, 'Test question')
      ).toThrow('Could not find JSON');
    });

    it('should throw error if JSON is invalid', () => {
      const rawResponse = `\`\`\`json
      { invalid json }
      \`\`\``;

      expect(() =>
        adapter.parseResponse(rawResponse, 'Test question')
      ).toThrow('Failed to parse response');
    });

    it('should populate query field if missing', () => {
      const rawResponse = `\`\`\`json
      {
        "answer": "Test",
        "sources": [{"file": "test.md", "section": "Test", "relevance": 0.9}],
        "confidence": 0.8,
        "contextSize": 1000
      }
      \`\`\``;

      const result = adapter.parseResponse(rawResponse, 'My question');
      expect(result.query).toBe('My question');
    });
  });

  describe('validate', () => {
    let adapter: ClaudeAdapter;
    let navigator: any;

    beforeAll(() => {
      adapter = new ClaudeAdapter({ apiKey: 'test-key' });
      navigator = adapter.loadNavigator(testNavigatorPath);
    });

    it('should validate a response with existing sources', () => {
      const response: any = {
        protocolVersion: '0.1.0',
        query: 'Test',
        answer: 'Test answer',
        sources: [
          {
            filePath: 'test.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          },
        ],
        confidence: 0.8,
        contextSize: 1000,
      };

      const result = adapter.validate(
        response,
        navigator.config,
        navigator.knowledgeBase
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for non-existent sources', () => {
      const response: any = {
        protocolVersion: '0.1.0',
        query: 'Test',
        answer: 'Test answer',
        sources: [
          {
            filePath: 'nonexistent.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          },
        ],
        confidence: 0.8,
        contextSize: 1000,
      };

      const result = adapter.validate(
        response,
        navigator.config,
        navigator.knowledgeBase
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn on low confidence', () => {
      const response: any = {
        protocolVersion: '0.1.0',
        query: 'Test',
        answer: 'Test answer',
        sources: [
          {
            filePath: 'test.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          },
        ],
        confidence: 0.3,
        contextSize: 1000,
      };

      const result = adapter.validate(
        response,
        navigator.config,
        navigator.knowledgeBase
      );

      // Low confidence should trigger an error based on threshold
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
