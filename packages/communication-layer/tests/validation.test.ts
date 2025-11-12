import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  checkSourcesExist,
  detectHallucinations,
  validateConfidence,
  validateContextSize,
  validateResponse,
  validateSource,
} from '../src/validation/index.js';
import {
  createNavigatorResponse,
  createNavigatorConfig,
  createSource,
} from '../src/index.js';
import type { NavigatorResponse, NavigatorConfig, Source } from '../src/index.js';

describe('Validation Utilities', () => {
  let tempDir: string;
  let testConfig: NavigatorConfig;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-ai-test-'));

    // Create test knowledge base files
    fs.writeFileSync(path.join(tempDir, 'doc1.md'), '# Test Document\nSome content here.');
    fs.writeFileSync(path.join(tempDir, 'doc2.md'), '# Another Doc\nMore content.');

    testConfig = createNavigatorConfig({
      name: 'test-navigator',
      domain: 'test',
      knowledgeBasePath: tempDir,
      confidenceThreshold: 0.7,
      maxContextSize: 10000,
    });
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('checkSourcesExist', () => {
    it('should pass when all sources exist', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = checkSourcesExist(response, tempDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when source does not exist', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'nonexistent.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = checkSourcesExist(response, tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('nonexistent.md');
    });

    it('should warn about invalid line numbers', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
            lineNumbers: [10, 5], // Invalid: start > end
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = checkSourcesExist(response, tempDir);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Invalid line numbers');
    });
  });

  describe('detectHallucinations', () => {
    it('should pass for clean response', () => {
      const response = createNavigatorResponse({
        answer: 'The configuration is in doc1.md',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Configuration details here',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = detectHallucinations(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect placeholder paths', () => {
      const response = createNavigatorResponse({
        answer: 'Check /path/to/your-file.md for details',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Some content',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = detectHallucinations(response);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect Lorem Ipsum text', () => {
      const response = createNavigatorResponse({
        answer: 'Lorem ipsum dolor sit amet',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Lorem ipsum placeholder text',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = detectHallucinations(response);
      expect(result.valid).toBe(false);
    });

    it('should fail when no sources provided', () => {
      const response: NavigatorResponse = {
        protocolVersion: '0.1.0',
        answer: 'Some answer',
        sources: [],
        confidence: 0.8,
        contextSize: 1000,
      };

      const result = detectHallucinations(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('no source citations');
    });

    it('should warn about short excerpts', () => {
      const response = createNavigatorResponse({
        answer: 'Test',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Short',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = detectHallucinations(response);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Very short excerpt');
    });

    it('should warn about low relevance scores', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Some content here',
            relevanceScore: 0.2,
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = detectHallucinations(response);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Low relevance score');
    });
  });

  describe('validateConfidence', () => {
    it('should pass when confidence meets threshold', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 1000,
      });

      const result = validateConfidence(response, testConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when confidence below threshold', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.5, // Below 0.7 threshold
        contextSize: 1000,
      });

      const result = validateConfidence(response, testConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('below threshold');
    });

    it('should warn when high confidence without quality sources', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.4, // Low relevance
          }),
        ],
        confidence: 0.9, // High confidence
        contextSize: 1000,
      });

      const result = validateConfidence(response, testConfig);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('no high-quality sources');
    });

    it('should warn when low confidence with quality sources', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          }),
          createSource({
            filePath: 'doc2.md',
            excerpt: 'More content',
            relevanceScore: 0.85,
          }),
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Another excerpt',
            relevanceScore: 0.8,
          }),
        ],
        confidence: 0.2, // Low confidence despite quality sources
        contextSize: 1000,
      });

      const result = validateConfidence(response, testConfig);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('confidence might be underestimated');
    });
  });

  describe('validateContextSize', () => {
    it('should pass when context within limits', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 5000, // Within 10000 limit
      });

      const result = validateContextSize(response, testConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when context exceeds limit', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 15000, // Exceeds 10000 limit
      });

      const result = validateContextSize(response, testConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('exceeds maximum');
    });

    it('should warn when context size high', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Test excerpt',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 8500, // 85% of 10000 limit
      });

      const result = validateContextSize(response, testConfig);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('% of limit');
    });
  });

  describe('validateResponse', () => {
    it('should run all validations', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer from documentation',
        sources: [
          createSource({
            filePath: 'doc1.md',
            excerpt: 'Relevant excerpt from the docs',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.8,
        contextSize: 2000,
      });

      const result = validateResponse(response, testConfig, tempDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should aggregate errors from all validations', () => {
      const response = createNavigatorResponse({
        answer: 'Check /path/to/your-file.md',
        sources: [
          createSource({
            filePath: 'nonexistent.md',
            excerpt: 'Some content',
            relevanceScore: 0.9,
          }),
        ],
        confidence: 0.5, // Below threshold
        contextSize: 15000, // Exceeds limit
      });

      const result = validateResponse(response, testConfig, tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2); // Multiple errors
    });
  });

  describe('validateSource', () => {
    it('should validate individual source', () => {
      const source = createSource({
        filePath: 'doc1.md',
        excerpt: 'Test content',
        relevanceScore: 0.9,
      });

      const result = validateSource(source, tempDir);
      expect(result.valid).toBe(true);
    });

    it('should fail for nonexistent source', () => {
      const source = createSource({
        filePath: 'missing.md',
        excerpt: 'Test content',
        relevanceScore: 0.9,
      });

      const result = validateSource(source, tempDir);
      expect(result.valid).toBe(false);
    });
  });
});
