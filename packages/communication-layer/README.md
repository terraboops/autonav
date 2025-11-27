# @autonav/communication-layer

Protocol schemas and validation for navigator responses.

## Install

```bash
npm install @autonav/communication-layer
```

## What's in here

- **Schemas** - Zod schemas for responses, configs, queries
- **Validation** - Source checking, hallucination detection
- **Errors** - Typed errors for common failure cases

This is protocol-only. No execution logic. For that, see `@autonav/core`.

## Usage

```typescript
import {
  NavigatorResponseSchema,
  validateResponse,
  createAnswerQuestionPrompt,
} from "@autonav/communication-layer";

// Validate a response
const result = validateResponse(response, knowledgeBasePath);
if (!result.valid) {
  console.error(result.errors);
}

// Parse a response
const parsed = NavigatorResponseSchema.parse(json);
```

## Key schemas

**NavigatorResponse** - What the navigator returns:
```typescript
{
  query: string;
  answer: string;
  sources: Source[];
  confidence: "high" | "medium" | "low";
  outOfDomain: boolean;
}
```

**NavigatorConfig** - Navigator settings (config.json):
```typescript
{
  version: string;
  name: string;
  knowledgeBase: string;
  confidenceThreshold?: number;
}
```

## Validation

`validateResponse()` checks:
- All cited source files exist
- No hallucination patterns (fake ARNs, placeholder paths)
- Confidence is reasonable

Returns `{ valid: boolean, errors: [], warnings: [] }`.
