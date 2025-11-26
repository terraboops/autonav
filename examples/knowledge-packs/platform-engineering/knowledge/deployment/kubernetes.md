# Kubernetes Deployment Guide

**Last Updated:** 2025-11-17

## Overview

This guide covers deploying applications to our Kubernetes clusters using our standardized GitOps workflow.

## Prerequisites

- kubectl 1.28+ installed and configured
- Access to the appropriate Kubernetes cluster
- Valid kubeconfig with namespace permissions
- Docker image pushed to our container registry

## Deployment Methods

### 1. Standard Application Deployment

For most applications, use our Helm chart template:

```bash
# Clone the app template
git clone https://github.com/company/k8s-app-template.git my-app

# Update values.yaml with your app configuration
vim my-app/values.yaml

# Deploy to staging
kubectl config use-context staging
helm install my-app ./my-app -n my-namespace

# Verify deployment
kubectl get pods -n my-namespace
kubectl get svc -n my-namespace
```

**Required values in values.yaml:**
```yaml
image:
  repository: registry.company.com/my-app
  tag: v1.0.0
  pullPolicy: IfNotPresent

replicas: 3

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

service:
  type: ClusterIP
  port: 8080
```

### 2. GitOps Deployment (Recommended)

We use ArgoCD for production deployments:

```bash
# 1. Commit your Helm chart to git
git add .
git commit -m "feat: add my-app deployment"
git push origin main

# 2. Create ArgoCD application
kubectl apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/deployments
    targetRevision: main
    path: my-app
  destination:
    server: https://kubernetes.default.svc
    namespace: my-namespace
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# 3. Monitor sync status
argocd app get my-app
argocd app sync my-app
```

### 3. Database Migration Jobs

For one-time migration jobs:

```bash
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  namespace: my-namespace
spec:
  template:
    spec:
      containers:
      - name: migration
        image: registry.company.com/my-app:v1.0.0
        command: ["./migrate.sh"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
      restartPolicy: OnFailure
  backoffLimit: 3
EOF

# Monitor job
kubectl logs -f job/db-migration -n my-namespace
```

## Rollout Strategies

### Rolling Update (Default)

Safe, zero-downtime deployments:

```yaml
# In your deployment spec
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

```bash
# Update image version
kubectl set image deployment/my-app \
  my-app=registry.company.com/my-app:v1.1.0 \
  -n my-namespace

# Watch rollout
kubectl rollout status deployment/my-app -n my-namespace

# Verify new version
kubectl get pods -n my-namespace -o jsonpath='{.items[*].spec.containers[0].image}'
```

### Blue-Green Deployment

For critical services requiring instant rollback:

```bash
# Deploy new version (green)
kubectl apply -f deployment-v2.yaml

# Wait for green to be ready
kubectl wait --for=condition=available deployment/my-app-v2 -n my-namespace

# Switch traffic
kubectl patch service my-app -n my-namespace -p '{"spec":{"selector":{"version":"v2"}}}'

# If issues occur, instant rollback
kubectl patch service my-app -n my-namespace -p '{"spec":{"selector":{"version":"v1"}}}'

# Clean up old version
kubectl delete deployment my-app-v1 -n my-namespace
```

## Health Checks

Always configure health checks:

```yaml
# In deployment spec
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2
```

## Resource Management

### Resource Requests and Limits

Always set requests and limits to prevent resource contention:

```yaml
resources:
  requests:
    cpu: 100m        # Guaranteed CPU
    memory: 128Mi    # Guaranteed memory
  limits:
    cpu: 500m        # Max CPU (throttled if exceeded)
    memory: 512Mi    # Max memory (OOMKilled if exceeded)
```

**Guidelines:**
- Requests: Based on average usage (see Grafana metrics)
- Limits: 2-3x requests, based on peak usage
- CPU limits: Optional, prevents one app from starving others
- Memory limits: Required, prevents OOM cascade

### Horizontal Pod Autoscaling

For variable traffic services:

```bash
kubectl autoscale deployment my-app \
  --cpu-percent=70 \
  --min=3 \
  --max=10 \
  -n my-namespace

