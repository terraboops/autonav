# Structured Outputs Exploration

## Overview

Structured Outputs is a feature in Claude's API (released November 14, 2024, public beta) that ensures API responses always match specified JSON schemas or tool definitions through constrained decoding.

## What Structured Outputs Provides

### Automatic Guarantees
1. **Schema Compliance**: Responses are guaranteed to match the provided JSON schema
2. **Type Safety**: Field types (string, number, boolean, enum, etc.) are enforced automatically
3. **Required Fields**: Required fields are guaranteed to be present
4. **Enum Validation**: Enum values are constrained to the specified options
5. **No Parsing Errors**: Eliminates JSON parsing failures and schema mismatches

### How It Works
- **Constrained Decoding**: Uses constrained sampling during generation to ensure valid JSON
- **Beta Header**: Requires `structured-outputs-2025-11-13` beta header
- **Supported Models**: Claude Sonnet 4.5 and Opus 4.1 (Haiku 4.5 coming soon)

### Two Modes

#### 1. JSON Outputs Mode
- Uses `output_format` parameter for data extraction tasks
- Response lands in `response.content[0].text` as guaranteed-valid JSON
- Ideal for: parsing emails, generating reports, structuring unstructured data

#### 2. Strict Tool Use Mode
- Adds `strict: true` to tool definitions
- Ensures function call parameters exactly match input schema
- Ideal for: API integrations, multi-step workflows, agent systems

## What Structured Outputs Does NOT Handle

While Structured Outputs ensures syntactic correctness, it does **NOT** validate semantic correctness:

### 1. File Path Existence
**Not validated**: Whether cited file paths actually exist in the knowledge base
**We must validate**: Check that `source.file` refers to a real file

### 2. Content Accuracy
**Not validated**: Whether the content is truthful or grounded in sources
**We must validate**: Hallucination detection, excerpt verification

### 3. Cross-Field Logic
**Not validated**: Relationships between fields (e.g., low confidence should have fewer sources)
**We must validate**: Confidence level justification, source-answer alignment

### 4. Business Rules
**Not validated**: Domain-specific constraints (e.g., confidence reason must be >10 chars)
**We must validate**: Application-specific validation rules

### 5. External References
**Not validated**: ARNs, URLs, resource names mentioned in answers
**We must validate**: Pattern detection for potentially hallucinated resources

## Integration with Zod

Structured Outputs works well with Zod schemas:

```typescript
import { z } from 'zod';

// Define schema with Zod
const NavigatorResponseSchema = z.object({
  answer: z.string().describe('Direct answer to the question'),
  sources: z.array(SourceCitationSchema),
  confidence: z.enum(['high', 'medium', 'low']),
  confidenceReason: z.string(),
  outOfDomain: z.boolean(),
});

// Use .describe() to add field descriptions for Claude
// Structured Outputs ensures the JSON matches this shape
// But we still need to validate file existence, hallucinations, etc.
```

## Validation Strategy for Platform AI

### Layer 1: Structured Outputs (Automatic)
- ✅ JSON structure
- ✅ Required fields present
- ✅ Types correct (string, number, boolean)
- ✅ Enums within allowed values
- ✅ Array constraints

### Layer 2: Semantic Validation (We Implement)
- ⚠️ File path existence (`checkSourcesExist`)
- ⚠️ Hallucination detection (`detectHallucinations`)
- ⚠️ Confidence justification
- ⚠️ Source-answer alignment
- ⚠️ Domain boundary detection

### Layer 3: Human Review (Triggered by Layer 2)
- 🚨 Low confidence responses
- 🚨 Hallucination warnings
- 🚨 Out-of-domain queries
- 🚨 Missing or weak sources

## Performance Implications

### Benefits
- **Faster**: No retry loops for malformed JSON
- **Cheaper**: Eliminates wasted tokens on parsing failures
- **Reliable**: Guaranteed schema compliance

### Considerations
- **Model Availability**: Only Sonnet 4.5 and Opus 4.1 currently
- **Beta Feature**: API may change before general availability
- **Constrained Generation**: Slightly slower than unconstrained generation

## Recommendations for Platform AI

### 1. Use Structured Outputs for Response Schema
```typescript
// Navigator responses should use Structured Outputs
// This eliminates schema parsing errors
const response = await agent.query(question, {
  output_format: NavigatorResponseSchema,
});
```

### 2. Keep Validation Layer
```typescript
// Structured Outputs ensures schema compliance
// But we MUST still validate semantic correctness
const parsed = NavigatorResponseSchema.parse(response);
const validation = validateNavigatorResponse(parsed, knowledgeBasePath);

if (!validation.valid) {
  throw new HallucinationError(validation.errors);
}
```

### 3. Design Schemas for Claude
```typescript
// Use .describe() to guide Claude's generation
const SourceCitationSchema = z.object({
  file: z.string().describe('Filename from knowledge base'),
  section: z.string().describe('Specific section or heading'),
  relevance: z.string().describe('Why this source is relevant'),
});
```

### 4. Handle Graceful Degradation
```typescript
// Plan for when Structured Outputs unavailable
try {
  // Try with Structured Outputs
  return await queryWithStructuredOutputs(question);
} catch (error) {
  // Fallback to manual JSON parsing
  return await queryWithManualParsing(question);
}
```

## Conclusion

**Structured Outputs eliminates**: JSON parsing errors, schema validation errors, type mismatches

**We still need to validate**: File existence, hallucinations, confidence justification, domain boundaries

**Strategy**: Use Structured Outputs for guaranteed schema compliance + implement semantic validation layer for correctness

---

**Reference**: Claude API Structured Outputs (Beta), November 2024
- Blog: https://www.claude.com/blog/structured-outputs-on-the-claude-developer-platform
- Docs: https://docs.claude.com/en/docs/build-with-claude/structured-outputs
