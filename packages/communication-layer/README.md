# @platform-ai/communication-layer

> Communication protocol and schemas for Platform AI multi-agent system

## Overview

The Communication Layer defines **HOW** agents in the Platform AI system communicate with each other, with operators, and with users. It provides:

- **Type-safe schemas** for all messages using Zod
- **Actor types** (User, Operator, Agent) with capability checks
- **Validation utilities** to prevent hallucinations and ensure quality
- **Context metrics** for operator insights and optimization
- **Error types** for standardized error handling

This is a protocol-only package - it contains no execution logic. For execution, see `@platform-ai/claude-sdk-adapter`.

## Installation

```bash
npm install @platform-ai/communication-layer
```

## Core Concepts

### Actor Types

Three types of actors can interact with the system:

```typescript
import { ActorCapabilities } from '@platform-ai/communication-layer';

// User: Can query navigators
const user = {
  type: 'user',
  id: 'user-123',
  name: 'Alice',
};

// Operator: Can query + configure + curate knowledge
const operator = {
  type: 'operator',
  id: 'op-456',
  name: 'Bob',
  permissions: ['query', 'configure', 'curate'],
};

// Agent: Can communicate with other agents
const agent = {
  type: 'agent',
  id: 'agent-789',
  navigatorName: 'terraform-navigator',
  domain: 'terraform',
};

// Check capabilities
ActorCapabilities.canQuery(user);      // true
ActorCapabilities.canConfigure(user);  // false
ActorCapabilities.canCurate(operator); // true
```

### Navigator Response

Standard response format with required source citations:

```typescript
import { createNavigatorResponse } from '@platform-ai/communication-layer';

const response = createNavigatorResponse({
  answer: 'To deploy, run `terraform apply` in the root directory.',
  sources: [
    {
      filePath: 'docs/deployment.md',
      lineNumbers: [15, 20],
      excerpt: 'Run terraform apply to deploy infrastructure',
      relevanceScore: 0.95,
    },
  ],
  confidence: 0.9,
  contextSize: 2500,
  metadata: {
    navigatorName: 'terraform-navigator',
    domain: 'terraform',
    responseTimeMs: 450,
  },
});
```

### Navigator Configuration

Define navigator settings and capabilities:

```typescript
import { createNavigatorConfig } from '@platform-ai/communication-layer';

const config = createNavigatorConfig({
  name: 'terraform-navigator',
  domain: 'terraform',
  description: 'Answers questions about Terraform infrastructure',
  knowledgeBasePath: './knowledge',
  confidenceThreshold: 0.7,
  maxContextSize: 100000,
  relatedDomains: ['aws', 'infrastructure'],
});
```

### Validation

Prevent hallucinations and ensure response quality:

```typescript
import { validateResponse } from '@platform-ai/communication-layer';

const result = validateResponse(response, config);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
  // Handle errors: SourceNotFoundError, HallucinationError, etc.
}

if (result.warnings.length > 0) {
  console.warn('Validation warnings:', result.warnings);
  // Log warnings for operator review
}
```

## API Reference

### Schemas

#### NavigatorResponse

Standard response format for all navigator queries.

```typescript
interface NavigatorResponse {
  protocolVersion: string;
  answer: string;
  sources: Source[];           // At least one required
  confidence: number;          // 0-1
  contextSize: number;         // tokens or characters
  metadata?: {
    responseTimeMs?: number;
    navigatorName?: string;
    domain?: string;
    filesSearched?: number;
    queryCategory?: QueryCategory;
  };
}
```

#### Source

Source citation with optional line numbers:

```typescript
interface Source {
  filePath: string;
  lineNumbers?: [number, number];  // [start, end]
  excerpt: string;
  relevanceScore: number;          // 0-1
}
```

#### NavigatorConfig

Navigator metadata and settings:

```typescript
interface NavigatorConfig {
  communicationLayerVersion: string;
  name: string;
  domain: string;
  description?: string;
  knowledgeBasePath: string;
  confidenceThreshold: number;     // default: 0.7
  maxContextSize?: number;
  relatedDomains?: string[];
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}
```

#### Query Types

```typescript
// User queries
interface UserQuery {
  protocolVersion: string;
  actor: Actor;
  question: string;
  category?: QueryCategory;
  context?: string;
  metadata?: {
    sessionId?: string;
    timestamp?: string;
    source?: string;
  };
}

// Inter-navigator queries (future)
interface NavigatorQuery {
  protocolVersion: string;
  fromNavigator: string;
  toNavigator: string;
  question: string;
  context?: string;
  reason?: 'out_of_domain' | 'needs_specialist' | 'requires_cross_domain_knowledge';
}
```

### Validation Functions

#### `validateResponse(response, config, knowledgeBasePath?)`

Run all validations on a response:
- Check sources exist
- Detect hallucinations
- Validate confidence
- Check context size

Returns `ValidationResult` with errors and warnings.

#### `checkSourcesExist(response, knowledgeBasePath)`

Verify all cited files actually exist in the knowledge base.

#### `detectHallucinations(response)`

Check for common hallucination patterns:
- Made-up AWS ARNs
- Generic placeholder paths
- Suspicious command patterns
- Missing source citations

#### `validateConfidence(response, config)`

