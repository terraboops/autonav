# @platform-ai/communication-layer

Protocol definitions, schemas, and validation for Platform AI navigators.

## Overview

The Communication Layer defines the contract between navigators and the SDK Adapter. It provides:

- **Schemas**: TypeScript types and Zod validators for all protocol messages
- **Prompts**: Reusable prompt templates for navigator interactions
- **Validation**: Utilities to detect hallucinations and verify source citations

This package contains NO execution logic - it only defines what messages look like and how to validate them.

## Installation

```bash
npm install @platform-ai/communication-layer
```

## Core Concepts

### Protocol Version

Current version: `1.0.0`

All responses include a `protocolVersion` field to enable compatibility checking.

### Schemas

#### NavigatorResponse

The standard response format for all navigator queries:

```typescript
import { NavigatorResponse, createNavigatorResponse } from "@platform-ai/communication-layer";

const response: NavigatorResponse = {
  protocolVersion: "1.0.0",
  query: "How do I deploy to production?",
  answer: "To deploy to production, follow the steps in deployment/production.md...",
  sources: [
    {
      filePath: "deployment/production.md",
      excerpt: "Run `kubectl apply -f prod.yaml` to deploy",
      section: "Deployment Process"
    }
  ],
  confidence: 0.95,
  timestamp: "2025-11-11T00:00:00Z"
};

// Or use the helper
const response = createNavigatorResponse(
  "How do I deploy to production?",
  "To deploy to production...",
  [{ filePath: "deployment/production.md", excerpt: "..." }],
  { confidence: 0.95 }
);
```

#### Source

Represents a cited source from the knowledge base:

```typescript
import { Source } from "@platform-ai/communication-layer";

const source: Source = {
  filePath: "deployment/ssl-config.md",  // Relative to knowledge-base/
  excerpt: "Set certificate_arn in aws_lb_listener",  // Direct quote
  section: "SSL Configuration",  // Optional section heading
  lineNumber: 42  // Optional line number
};
```

#### NavigatorConfig

Configuration file (`config.json`) for a navigator:

```typescript
import { NavigatorConfig, createNavigatorConfig } from "@platform-ai/communication-layer";

const config = createNavigatorConfig(
  "platform-engineering-navigator",
  "Answers questions about platform engineering practices"
);

// Results in:
// {
//   version: "1.0.0",
//   name: "platform-engineering-navigator",
//   description: "Answers questions about platform engineering practices",
//   communicationLayerVersion: "^1.0.0",
//   sdkAdapterVersion: "^1.0.0",
//   knowledgeBasePath: "knowledge-base",
//   instructionsPath: "CLAUDE.md",
//   createdAt: "2025-11-11T00:00:00Z",
//   updatedAt: "2025-11-11T00:00:00Z"
// }
```

### Prompts

Pre-built prompt templates for common navigator tasks:

```typescript
import {
  createAnswerQuestionPrompt,
  createNavigatorSystemPrompt,
  GROUNDING_RULES
} from "@platform-ai/communication-layer";

// Generate a prompt for answering a question
const prompt = createAnswerQuestionPrompt("How do I configure SSL?");

// Generate a system prompt for CLAUDE.md
const systemPrompt = createNavigatorSystemPrompt(
  "Platform Navigator",
  "Answers platform engineering questions",
  "knowledge-base"
);

// Access core grounding rules
console.log(GROUNDING_RULES);
```

### Validation

Detect hallucinations and verify source citations:

```typescript
import {
  validateNavigatorResponse,
  formatValidationResult
} from "@platform-ai/communication-layer";

const response = {
  query: "How do I deploy?",
  answer: "Use kubectl apply...",
  sources: [
    { filePath: "deployment/guide.md", excerpt: "..." }
  ],
  protocolVersion: "1.0.0"
};

// Validate the response
const result = validateNavigatorResponse(
  response,
  "/path/to/knowledge-base"
);

if (!result.valid) {
  console.error(formatValidationResult(result));
  // Output:
  // ❌ Validation failed
  //
  // Errors:
  //   - [missing_source] Source file does not exist: deployment/guide.md
}
```

#### Hallucination Detection

The validator checks for common hallucination patterns:

1. **No sources**: Confident answer without citations
2. **Made-up ARNs**: AWS resource names that seem invented
3. **Uncited file paths**: File paths mentioned but not in sources
4. **Vague answers**: Many hedging words with few sources
5. **Low confidence**: Confidence score below 0.5

## API Reference

### Schemas

- `SourceSchema` - Zod schema for source citations
- `NavigatorResponseSchema` - Zod schema for responses
- `NavigatorConfigSchema` - Zod schema for config.json
- `createNavigatorResponse()` - Helper to create responses
- `createNavigatorConfig()` - Helper to create configs

### Prompts

- `GROUNDING_RULES` - Core rules all navigators must follow
- `createAnswerQuestionPrompt(question)` - Generate query prompt
- `createConfidencePrompt(answer, sources)` - Score confidence
- `createExtractSourcesPrompt(text)` - Extract citations
- `createNavigatorSystemPrompt(name, description, path)` - Generate system prompt

### Validation

- `checkSourcesExist(response, knowledgeBasePath)` - Verify file paths exist
- `detectHallucinations(response)` - Check for hallucination patterns
- `validateNavigatorResponse(response, knowledgeBasePath)` - Run all validations
- `formatValidationResult(result)` - Format result as human-readable text

## Versioning

This package follows semantic versioning. Breaking changes will trigger a major version bump.

See [VERSIONING_STRATEGY.md](../../docs/VERSIONING_STRATEGY.md) for details on protocol evolution and migration tools.

## Design Principles

1. **No execution**: This package defines contracts, doesn't execute them
2. **Grounding first**: Everything is designed to prevent hallucinations
3. **Version all the things**: Enable graceful protocol evolution
4. **TypeScript + Zod**: Type safety at compile time and runtime

## Usage with SDK Adapter

The Communication Layer is typically consumed by the SDK Adapter:

```typescript
import { Agent } from "@anthropic-ai/sdk";
import {
  createAnswerQuestionPrompt,
  NavigatorResponseSchema,
  validateNavigatorResponse
} from "@platform-ai/communication-layer";

// 1. Create prompt
const prompt = createAnswerQuestionPrompt("How do I deploy?");

// 2. Execute with Claude Agent SDK
const agent = new Agent({ apiKey: process.env.ANTHROPIC_API_KEY });
const rawResponse = await agent.query(prompt);

// 3. Parse and validate
const response = NavigatorResponseSchema.parse(JSON.parse(rawResponse));
const validation = validateNavigatorResponse(response, "./knowledge-base");

if (!validation.valid) {
  throw new Error("Validation failed: " + formatValidationResult(validation));
}
```

## Contributing

This is a core protocol package. Changes should be discussed in issues before implementation.

## License

TBD
