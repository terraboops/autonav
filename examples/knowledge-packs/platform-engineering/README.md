# Platform Engineering Knowledge Pack

**Version:** 1.0.0
**Last Updated:** 2025-11-17

## Overview

This knowledge pack provides comprehensive documentation for platform engineering operations, covering Kubernetes deployment, AWS infrastructure, monitoring with Prometheus and Grafana, and platform architecture.

## What's Included

### Deployment
- **Kubernetes Deployment Guide** - Standard deployment procedures, GitOps with ArgoCD, rollout strategies
- **Troubleshooting Guide** - Common deployment issues and solutions

### Monitoring
- **Prometheus Guide** - Metrics collection, PromQL queries, alerting
- **Grafana Guide** - Dashboard creation, visualization, alerts

### Architecture
- **Overview** - High-level platform architecture and design principles
- **Decision Records** - ADRs documenting key technology choices

## Using This Pack

### With Autonav

```bash
# Download and extract the pack
curl -L https://packs.example.com/packs/platform-engineering/latest -o pack.tar.gz
tar -xzf pack.tar.gz
cd platform-engineering

# Query the knowledge base
export ANTHROPIC_API_KEY=your-api-key
nav-query . "How do I deploy to Kubernetes?"
nav-query . "How do I set up Prometheus alerts?"
nav-query . "What's the platform architecture?"
```

### Browse Documentation

All documentation is in the `knowledge/` directory:

```
knowledge/
├── README.md
├── deployment/
│   ├── kubernetes.md
│   └── troubleshooting.md
├── monitoring/
│   ├── prometheus.md
│   └── grafana.md
└── architecture/
    ├── overview.md
    └── decisions.md
```

## Topics Covered

### Deployment
- Kubernetes deployment methods (standard, GitOps, jobs)
- Rollout strategies (rolling update, blue-green)
- Health checks and resource management
- Horizontal pod autoscaling
- Configuration management (ConfigMaps, Secrets)
- Rollback procedures
- Debugging and troubleshooting

### Monitoring
- Prometheus metrics collection
- ServiceMonitor configuration
- PromQL queries and aggregations
- Alerting with PrometheusRule
- Grafana dashboard creation
- Common dashboard patterns
- Performance optimization

### Architecture
- Platform overview and components
- Kubernetes (EKS) setup
- GitOps with ArgoCD
- Observability stack
- Design principles
- Technology stack
- Disaster recovery

## Example Queries

**Deployment:**
- "How do I deploy a new application to Kubernetes?"
- "What's the rollback procedure if a deployment fails?"
- "How do I configure horizontal pod autoscaling?"

**Troubleshooting:**
- "My pods are in CrashLoopBackOff, how do I debug?"
- "How do I fix ImagePullBackOff errors?"
- "Why is my service not accessible?"

**Monitoring:**
- "How do I expose Prometheus metrics from my app?"
- "How do I write a PromQL query for request rate?"
- "How do I set up alerts for high error rates?"

**Architecture:**
- "What's the overall platform architecture?"
- "Why did we choose Kubernetes over ECS?"
- "How does GitOps work with ArgoCD?"

## System Configuration

This pack includes a `system-configuration.md` file that provides domain-specific instructions for the Autonav navigator, including:

- Domain scope (what questions this pack can answer)
- Knowledge base organization
- Key concepts and terminology
- Response guidelines
- Out-of-scope topics

## Version History

### 1.0.0 (2025-11-17)

Initial release with comprehensive documentation:
- Kubernetes deployment guide
- Deployment troubleshooting
- Prometheus monitoring guide
- Grafana dashboard guide
- Architecture overview
- Architecture decision records

## Compatibility

- **Autonav Version:** >= 0.1.0
- **Claude API:** Compatible with Claude 3 and above

## Contributing

To update this knowledge pack:

1. Edit files in `knowledge/` directory
2. Update `metadata.json` with new version and updated timestamp
3. Update this README with changes
4. Package as tarball: `tar -czf platform-engineering-{version}.tar.gz .`

## License

MIT

## Links

- [Autonav Documentation](https://github.com/terraboops/platform-ai)
- [Knowledge Pack Protocol](https://github.com/terraboops/platform-ai/docs/KNOWLEDGE_PACK_PROTOCOL.md)
