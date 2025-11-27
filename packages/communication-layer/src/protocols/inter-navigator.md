# Inter-Navigator Communication Protocol

## Status

🚧 **PLACEHOLDER - Not Implemented in Phase 1**

This document outlines the future protocol for navigator-to-navigator communication. This feature is planned for Phase 3 of the Platform AI roadmap.

## Overview

Inter-navigator communication enables navigators to query each other when questions span multiple domains. For example, a Kubernetes navigator might consult an AWS navigator when a question involves both Kubernetes and AWS-specific resources.

## Vision

```
User asks Kubernetes Navigator:
"How do I configure my pods to use an S3 bucket?"

Kubernetes Navigator determines:
- Pod configuration is in its domain
- S3 bucket permissions are outside its domain

Kubernetes Navigator queries AWS Navigator:
"What IAM permissions are needed for pod access to S3?"

AWS Navigator responds with IAM policy details

Kubernetes Navigator synthesizes:
- Pod ServiceAccount setup (from its knowledge)
- IAM Role/Policy configuration (from AWS Navigator)
- Returns complete answer to user
```

## Planned Message Schema

```typescript
// Phase 3 - Not implemented yet
interface InterNavigatorMessage {
  fromNavigator: string;     // Source navigator name
  toNavigator: string;       // Target navigator name
  query: string;             // Question for target navigator
  context?: Record<string, unknown>; // Optional context
  reason?: 'needs_specialist' | 'cross_domain' | 'verification';
}

interface InterNavigatorResponse {
  fromNavigator: string;     // Navigator that answered
  answer: string;            // Answer to the query
  sources: Source[];         // Sources from target navigator's knowledge
  confidence: ConfidenceLevel;
  canHelp: boolean;          // Whether target navigator can answer
}
```

## Use Cases

### 1. Cross-Domain Questions

User question spans multiple specialized domains.

**Example**:
- **User**: "How do I set up auto-scaling for my database?"
- **Entry Navigator**: Platform Engineering
- **Consulted Navigators**:
  - Kubernetes Navigator (for HPA configuration)
  - Database Navigator (for database-specific scaling considerations)

### 2. Verification

Navigator wants to verify information with a specialist.

**Example**:
- **User**: "Is this Terraform syntax correct for AWS?"
- **Entry Navigator**: Terraform Navigator
- **Consulted Navigator**: AWS Navigator (to verify AWS-specific resources)

### 3. Specialist Referral

Navigator recognizes a question is better suited for another navigator.

**Example**:
- **User**: "How do I debug a Postgres query?"
- **Entry Navigator**: Platform Engineering
- **Referred To**: Database Navigator

## Communication Patterns

### Pattern 1: Sequential Consultation

```
User → Navigator A → Navigator B → Navigator A → User
```

Navigator A asks Navigator B, synthesizes response, returns to user.

### Pattern 2: Parallel Consultation

```
User → Navigator A → [Navigator B, Navigator C, Navigator D] → Navigator A → User
```

Navigator A queries multiple specialists in parallel, synthesizes all responses.

### Pattern 3: Chain Consultation

```
User → Navigator A → Navigator B → Navigator C → Navigator B → Navigator A → User
```

Navigator B needs info from Navigator C to answer Navigator A's query.

## Routing Logic

### When to Consult Another Navigator

```typescript
function shouldConsult(question: string, domain: string): boolean {
  // Detect cross-domain keywords
  const crossDomain = detectCrossDomainTerms(question, domain);

  // Check if question explicitly mentions another domain
  const explicitDomain = detectExplicitDomain(question);

  // Check if initial search yields no results
  const noLocalResults = searchLocalKnowledge(question).length === 0;

  return crossDomain || explicitDomain || (noLocalResults && !outOfDomain);
}
```

### Navigator Discovery

```typescript
interface NavigatorRegistry {
  name: string;
  domain: string;
  relatedDomains: string[];
  capabilities: string[];
}

// Example registry
const navigators: NavigatorRegistry[] = [
  {
    name: 'kubernetes-nav',
    domain: 'kubernetes',
    relatedDomains: ['containers', 'orchestration'],
    capabilities: ['deployment', 'troubleshooting', 'scaling']
  },
  {
    name: 'aws-nav',
    domain: 'aws',
    relatedDomains: ['cloud', 'infrastructure'],
    capabilities: ['iam', 's3', 'ec2', 'rds']
  }
];
```

## Response Synthesis

When combining responses from multiple navigators:

```typescript
interface SynthesizedResponse {
  answer: string;              // Combined answer
  sources: Array<{
    navigator: string;         // Which navigator provided this source
    source: Source;           // The actual source
  }>;
  confidence: ConfidenceLevel; // Overall confidence
  confidenceReason: string;   // Explanation of synthesis
  navigatorsConsulted: string[]; // Which navigators were asked
}
```

## Security Considerations

