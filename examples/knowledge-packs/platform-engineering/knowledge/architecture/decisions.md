# Architecture Decision Records (ADRs)

**Last Updated:** 2025-11-17

## Overview

This document contains Architecture Decision Records for key technology and design choices in our platform.

## ADR Format

Each decision follows this structure:
- **Status:** Accepted, Proposed, Deprecated, Superseded
- **Context:** The situation prompting the decision
- **Decision:** What we decided
- **Consequences:** Trade-offs and implications

---

## ADR-001: Use Kubernetes for Container Orchestration

**Status:** Accepted
**Date:** 2024-06-01
**Deciders:** Platform Team

### Context

We needed a container orchestration platform to manage microservices deployments. Requirements:
- Multi-tenant isolation
- Auto-scaling
- Self-healing
- Industry standard with large ecosystem

**Options considered:**
1. Amazon ECS
2. HashiCorp Nomad
3. Kubernetes (Amazon EKS)

### Decision

Use Kubernetes (Amazon EKS) as our container orchestration platform.

### Consequences

**Positive:**
- Industry standard with massive ecosystem
- Multi-tenancy via namespaces
- Rich tooling (Helm, Kustomize, operators)
- Declarative configuration
- Large community and documentation

**Negative:**
- Steeper learning curve than ECS
- More complex to operate
- Requires dedicated platform team
- Higher AWS costs than ECS

**Mitigations:**
- Invest in platform team training
- Use managed EKS (AWS handles control plane)
- Create golden path templates to abstract complexity

---

## ADR-002: GitOps with ArgoCD

**Status:** Accepted
**Date:** 2024-07-15
**Deciders:** Platform Team

### Context

We needed a deployment strategy that:
- Provides audit trail
- Enables self-service for developers
- Supports rollback
- Integrates with Git workflows

**Options considered:**
1. Jenkins pipelines
2. GitHub Actions with kubectl
3. Flux (GitOps)
4. ArgoCD (GitOps)

### Decision

Implement GitOps using ArgoCD for all Kubernetes deployments.

### Consequences

**Positive:**
- Git is single source of truth
- Every change has audit trail (Git history)
- Easy rollback (git revert)
- Declarative desired state
- Beautiful UI for visibility
- Multi-cluster support

