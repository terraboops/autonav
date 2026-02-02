import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  checkSourcesExist,
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
      knowledgeBasePath: tempDir,
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
            file: 'doc1.md',
            section: 'Test Section',
            relevance: 'Contains the answer to the question',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Direct answer found in documentation',
        outOfDomain: false,
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
            file: 'nonexistent.md',
            section: 'Test Section',
            relevance: 'Contains the answer',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Found in documentation',
        outOfDomain: false,
      });

      const result = checkSourcesExist(response, tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('nonexistent.md');
    });
  });

  describe.skip('detectHallucinations - DEPRECATED (removed in minimal validation refactor)', () => {
    it('should pass for clean response', () => {
      const response = createNavigatorResponse({
        answer: 'The configuration is in doc1.md',
        sources: [
          createSource({
            file: 'doc1.md',
            section: 'Configuration Section',
            relevance: 'Configuration details are documented here',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Direct answer found in source',
        outOfDomain: false,
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
            file: 'doc1.md',
            section: 'Some Section',
            relevance: 'Some content is here',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Found in documentation',
        outOfDomain: false,
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
            file: 'doc1.md',
            section: 'Test Section',
            relevance: 'Lorem ipsum placeholder text',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Found in documentation',
        outOfDomain: false,
      });

      const result = detectHallucinations(response);
      expect(result.valid).toBe(false);
    });

    it('should fail when no sources provided and not out of domain', () => {
      const response: NavigatorResponse = {
        protocolVersion: '0.1.0',
        answer: 'Some specific answer about the system',
        sources: [],
        confidence: 'high',
        confidenceReason: 'Based on general knowledge',
        outOfDomain: false,
      };

      const result = detectHallucinations(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('no source citations');
    });

    it('should pass when no sources but answer is uncertain', () => {
      const response: NavigatorResponse = {
        protocolVersion: '0.1.0',
        answer: "I don't have information about that",
        sources: [],
        confidence: 'low',
        confidenceReason: 'No relevant information found',
        outOfDomain: false,
      };

      const result = detectHallucinations(response);
      expect(result.valid).toBe(true);
    });

    it('should warn about short relevance explanations', () => {
      const response = createNavigatorResponse({
        answer: 'Test',
        sources: [
          createSource({
            file: 'doc1.md',
            section: 'Test Section',
            relevance: 'Short', // Too short
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Found in documentation',
        outOfDomain: false,
      });

      const result = detectHallucinations(response);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('short relevance explanation');
    });

    it('should warn about high confidence with uncertain answer', () => {
      const response = createNavigatorResponse({
        answer: "I don't know the answer to that question",
        sources: [],
        confidence: 'high',
        confidenceReason: 'Certain about lack of information',
        outOfDomain: true,
      });

      const result = detectHallucinations(response);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('High confidence level with uncertain answer');
    });
  });

  describe.skip('validateConfidence - DEPRECATED (removed in minimal validation refactor)', () => {
    it('should pass when confidence is justified', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            file: 'doc1.md',
            section: 'Test Section',
            relevance: 'Contains detailed information about the topic',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Direct answer found in authoritative documentation',
        outOfDomain: false,
      });

      const result = validateConfidence(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about short confidence reason', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            file: 'doc1.md',
            section: 'Test Section',
            relevance: 'Contains information',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Found info', // Exactly 10 chars (minimum)
        outOfDomain: false,
      });

      const result = validateConfidence(response);
      // This test verifies the validation passes even for minimal confidence reasons
      // The schema enforces minimum 10 chars, so shorter reasons will be rejected at parse time
      expect(result.valid).toBe(true);
    });

    it('should warn when high confidence without sources', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [],
        confidence: 'high',
        confidenceReason: 'Based on general knowledge',
        outOfDomain: true,
      });

      const result = validateConfidence(response);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('no sources cited'))).toBe(true);
    });

    it('should warn when low confidence with multiple sources', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            file: 'doc1.md',
            section: 'Section 1',
            relevance: 'Contains relevant information',
          }),
          createSource({
            file: 'doc2.md',
            section: 'Section 2',
            relevance: 'More relevant content',
          }),
          createSource({
            file: 'doc1.md',
            section: 'Section 3',
            relevance: 'Additional information',
          }),
        ],
        confidence: 'low',
        confidenceReason: 'Information is scattered and unclear',
        outOfDomain: false,
      });

      const result = validateConfidence(response);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('underestimated'))).toBe(true);
    });

    it('should warn on low confidence responses', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer',
        sources: [
          createSource({
            file: 'doc1.md',
            section: 'Test Section',
            relevance: 'Partially relevant',
          }),
        ],
        confidence: 'low',
        confidenceReason: 'Information is incomplete',
        outOfDomain: false,
      });

      const result = validateConfidence(response);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Low confidence response'))).toBe(true);
    });
  });

  describe.skip('validateContextSize - DEPRECATED (removed in minimal validation refactor)', () => {
    it('should return deprecation warning', () => {
      const result = validateContextSize();
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('deprecated');
    });
  });

  describe('validateResponse', () => {
    it('should run all validations', () => {
      const response = createNavigatorResponse({
        answer: 'Test answer from documentation',
        sources: [
          createSource({
            file: 'doc1.md',
            section: 'Relevant Section',
            relevance: 'Relevant excerpt from the docs explaining the topic',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Direct answer found in authoritative documentation',
        outOfDomain: false,
      });

      const result = validateResponse(response, tempDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should aggregate errors from all validations', () => {
      const response = createNavigatorResponse({
        answer: 'Check /path/to/your-file.md',
        sources: [
          createSource({
            file: 'nonexistent.md',
            section: 'Some Section',
            relevance: 'Some content is documented here',
          }),
        ],
        confidence: 'high',
        confidenceReason: 'Found in documentation',
        outOfDomain: false,
      });

      const result = validateResponse(response, tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0); // Multiple errors
    });
  });

  describe('validateSource', () => {
    it('should validate individual source', () => {
      const source = createSource({
        file: 'doc1.md',
        section: 'Test Section',
        relevance: 'Contains relevant test content for validation',
      });

      const result = validateSource(source, tempDir);
      expect(result.valid).toBe(true);
    });

    it('should fail for nonexistent source', () => {
      const source = createSource({
        file: 'missing.md',
        section: 'Test Section',
        relevance: 'Contains test content that should exist',
      });

      const result = validateSource(source, tempDir);
      expect(result.valid).toBe(false);
    });

    it('should not warn about short relevance (minimal validation)', () => {
      const source = createSource({
        file: 'doc1.md',
        section: 'Test Section',
        relevance: 'Short', // Short but acceptable under minimal validation
      });

      const result = validateSource(source, tempDir);
      // Minimal validation only checks file existence, not content quality
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });
  });
});
