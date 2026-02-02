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
    fs.mkdirSync(path.join(testNavigatorPath, 'knowledge'), {
      recursive: true,
    });

    // Create test config.json with new schema
    const config = {
      version: '1.0.0',
      name: 'test-navigator',
      description: 'Test navigator',
      createdAt: new Date().toISOString(),
      knowledgePack: null,
      knowledgeBasePath: './knowledge',
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
      path.join(testNavigatorPath, 'knowledge', 'test.md'),
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
    it('should create adapter with default options', () => {
      const adapter = new ClaudeAdapter();
      expect(adapter).toBeInstanceOf(ClaudeAdapter);
    });

    it('should accept custom model option', () => {
      const options: ClaudeAdapterOptions = {
        model: 'claude-opus-4-20250514',
      };

      const adapter = new ClaudeAdapter(options);
      expect(adapter).toBeInstanceOf(ClaudeAdapter);
    });

    it('should accept custom maxTurns option', () => {
      const options: ClaudeAdapterOptions = {
        maxTurns: 20,
      };

      const adapter = new ClaudeAdapter(options);
      expect(adapter).toBeInstanceOf(ClaudeAdapter);
    });
  });

  describe('loadNavigator', () => {
    let adapter: ClaudeAdapter;

    beforeAll(() => {
      adapter = new ClaudeAdapter();
    });

    it('should load a valid navigator', async () => {
      const navigator = await adapter.loadNavigator(testNavigatorPath);

      expect(navigator.config.name).toBe('test-navigator');
      expect(navigator.systemPrompt).toContain('Test Navigator');
      expect(navigator.knowledgeBasePath).toContain('knowledge');
    });

    it('should throw error if navigator path does not exist', async () => {
      await expect(() =>
        adapter.loadNavigator('/nonexistent/path')
      ).rejects.toThrow();
    });

    it('should throw error if config.json is missing', async () => {
      const invalidPath = path.join(__dirname, 'no-config-navigator');
      fs.mkdirSync(invalidPath, { recursive: true });

      try {
        await expect(() => adapter.loadNavigator(invalidPath)).rejects.toThrow(
          'config.json not found'
        );
      } finally {
        fs.rmSync(invalidPath, { recursive: true, force: true });
      }
    });

    it('should throw error if config.json is invalid', async () => {
      const invalidPath = path.join(__dirname, 'invalid-config-navigator');
      fs.mkdirSync(invalidPath, { recursive: true });
      fs.writeFileSync(
        path.join(invalidPath, 'config.json'),
        '{ invalid json }'
      );

      try {
        await expect(() => adapter.loadNavigator(invalidPath)).rejects.toThrow();
      } finally {
        fs.rmSync(invalidPath, { recursive: true, force: true });
      }
    });

    it('should throw error if CLAUDE.md is missing', async () => {
      const invalidPath = path.join(__dirname, 'no-claude-md-navigator');
      fs.mkdirSync(invalidPath, { recursive: true });
      fs.mkdirSync(path.join(invalidPath, 'knowledge'), {
        recursive: true,
      });

      const config = {
        version: '1.0.0',
        name: 'test',
        createdAt: new Date().toISOString(),
        knowledgePack: null,
        knowledgeBasePath: './knowledge',
        plugins: {
          configFile: '.claude/plugins.json',
        },
      };

      fs.writeFileSync(
        path.join(invalidPath, 'config.json'),
        JSON.stringify(config)
      );

      try {
        await expect(() =>
          adapter.loadNavigator(invalidPath)
        ).rejects.toThrow('Instructions file not found');
      } finally {
        fs.rmSync(invalidPath, { recursive: true, force: true });
      }
    });

    it('should throw error if knowledge base directory is missing', async () => {
      const invalidPath = path.join(__dirname, 'no-kb-navigator');
      fs.mkdirSync(invalidPath, { recursive: true });

      const config = {
        version: '1.0.0',
        name: 'test',
        createdAt: new Date().toISOString(),
        knowledgePack: null,
        knowledgeBasePath: './knowledge',
        plugins: {
          configFile: '.claude/plugins.json',
        },
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
        await expect(() =>
          adapter.loadNavigator(invalidPath)
        ).rejects.toThrow('Knowledge base directory not found');
      } finally {
        fs.rmSync(invalidPath, { recursive: true, force: true });
      }
    });

    it('should support custom instructions path', async () => {
      const customPath = path.join(__dirname, 'custom-instructions-navigator');
      fs.mkdirSync(customPath, { recursive: true });
      fs.mkdirSync(path.join(customPath, 'knowledge'), {
        recursive: true,
      });

      const config = {
        version: '1.0.0',
        name: 'test',
        createdAt: new Date().toISOString(),
        knowledgePack: null,
        knowledgeBasePath: './knowledge',
        instructionsPath: 'custom-prompt.md',
        plugins: {
          configFile: '.claude/plugins.json',
        },
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
        const navigator = await adapter.loadNavigator(customPath);
        expect(navigator.systemPrompt).toBe('Custom prompt');
      } finally {
        fs.rmSync(customPath, { recursive: true, force: true });
      }
    });
  });

  describe('parseResponse', () => {
    let adapter: ClaudeAdapter;

    beforeAll(() => {
      adapter = new ClaudeAdapter();
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
      "section": "Test Section",
      "relevance": "Contains the answer"
    }
  ],
  "confidence": "high",
  "confidenceReason": "Direct answer found in source",
  "outOfDomain": false
}
\`\`\`
      `;

      const result = adapter.parseResponse(rawResponse, 'Test question');
      expect(result.answer).toBe('Test answer');
      expect(result.sources).toHaveLength(1);
      expect(result.confidence).toBe('high');
    });

    it('should parse JSON from raw object', () => {
      const rawResponse = `{
        "answer": "Test answer",
        "sources": [
          {
            "file": "test.md",
            "section": "Test Section",
            "relevance": "Contains the answer"
          }
        ],
        "confidence": "medium",
        "confidenceReason": "Partial information found",
        "outOfDomain": false
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
        "sources": [{
          "file": "test.md",
          "section": "Section",
          "relevance": "Relevant"
        }],
        "confidence": "high",
        "confidenceReason": "Found directly",
        "outOfDomain": false
      }
      \`\`\``;

      const result = adapter.parseResponse(rawResponse, 'My question');
      expect(result.query).toBe('My question');
    });
  });

  describe('validate', () => {
    let adapter: ClaudeAdapter;
    let navigator: any;

    beforeAll(async () => {
      adapter = new ClaudeAdapter();
      navigator = await adapter.loadNavigator(testNavigatorPath);
    });

    it('should validate a response with existing sources', () => {
      const response: any = {
        protocolVersion: '0.1.0',
        query: 'Test',
        answer: 'Test answer',
        sources: [
          {
            file: 'test.md',
            section: 'Test Section',
            relevance: 'Contains the answer',
          },
        ],
        confidence: 'high',
        confidenceReason: 'Direct answer found',
        outOfDomain: false,
      };

      const result = adapter.validate(response, navigator.knowledgeBasePath);
      expect(result.valid).toBe(true);
    });

    it('should fail validation for non-existent sources', () => {
      const response: any = {
        protocolVersion: '0.1.0',
        query: 'Test',
        answer: 'Test answer',
        sources: [
          {
            file: 'nonexistent.md',
            section: 'Section',
            relevance: 'Relevant',
          },
        ],
        confidence: 'high',
        confidenceReason: 'Direct answer found',
        outOfDomain: false,
      };

      const result = adapter.validate(response, navigator.knowledgeBasePath);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not warn for low confidence (trust the model)', () => {
      const response: any = {
        protocolVersion: '0.1.0',
        query: 'Test',
        answer: 'Test answer',
        sources: [
          {
            file: 'test.md',
            section: 'Section',
            relevance: 'Relevant',
          },
        ],
        confidence: 'low',
        confidenceReason: 'Limited information found',
        outOfDomain: false,
      };

      const result = adapter.validate(response, navigator.knowledgeBasePath);
      // New validation philosophy: only validate objective facts (source existence)
      // Trust the model for everything else, including confidence assessment
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });
  });
});