**Negative:**
- Requires all config in Git (can't deploy manually)
- Additional component to maintain
- Initial migration effort from existing pipelines

**Mitigations:**
- Provide documentation and training
- Create example repositories with ArgoCD setup
- Emergency procedures for bypassing ArgoCD if needed

---

## ADR-003: Prometheus for Metrics

**Status:** Accepted
**Date:** 2024-08-01
**Deciders:** Platform Team

### Context

We needed a metrics and alerting system for platform and application monitoring.

**Options considered:**
1. CloudWatch (AWS native)
2. Datadog (SaaS)
3. Prometheus + Grafana (self-hosted)

### Decision

Use Prometheus for metrics collection and Grafana for visualization, self-hosted in Kubernetes.

### Consequences

**Positive:**
- Open source, no vendor lock-in
- Kubernetes-native (built for dynamic environments)
- Powerful query language (PromQL)
- Massive ecosystem of exporters
- Cost-effective (no per-metric pricing)
- Data stays in our infrastructure

**Negative:**
- Requires self-hosting and maintenance
- Scaling challenges for large deployments
- Need to implement own long-term storage solution
- Steeper learning curve than CloudWatch

**Mitigations:**
- Use Prometheus Operator for easier management
- Implement Thanos for long-term storage (future)
- Provide PromQL training and example queries
- Maintain standard dashboards and alerts

---

## ADR-004: Spot Instances for Cost Optimization

**Status:** Accepted
**Date:** 2024-09-10
**Deciders:** Platform Team, Finance

### Context

Kubernetes node costs were exceeding budget. We needed to reduce AWS EC2 costs while maintaining reliability.

**Options considered:**
1. Reserved Instances (1-year commitment)
2. Savings Plans
3. Spot Instances with On-Demand fallback
4. Rightsizing only

### Decision

Use mixed node groups: 70% Spot instances, 30% On-Demand, with pod disruption budgets.

### Consequences

**Positive:**
- 60-70% cost savings on Spot instances
- Cluster Autoscaler handles Spot interruptions
- On-Demand provides baseline capacity
- Pod disruption budgets prevent cascading failures

**Negative:**
- Spot interruptions require handling
- More complex node group configuration
- Some applications not suitable for Spot
- Need careful monitoring of interruptions

**Mitigations:**
- Set pod disruption budgets for all deployments
- Use On-Demand for critical stateful workloads
- Monitor Spot interruption rates
- Implement graceful shutdown handlers

---

## ADR-005: Namespace-Per-Team Model

**Status:** Accepted
**Date:** 2024-10-01
**Deciders:** Platform Team

### Context

We needed a multi-tenancy model for Kubernetes that balances isolation with simplicity.

**Options considered:**
1. Namespace per environment (dev, staging, prod)
2. Namespace per team
3. Namespace per service
4. Separate clusters per team

### Decision

Use namespace-per-team model, with team namespaces in each environment cluster.

**Example:**
- Cluster: eks-production
  - Namespace: team-platform
  - Namespace: team-api
  - Namespace: team-frontend

### Consequences

**Positive:**
- Clear ownership and RBAC boundaries
- Resource quotas per team
- Easier to track costs per team
- Reduces namespace sprawl vs. per-service model

**Negative:**
- Services from different teams in same namespace complicate ownership
- Scaling teams requires namespace coordination
- Cross-team dependencies require network policies

**Mitigations:**
- Document namespace ownership in Git
- Implement network policies for cross-namespace communication
- Use labels for finer-grained organization within namespace

---

## ADR-006: External Secrets Operator

**Status:** Accepted
**Date:** 2024-11-01
**Deciders:** Platform Team, Security

### Context

We needed a secure way to inject secrets from AWS Secrets Manager into Kubernetes pods without:
- Storing secrets in Git
- Manually creating Kubernetes Secrets
- Granting broad IAM permissions to pods

**Options considered:**
1. Manual Kubernetes Secrets (kubectl create secret)
2. Sealed Secrets (encrypted in Git)
3. External Secrets Operator
4. Vault

### Decision

Use External Secrets Operator to sync AWS Secrets Manager to Kubernetes Secrets.

### Consequences

**Positive:**
- Secrets stay in AWS Secrets Manager (single source of truth)
- Automatic sync to Kubernetes Secrets
- Rotation handled by AWS
- Audit trail in AWS CloudTrail
- No secrets in Git

**Negative:**
- Additional operator to maintain
- Dependency on AWS Secrets Manager
- Sync delay (eventual consistency)

**Mitigations:**
- Monitor External Secrets Operator health
- Document secret rotation procedures
- Provide examples of ExternalSecret manifests

---

## ADR-007: HTTP-Based Knowledge Pack Distribution

**Status:** Proposed
**Date:** 2025-11-17
**Deciders:** Platform Team

### Context

We need a way to distribute Autonav knowledge packs without requiring npm registry or centralized package management.

**Options considered:**
1. npm packages (@company/platform-pack)
2. Git submodules
3. HTTP distribution (tarball download)
4. Direct Git clone

### Decision

Use HTTP-based distribution with semantic versioning and tarball packaging.

**Protocol:**
- GET /packs/{name}/latest
- GET /packs/{name}/versions
- GET /packs/{name}/{version}

### Consequences

**Positive:**
- Decentralized: Anyone can host packs
- Simple: Any web server can distribute
- Flexible: No npm registry required
- Versionable: Semantic versioning built-in

**Negative:**
- No dependency resolution (acceptable for MVP)
- Manual version management
- No built-in discovery mechanism

**Mitigations:**
- Document versioning best practices
- Create reference server implementation
- Defer dependency resolution to Phase 2

**References:**
- See docs/KNOWLEDGE_PACK_PROTOCOL.md

---

## Superseded Decisions

### ADR-OLD-001: Jenkins for CI/CD

**Status:** Superseded by ADR-002 (ArgoCD)
**Date:** 2023-12-01

We originally used Jenkins for CI/CD but migrated to ArgoCD for better GitOps workflows and improved developer experience.

---

## Deprecated Decisions

### ADR-OLD-002: ECS for Container Orchestration

**Status:** Deprecated
**Date:** 2024-01-15

Early prototype used Amazon ECS. Deprecated in favor of Kubernetes for better ecosystem and features (ADR-001).

---

## Template for New ADRs

```markdown
## ADR-XXX: [Title]

**Status:** [Proposed | Accepted | Deprecated | Superseded]
**Date:** YYYY-MM-DD
**Deciders:** [List of people/teams]

### Context

[Describe the situation and requirements that led to this decision]

**Options considered:**
1. Option A
2. Option B
3. Option C

### Decision

[What we decided to do]

### Consequences

**Positive:**
- [Benefit 1]
- [Benefit 2]

**Negative:**
- [Trade-off 1]
- [Trade-off 2]

**Mitigations:**
- [How we address negative consequences]

**References:**
- [Links to relevant documentation]
```

---

## Related Documentation

- [Architecture Overview](overview.md) - High-level platform architecture
- [Kubernetes Deployment](../deployment/kubernetes.md) - How to deploy applications
- [Prometheus Monitoring](../monitoring/prometheus.md) - Metrics and alerting