### Trust Model

- **Same organization**: Navigators within same org can query each other freely
- **Different organizations**: Require explicit trust relationships
- **Public navigators**: Read-only, rate-limited access

### Privacy

- Queries to other navigators should not leak sensitive information
- Consider sanitizing queries before forwarding
- Respect data classification boundaries

### Rate Limiting

- Prevent query loops (A → B → A → B...)
- Limit consultation depth (max 3 navigators deep)
- Timeout for unresponsive navigators

## Configuration

### Per-Navigator Settings

```json
{
  "interNavigatorCommunication": {
    "enabled": true,
    "trustedNavigators": [
      "kubernetes-nav",
      "aws-nav",
      "terraform-nav"
    ],
    "maxConsultationDepth": 2,
    "timeoutMs": 5000,
    "autoConsult": {
      "enabled": true,
      "requireConfirmation": false
    }
  }
}
```

### Global Registry

```json
{
  "navigatorRegistry": [
    {
      "name": "kubernetes-nav",
      "endpoint": "http://localhost:3001",
      "domain": "kubernetes",
      "status": "active"
    },
    {
      "name": "aws-nav",
      "endpoint": "http://localhost:3002",
      "domain": "aws",
      "status": "active"
    }
  ]
}
```

## Implementation Notes

### Phase 3 Roadmap

1. **Basic Querying**: Navigator A can ask Navigator B a question
2. **Response Synthesis**: Navigator A combines its knowledge with Navigator B's response
3. **Navigator Discovery**: Automatic detection of relevant navigators
4. **Parallel Consultation**: Query multiple navigators simultaneously
5. **Smart Routing**: Learn which navigators are most helpful for which questions

### Technical Considerations

- **API Design**: REST, GraphQL, or gRPC for inter-navigator communication?
- **Authentication**: How do navigators authenticate to each other?
- **Schema Compatibility**: How to handle version mismatches?
- **Failure Handling**: What if a consulted navigator is down?
- **Caching**: Should responses from other navigators be cached?

## Example Implementations

### Consultation Request

```typescript
// Navigator A consulting Navigator B
const consultationRequest: InterNavigatorMessage = {
  fromNavigator: 'kubernetes-nav',
  toNavigator: 'aws-nav',
  query: 'What IAM permissions are needed for a pod to access S3?',
  context: {
    serviceAccount: 'my-app-sa',
    namespace: 'production'
  },
  reason: 'needs_specialist'
};
```

### Consultation Response

```typescript
const consultationResponse: InterNavigatorResponse = {
  fromNavigator: 'aws-nav',
  answer: 'For pod access to S3, create an IAM role with s3:GetObject and s3:PutObject permissions, then use IRSA to associate it with the ServiceAccount.',
  sources: [
    {
      file: 'iam/pod-s3-access.md',
      section: 'IAM Roles for Service Accounts',
      relevance: 'Describes the exact permissions and IRSA setup'
    }
  ],
  confidence: 'high',
  canHelp: true
};
```

### Synthesized User Response

```typescript
const userResponse: NavigatorResponse = {
  answer: 'To configure your pods to use an S3 bucket:\n\n1. Create an IAM role with s3:GetObject and s3:PutObject permissions (aws-nav: iam/pod-s3-access.md)\n2. Associate the IAM role with your ServiceAccount using IRSA\n3. Reference the ServiceAccount in your pod spec (kubernetes-nav: deployment/service-accounts.md)',
  sources: [
    {
      file: 'kubernetes-nav:deployment/service-accounts.md',
      section: 'ServiceAccount Configuration',
      relevance: 'Shows how to configure ServiceAccount in pod spec'
    },
    {
      file: 'aws-nav:iam/pod-s3-access.md',
      section: 'IAM Roles for Service Accounts',
      relevance: 'Provides IAM role and IRSA configuration'
    }
  ],
  confidence: 'high',
  confidenceReason: 'Combined authoritative sources from Kubernetes and AWS navigators',
  navigatorsConsulted: ['kubernetes-nav', 'aws-nav'],
  outOfDomain: false
};
```

## Open Questions

1. **Circular Dependencies**: How to handle A needs B, B needs C, C needs A?
2. **Conflicting Answers**: What if two navigators give different answers?
3. **Cost**: How to handle API costs when consulting many navigators?
4. **UX**: Should users see which navigators were consulted?
5. **Trust**: How to validate responses from external navigators?

## Related Work

- **Multi-agent systems**: Research on agent coordination
- **Federated search**: Combining results from multiple sources
- **Microservices**: Service mesh patterns for service-to-service communication
- **Semantic web**: Linked data and ontology alignment

---

**Version**: 0.1.0-draft
**Status**: Planned (Phase 3)
**Last Updated**: 2024-01-15

**Note**: This is a design document for future functionality. Implementation details will be refined based on Phase 1 and Phase 2 learnings.
