# Getting Started with Platform Engineering

**🎯 Goal**: Deploy your first service safely to production in your first week

**⏱️ Time Investment**:
- First 30 minutes: Setup and validation
- First day: Deploy to development
- First week: Deploy to production

---

## Prerequisites Checklist

Before you begin, ensure you have:

- [ ] `kubectl` installed and configured
- [ ] Access to at least one Kubernetes cluster
- [ ] Basic understanding of containers and Docker
- [ ] Familiarity with YAML configuration
- [ ] Git installed and GitHub/GitLab account
- [ ] Text editor (VS Code recommended)

**Validation**:
```bash
# Check kubectl works
kubectl version

# Check cluster access
kubectl get nodes

# Check git works
git --version
```

✅ All commands successful? You're ready to start!

---

## Your First 30 Minutes: Quick Wins

### 🌟 Golden Path: Deploy a Simple Application

**Start here** if you're new to Kubernetes platform engineering.

#### Step 1: Create a Simple Deployment (5 min)

```bash
# Create namespace
kubectl create namespace my-first-app

# Create deployment
kubectl create deployment nginx \
  --image=nginx:1.21 \
  --replicas=2 \
  -n my-first-app

# Verify pods are running
kubectl get pods -n my-first-app
```

**Expected output**: 2 nginx pods in "Running" state

