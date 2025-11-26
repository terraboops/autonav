# Platform Architecture Overview

**Last Updated:** 2025-11-17

## Overview

This document describes the high-level architecture of our internal developer platform, design principles, and key technology choices.

## Platform Purpose

Enable product teams to:
- Deploy applications safely and efficiently
- Monitor service health and performance
- Respond to incidents quickly
- Manage infrastructure through self-service

**Core Principle:** Reduce toil, increase developer productivity, maintain reliability.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       Developer Interface                   │
│  (CLI tools, Web UI, GitOps, Slack integrations)           │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Control Plane                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   ArgoCD     │  │  Terraform   │  │   Vault      │      │
│  │   (GitOps)   │  │  (IaC)       │  │  (Secrets)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Kubernetes Cluster (EKS)                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Application Layer                                  │    │
│  │  (Deployments, Services, Ingress)                  │    │
│  └────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Platform Services                                  │    │
│  │  (Ingress-nginx, cert-manager, external-dns)       │    │
│  └────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Observability                                      │    │
│  │  (Prometheus, Grafana, Loki, Jaeger)               │    │
│  └────────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      AWS Infrastructure                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     VPC      │  │     RDS      │  │      S3      │      │
│  │  (Networking)│  │  (Databases) │  │   (Storage)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Kubernetes (Amazon EKS)

**Purpose:** Container orchestration and application runtime

**Key Features:**
- Multi-tenant: Namespace isolation per team/service
- Auto-scaling: HPA for applications, Cluster Autoscaler for nodes
- Self-healing: Automatic pod restart and rescheduling
- Rolling updates: Zero-downtime deployments

**Configuration:**
- **Cluster version:** 1.28
- **Node groups:** Spot and On-Demand mixed
- **CNI:** AWS VPC CNI
- **Storage:** EBS CSI driver

See [Kubernetes Deployment Guide](../deployment/kubernetes.md) for usage.

### 2. ArgoCD (GitOps)

**Purpose:** Declarative, Git-based continuous deployment

**Key Features:**
- Git as source of truth for deployments
- Automated sync from Git to cluster
- Rollback to any previous commit
- Multi-cluster management

**Workflow:**
```
Developer commits → Git repository → ArgoCD syncs → Kubernetes cluster
```

**Benefits:**
- Audit trail (all changes in Git history)
- Easy rollback (git revert)
- Declarative (desired state in YAML)
- Self-service (developers manage own deployments)

### 3. Prometheus + Grafana

**Purpose:** Metrics collection and visualization

**Architecture:**
```
Applications → Prometheus (scrape metrics) → Grafana (visualize)
                     ↓
              Alertmanager (alerts) → Slack, PagerDuty
```

**Metrics:**
- Application: Request rate, errors, latency, business metrics
- Infrastructure: CPU, memory, disk, network
- Kubernetes: Pod status, deployments, resource usage

See [Prometheus Guide](../monitoring/prometheus.md) and [Grafana Guide](../monitoring/grafana.md).

### 4. Ingress and Load Balancing

**Components:**
- **ingress-nginx:** Kubernetes ingress controller
- **AWS ALB:** External load balancer
- **cert-manager:** Automatic TLS certificate management
- **external-dns:** Automatic DNS record management

**Traffic Flow:**
```
User → Route53 (DNS) → ALB → ingress-nginx → Service → Pod
```

**Features:**
- Automatic HTTPS with Let's Encrypt
- Path-based routing
- Host-based routing
- TLS termination

### 5. Secrets Management

**Components:**
- **AWS Secrets Manager:** Cloud secret storage
- **Kubernetes Secrets:** In-cluster secret distribution
- **External Secrets Operator:** Sync AWS Secrets to K8s Secrets

**Flow:**
```
AWS Secrets Manager → External Secrets Operator → Kubernetes Secret → Pod
```

**Best Practices:**
- Never commit secrets to Git
- Rotate credentials regularly
- Use IAM roles for service authentication when possible
- Encrypt secrets at rest

## Design Principles

### 1. Golden Path

Provide opinionated, supported patterns:
- Standard Helm chart template
- Pre-configured CI/CD pipelines
- Monitoring dashboards and alerts

**Goal:** Make the easy way the right way.

