# Deployment Strategies and Procedures

**Version**: 0.1.0
**Last Updated**: 2025-11-17

This guide covers deployment strategies, procedures, checklists, and rollback plans for safely deploying applications to Kubernetes.

---

## Table of Contents

1. [Deployment Strategies](#deployment-strategies)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Procedures](#deployment-procedures)
4. [Rollback Procedures](#rollback-procedures)
5. [Deployment Validation](#deployment-validation)
6. [Common Issues](#common-issues)

---

## Deployment Strategies

### Rolling Update (Default)

**Use Case**: Standard deployments where brief mixed versions are acceptable.

**How It Works**:
- Creates new pods with new version
- Gradually terminates old pods
- Maintains minimum availability throughout

**Configuration**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # Max pods above desired count
      maxUnavailable: 1  # Max pods below desired count
  template:
    spec:
      containers:
      - name: app
        image: my-app:v2
```

**Process**:
1. Creates 1 new pod (maxSurge=1)
2. Waits for new pod to be Ready
3. Terminates 1 old pod
4. Repeats until all pods are new version

**Pros**:
- Zero downtime
- Simple configuration
- Built-in Kubernetes feature
- Automatic rollback on failure

**Cons**:
- Mixed versions during rollout
- No traffic control
- Hard to validate before full rollout

**When to Use**:
- Low-risk deployments
- Services that handle mixed versions well
- Internal services with lenient SLAs

### Blue-Green Deployment

**Use Case**: Zero-downtime deployment with instant switch and easy rollback.

**How It Works**:
- Deploy new version (green) alongside old version (blue)
- Test green environment
- Switch traffic from blue to green
- Keep blue for rollback

**Implementation**:

1. **Deploy green version**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-green
  labels:
    app: my-app
    version: green
spec:
  replicas: 5
  selector:
    matchLabels:
      app: my-app
      version: green
  template:
    metadata:
      labels:
        app: my-app
        version: green
    spec:
      containers:
      - name: app
        image: my-app:v2
```

2. **Service initially pointing to blue**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
spec:
  selector:
    app: my-app
    version: blue  # Currently serving blue
  ports:
  - port: 80
    targetPort: 8080
```

3. **Switch to green**:
```bash
kubectl patch service my-app -p '{"spec":{"selector":{"version":"green"}}}'
```

4. **Rollback to blue if needed**:
```bash
kubectl patch service my-app -p '{"spec":{"selector":{"version":"blue"}}}'
```

**Pros**:
- Instant traffic switch
- Full testing before switch
- Instant rollback
- No mixed versions

**Cons**:
- Requires double resources during deployment
- Database migrations can be tricky
- More complex to manage

**When to Use**:
- Production services with strict SLAs
- Services where mixed versions cause issues
- When instant rollback is critical

### Canary Deployment

**Use Case**: Gradual rollout with monitoring to minimize risk.

**How It Works**:
- Deploy new version to small subset of traffic
- Monitor metrics
- Gradually increase traffic to new version
- Full rollout only if metrics are healthy

**Implementation**:

1. **Stable deployment** (90% of traffic):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-stable
spec:
  replicas: 9  # 90% of traffic
  selector:
    matchLabels:
      app: my-app
      track: stable
  template:
    metadata:
      labels:
        app: my-app
        track: stable
    spec:
      containers:
      - name: app
        image: my-app:v1
```

2. **Canary deployment** (10% of traffic):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-canary
spec:
  replicas: 1  # 10% of traffic
  selector:
    matchLabels:
      app: my-app
      track: canary
  template:
    metadata:
      labels:
        app: my-app
        track: canary
    spec:
      containers:
      - name: app
        image: my-app:v2
```

3. **Service selects both**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
spec:
  selector:
    app: my-app  # Matches both stable and canary
  ports:
  - port: 80
    targetPort: 8080
```

**Gradual Rollout Process**:
1. Deploy canary (10%)
2. Monitor for 15-30 minutes
3. If healthy, increase to 25%
4. Monitor for 15-30 minutes
5. If healthy, increase to 50%
6. Monitor for 15-30 minutes
7. If healthy, promote to 100%

**Scaling for traffic percentages**:
```bash
# 10% canary
kubectl scale deployment my-app-stable --replicas=9
kubectl scale deployment my-app-canary --replicas=1

# 25% canary
kubectl scale deployment my-app-stable --replicas=3
kubectl scale deployment my-app-canary --replicas=1

# 50% canary
kubectl scale deployment my-app-stable --replicas=5
kubectl scale deployment my-app-canary --replicas=5

# 100% canary (promote)
kubectl scale deployment my-app-stable --replicas=0
kubectl scale deployment my-app-canary --replicas=10
# Or update stable deployment to new version
```

**Pros**:
- Minimal blast radius
- Real production testing
- Data-driven rollout decisions
- Can detect issues early

**Cons**:
- Requires good monitoring
- Slower rollout
- More complex to orchestrate
- Requires service mesh or ingress for advanced routing

**When to Use**:
- High-risk deployments
- User-facing services
- Services with good observability
- When gradual validation is important

### Recreate Strategy

**Use Case**: Downtime acceptable, need clean state between versions.

**How It Works**:
- Terminate all old pods
- Wait for termination
- Create all new pods

**Configuration**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 5
  strategy:
    type: Recreate
  template:
    spec:
      containers:
      - name: app
        image: my-app:v2
```

**Pros**:
- Simple
- No mixed versions
- Clean state

**Cons**:
- Downtime during deployment
- All-or-nothing (no gradual rollout)

**When to Use**:
- Development/staging environments
- Batch processing jobs
- Services where downtime is acceptable
- Stateful applications with complex migration

---

## Pre-Deployment Checklist

### Planning Phase

- [ ] **Change approved** - Deployment reviewed and approved
- [ ] **Deployment window** - Scheduled during appropriate time
- [ ] **Stakeholders notified** - Teams aware of deployment
- [ ] **Rollback plan documented** - Clear steps to revert
- [ ] **Success criteria defined** - How to measure successful deployment

### Code & Build

- [ ] **Code reviewed** - Changes peer-reviewed
- [ ] **Tests passing** - Unit, integration, e2e tests green
- [ ] **Image built** - Container image built and tagged
- [ ] **Image scanned** - Security vulnerabilities checked
- [ ] **Image pushed** - Image in container registry

### Configuration

- [ ] **Manifests updated** - Kubernetes YAML reflects new version
- [ ] **ConfigMaps prepared** - Configuration changes ready
- [ ] **Secrets created** - New secrets created if needed
- [ ] **Resource limits set** - CPU/memory requests and limits defined
- [ ] **Environment variables verified** - All required env vars present

### Dependencies

- [ ] **Database migrations** - Schema changes applied or planned
- [ ] **Dependent services ready** - Upstream/downstream services compatible
- [ ] **Feature flags configured** - Flags set appropriately
- [ ] **API changes communicated** - Breaking changes documented

### Monitoring & Alerts

- [ ] **Dashboards ready** - Grafana dashboards for service metrics
- [ ] **Alerts configured** - Prometheus alerts for error rates, latency
- [ ] **Logs aggregated** - Logging pipeline working
- [ ] **Runbooks updated** - Troubleshooting docs current
- [ ] **On-call notified** - Oncall engineer aware of deployment

### Testing

- [ ] **Staging tested** - Deployment tested in staging environment
- [ ] **Load testing done** - Performance under load validated
- [ ] **Rollback tested** - Rollback procedure verified in staging
- [ ] **Health checks working** - Liveness and readiness probes validated

### Security ⚠️

- [ ] **Image scanned** - No critical/high vulnerabilities in container image
- [ ] **Secrets not in code** - No hardcoded passwords, API keys, or tokens
- [ ] **RBAC configured** - Service account with least privilege
- [ ] **Network policies** - Ingress/egress rules defined
- [ ] **Pod security standards** - SecurityContext configured (runAsNonRoot, readOnlyRootFilesystem)
- [ ] **TLS certificates valid** - HTTPS endpoints have valid certificates
- [ ] **Compliance verified** - Meets security/compliance requirements

**⚠️ Security Note**: Never skip security checks, even for "urgent" deployments. A compromised service is worse than a delayed deployment.

### Access & Permissions

- [ ] **Access verified** - Have kubectl access to prod cluster
- [ ] **Credentials available** - Docker registry, secrets, etc.
- [ ] **Permissions checked** - RBAC permissions to deploy

---

## Deployment Procedures

### Standard Rolling Deployment

**Use for**: Low-risk changes, services with good version compatibility.

**Steps**:

1. **Pre-deployment verification**:
   ```bash
   # Verify current state
   kubectl get deployment <deployment-name> -n <namespace>
   kubectl get pods -n <namespace> -l app=<app-name>

   # Check current version
   kubectl get deployment <deployment-name> -n <namespace> -o jsonpath='{.spec.template.spec.containers[0].image}'
   ```

2. **Update deployment**:
   ```bash
   # Option 1: Update image directly
   kubectl set image deployment/<deployment-name> \
     <container-name>=<new-image>:<new-tag> \
     -n <namespace>

   # Option 2: Apply manifest
   kubectl apply -f deployment.yaml -n <namespace>
   ```

3. **Monitor rollout**:
   ```bash
   # Watch rollout status
   kubectl rollout status deployment/<deployment-name> -n <namespace>

   # Watch pods being replaced
   kubectl get pods -n <namespace> -l app=<app-name> --watch

   # Check rollout history
   kubectl rollout history deployment/<deployment-name> -n <namespace>
   ```

4. **Verify deployment**:
   ```bash
   # Check all pods are running
   kubectl get pods -n <namespace> -l app=<app-name>

   # Verify new version
   kubectl get deployment <deployment-name> -n <namespace> \
     -o jsonpath='{.spec.template.spec.containers[0].image}'

   # Check pod logs for errors
   kubectl logs -n <namespace> -l app=<app-name> --tail=50
   ```

5. **Monitor metrics** (see monitoring.md for details):
   - Error rate
   - Request latency (p50, p95, p99)
   - Request rate
   - Resource usage (CPU, memory)

6. **Verify health checks**:
   ```bash
   # Test service endpoint
   kubectl port-forward -n <namespace> service/<service-name> 8080:80
   curl http://localhost:8080/health
   ```

### Canary Deployment Procedure

**Use for**: High-risk changes, user-facing services.

**Steps**:

1. **Deploy canary (10% traffic)**:
   ```bash
   kubectl apply -f deployment-canary.yaml -n <namespace>
   kubectl scale deployment <app-name>-stable --replicas=9 -n <namespace>
   kubectl scale deployment <app-name>-canary --replicas=1 -n <namespace>
   ```

2. **Monitor canary metrics** (15-30 minutes):
   - Compare error rates: canary vs stable
   - Compare latency: canary vs stable
   - Check for new errors in logs
   - Monitor resource usage

   ```bash
   # Check canary pod logs
   kubectl logs -n <namespace> -l app=<app-name>,track=canary --tail=100

   # Compare pod count
   kubectl get pods -n <namespace> -l app=<app-name>
   ```

3. **Decision point**:
   - **If metrics healthy**: Proceed to next stage
   - **If metrics degraded**: Rollback (see rollback procedures)

4. **Increase to 25%**:
   ```bash
   kubectl scale deployment <app-name>-stable --replicas=3 -n <namespace>
   kubectl scale deployment <app-name>-canary --replicas=1 -n <namespace>
   ```

5. **Monitor again** (15-30 minutes)

6. **Increase to 50%**:
   ```bash
   kubectl scale deployment <app-name>-stable --replicas=5 -n <namespace>
   kubectl scale deployment <app-name>-canary --replicas=5 -n <namespace>
   ```

7. **Monitor again** (15-30 minutes)

8. **Promote to 100%**:
   ```bash
   # Option 1: Scale down stable
   kubectl scale deployment <app-name>-stable --replicas=0 -n <namespace>
   kubectl scale deployment <app-name>-canary --replicas=10 -n <namespace>

   # Option 2: Update stable to new version
   kubectl set image deployment/<app-name>-stable \
     <container-name>=<new-image>:<new-tag> \
     -n <namespace>
   ```

9. **Clean up** (after 24 hours of stable operation):
   ```bash
   kubectl delete deployment <app-name>-canary -n <namespace>
   ```

### Blue-Green Deployment Procedure

**Use for**: Zero-downtime deployments, instant rollback requirement.

**Steps**:

1. **Verify blue (current) is healthy**:
   ```bash
   kubectl get deployment <app-name>-blue -n <namespace>
   kubectl get pods -n <namespace> -l app=<app-name>,version=blue
   ```

2. **Deploy green (new version)**:
   ```bash
   kubectl apply -f deployment-green.yaml -n <namespace>

   # Wait for all green pods to be ready
   kubectl wait --for=condition=available --timeout=300s \
     deployment/<app-name>-green -n <namespace>
   ```

3. **Test green environment**:
   ```bash
   # Port forward to green pods
   kubectl port-forward -n <namespace> \
     deployment/<app-name>-green 8080:8080

   # Run smoke tests
   curl http://localhost:8080/health
   curl http://localhost:8080/api/test

   # Check logs for errors
   kubectl logs -n <namespace> -l app=<app-name>,version=green --tail=50
   ```

4. **Switch traffic to green**:
   ```bash
   # Update service selector
   kubectl patch service <app-name> -n <namespace> -p \
     '{"spec":{"selector":{"version":"green"}}}'

   # Verify service endpoints
   kubectl get endpoints <app-name> -n <namespace>
   ```

5. **Monitor green in production** (15-30 minutes):
   - Watch error rates
   - Monitor latency
   - Check logs for errors
   - Verify user-facing functionality

6. **If successful, clean up blue**:
   ```bash
   # Keep blue for 24 hours, then delete
   kubectl delete deployment <app-name>-blue -n <namespace>
   ```

7. **If issues, rollback to blue** (see rollback procedures)

---

## Rollback Procedures

### Rolling Update Rollback

**Fast rollback** (use previous revision):
```bash
# Rollback to previous version
kubectl rollout undo deployment/<deployment-name> -n <namespace>

# Monitor rollback
kubectl rollout status deployment/<deployment-name> -n <namespace>

# Verify pods
kubectl get pods -n <namespace> -l app=<app-name>
```

**Rollback to specific revision**:
```bash
# View rollout history
kubectl rollout history deployment/<deployment-name> -n <namespace>

# Rollback to specific revision
kubectl rollout undo deployment/<deployment-name> \
  --to-revision=<revision-number> \
  -n <namespace>
```

**Manual rollback** (if rollout undo doesn't work):
```bash
# Update to known-good version
kubectl set image deployment/<deployment-name> \
  <container-name>=<old-image>:<old-tag> \
  -n <namespace>
```

### Canary Rollback

**Immediate rollback**:
```bash
# Scale canary to zero
kubectl scale deployment <app-name>-canary --replicas=0 -n <namespace>

# Scale stable back to full capacity
kubectl scale deployment <app-name>-stable --replicas=10 -n <namespace>

# Verify
kubectl get pods -n <namespace> -l app=<app-name>
```

### Blue-Green Rollback

**Instant rollback**:
```bash
# Switch service back to blue
kubectl patch service <app-name> -n <namespace> -p \
  '{"spec":{"selector":{"version":"blue"}}}'

# Verify endpoints
kubectl get endpoints <app-name> -n <namespace>

# Verify traffic is back on blue
kubectl logs -n <namespace> -l app=<app-name>,version=blue --tail=20
```

### Post-Rollback Actions

1. **Verify rollback successful**:
   ```bash
   kubectl get pods -n <namespace> -l app=<app-name>
   kubectl get deployment <deployment-name> -n <namespace>
   ```

2. **Check metrics return to normal**:
   - Error rate decreases
   - Latency returns to baseline
   - No new errors in logs

3. **Communicate rollback**:
   - Notify stakeholders
   - Update incident channel
   - Document reason for rollback

4. **Root cause analysis**:
   - What went wrong?
   - Why wasn't it caught in testing?
   - How to prevent in future?

---

## Deployment Validation

### Automated Checks

**Pod health**:
```bash
# All pods running and ready
kubectl get pods -n <namespace> -l app=<app-name>

# Check for restarts (should be 0)
kubectl get pods -n <namespace> -l app=<app-name> \
  -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}'

# Check pod age (should be recent)
kubectl get pods -n <namespace> -l app=<app-name> \
  -o jsonpath='{.items[*].status.startTime}'
```

**Deployment status**:
```bash
# Verify replicas match
kubectl get deployment <deployment-name> -n <namespace>
# DESIRED should equal CURRENT and READY

# Check rollout status
kubectl rollout status deployment/<deployment-name> -n <namespace>
# Should output: "successfully rolled out"
```

**Service endpoints**:
```bash
# Verify service has endpoints
kubectl get endpoints <service-name> -n <namespace>
# Should list all pod IPs

# Count endpoints
kubectl get endpoints <service-name> -n <namespace> \
  -o jsonpath='{.subsets[*].addresses[*].ip}' | wc -w
# Should match replica count
```

### Manual Validation

**Smoke tests**:
```bash
# Port forward to service
kubectl port-forward -n <namespace> service/<service-name> 8080:80

# Test health endpoint
curl http://localhost:8080/health
# Should return 200 OK

# Test core functionality
curl http://localhost:8080/api/users
curl -X POST http://localhost:8080/api/data -d '{"test":"value"}'
```

**Log verification**:
```bash
# Check for errors in recent logs
kubectl logs -n <namespace> -l app=<app-name> \
  --tail=100 | grep -i error

# Check for startup messages
kubectl logs -n <namespace> -l app=<app-name> \
  --tail=50 | grep -i "started\|ready\|listening"
```

**Resource usage**:
```bash
# Check if pods are within resource limits
kubectl top pods -n <namespace> -l app=<app-name>

# Compare to limits
kubectl describe pod <pod-name> -n <namespace> | grep -A 5 "Limits:"
```

### Metric Validation

**Key metrics to check** (see monitoring.md for Prometheus queries):

1. **Error rate**: Should be ≤ baseline
2. **Request latency (p95)**: Should be ≤ baseline + 10%
3. **Request rate**: Should match expected traffic
4. **Pod restarts**: Should be 0
5. **CPU usage**: Should be < 80% of limits
6. **Memory usage**: Should be < 90% of limits

**Validation period**:
- Rolling update: Monitor for 30 minutes
- Canary: Monitor each stage for 15-30 minutes
- Blue-green: Monitor green for 30 minutes before cutting traffic

---

## Common Issues

### Issue: Pods not starting

**Symptoms**:
- Pods stuck in `Pending` or `ContainerCreating`
- Deployment not progressing

**Causes**:
- Insufficient cluster resources
- Image pull issues
- ConfigMap/Secret missing
- Volume mount issues

**Diagnosis**:
```bash
kubectl describe pod <pod-name> -n <namespace>
# Look at Events section for errors
```

**Resolution**:
- See kubernetes.md → "Troubleshooting Pod States"

### Issue: Pods starting but failing health checks

**Symptoms**:
- Pods restart repeatedly
- Deployment shows pods not ready

**Causes**:
- Application not starting correctly
- Health check endpoint failing
- Health check timing too aggressive

**Diagnosis**:
```bash
# Check logs
kubectl logs <pod-name> -n <namespace>

# Check health check config
kubectl describe pod <pod-name> -n <namespace>
# Look at Liveness/Readiness probes
```

**Resolution**:
1. Check application logs for startup errors
2. Increase `initialDelaySeconds` if app needs more time
3. Verify health check endpoint works:
   ```bash
   kubectl exec <pod-name> -n <namespace> -- curl localhost:8080/health
   ```

### Issue: Rollout stuck

**Symptoms**:
- Rollout doesn't progress beyond certain point
- Old pods remain running

**Causes**:
- New pods failing to become ready
- Insufficient resources to create new pods
- PodDisruptionBudget preventing termination

**Diagnosis**:
```bash
# Check rollout status
kubectl rollout status deployment/<deployment-name> -n <namespace>

# Check pod status
kubectl get pods -n <namespace> -l app=<app-name>

# Check events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

**Resolution**:
1. Fix pod startup issues (see above)
2. Scale cluster if resource constrained
3. Check PodDisruptionBudget:
   ```bash
   kubectl get pdb -n <namespace>
   ```

### Issue: Increased error rate after deployment

**Symptoms**:
- Error rate spikes in monitoring
- User reports of failures

**Immediate action**:
1. **Rollback immediately** (see Rollback Procedures)
2. Notify stakeholders
3. Investigate root cause

**Common causes**:
- Code bugs in new version
- Configuration mismatch
- Database migration issues
- Dependency version incompatibility

**Investigation**:
```bash
# Check logs for errors
kubectl logs -n <namespace> -l app=<app-name> | grep -i error

# Compare old vs new pod logs
kubectl logs <old-pod> -n <namespace> > old.log
kubectl logs <new-pod> -n <namespace> > new.log
diff old.log new.log
```

### Issue: Service unreachable after deployment

**Symptoms**:
- Service returns connection refused
- Load balancer showing no healthy targets

**Causes**:
- Service selector mismatch with pod labels
- Port configuration incorrect
- Network policies blocking traffic

**Diagnosis**:
```bash
# Check service selector and pod labels
kubectl describe service <service-name> -n <namespace>
kubectl get pods -n <namespace> --show-labels

# Check service endpoints
kubectl get endpoints <service-name> -n <namespace>
# Should list pod IPs

# Test connectivity from another pod
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- /bin/bash
curl <service-name>.<namespace>.svc.cluster.local
```

**Resolution**:
1. Verify service selector matches pod labels
2. Verify port numbers match container ports
3. Check NetworkPolicies:
   ```bash
   kubectl get networkpolicies -n <namespace>
   ```

---

## Deployment Templates

### Basic Deployment Manifest

**⚠️ Security Best Practices in This Template**:
- `runAsNonRoot: true` - Never run containers as root
- `runAsUser: 1000` - Use non-privileged user ID
- `resources.limits` - Prevent resource exhaustion attacks
- `secrets` via `secretRef` - Never hardcode credentials
- Health probes configured - Detect compromised containers

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: production
  labels:
    app: my-app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
        version: v1.2.3
    spec:
      containers:
      - name: app
        image: myregistry/my-app:v1.2.3
        ports:
        - containerPort: 8080
          name: http
        env:
        - name: ENV
          value: "production"
        envFrom:
        - configMapRef:
            name: my-app-config
        - secretRef:
            name: my-app-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
          failureThreshold: 3
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
```

---

**Related Documentation**:
- Kubernetes operations: See kubernetes.md
- Monitoring deployments: See monitoring.md
- Troubleshooting: See troubleshooting.md
- Configuration management: See configuration.md