**❌ Troubleshooting**: Pods not running?
- See [kubernetes.md → Troubleshooting Pod States](knowledge/kubernetes.md#troubleshooting-pod-states)

#### Step 2: Expose Your Service (5 min)

```bash
# Create service
kubectl expose deployment nginx \
  --port=80 \
  --target-port=80 \
  --type=ClusterIP \
  -n my-first-app

# Verify service
kubectl get svc -n my-first-app

# Test (from within cluster)
kubectl run test-pod --rm -it --image=curlimages/curl -n my-first-app -- curl nginx
```

**Expected output**: nginx welcome page HTML

#### Step 3: Monitor Your Application (10 min)

```bash
# Check pod status
kubectl get pods -n my-first-app

# Check pod logs
kubectl logs -n my-first-app -l app=nginx

# Check resource usage
kubectl top pods -n my-first-app

# Watch for events
kubectl get events -n my-first-app --sort-by='.lastTimestamp'
```

**✅ Success Criteria**:
- [ ] Pods are running
- [ ] Service is accessible
- [ ] Logs show requests
- [ ] No error events

**🎉 Congratulations!** You've deployed your first application to Kubernetes.

#### Step 4: Clean Up (5 min)

```bash
# Delete everything
kubectl delete namespace my-first-app

# Verify deletion
kubectl get namespace my-first-app
# Should show "NotFound"
```

---

## Your First Day: Structured Deployment

Now that you've done a quick deployment, let's do it **the right way** with proper structure.

### 🌟 Golden Path: GitOps Deployment

**Learn**: How platform teams actually deploy services in production

**Time**: 2-3 hours

### Phase 1: Setup GitOps Repository (30 min)

```bash
# Create git repository
mkdir my-platform-apps
cd my-platform-apps
git init

# Create directory structure (monorepo - RECOMMENDED)
mkdir -p apps/nginx/{base,overlays/dev,overlays/prod}
```

**Structure**:
```
my-platform-apps/
├── apps/
│   └── nginx/
│       ├── base/               # Common configuration
│       │   ├── deployment.yaml
│       │   ├── service.yaml
│       │   └── kustomization.yaml
│       └── overlays/
│           ├── dev/            # Dev-specific
│           │   └── kustomization.yaml
│           └── prod/           # Prod-specific
│               └── kustomization.yaml
└── README.md
```

**Why this structure?** See [configuration.md → GitOps Workflow](knowledge/configuration.md#gitops-workflow)

### Phase 2: Create Base Configuration (20 min)

**File: apps/nginx/base/deployment.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  replicas: 2  # Will be overridden in overlays
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "100m"
          limits:
            memory: "128Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
```

**File: apps/nginx/base/service.yaml**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx
spec:
  selector:
    app: nginx
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
```

**File: apps/nginx/base/kustomization.yaml**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
- service.yaml
```

### Phase 3: Create Environment Overlays (20 min)

**File: apps/nginx/overlays/dev/kustomization.yaml**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: dev

bases:
- ../../base

patches:
- patch: |-
    - op: replace
      path: /spec/replicas
      value: 1
  target:
    kind: Deployment
    name: nginx
```

**File: apps/nginx/overlays/prod/kustomization.yaml**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: production

bases:
- ../../base

patches:
- patch: |-
    - op: replace
      path: /spec/replicas
      value: 3
  target:
    kind: Deployment
    name: nginx
```

### Phase 4: Deploy to Dev (10 min)

```bash
# Preview what will be deployed
kubectl kustomize apps/nginx/overlays/dev

# Create namespace
kubectl create namespace dev

# Deploy to dev
kubectl apply -k apps/nginx/overlays/dev

# Verify
kubectl get all -n dev
```

**✅ Validation**:
- [ ] 1 nginx pod running (dev uses 1 replica)
- [ ] Service created
- [ ] No errors in events

### Phase 5: Commit to Git (10 min)

```bash
# Add files
git add .

# Commit
git commit -m "Add nginx application with dev/prod overlays"

# Push to GitHub/GitLab
git remote add origin <your-repo-url>
git push -u origin main
```

**🎉 First Day Complete!**

You now have:
- ✅ Proper GitOps repository structure
- ✅ Environment-specific configurations
- ✅ Version-controlled infrastructure
- ✅ Foundation for production deployments

---

## Your First Week: Production Deployment

**Time**: 5-8 hours spread over the week

### Day 2: Monitoring Setup (2 hours)

**Why first?** You need visibility before deploying to production.

1. **Install monitoring stack** → [monitoring.md → Prometheus Setup](knowledge/monitoring.md#prometheus-setup)
2. **Create dashboards** → [monitoring.md → Grafana Dashboards](knowledge/monitoring.md#grafana-dashboards)
3. **Set up alerts** → [monitoring.md → Alert Configuration](knowledge/monitoring.md#alert-configuration)

**⚠️ Security Note**: Install monitoring in dedicated namespace with restricted access.

### Day 3: Deployment Strategy (2 hours)

**Why canary?** Safest way to deploy to production for first time.

1. **Learn canary deployments** → [deployment.md → Canary Deployment](knowledge/deployment.md#canary-deployment)
2. **Prepare rollback plan** → [deployment.md → Rollback Procedures](knowledge/deployment.md#rollback-procedures)
3. **Complete pre-deployment checklist** → [deployment.md → Pre-Deployment Checklist](knowledge/deployment.md#pre-deployment-checklist)

### Day 4: Production Deployment (2 hours)

**🌟 Golden Path: Safe Production Deployment**

```bash
# 1. Create production namespace
kubectl create namespace production

# 2. Deploy canary (10% traffic)
kubectl apply -k apps/nginx/overlays/prod

# Scale to 10% (if you have 10 total replicas, 1 is canary)
kubectl scale deployment nginx --replicas=1 -n production

# 3. Monitor for 30 minutes
# Check Grafana dashboards
# Watch for errors in logs
kubectl logs -n production -l app=nginx --follow

# 4. If healthy, scale up to 100%
kubectl scale deployment nginx --replicas=3 -n production
```

**✅ Production Checklist**:
- [ ] Monitoring dashboards show healthy metrics
- [ ] No errors in logs
- [ ] Rollback plan documented
- [ ] Team notified of deployment
- [ ] Incident response plan ready

### Day 5: Incident Preparedness (1 hour)

**Why?** Production breaks. Be prepared.

1. **Learn incident response** → [incident-response.md](knowledge/incident-response.md)
2. **Review runbooks** → [incident-response.md → Runbook Organization](knowledge/incident-response.md#runbook-organization)
3. **Practice rollback**:
   ```bash
   # Rollback deployment
   kubectl rollout undo deployment/nginx -n production

   # Verify rollback
   kubectl rollout status deployment/nginx -n production
   ```

**🎉 First Week Complete!**

You are now a practicing platform engineer with:
- ✅ Production deployment experience
- ✅ Monitoring and observability
- ✅ Incident response knowledge
- ✅ Safe deployment practices

---

## Learning Paths by Persona

### 👶 Junior Platform Engineer (< 1 year K8s)

**Your path**: Follow this guide exactly, top to bottom

**Focus on**:
- Kubernetes basics → [kubernetes.md](knowledge/kubernetes.md)
- Deployment fundamentals → [deployment.md](knowledge/deployment.md)
- Basic troubleshooting → [troubleshooting.md](knowledge/troubleshooting.md)

**Skip for now**:
- Service mesh decisions
- Advanced architecture patterns
- Multi-tenancy strategies

### 🧑‍💻 Mid-Level Platform Engineer (1-3 years)

**Your path**: Skim basics, focus on production practices

**Focus on**:
- Deployment strategies (canary, blue-green) → [deployment.md](knowledge/deployment.md)
- Monitoring and SLOs → [monitoring.md](knowledge/monitoring.md)
- Incident response → [incident-response.md](knowledge/incident-response.md)
- GitOps workflows → [configuration.md](knowledge/configuration.md)

**Explore**:
- Architecture decisions → [architecture.md](knowledge/architecture.md)
- Service mesh evaluation → [architecture.md → Service Mesh](knowledge/architecture.md#service-mesh-considerations)

### 🎓 Senior SRE/Platform Engineer (3+ years)

**Your path**: Use as reference, focus on advanced topics

**Focus on**:
- Architecture patterns → [architecture.md](knowledge/architecture.md)
- Platform design decisions → [architecture.md → ADRs](knowledge/architecture.md#architecture-decision-records)
- Advanced troubleshooting → [troubleshooting.md → Diagnostic Decision Trees](knowledge/troubleshooting.md#diagnostic-decision-trees)

**Contribute**:
- Share your production experience
- Improve runbooks and procedures
- Add case studies

---

## Next Steps

After completing this guide, explore:

1. **Configuration Management** → [configuration.md](knowledge/configuration.md)
   - Secret management
   - Environment configuration
   - GitOps automation

2. **Architecture Patterns** → [architecture.md](knowledge/architecture.md)
   - Service mesh evaluation
   - Storage strategies
   - Multi-tenancy

3. **Advanced Troubleshooting** → [troubleshooting.md](knowledge/troubleshooting.md)
   - Complex failure patterns
   - Performance debugging
   - Network troubleshooting

---

## Common Pitfalls to Avoid

### ❌ Don't Skip Monitoring

**Mistake**: Deploy without monitoring, troubleshoot blindly

**Fix**: Always set up monitoring first (Day 2 in this guide)

### ❌ Don't Deploy to Production First

**Mistake**: "It's just a small change, deploy to prod"

**Fix**: Always test in dev first, even for "small" changes

### ❌ Don't Ignore Resource Limits

**Mistake**: Deploy without memory/CPU limits, get OOMKilled

**Fix**: Always set requests and limits (included in examples above)

### ❌ Don't Skip Rollback Planning

**Mistake**: No rollback plan, panic when deployment fails

**Fix**: Document rollback before deploying (included in checklists)

### ❌ Don't Commit Secrets to Git

**Mistake**: Add database password to YAML, commit to repo

**Fix**: Use secret management → [configuration.md → Secret Management](knowledge/configuration.md#secret-management)

**⚠️ Security**: If you've committed a secret, consider it compromised. Rotate immediately.

---

## Getting Help

### 📚 Documentation

- Start with this guide
- Explore linked documents
- Use Quick Reference sections

### 🐛 Troubleshooting

- Check [troubleshooting.md](knowledge/troubleshooting.md) first
- Use diagnostic decision trees
- Check common issues sections

### 💬 Community

- GitHub Discussions: [Link to discussions]
- Slack channels: #platform-engineering
- Office hours: [If applicable]

### 🆘 Emergency

- Production incident? → [incident-response.md](knowledge/incident-response.md)
- Follow P0/P1 procedures
- Don't panic, follow the runbook

---

## Success Milestones

Track your progress:

- [ ] **30 Minutes**: Deployed first app to Kubernetes
- [ ] **1 Day**: Created GitOps repository structure
- [ ] **1 Week**: Deployed to production with monitoring
- [ ] **1 Month**: Responded to first incident successfully
- [ ] **3 Months**: Contributing to platform improvements
- [ ] **6 Months**: Mentoring other platform engineers

---

## Feedback

**Was this guide helpful?**

- ✅ Yes → Share what worked well in [GitHub Discussions]
- ❌ No → Tell us how to improve in [GitHub Issues]
- 🤔 Partially → Suggest specific improvements

Your feedback makes this guide better for everyone!

---

**Ready to begin?** Start with [Your First 30 Minutes](#your-first-30-minutes-quick-wins) above.

**Questions?** Check the [FAQ](#) or ask in [GitHub Discussions](#).

**Good luck, and welcome to platform engineering! 🚀**