### 2. Self-Service

Empower developers:
- Deploy via Git commits (GitOps)
- Scale applications via HPA configuration
- View metrics in Grafana dashboards

**Goal:** Reduce dependency on platform team for common tasks.

### 3. Security by Default

Security built into platform:
- Network policies isolate namespaces
- Pod security standards enforced
- Secrets encrypted and rotated
- HTTPS enforced for all services

**Goal:** Secure by default, not as an afterthought.

### 4. Observability First

Monitoring is not optional:
- All services expose Prometheus metrics
- Standard Grafana dashboards
- Alerts configured before production
- Distributed tracing with Jaeger

**Goal:** Understand system behavior before issues occur.

### 5. Infrastructure as Code

All infrastructure defined in code:
- Terraform for AWS resources
- Helm charts for Kubernetes resources
- Git for version control

**Benefits:**
- Reproducible environments
- Code review for changes
- Disaster recovery

## Technology Stack

### Application Runtime
- **Container runtime:** containerd
- **Orchestration:** Kubernetes 1.28 (Amazon EKS)
- **Service mesh:** (Future: Istio)

### CI/CD
- **GitOps:** ArgoCD
- **CI:** GitHub Actions
- **Image registry:** Amazon ECR

### Observability
- **Metrics:** Prometheus, Grafana
- **Logs:** Loki, Grafana
- **Traces:** Jaeger (Future)
- **Alerts:** Alertmanager, PagerDuty

### Infrastructure
- **Cloud:** AWS
- **IaC:** Terraform
- **Secrets:** AWS Secrets Manager, External Secrets Operator
- **Networking:** AWS VPC, VPC CNI

### Security
- **Authentication:** AWS IAM, OIDC
- **Authorization:** Kubernetes RBAC
- **Secrets:** Encrypted at rest and in transit
- **Network:** Network policies, security groups

## Environments

### Staging
- **Purpose:** Pre-production testing
- **Cluster:** eks-staging
- **Automation:** ArgoCD auto-sync enabled
- **Cost optimization:** Spot instances, smaller node sizes

### Production
- **Purpose:** Customer-facing services
- **Cluster:** eks-production
- **Automation:** ArgoCD sync on approval only
- **Reliability:** Multi-AZ, On-Demand instances

### Development
- **Purpose:** Individual developer testing
- **Cluster:** Local (minikube, kind) or shared eks-dev
- **Automation:** Manual deployments

## Scaling Strategy

### Application Scaling

**Horizontal Pod Autoscaling:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Infrastructure Scaling

**Cluster Autoscaler:**
- Adds nodes when pods can't be scheduled
- Removes nodes when utilization is low
- Respects pod disruption budgets

**Node groups:**
- General: t3.medium (Spot + On-Demand mix)
- Memory-intensive: r6i.xlarge (On-Demand)
- Burstable: t3.large (Spot)

## Disaster Recovery

### Backup Strategy

**Kubernetes resources:**
- ArgoCD: Git is source of truth
- Velero: Backup for stateful resources

**Databases:**
- RDS automated backups (7-day retention)
- Manual snapshots before major changes

**Recovery Time Objectives:**
- RTO: 4 hours (time to restore service)
- RPO: 1 hour (acceptable data loss)

### Incident Response

1. Alert fires → PagerDuty pages on-call
2. On-call triages in #incidents Slack channel
3. Follow runbooks (see troubleshooting.md)
4. Escalate if needed
5. Post-mortem after resolution

## Future Enhancements

Planned improvements:

1. **Service Mesh (Istio):**
   - Mutual TLS between services
   - Advanced traffic management
   - Better observability

2. **Distributed Tracing:**
   - Full Jaeger implementation
   - Trace-based debugging

3. **Policy Enforcement (OPA):**
   - Automated policy compliance
   - Security best practice enforcement

4. **Multi-Region:**
   - Active-active across regions
   - Improved disaster recovery

## Related Documentation

- [Kubernetes Deployment](../deployment/kubernetes.md) - How to deploy applications
- [Prometheus Monitoring](../monitoring/prometheus.md) - Setting up monitoring
- [Grafana Dashboards](../monitoring/grafana.md) - Creating visualizations
- [Architecture Decisions](decisions.md) - ADRs for key choices