Ensure confidence score is justified and above threshold.

#### `validateContextSize(response, config)`

Check context size is within configured limits.

### Error Types

All errors extend `PlatformAIError` with a `code` field:

```typescript
// Source file doesn't exist
throw new SourceNotFoundError('/path/to/file.md');

// Confidence below threshold
throw new LowConfidenceError(0.5, 0.7);

// Question outside navigator's domain
throw new OutOfDomainError('kubernetes question', 'terraform');

// Context too large
throw new ContextOverflowError(150000, 100000);

// Hallucination detected
throw new HallucinationError('Made-up AWS ARN detected', ['arn:aws:...']);

// Protocol version mismatch
throw new VersionMismatchError('0.1.0', '0.2.0');
```

### Context Metrics

Track usage patterns and performance:

```typescript
import { createContextMetrics } from '@platform-ai/communication-layer';

const metrics = createContextMetrics({
  navigatorName: 'terraform-navigator',
  period: {
    start: '2024-01-01T00:00:00Z',
    end: '2024-01-07T23:59:59Z',
  },
  totalQueries: 150,
  averageContextSize: 3500,
  averageConfidence: 0.85,
});

// Extended metrics
metrics.topSources = [
  {
    filePath: 'docs/deployment.md',
    usageCount: 45,
    averageRelevanceScore: 0.92,
  },
];

metrics.categoryBreakdown = {
  informational: 60,
  troubleshooting: 50,
  configuration: 30,
  architectural: 10,
};
```

## Usage Examples

### Creating a Query

```typescript
import { createUserQuery } from '@platform-ai/communication-layer';

const query = createUserQuery({
  actor: {
    type: 'user',
    id: 'user-123',
    name: 'Alice',
  },
  question: 'How do I deploy my Terraform infrastructure?',
  category: 'configuration',
  context: 'Working on AWS infrastructure in us-east-1',
  metadata: {
    sessionId: 'sess-456',
    source: 'slack',
  },
});
```

### Validating a Response

```typescript
import {
  createNavigatorResponse,
  validateResponse,
  NavigatorConfig,
} from '@platform-ai/communication-layer';

const config: NavigatorConfig = {
  name: 'my-navigator',
  domain: 'terraform',
  knowledgeBasePath: './knowledge',
  confidenceThreshold: 0.7,
};

const response = createNavigatorResponse({
  answer: 'Run terraform apply',
  sources: [{
    filePath: 'docs/deploy.md',
    excerpt: 'terraform apply deploys infrastructure',
    relevanceScore: 0.9,
  }],
  confidence: 0.85,
  contextSize: 2000,
});

const result = validateResponse(response, config);

if (!result.valid) {
  for (const error of result.errors) {
    if (error instanceof SourceNotFoundError) {
      console.error('Missing file:', error.message);
    } else if (error instanceof HallucinationError) {
      console.error('Hallucination detected:', error.detectedPatterns);
    }
  }
}
```

### Inter-Navigator Communication

```typescript
import { createNavigatorQuery } from '@platform-ai/communication-layer';

// One navigator asking another for help
const query = createNavigatorQuery({
  fromNavigator: 'terraform-navigator',
  toNavigator: 'aws-navigator',
  question: 'What IAM permissions does this Lambda need?',
  context: 'Terraform config shows Lambda accessing S3 and DynamoDB',
  reason: 'needs_specialist',
});
```

## Design Principles

### 1. Hallucination Prevention

All responses **must** cite sources. Validation utilities check:
- Cited files actually exist
- No placeholder or made-up content
- Confidence scores are justified

### 2. Versioning

Everything is versioned from day 1:
- `COMMUNICATION_LAYER_VERSION` for the package
- `PROTOCOL_VERSION` for message format
- Configs declare their `communicationLayerVersion`

### 3. Clean Separation

This package defines **protocol**, not **execution**:
- ✅ Schemas and types
- ✅ Validation rules
- ✅ Error definitions
- ❌ Claude SDK integration (see `@platform-ai/claude-sdk-adapter`)
- ❌ CLI tools (see `@platform-ai/navigator-framework`)

### 4. Operator-Centric

Context metrics provide insights for platform engineers:
- Which sources get used most
- Correlation between context size and quality
- Performance tracking
- Error patterns

## Testing

The package includes comprehensive tests:

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
```

Test coverage includes:
- Schema validation
- Error handling
- Hallucination detection
- Source validation
- Confidence checks

## Versioning Strategy

See [VERSIONING_STRATEGY.md](../../docs/VERSIONING_STRATEGY.md) for full details.

**TL;DR**: We use semantic versioning. Major version bumps for breaking schema changes, minor for new features, patch for bug fixes.

## Contributing

This package is part of the Platform AI monorepo. See the main [README](../../README.md) for development setup.

Key files:
- `src/schemas/` - Zod schemas for all message types
- `src/validation/` - Validation utilities
- `src/errors/` - Error type definitions
- `src/types/` - TypeScript types and interfaces

## License

TBD

## Related Packages

- `@platform-ai/claude-sdk-adapter` - Execution engine using Claude Agent SDK
- `@platform-ai/navigator-framework` - CLI tools for building navigators

## Support

For issues and questions, see the main Platform AI repository.
