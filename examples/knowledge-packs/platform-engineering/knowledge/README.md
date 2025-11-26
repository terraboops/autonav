# Platform Engineering Knowledge Base

This knowledge base contains curated documentation for platform engineering operations, covering deployment, monitoring, and architecture.

## Contents

### Deployment
Documentation for deploying and managing applications on our platform.

- **Kubernetes** - Kubernetes deployment procedures, best practices, and troubleshooting
- **AWS** - AWS infrastructure setup and management
- **Troubleshooting** - Common deployment issues and their solutions

### Monitoring
Guides for setting up and using our observability stack.

- **Prometheus** - Metrics collection, PromQL queries, and alerting
- **Grafana** - Dashboard creation and management

### Architecture
Platform architecture documentation and decision records.

- **Overview** - High-level platform architecture and design principles
- **Decisions** - Architecture Decision Records (ADRs)

## Getting Started

If you're new to the platform, start with:
1. [Architecture Overview](architecture/overview.md) - Understand the platform structure
2. [Kubernetes Deployment](deployment/kubernetes.md) - Learn how to deploy applications
3. [Prometheus Monitoring](monitoring/prometheus.md) - Set up monitoring for your services

## Contributing

To add or update documentation:
1. Keep files focused on a single topic
2. Use clear markdown headings for sections
3. Include working code examples
4. Add "Last Updated" dates
5. Link to related docs

## Questions?

Use the Autonav navigator to query this knowledge base:

```bash
nav-query . "How do I deploy to Kubernetes?"
nav-query . "How do I create a Grafana dashboard?"
nav-query . "What's the platform architecture?"
```