# Or with HPA manifest
kubectl apply -f - <<EOF
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app
  namespace: my-namespace
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
EOF
```

## Configuration Management

### ConfigMaps

For non-sensitive configuration:

```bash
kubectl create configmap my-app-config \
  --from-file=config.yaml \
  --from-literal=LOG_LEVEL=info \
  -n my-namespace

# Use in deployment
env:
  - name: LOG_LEVEL
    valueFrom:
      configMapKeyRef:
        name: my-app-config
        key: LOG_LEVEL
```

### Secrets

For sensitive data (credentials, tokens):

```bash
kubectl create secret generic my-app-secrets \
  --from-literal=DATABASE_PASSWORD=secret123 \
  --from-literal=API_KEY=abc123 \
  -n my-namespace

# Use in deployment
env:
  - name: DATABASE_PASSWORD
    valueFrom:
      secretKeyRef:
        name: my-app-secrets
        key: DATABASE_PASSWORD
```

## Rollback Procedures

### Rollback a Deployment

```bash
# View rollout history
kubectl rollout history deployment/my-app -n my-namespace

# Rollback to previous version
kubectl rollout undo deployment/my-app -n my-namespace

# Rollback to specific revision
kubectl rollout undo deployment/my-app --to-revision=3 -n my-namespace

# Verify rollback
kubectl rollout status deployment/my-app -n my-namespace
```

### Emergency Rollback Checklist

1. **Identify the issue:**
   ```bash
   kubectl logs -l app=my-app -n my-namespace --tail=100
   kubectl describe pods -l app=my-app -n my-namespace
   ```

2. **Execute rollback:**
   ```bash
   kubectl rollout undo deployment/my-app -n my-namespace
   ```

3. **Verify recovery:**
   ```bash
   kubectl get pods -n my-namespace
   curl https://my-app.company.com/healthz
   ```

4. **Notify team:**
   - Post in #incidents Slack channel
   - Update status page
   - Create post-mortem issue

## Debugging

### View Logs

```bash
# Recent logs
kubectl logs deployment/my-app -n my-namespace --tail=50

# Follow logs
kubectl logs -f deployment/my-app -n my-namespace

# Logs from specific pod
kubectl logs my-app-7d8f9c8b-xyz12 -n my-namespace

# Logs from previous container (if crashed)
kubectl logs my-app-7d8f9c8b-xyz12 -n my-namespace --previous
```

### Execute Commands in Pod

```bash
# Interactive shell
kubectl exec -it deployment/my-app -n my-namespace -- /bin/bash

# Run single command
kubectl exec deployment/my-app -n my-namespace -- curl localhost:8080/healthz
```

### Port Forwarding

For local testing:

```bash
# Forward pod port to local machine
kubectl port-forward deployment/my-app 8080:8080 -n my-namespace

# Access at http://localhost:8080
curl http://localhost:8080/healthz
```

## Production Checklist

Before deploying to production:

- [ ] Resource requests and limits configured
- [ ] Liveness and readiness probes configured
- [ ] Horizontal Pod Autoscaler configured (if needed)
- [ ] Monitoring alerts set up in Prometheus (see monitoring/prometheus.md)
- [ ] Grafana dashboard created (see monitoring/grafana.md)
- [ ] Secrets stored in Kubernetes Secrets (not ConfigMaps)
- [ ] Deployment tested in staging environment
- [ ] Rollback procedure documented and tested
- [ ] Team notified in #deployments Slack channel

## Common Issues

See [deployment/troubleshooting.md](troubleshooting.md) for solutions to common deployment problems.

## Related Documentation

- [AWS Infrastructure](aws.md) - AWS setup and configuration
- [Deployment Troubleshooting](troubleshooting.md) - Common issues and solutions
- [Prometheus Monitoring](../monitoring/prometheus.md) - Setting up metrics and alerts
- [Architecture Overview](../architecture/overview.md) - Platform architecture
