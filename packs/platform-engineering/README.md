# Platform Engineering Knowledge Pack

Knowledge pack for cloud-native platform engineering. Covers Kubernetes, deployment strategies, monitoring, and incident response.

## Contents

```
knowledge/
├── kubernetes.md        # K8s operations and troubleshooting
├── deployment.md        # Rolling, canary, blue-green deploys
├── monitoring.md        # Prometheus, Grafana, alerting
├── troubleshooting.md   # Diagnostic methods
├── incident-response.md # Severity levels, response procedures
├── configuration.md     # GitOps, secrets, env management
└── architecture.md      # Design patterns, service mesh
```

## Example questions

- "How do I troubleshoot a pod in CrashLoopBackOff?"
- "Walk me through a canary deployment"
- "What's a P1 incident and how do I respond?"
- "How do I set up Prometheus alerting?"

## Usage

```bash
autonav init my-platform --pack platform-engineering
autonav query my-platform "How do I deploy safely?"
```
