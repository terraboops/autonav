# Platform Engineering Knowledge Pack - Index

**Quick Navigation**: Find what you need fast

**Last Updated**: 2025-11-17

---

## 🚀 Start Here

**New to platform engineering?**
→ [GETTING_STARTED.md](GETTING_STARTED.md)

**Know your experience level?**
→ [USER_PERSONAS.md](USER_PERSONAS.md)

**Need something specific?**
→ Use this index or search this page (Ctrl/Cmd+F)

---

## 📚 By Topic

### Deployment & Releases

| Topic | Location | Difficulty |
|-------|----------|------------|
| First deployment (quick win) | [GETTING_STARTED.md → 30 Minutes](GETTING_STARTED.md#your-first-30-minutes-quick-wins) | Beginner |
| Rolling update deployment | [deployment.md → Rolling Update](knowledge/deployment.md#rolling-update-default) | Beginner |
| Canary deployment | [deployment.md → Canary](knowledge/deployment.md#canary-deployment) | Intermediate |
| Blue-green deployment | [deployment.md → Blue-Green](knowledge/deployment.md#blue-green-deployment) | Intermediate |
| Rollback procedures | [deployment.md → Rollback](knowledge/deployment.md#rollback-procedures) | Beginner |
| Pre-deployment checklist | [deployment.md → Checklist](knowledge/deployment.md#pre-deployment-checklist) | All levels |

### Kubernetes Operations

| Topic | Location | Difficulty |
|-------|----------|------------|
| kubectl basics | [kubernetes.md → Essential Commands](knowledge/kubernetes.md#essential-kubectl-commands) | Beginner |
| Pod troubleshooting | [kubernetes.md → Pod States](knowledge/kubernetes.md#troubleshooting-pod-states) | Beginner |
| CrashLoopBackOff debug | [kubernetes.md → CrashLoopBackOff](knowledge/kubernetes.md#crashloopbackoff) | Beginner |
| ImagePullBackOff debug | [kubernetes.md → ImagePullBackOff](knowledge/kubernetes.md#imagepullbackoff) | Beginner |
| Service networking | [kubernetes.md → Service and Networking](knowledge/kubernetes.md#service-and-networking) | Intermediate |
| RBAC and security | [kubernetes.md → RBAC](knowledge/kubernetes.md#rbac-and-security) | Intermediate |

### Monitoring & Observability

| Topic | Location | Difficulty |
|-------|----------|------------|
| Prometheus setup | [monitoring.md → Prometheus Setup](knowledge/monitoring.md#prometheus-setup) | Intermediate |
| Grafana dashboards | [monitoring.md → Grafana Dashboards](knowledge/monitoring.md#grafana-dashboards) | Intermediate |
| Alert configuration | [monitoring.md → Alerts](knowledge/monitoring.md#alert-configuration) | Intermediate |
| SLIs and SLOs | [monitoring.md → SLIs and SLOs](knowledge/monitoring.md#slis-and-slos) | Advanced |
| Key metrics to monitor | [monitoring.md → Key Metrics](knowledge/monitoring.md#key-metrics) | All levels |
| Troubleshooting monitoring | [monitoring.md → Troubleshooting](knowledge/monitoring.md#troubleshooting-monitoring) | Intermediate |

### Troubleshooting

| Topic | Location | Difficulty |
|-------|----------|------------|
| Troubleshooting methodology | [troubleshooting.md → Methodology](knowledge/troubleshooting.md#troubleshooting-methodology) | All levels |
| Common failure patterns | [troubleshooting.md → Failure Patterns](knowledge/troubleshooting.md#common-failure-patterns) | Intermediate |
| Decision trees | [troubleshooting.md → Decision Trees](knowledge/troubleshooting.md#diagnostic-decision-trees) | All levels |
| Container failures | [troubleshooting.md → Container Failures](knowledge/troubleshooting.md#container-failures) | Beginner |
| Network issues | [troubleshooting.md → Network Issues](knowledge/troubleshooting.md#network-issues) | Intermediate |
| Application errors | [troubleshooting.md → Application Errors](knowledge/troubleshooting.md#application-errors) | Intermediate |

### Incident Response

| Topic | Location | Difficulty |
|-------|----------|------------|
| Incident severity levels | [incident-response.md → Severity](knowledge/incident-response.md#incident-severity-levels) | All levels |
| P0/P1 response procedures | [incident-response.md → Response](knowledge/incident-response.md#p0p1-incident-response) | Intermediate |
| Communication protocols | [incident-response.md → Communication](knowledge/incident-response.md#communication-protocols) | All levels |
| Post-incident reviews | [incident-response.md → Post-Incident](knowledge/incident-response.md#post-incident-review) | Intermediate |
| Runbook organization | [incident-response.md → Runbooks](knowledge/incident-response.md#runbook-organization) | Intermediate |
| On-call best practices | [incident-response.md → On-Call](knowledge/incident-response.md#on-call-best-practices) | All levels |

### Configuration Management

| Topic | Location | Difficulty |
|-------|----------|------------|
| GitOps workflow | [configuration.md → GitOps](knowledge/configuration.md#gitops-workflow) | Intermediate |
| Argo CD setup | [configuration.md → Argo CD](knowledge/configuration.md#argo-cd-setup) | Intermediate |
| Secret management | [configuration.md → Secrets](knowledge/configuration.md#secret-management) | Intermediate |
| Environment management | [configuration.md → Environments](knowledge/configuration.md#environment-management) | Intermediate |
| Kustomize patterns | [configuration.md → Common Patterns](knowledge/configuration.md#common-patterns) | Intermediate |

### Architecture & Design

| Topic | Location | Difficulty |
|-------|----------|------------|
| Cloud-native principles | [architecture.md → Principles](knowledge/architecture.md#architecture-principles) | All levels |
| Service mesh decision | [architecture.md → Service Mesh](knowledge/architecture.md#service-mesh-considerations) | Advanced |
| Networking patterns | [architecture.md → Networking](knowledge/architecture.md#networking-patterns) | Intermediate |
| Storage strategies | [architecture.md → Storage](knowledge/architecture.md#storage-strategies) | Intermediate |
| Multi-tenancy | [architecture.md → Multi-Tenancy](knowledge/architecture.md#multi-tenancy-approaches) | Advanced |
| Scalability patterns | [architecture.md → Scalability](knowledge/architecture.md#scalability-patterns) | Advanced |
| Architecture Decision Records | [architecture.md → ADRs](knowledge/architecture.md#architecture-decision-records) | Advanced |

---

## 🎯 By Use Case

### "I need to deploy something"

**First time deploying?**
1. [GETTING_STARTED.md → First 30 Minutes](GETTING_STARTED.md#your-first-30-minutes-quick-wins)
2. [kubernetes.md → Pod Operations](knowledge/kubernetes.md#pod-operations)

**Deploying to production?**
1. [deployment.md → Pre-Deployment Checklist](knowledge/deployment.md#pre-deployment-checklist)
2. [deployment.md → Canary Deployment Procedure](knowledge/deployment.md#canary-deployment-procedure)
3. [monitoring.md → Deployment Monitoring](knowledge/monitoring.md#deployment-monitoring)

**Need to rollback?**
1. [deployment.md → Rollback Procedures](knowledge/deployment.md#rollback-procedures)

### "Something is broken"

**Pod not starting?**
1. [kubernetes.md → Troubleshooting Pod States](knowledge/kubernetes.md#troubleshooting-pod-states)
2. [troubleshooting.md → Pod Not Running Decision Tree](knowledge/troubleshooting.md#pod-not-running-decision-tree)

**Service unreachable?**
1. [kubernetes.md → Service Debugging](knowledge/kubernetes.md#debugging-service-connectivity)
2. [troubleshooting.md → Network Issues](knowledge/troubleshooting.md#network-issues)

**Production incident?**
1. [incident-response.md → P0/P1 Response](knowledge/incident-response.md#p0p1-incident-response)
2. [troubleshooting.md → Methodology](knowledge/troubleshooting.md#troubleshooting-methodology)

**High error rate?**
1. [troubleshooting.md → High Error Rate](knowledge/troubleshooting.md#high-error-rate)
2. [incident-response.md → Response Procedures](knowledge/incident-response.md#response-procedures)

### "I need to set something up"

**Monitoring from scratch?**
1. [monitoring.md → Prometheus Setup](knowledge/monitoring.md#prometheus-setup)
2. [monitoring.md → Grafana Dashboards](knowledge/monitoring.md#grafana-dashboards)
3. [monitoring.md → Alert Configuration](knowledge/monitoring.md#alert-configuration)

**GitOps workflow?**
1. [configuration.md → GitOps Workflow](knowledge/configuration.md#gitops-workflow)
2. [configuration.md → Argo CD Setup](knowledge/configuration.md#argo-cd-setup)

**Secret management?**
1. [configuration.md → Secret Management](knowledge/configuration.md#secret-management)

### "I need to make a decision"

**Which deployment strategy?**
→ [deployment.md → Deployment Strategies](knowledge/deployment.md#deployment-strategies) - Compare all options

**Should I use a service mesh?**
→ [architecture.md → Service Mesh Considerations](knowledge/architecture.md#service-mesh-considerations)

**Which GitOps tool?**
→ [configuration.md → GitOps Tools](knowledge/configuration.md#gitops-tools)

**Storage strategy?**
→ [architecture.md → Storage Strategies](knowledge/architecture.md#storage-strategies)

---

## 🔧 By Command/Tool

### kubectl

| Command/Topic | Location |
|---------------|----------|
| Essential commands | [kubernetes.md → Essential kubectl Commands](knowledge/kubernetes.md#essential-kubectl-commands) |
| kubectl cheat sheet | [kubernetes.md → Quick Reference](knowledge/kubernetes.md#quick-reference) |
| Debug commands | [troubleshooting.md → Debugging Tools](knowledge/troubleshooting.md#debugging-tools) |

### Prometheus

| Topic | Location |
|-------|----------|
| Installation | [monitoring.md → Prometheus Setup](knowledge/monitoring.md#prometheus-setup) |
| PromQL queries | [monitoring.md → Key Metrics](knowledge/monitoring.md#key-metrics) |
| Alert rules | [monitoring.md → Alert Configuration](knowledge/monitoring.md#alert-configuration) |

### Grafana

| Topic | Location |
|-------|----------|
| Setup | [monitoring.md → Grafana Dashboards](knowledge/monitoring.md#grafana-dashboards) |
| Creating dashboards | [monitoring.md → Creating Custom Dashboard](knowledge/monitoring.md#creating-custom-dashboard) |
| Best practices | [monitoring.md → Dashboard Best Practices](knowledge/monitoring.md#dashboard-best-practices) |

### Argo CD

| Topic | Location |
|-------|----------|
| Installation | [configuration.md → Argo CD Setup](knowledge/configuration.md#argo-cd-setup) |
| Application creation | [configuration.md → Create Application](knowledge/configuration.md#create-application) |
| GitOps workflow | [configuration.md → GitOps Workflow Steps](knowledge/configuration.md#gitops-workflow-steps) |

### Kustomize

| Topic | Location |
|-------|----------|
| Basic usage | [configuration.md → Environment Management](knowledge/configuration.md#environment-management) |
| Overlays | [configuration.md → Environment-Specific Configuration](knowledge/configuration.md#environment-specific-configuration) |
| Commands | [configuration.md → Kustomize Commands](knowledge/configuration.md#kustomize-commands) |

---

## 🎓 By Learning Goal

### "I want to learn Kubernetes"

**Path**:
1. [GETTING_STARTED.md](GETTING_STARTED.md) - Hands-on introduction
2. [kubernetes.md → Core Concepts](knowledge/kubernetes.md#core-concepts)
3. [kubernetes.md → Essential kubectl Commands](knowledge/kubernetes.md#essential-kubectl-commands)
4. [kubernetes.md → Common Workflows](knowledge/kubernetes.md#common-workflows)

### "I want to master deployments"

**Path**:
1. [deployment.md → Deployment Strategies](knowledge/deployment.md#deployment-strategies)
2. [deployment.md → Deployment Procedures](knowledge/deployment.md#deployment-procedures)
3. [monitoring.md → Deployment Validation](knowledge/monitoring.md#deployment-validation)
4. [deployment.md → Common Issues](knowledge/deployment.md#common-issues)

### "I want to improve monitoring"

**Path**:
1. [monitoring.md → Monitoring Stack Overview](knowledge/monitoring.md#monitoring-stack-overview)
2. [monitoring.md → Key Metrics](knowledge/monitoring.md#key-metrics)
3. [monitoring.md → Alert Configuration](knowledge/monitoring.md#alert-configuration)
4. [monitoring.md → SLIs and SLOs](knowledge/monitoring.md#slis-and-slos)

### "I want to be ready for incidents"

**Path**:
1. [incident-response.md → Incident Severity Levels](knowledge/incident-response.md#incident-severity-levels)
2. [incident-response.md → Response Procedures](knowledge/incident-response.md#response-procedures)
3. [incident-response.md → Communication Protocols](knowledge/incident-response.md#communication-protocols)
4. [incident-response.md → Runbook Organization](knowledge/incident-response.md#runbook-organization)
5. Practice rollbacks: [deployment.md → Rollback Procedures](knowledge/deployment.md#rollback-procedures)

### "I want to understand architecture"

**Path**:
1. [architecture.md → Architecture Principles](knowledge/architecture.md#architecture-principles)
2. [architecture.md → Service Mesh Considerations](knowledge/architecture.md#service-mesh-considerations)
3. [architecture.md → Networking Patterns](knowledge/architecture.md#networking-patterns)
4. [architecture.md → Scalability Patterns](knowledge/architecture.md#scalability-patterns)
5. [architecture.md → Architecture Decision Records](knowledge/architecture.md#architecture-decision-records)

---

## 🔍 Search Tips

**Can't find what you need?**

1. **Use Ctrl/Cmd+F** on this page to search index
2. **Search GitHub** using repository search
3. **Check decision trees** in troubleshooting.md
4. **Ask in** [GitHub Discussions](https://github.com/terraboops/platform-ai/discussions)

**Common searches**:
- Pod problems → [kubernetes.md → Troubleshooting Pod States](knowledge/kubernetes.md#troubleshooting-pod-states)
- Deployment issues → [deployment.md → Common Issues](knowledge/deployment.md#common-issues)
- Network problems → [troubleshooting.md → Network Issues](knowledge/troubleshooting.md#network-issues)
- Incident procedures → [incident-response.md](knowledge/incident-response.md)

---

## 📊 By Expertise Level

### Beginner Content

**Must Read**:
- [GETTING_STARTED.md](GETTING_STARTED.md)
- [kubernetes.md → Essential kubectl Commands](knowledge/kubernetes.md#essential-kubectl-commands)
- [kubernetes.md → Troubleshooting Pod States](knowledge/kubernetes.md#troubleshooting-pod-states)
- [deployment.md → Rolling Update](knowledge/deployment.md#rolling-update-default)

**Reference**:
- [troubleshooting.md → Decision Trees](knowledge/troubleshooting.md#diagnostic-decision-trees)
- [kubernetes.md → Quick Reference](knowledge/kubernetes.md#quick-reference)

### Intermediate Content

**Focus On**:
- [deployment.md → Canary Deployment](knowledge/deployment.md#canary-deployment)
- [monitoring.md → Complete](knowledge/monitoring.md)
- [incident-response.md → Complete](knowledge/incident-response.md)
- [configuration.md → GitOps Workflow](knowledge/configuration.md#gitops-workflow)

### Advanced Content

**Explore**:
- [architecture.md → Complete](knowledge/architecture.md)
- [monitoring.md → SLIs and SLOs](knowledge/monitoring.md#slis-and-slos)
- [configuration.md → Secret Management](knowledge/configuration.md#secret-management)
- [architecture.md → ADRs](knowledge/architecture.md#architecture-decision-records)

---

## 🗺️ Complete File Map

```
platform-engineering/
├── README.md                     # Start here for overview
├── GETTING_STARTED.md           # 🌟 Your first week guide
├── USER_PERSONAS.md             # Find your learning path
├── INDEX.md                     # This file - quick navigation
├── PLATFORM_REVIEW.md           # Platform engineering review
├── CREATOR_NOTES.md             # Design decisions
├── system-configuration.md      # Navigator grounding
├── test-questions.md            # Validation scenarios
├── metadata.json                # Pack metadata
└── knowledge/
    ├── kubernetes.md            # K8s operations (600 lines)
    ├── deployment.md            # Deployment strategies (500 lines)
    ├── monitoring.md            # Observability (550 lines)
    ├── troubleshooting.md       # Debugging (550 lines)
    ├── incident-response.md     # Incidents (500 lines)
    ├── configuration.md         # Config & GitOps (500 lines)
    └── architecture.md          # Platform architecture (500 lines)
```

---

## 🎯 Quick Wins

**Want to accomplish something right now?**

- **Next 10 minutes**: [Deploy your first pod](GETTING_STARTED.md#step-1-create-a-simple-deployment-5-min)
- **Next 30 minutes**: [Complete first deployment](GETTING_STARTED.md#your-first-30-minutes-quick-wins)
- **Next hour**: [Set up GitOps repo](GETTING_STARTED.md#phase-1-setup-gitops-repository-30-min)
- **Today**: [Deploy to dev environment](GETTING_STARTED.md#your-first-day-structured-deployment)
- **This week**: [Deploy to production](GETTING_STARTED.md#your-first-week-production-deployment)

---

## 🆘 Emergency Reference

**Production is down right now?**

1. **Declare incident**: [incident-response.md → P0/P1 Response](knowledge/incident-response.md#step-1-alert-received-0-5-minutes)
2. **Check recent changes**: `kubectl rollout history deployment/<name>`
3. **Rollback if needed**: [deployment.md → Rollback](knowledge/deployment.md#rolling-update-rollback)
4. **Follow procedures**: [incident-response.md → Mitigation](knowledge/incident-response.md#step-3-mitigation-15-30-minutes)

**Pod failing?**
→ [kubernetes.md → Troubleshooting Pod States](knowledge/kubernetes.md#troubleshooting-pod-states)

**Service unreachable?**
→ [troubleshooting.md → Service Unreachable Decision Tree](knowledge/troubleshooting.md#service-unreachable-decision-tree)

---

**Didn't find what you need?** [Open a discussion](https://github.com/terraboops/platform-ai/discussions) or [file an issue](https://github.com/terraboops/platform-ai/issues).

**Found this helpful?** ⭐ Star the repo and share your success story!
