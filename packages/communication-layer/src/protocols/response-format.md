# Navigator Response Format Protocol

## Overview

This document defines the canonical response format for all navigator queries. All navigators must respond using this structured format to ensure consistency, enable validation, and prevent hallucinations.

## Design Principles

1. **Grounding**: Every response must be grounded in knowledge base sources
2. **Transparency**: Responses must explain their confidence levels
3. **Structured**: JSON schema enforced via Claude's Structured Outputs
4. **Validated**: Responses are validated for hallucination patterns
5. **Actionable**: Responses should help users find information or take next steps

## Response Schema

### Complete Schema

```typescript
{
  answer: string;                    // Direct answer to the question
  sources: Array<{                   // Sources cited in answer
    file: string;                    // Filename from knowledge base
    section: string;                 // Specific section or heading
    relevance: string;               // Why this source is relevant
  }>;
  confidence: 'high' | 'medium' | 'low';  // Confidence level
  confidenceReason: string;          // Why this confidence level
  relatedTopics?: string[];          // Related topics user might ask about
  outOfDomain: boolean;              // Is question outside navigator domain
}
```

### Field Specifications

#### answer (required)

The direct answer to the user's question, grounded in sources.

**Rules**:
- Must cite sources inline when possible (e.g., "According to deployment.md...")
- Should be clear, concise, and actionable
- Must not invent information not in sources
- Can acknowledge lack of information: "I don't have information about..."

**Examples**:

✅ **Good**:
```
"To configure SSL, set the certificate_arn parameter in the aws_lb_listener resource (deployment/ssl-config.md, SSL Configuration section)."
```

❌ **Bad**:
```
"You can configure SSL by updating the config file."
```
*Problem*: Vague, no specific file or parameter mentioned.

#### sources (required)

Array of source citations that support the answer.

**Rules**:
- Empty array allowed only when explicitly stating lack of information OR when out of domain
- Each source must include file, section, and relevance
- File paths must be relative to knowledge base root
- Section should be a specific heading or subsection name
- Relevance should explain why this source answers the question

**Example**:
```json
{
  "file": "troubleshooting/pod-errors.md",
  "section": "CrashLoopBackOff Debugging",
  "relevance": "Provides step-by-step diagnosis procedure for CrashLoopBackOff errors"
}
```

#### confidence (required)

Enum: `high`, `medium`, or `low`

**Levels**:

**High** (`high`):
- Direct answer found in sources
- Clear and unambiguous
- Multiple confirming sources OR one authoritative source
- No conflicting information

**Medium** (`medium`):
- Answer requires synthesizing multiple sources
- Some interpretation needed
- Sources mostly agree but with minor gaps
- Answer is probable but not certain

**Low** (`low`):
- Sources are partially relevant but incomplete
- Answer requires significant inference
- Sources conflict with each other
- Uncertainty about accuracy

#### confidenceReason (required)

Explanation of why the chosen confidence level is appropriate.

**Rules**:
- Minimum 10 characters (enforced by schema)
- Should explain the quality and quantity of sources
- Should mention any limitations or uncertainties
- Should be honest about gaps in knowledge

**Examples**:

✅ **Good**:
```
"High confidence: deployment.md provides explicit step-by-step instructions with exact command syntax in the SSL Configuration section."
```

✅ **Good**:
```
"Medium confidence: multiple files mention this feature but with slightly different implementation details. Synthesized the common approach."
```

✅ **Good**:
```
"Low confidence: found only indirect references in monitoring docs. The specific parameter isn't explicitly documented."
```

❌ **Bad**:
```
"Seems right"
```
*Problem*: Too vague, doesn't explain reasoning.

#### relatedTopics (optional)

Array of related topics the user might want to explore.

**Purpose**:
- Help users discover related information
- Guide follow-up questions
- Improve navigation of knowledge base

**Example**:
```json
"relatedTopics": [
  "certificate renewal",
  "load balancer configuration",
  "TLS version settings"
]
```

#### outOfDomain (required)

Boolean indicating if the question is outside the navigator's configured domain.

**When to set true**:
- Question clearly falls outside knowledge base scope
- No relevant files exist for the topic
- Question requires expertise the navigator wasn't designed for

**When to set false**:
- Question is within domain but answer isn't found (use low confidence instead)
- Partial information is available
- Related information exists

**Out-of-domain response example**:
```json
{
  "answer": "This question is about database indexing, which is outside my domain. I specialize in Kubernetes operations. You might want to consult the database team or a database-specific navigator.",
  "sources": [],
  "confidence": "high",
  "confidenceReason": "Question clearly outside configured domain",
  "relatedTopics": ["database team contact"],
  "outOfDomain": true
}
```

## Response Patterns

### Pattern 1: High Confidence Answer

