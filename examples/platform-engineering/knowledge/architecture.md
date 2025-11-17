# Platform Architecture Guide

**Version**: 0.1.0
**Last Updated**: 2025-11-17

This guide covers platform architecture decisions, design patterns, and trade-offs for building cloud-native systems on Kubernetes.

---

## Table of Contents

1. [Architecture Principles](#architecture-principles)
2. [Service Mesh Considerations](#service-mesh-considerations)
3. [Networking Patterns](#networking-patterns)
4. [Storage Strategies](#storage-strategies)
5. [Multi-Tenancy Approaches](#multi-tenancy-approaches)
6. [Scalability Patterns](#scalability-patterns)
7. [Architecture Decision Records](#architecture-decision-records)

---

## Architecture Principles

### Cloud-Native Design Principles

**1. Design for Failure**
- Assume components will fail
- Build resilience at every layer
- Use health checks, retries, circuit breakers
- Practice chaos engineering

**2. Scale Horizontally**
- Add more instances, not bigger instances
- Stateless services scale easily
- Use horizontal pod autoscaling

**3. Automate Everything**
- Infrastructure as Code
- GitOps for deployment
- Automated testing and validation
- Self-healing systems

**4. Observe and Monitor**
- Metrics, logs, and traces
- SLIs and SLOs
- Distributed tracing
- Alerting on symptoms, not causes

**5. Secure by Default**
- Principle of least privilege
- Encrypt in transit and at rest
- Network policies
- Pod security standards

### The Twelve-Factor App

Key principles for cloud-native applications:

1. **Codebase**: One codebase tracked in version control
2. **Dependencies**: Explicitly declare dependencies
3. **Config**: Store config in environment
4. **Backing Services**: Treat as attached resources
5. **Build, Release, Run**: Strictly separate stages
6. **Processes**: Execute as stateless processes
7. **Port Binding**: Export services via port binding
8. **Concurrency**: Scale out via process model
9. **Disposability**: Fast startup and graceful shutdown
10. **Dev/Prod Parity**: Keep environments similar
11. **Logs**: Treat logs as event streams
12. **Admin Processes**: Run as one-off processes

---

## Service Mesh Considerations

### What is a Service Mesh?

A dedicated infrastructure layer for handling service-to-service communication.

**Features**:
- Traffic management (routing, retries, timeouts)
- Security (mTLS, authorization)
- Observability (metrics, traces)
- Resilience (circuit breaking, rate limiting)

**Popular Options**:
- **Istio**: Feature-rich, complex, CNCF graduated
- **Linkerd**: Simpler, lightweight, CNCF graduated
- **Consul Connect**: From HashiCorp
- **AWS App Mesh**: AWS-managed

### Do You Need a Service Mesh?

**Consider a service mesh if**:
- ✅ Many microservices (10+)
- ✅ Need advanced traffic routing (canary, A/B testing)
- ✅ Require mTLS between all services
- ✅ Need distributed tracing
- ✅ Have polyglot architecture (multiple languages)

**Skip service mesh if**:
- ❌ Small number of services (< 10)
- ❌ Simple routing needs
- ❌ Team not ready for complexity
- ❌ Can achieve goals with simpler tools

### Service Mesh: Trade-offs

**Pros**:
- Security: mTLS automatically
- Observability: Metrics and tracing out-of-box
- Traffic control: Advanced routing, retries, timeouts
- Language-agnostic: Works with any language

**Cons**:
- Complexity: Steep learning curve
- Performance: Sidecar adds latency (~1-3ms)
- Resource usage: Sidecar in every pod
- Debugging: Additional layer to troubleshoot

### Istio Architecture

```
┌─────────────────────────────────────────────┐
│ Control Plane (istiod)                      │
│ - Service discovery                         │
│ - Configuration distribution                │
│ - Certificate management                    │
└────────────┬────────────────────────────────┘
             │ configures
             ▼
┌──────────────────────────────────────────────┐
│ Data Plane (Envoy sidecar proxies)          │
│                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ Pod A   │  │ Pod B   │  │ Pod C   │     │
│  │ ┌─────┐ │  │ ┌─────┐ │  │ ┌─────┐ │     │
│  │ │ App │ │  │ │ App │ │  │ │ App │ │     │
│  │ └──┬──┘ │  │ └──┬──┘ │  │ └──┬──┘ │     │
│  │ ┌──▼──┐ │  │ ┌──▼──┐ │  │ ┌──▼──┐ │     │
│  │ │Envoy│ │  │ │Envoy│ │  │ │Envoy│ │     │
│  │ └─────┘ │  │ └─────┘ │  │ └─────┘ │     │
│  └─────────┘  └─────────┘  └─────────┘     │
└──────────────────────────────────────────────┘
```

### Istio: Basic Setup

**Install Istio**:
```bash
# Download Istio
curl -L https://istio.io/downloadIstio | sh -
cd istio-1.20.0
export PATH=$PWD/bin:$PATH

# Install Istio
istioctl install --set profile=default -y

# Enable sidecar injection for namespace
kubectl label namespace default istio-injection=enabled

# Verify
kubectl get pods -n istio-system
```

**Traffic Management Example**:
```yaml
# VirtualService for canary deployment
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: my-app
spec:
  hosts:
  - my-app
  http:
  - match:
    - headers:
        user-type:
          exact: "beta"
    route:
    - destination:
        host: my-app
        subset: v2
  - route:
    - destination:
        host: my-app
        subset: v1
      weight: 90
    - destination:
        host: my-app
        subset: v2
      weight: 10
```

### When to Adopt Service Mesh

**Phase 1: No service mesh**
- Use native Kubernetes networking
- Ingress for external traffic
- Application-level retries and timeouts

**Phase 2: Evaluate service mesh**
- Pain points with current approach?
- Need for advanced traffic management?
- Security requirements (mTLS)?

**Phase 3: Adopt incrementally**
- Start with one namespace
- Enable sidecar injection
- Migrate one service at a time
- Learn and iterate

---

## Networking Patterns

### Ingress vs LoadBalancer vs NodePort

**ClusterIP** (default):
- Internal only
- Stable internal IP
- Use for: Inter-service communication

**NodePort**:
- Exposes on node IP:port
- Port range: 30000-32767
- Use for: Development, debugging

**LoadBalancer**:
- Cloud provider load balancer
- External IP assigned
- Use for: Individual service exposure (expensive at scale)

**Ingress**:
- HTTP/HTTPS routing
- Single load balancer for many services
- Host/path-based routing
- Use for: Production HTTP services (most common)

### Ingress Controllers

**Popular options**:
- **NGINX Ingress**: Most widely used, battle-tested
- **Traefik**: Easy to use, automatic HTTPS
- **HAProxy**: High performance
- **Kong**: API gateway features
- **Cloud-specific**: ALB (AWS), GLB (GCP), Application Gateway (Azure)

**NGINX Ingress Setup**:
```bash
# Install NGINX Ingress Controller
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace

# Verify
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

**Ingress Resource Example**:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-app
            port:
              number: 80
  - host: api.example.com
    http:
      paths:
      - path: /v1
        pathType: Prefix
        backend:
          service:
            name: my-api-v1
            port:
              number: 80
  tls:
  - hosts:
    - myapp.example.com
    - api.example.com
    secretName: tls-secret
```

### Network Policies

**Default behavior**: All pods can communicate with all pods.

**Network Policy** restricts traffic:

**Example: Allow only from specific namespace**:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
  namespace: backend
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: frontend
    ports:
    - protocol: TCP
      port: 8080
```

**Example: Deny all, allow specific**:
```yaml
# Deny all ingress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress

---
# Allow specific
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-specific
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: my-app
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
```

**Network Policy Best Practices**:
1. Start with deny-all, then allow specific
2. Use namespace isolation for different environments
3. Allow monitoring and logging systems
4. Document policies clearly
5. Test policies in non-prod first

### DNS and Service Discovery

**Kubernetes DNS**:
- CoreDNS provides service discovery
- Format: `<service>.<namespace>.svc.cluster.local`
- Short form within namespace: `<service>`

**Example DNS lookups**:
```bash
# Same namespace
curl http://api-service

# Different namespace
curl http://api-service.production.svc.cluster.local

# Full FQDN
curl http://api-service.production.svc.cluster.local.
```

**External DNS**:
- Automatically creates DNS records for Ingress/LoadBalancer
- Integrates with AWS Route53, Google Cloud DNS, etc.

---

## Storage Strategies

### Storage Types

**Ephemeral Storage**:
- Lifetime tied to pod
- Lost when pod deleted
- Use for: Caches, temporary files

**Persistent Storage**:
- Lifetime independent of pod
- Survives pod deletion
- Use for: Databases, file uploads

### Persistent Volumes (PV) and Claims (PVC)

**Architecture**:
```
PersistentVolumeClaim (PVC)
  ↓ binds to
PersistentVolume (PV)
  ↓ backed by
Storage (cloud disk, NFS, etc.)
```

**StorageClass** defines storage type:
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iops: "3000"
reclaimPolicy: Delete
allowVolumeExpansion: true
```

**PersistentVolumeClaim**:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 20Gi
```

**Using PVC in Pod**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: postgres
spec:
  containers:
  - name: postgres
    image: postgres:15
    volumeMounts:
    - name: data
      mountPath: /var/lib/postgresql/data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: postgres-pvc
```

### Access Modes

**ReadWriteOnce (RWO)**:
- Mounted read-write by single node
- Most common
- Use for: Databases (single instance)

**ReadOnlyMany (ROX)**:
- Mounted read-only by many nodes
- Use for: Shared static content

**ReadWriteMany (RWX)**:
- Mounted read-write by many nodes
- Requires special storage (NFS, EFS, GlusterFS)
- Use for: Shared file systems

### Storage Patterns

**Pattern 1: StatefulSet for Databases**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    spec:
      containers:
      - name: postgres
        image: postgres:15
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 20Gi
```

**Pattern 2: Shared File Storage (RWX)**
```yaml
# EFS-backed storage (AWS)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-files
spec:
  accessModes:
  - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 100Gi
```

**Pattern 3: Backup and Restore**
```bash
# Backup (example with postgres)
kubectl exec postgres-0 -- pg_dump mydb > backup.sql

# Restore
kubectl exec -i postgres-0 -- psql mydb < backup.sql

# For production: Use Velero for cluster-wide backup
```

### Storage Best Practices

1. **Use StorageClass with dynamic provisioning**: Don't manually create PVs
2. **Set appropriate reclaimPolicy**: `Retain` for production data, `Delete` for dev
3. **Enable volume expansion**: `allowVolumeExpansion: true`
4. **Monitor storage usage**: Alert before full
5. **Backup regularly**: Test restore procedures
6. **Choose right storage type**: Fast for databases, standard for bulk data

---

## Multi-Tenancy Approaches

### Multi-Tenancy Models

**Model 1: Namespace-per-Tenant**
- Logical isolation within cluster
- ResourceQuotas limit resources
- NetworkPolicies isolate traffic
- Use for: Internal teams, low-security requirements

**Model 2: Cluster-per-Tenant**
- Strong isolation via separate clusters
- Higher operational overhead
- Higher cost
- Use for: High-security requirements, customer-facing SaaS

**Model 3: Hybrid**
- Some tenants share namespace (trusted)
- Others get dedicated namespace or cluster (untrusted)
- Use for: Mixed trust levels

### Namespace Isolation

**Create namespace with quotas**:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: tenant-acme

---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: tenant-quota
  namespace: tenant-acme
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "50"
    services: "10"
    persistentvolumeclaims: "5"

---
apiVersion: v1
kind: LimitRange
metadata:
  name: tenant-limits
  namespace: tenant-acme
spec:
  limits:
  - max:
      memory: 2Gi
      cpu: "2"
    min:
      memory: 128Mi
      cpu: "100m"
    type: Container
```

**Network isolation**:
```yaml
# Deny all traffic to/from namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: tenant-acme
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress

---
# Allow egress to kube-dns
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: tenant-acme
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53
```

**RBAC isolation**:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: tenant-admin
  namespace: tenant-acme
rules:
- apiGroups: ["", "apps", "batch"]
  resources: ["*"]
  verbs: ["*"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: tenant-admin-binding
  namespace: tenant-acme
subjects:
- kind: User
  name: acme-admin
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: tenant-admin
  apiGroup: rbac.authorization.k8s.io
```

### Virtual Clusters

**vcluster**: Create virtual Kubernetes clusters inside namespaces.

**Benefits**:
- Full cluster isolation (tenants can't see each other)
- Each tenant gets own API server
- Lower cost than real clusters
- Still share node resources

**Install vcluster**:
```bash
# Install vcluster CLI
curl -s -L "https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-linux-amd64" | sudo install -c -m 0755 /dev/stdin /usr/local/bin/vcluster

# Create virtual cluster
vcluster create tenant-acme -n tenant-acme

# Connect to virtual cluster
vcluster connect tenant-acme -n tenant-acme

# Now kubectl commands go to virtual cluster
```

---

## Scalability Patterns

### Horizontal Pod Autoscaler (HPA)

**Scale based on CPU**:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

**Scale based on custom metrics**:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
```

**HPA Best Practices**:
1. Set reasonable min/max replicas
2. Use multiple metrics (CPU + custom)
3. Set resource requests (HPA needs them)
4. Add scale-down stabilization (prevent flapping)
5. Monitor scaling events

### Cluster Autoscaler

**Scales cluster nodes** based on pod resource needs.

**How it works**:
1. Pod cannot be scheduled (insufficient resources)
2. Cluster Autoscaler detects pending pods
3. Adds nodes to cluster
4. Pods get scheduled on new nodes

**Setup** (cloud-specific):
```yaml
# AWS example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
  namespace: kube-system
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: cluster-autoscaler
        image: k8s.gcr.io/autoscaling/cluster-autoscaler:v1.28.0
        command:
        - ./cluster-autoscaler
        - --cloud-provider=aws
        - --nodes=2:10:my-asg-name
```

**Scale-down**: Removes underutilized nodes after 10 minutes.

### Vertical Pod Autoscaler (VPA)

**Adjusts resource requests/limits** automatically.

**Use VPA when**:
- Hard to estimate resource needs
- Resource usage varies over time
- Want to optimize resource allocation

**Don't use VPA with HPA** (on same metric) - they conflict.

---

## Architecture Decision Records

### What are ADRs?

**Architecture Decision Record**: Document capturing:
- Context: What situation led to decision?
- Decision: What did we decide?
- Consequences: What are the trade-offs?

### ADR Template

```markdown
# ADR-001: Use Istio for Service Mesh

## Status
Accepted

## Context
We have 20+ microservices with complex routing needs:
- Need canary deployments for risk reduction
- Require mTLS between all services for security
- Want distributed tracing without application changes
- Multiple languages (Go, Python, Java)

Current state:
- Manual mTLS certificate management (error-prone)
- No distributed tracing
- Canary deployments require application logic

## Decision
Adopt Istio as our service mesh.

## Consequences

### Positive
- mTLS automatically between all services
- Distributed tracing out-of-box
- Advanced traffic routing (canary, A/B testing)
- Language-agnostic
- Industry standard with good community support

### Negative
- Complexity: Team needs training
- Performance: ~2ms latency per hop
- Resource usage: Sidecar per pod (~0.5 CPU, 128Mi memory)
- Debugging: Additional layer to understand

### Neutral
- Migration: Will roll out incrementally (one namespace at a time)
- Timeline: 3 months for full adoption
- Cost: ~15% increase in cluster resources

## Alternatives Considered

### Linkerd
- Pros: Simpler, lower resource usage
- Cons: Less mature, fewer features
- Why not: Need advanced traffic routing features

### No service mesh
- Pros: Simpler, no overhead
- Cons: Manual mTLS, no distributed tracing
- Why not: Security and observability requirements outweigh simplicity

## References
- [Istio documentation](https://istio.io/docs)
- [Performance benchmarks](link)
- [Team training plan](link)
```

### When to Write ADRs

**Write ADR for**:
- Infrastructure decisions (service mesh, ingress controller)
- Storage choices (database, cache)
- Deployment strategies
- Security approaches
- Monitoring/logging solutions

**Don't write ADR for**:
- Tactical implementation details
- Temporary workarounds
- Decisions easily reversible

---

## Quick Reference

### Architecture Checklist

**Reliability**:
- [ ] Health checks (liveness, readiness)
- [ ] Resource limits set
- [ ] Multiple replicas for high availability
- [ ] Graceful shutdown
- [ ] Circuit breakers for dependencies

**Security**:
- [ ] Network policies
- [ ] Pod security standards
- [ ] Secrets management
- [ ] RBAC configured
- [ ] Container images scanned

**Observability**:
- [ ] Metrics exposed
- [ ] Structured logging
- [ ] Distributed tracing (if microservices)
- [ ] Alerts configured
- [ ] Dashboards created

**Scalability**:
- [ ] Horizontal pod autoscaling
- [ ] Cluster autoscaling
- [ ] Stateless design
- [ ] Caching strategy
- [ ] Database optimization

**Operability**:
- [ ] GitOps deployment
- [ ] Rollback procedure documented
- [ ] Runbooks created
- [ ] On-call rotation defined
- [ ] Incident response process

---

**Related Documentation**:
- Deployment strategies: See deployment.md
- Configuration management: See configuration.md
- Monitoring setup: See monitoring.md
- Kubernetes fundamentals: See kubernetes.md