```json
{
  "answer": "To rollback a deployment, use 'kubectl rollout undo deployment/<name>' as documented in troubleshooting/rollback-procedures.md. This will revert to the previous revision.",
  "sources": [
    {
      "file": "troubleshooting/rollback-procedures.md",
      "section": "Quick Rollback",
      "relevance": "Contains the exact kubectl command and rollback process"
    },
    {
      "file": "reference/kubectl-commands.md",
      "section": "Deployment Management",
      "relevance": "Provides additional context on rollout commands"
    }
  ],
  "confidence": "high",
  "confidenceReason": "Direct answer found with exact command syntax in two authoritative sources",
  "relatedTopics": ["deployment history", "rollout status", "revision management"],
  "outOfDomain": false
}
```

### Pattern 2: Medium Confidence (Synthesis Required)

```json
{
  "answer": "To optimize pod startup time, you can use init containers (mentioned in deployment/init-containers.md) and configure readiness probes appropriately (reference/pod-lifecycle.md). However, the specific optimization strategy depends on your application architecture.",
  "sources": [
    {
      "file": "deployment/init-containers.md",
      "section": "Performance Considerations",
      "relevance": "Discusses init container impact on startup time"
    },
    {
      "file": "reference/pod-lifecycle.md",
      "section": "Readiness Probes",
      "relevance": "Explains probe configuration affecting startup"
    }
  ],
  "confidence": "medium",
  "confidenceReason": "Multiple relevant sources but no single comprehensive guide. Answer synthesized from different sections.",
  "relatedTopics": ["application startup optimization", "container image optimization", "probe tuning"],
  "outOfDomain": false
}
```

### Pattern 3: Low Confidence (Incomplete Information)

```json
{
  "answer": "I found references to rate limiting in the API documentation (reference/api-spec.md) but no specific configuration examples. Rate limiting might be configured at the ingress level, but I don't have detailed documentation on this.",
  "sources": [
    {
      "file": "reference/api-spec.md",
      "section": "Rate Limiting",
      "relevance": "Mentions that rate limiting exists but lacks configuration details"
    }
  ],
  "confidence": "low",
  "confidenceReason": "Only found indirect references without configuration details or examples",
  "relatedTopics": ["ingress configuration", "API gateway settings"],
  "outOfDomain": false
}
```

### Pattern 4: No Information Available

```json
{
  "answer": "I don't have information about database migration procedures in my knowledge base. My documentation focuses on Kubernetes operations and deployments.",
  "sources": [],
  "confidence": "high",
  "confidenceReason": "Thoroughly searched knowledge base with no relevant results. High confidence in the absence of information.",
  "relatedTopics": [],
  "outOfDomain": false
}
```

### Pattern 5: Out of Domain

```json
{
  "answer": "This question is about AWS IAM policies, which is outside my domain. I specialize in Kubernetes operations. You might want to consult the AWS navigator or the security team for IAM-related questions.",
  "sources": [],
  "confidence": "high",
  "confidenceReason": "Question clearly outside my configured knowledge domain (Kubernetes ops)",
  "relatedTopics": ["AWS navigator", "security team contact"],
  "outOfDomain": true
}
```

## Validation Rules

All responses are validated against:

1. **Source existence**: All cited files must exist in knowledge base
2. **Hallucination patterns**: Response checked for made-up file paths, ARNs, commands
3. **Confidence justification**: confidenceReason must be meaningful (>10 chars)
4. **Source-answer alignment**: Sources should actually support the answer
5. **Out-of-domain logic**: outOfDomain=true should have empty sources (usually)

## Integration with Structured Outputs

This format is designed for use with Claude's Structured Outputs feature:

```typescript
import { z } from 'zod';

const NavigatorResponseSchema = z.object({
  answer: z.string().describe('Direct answer to the question'),
  sources: z.array(SourceSchema).describe('Sources cited in answer'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence level'),
  confidenceReason: z.string().min(10).describe('Why this confidence level'),
  relatedTopics: z.array(z.string()).optional().describe('Related topics'),
  outOfDomain: z.boolean().describe('Is question outside domain'),
});
```

**Benefits**:
- Guaranteed JSON structure
- Automatic enum validation
- Type safety
- No parsing errors

## Best Practices

### For Navigator Implementers

1. **Be honest**: Low confidence with explanation is better than false confidence
2. **Cite specifically**: Reference exact sections, not entire files
3. **Explain relevance**: Help users understand why each source matters
4. **Suggest next steps**: Use relatedTopics to guide exploration
5. **Know your limits**: Use outOfDomain when appropriate

### For Navigator Consumers

1. **Check confidence**: Low confidence responses may need human review
2. **Validate sources**: Verify cited files actually exist
3. **Review out-of-domain**: Route to appropriate navigator
4. **Use related topics**: Explore suggested topics for deeper understanding

## Future Extensions

Potential future additions to the response format:

- **Search strategy metadata**: Which search terms were used
- **Alternative answers**: When multiple valid approaches exist
- **Confidence score components**: Breakdown of what affects confidence
- **Source excerpts**: Include exact quotes from sources
- **Response quality metrics**: Self-assessment of answer quality

---

**Version**: 1.0.0
**Last Updated**: 2024-01-15
**Status**: Stable
