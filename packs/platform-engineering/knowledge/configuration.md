# Configuration Management Guide

**Version**: 0.1.0
**Last Updated**: 2025-11-17

This guide covers configuration management patterns, GitOps workflows, secret management, and environment-specific configuration for cloud-native platforms.

---

## Table of Contents

1. [Configuration Principles](#configuration-principles)
2. [GitOps Workflow](#gitops-workflow)
3. [Environment Management](#environment-management)
4. [Secret Management](#secret-management)
5. [Configuration Validation](#configuration-validation)
6. [Common Patterns](#common-patterns)

---

## Configuration Principles

### The Twelve-Factor App: Configuration

**Store config in the environment**:
- Configuration varies between environments (dev, staging, prod)
- Code should be environment-agnostic
- Never commit secrets to source control

### Configuration Hierarchy

```
1. Default values (in code)
2. Configuration files (ConfigMaps)
3. Environment variables
4. Secrets (mounted or env vars)
5. Command-line flags (highest priority)
```

### Configuration vs Code

**Configuration** (belongs in ConfigMaps/Secrets):
- Environment-specific values (URLs, endpoints)
- Feature flags
- Resource limits
- Timeouts and retries
- Third-party API keys

**Code** (belongs in application):
- Business logic
- Algorithms
- Data structures
- Interface definitions

---

## GitOps Workflow

### What is GitOps?

**Core Principles**:
1. **Git as single source of truth** for declarative infrastructure
2. **Automated deployment** from Git changes
3. **Continuous reconciliation** between desired (Git) and actual (cluster) state
4. **Explicit change management** via pull requests

### GitOps Tools

**Popular options**:
- **Flux CD**: CNCF project, Kubernetes-native
- **Argo CD**: Feature-rich UI, application-centric
- **Fleet**: Rancher's GitOps tool
- **Jenkins X**: CI/CD with built-in GitOps

**This guide focuses on Argo CD** (widely adopted, good for learning).

### Repository Structure

**Option 1: Monorepo** (single repo for all environments)
```
gitops-repo/
├── apps/
│   ├── my-app/
│   │   ├── base/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── kustomization.yaml
│   │   ├── overlays/
│   │   │   ├── dev/
│   │   │   │   └── kustomization.yaml
│   │   │   ├── staging/
│   │   │   │   └── kustomization.yaml
│   │   │   └── prod/
│   │   │       └── kustomization.yaml
│   └── other-app/
├── infrastructure/
│   ├── monitoring/
│   └── ingress/
└── README.md
```

**Option 2: Repo-per-environment**
```
gitops-dev/        (dev cluster config)
gitops-staging/    (staging cluster config)
gitops-prod/       (prod cluster config - strict access control)
```

**Option 3: Repo-per-app**
```
app1-gitops/
app2-gitops/
infrastructure-gitops/
```

**Recommendation**: Start with monorepo, split if access control or scale requires it.

### Argo CD Setup

**Install Argo CD**:
```bash
# Create namespace
kubectl create namespace argocd

# Install Argo CD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods
kubectl wait --for=condition=available --timeout=300s \
  deployment/argocd-server -n argocd

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

# Port forward to UI
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Access at https://localhost:8080
# Username: admin
# Password: <from above>
```

**Create Application**:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/gitops-repo
    targetRevision: HEAD
    path: apps/my-app/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true      # Delete resources removed from git
      selfHeal: true   # Revert manual changes
    syncOptions:
    - CreateNamespace=true
```

**Apply Application**:
```bash
kubectl apply -f application.yaml -n argocd

# Watch sync status
kubectl get application my-app -n argocd -w

# Or in Argo CD UI
```

### GitOps Workflow Steps

**1. Make changes in Git**:
```bash
# Edit configuration
vim apps/my-app/overlays/prod/kustomization.yaml

# Commit changes
git add .
git commit -m "Update my-app to v1.2.3"
git push origin main
```

**2. Create pull request**:
- Changes reviewed by team
- CI runs validation checks
- Merge when approved

**3. Argo CD syncs automatically**:
- Detects Git changes (polls or webhook)
- Compares desired state (Git) vs actual state (cluster)
- Applies differences to cluster
- Reports sync status

**4. Verify deployment**:
```bash
# Check application status
kubectl get application my-app -n argocd

# View in Argo CD UI
# Shows sync status, health, and resource tree
```

### GitOps Best Practices

**1. Use kustomize or Helm**:
- **Kustomize**: Native to kubectl, simpler
- **Helm**: More features, templating, charts

**2. Separate environments in Git**:
- Use branches (dev, staging, prod) OR
- Use directories (overlays/dev, overlays/prod)

**3. Review all changes**:
- All changes go through PR review
- Even "small" config changes can break things

**4. Test in lower environments first**:
- dev → staging → prod progression
- Validate each stage before promoting

**5. Enable automated sync carefully**:
- Start with manual sync to learn
- Enable auto-sync for dev/staging
- Consider manual approval for prod

**6. Monitor sync status**:
- Alert on sync failures
- Review out-of-sync applications regularly

---

## Environment Management

### Environment-Specific Configuration

**Using Kustomize**:

**Base configuration** (apps/my-app/base/deployment.yaml):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 2  # Default
  template:
    spec:
      containers:
      - name: app
        image: my-app:latest  # Will be overridden
        env:
        - name: LOG_LEVEL
          value: "info"  # Default
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
```

**Dev overlay** (apps/my-app/overlays/dev/kustomization.yaml):
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: dev

bases:
- ../../base

images:
- name: my-app
  newTag: dev-latest

patches:
- patch: |-
    - op: replace
      path: /spec/replicas
      value: 1
  target:
    kind: Deployment
    name: my-app

configMapGenerator:
- name: my-app-config
  literals:
  - LOG_LEVEL=debug
  - API_ENDPOINT=https://api-dev.example.com
```

**Prod overlay** (apps/my-app/overlays/prod/kustomization.yaml):
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: production

bases:
- ../../base

images:
- name: my-app
  newTag: v1.2.3  # Specific version for prod

patches:
- patch: |-
    - op: replace
      path: /spec/replicas
      value: 5
  target:
    kind: Deployment
    name: my-app

configMapGenerator:
- name: my-app-config
  literals:
  - LOG_LEVEL=warn
  - API_ENDPOINT=https://api.example.com

resources:
- ingress.yaml  # Prod-only resources
```

**Preview result**:
```bash
# See what would be applied
kubectl kustomize apps/my-app/overlays/dev
kubectl kustomize apps/my-app/overlays/prod

# Apply directly (without GitOps)
kubectl apply -k apps/my-app/overlays/dev
```

### Feature Flags

**Pattern 1: Environment Variable**
```yaml
env:
- name: ENABLE_NEW_FEATURE
  value: "true"
```

**Pattern 2: ConfigMap**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: feature-flags
data:
  features.yaml: |
    new_feature: true
    experimental_ui: false
    beta_api: true
```

**Pattern 3: External Service** (LaunchDarkly, Split.io)
- More dynamic, can change without redeployment
- Better for A/B testing, gradual rollouts
- Requires additional service

### Configuration Drift Detection

**What is drift?**
Manual changes to cluster that don't match Git (source of truth).

**Argo CD drift detection**:
- Compares Git manifest with live cluster state
- Shows differences in UI
- Can auto-revert with `selfHeal: true`

**View drift**:
```bash
# Check application sync status
kubectl get application my-app -n argocd

# If OutOfSync, view diff
argocd app diff my-app

# Or in Argo CD UI: Application → Diff
```

**Handle drift**:
```bash
# Option 1: Sync (apply Git state to cluster)
argocd app sync my-app

# Option 2: Update Git to match cluster (if manual change was correct)
# Extract current state and commit to Git
```

---

## Secret Management

### The Problem

**Never commit secrets to Git**:
- Secrets in Git = security risk
- Even in private repos
- Even if "encrypted" (keys often leaked)

### Secret Management Solutions

**Option 1: External Secret Operator**

Use Kubernetes operator to sync secrets from external vault.

**Example with AWS Secrets Manager**:
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: my-app-secrets
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: my-app-secrets
    creationPolicy: Owner
  data:
  - secretKey: database-password
    remoteRef:
      key: prod/my-app/database
      property: password
  - secretKey: api-key
    remoteRef:
      key: prod/my-app/api
      property: key
```

**Supported backends**:
- AWS Secrets Manager
- AWS Parameter Store
- Azure Key Vault
- Google Secret Manager
- HashiCorp Vault
- 1Password

**Benefits**:
- Secrets stored securely in vault
- Rotation handled by vault
- Access control via vault
- Audit logging

**Setup External Secrets Operator**:
```bash
# Install operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

# Create SecretStore (example for AWS)
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-west-2
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
EOF
```

**Option 2: Sealed Secrets**

Encrypt secrets so they can be safely stored in Git.

**How it works**:
1. Sealed Secrets controller generates key pair
2. You encrypt secrets with public key (creates SealedSecret)
3. Commit SealedSecret to Git
4. Controller decrypts with private key, creates Secret in cluster

**Install Sealed Secrets**:
```bash
# Install controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Install kubeseal CLI
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-linux-amd64 -O kubeseal
chmod +x kubeseal
sudo mv kubeseal /usr/local/bin/
```

**Create Sealed Secret**:
```bash
# Create secret manifest (don't commit!)
kubectl create secret generic my-app-secrets \
  --from-literal=database-password='supersecret' \
  --from-literal=api-key='12345' \
  --dry-run=client -o yaml > secret.yaml

# Seal it
kubeseal -f secret.yaml -w sealed-secret.yaml

# Commit sealed secret to Git
git add sealed-secret.yaml
git commit -m "Add my-app secrets"
git push
```

**sealed-secret.yaml** (safe to commit):
```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: my-app-secrets
  namespace: production
spec:
  encryptedData:
    database-password: AgByhF7T... (encrypted)
    api-key: AgCJK8x... (encrypted)
```

**Option 3: SOPS (Secrets OPerationS)**

Encrypt YAML files with cloud KMS keys.

**Install SOPS**:
```bash
# Install SOPS
wget https://github.com/mozilla/sops/releases/download/v3.8.1/sops-v3.8.1.linux.amd64
chmod +x sops-v3.8.1.linux.amd64
sudo mv sops-v3.8.1.linux.amd64 /usr/local/bin/sops
```

**Encrypt secret**:
```bash
# Create secret file
cat > secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: my-app-secrets
stringData:
  database-password: supersecret
  api-key: 12345
EOF

# Encrypt with AWS KMS
sops --encrypt --kms 'arn:aws:kms:us-west-2:111122223333:key/abcd-1234' secret.yaml > secret.enc.yaml

# Commit encrypted file
git add secret.enc.yaml
```

**Decrypt and apply**:
```bash
# Decrypt and apply
sops --decrypt secret.enc.yaml | kubectl apply -f -

# Or with Argo CD + SOPS plugin
```

### Secret Management Best Practices

1. **Rotate secrets regularly**: Monthly or quarterly
2. **Least privilege**: Only give access to secrets that are needed
3. **Separate secrets by environment**: Dev secrets ≠ prod secrets
4. **Audit access**: Log who accesses secrets and when
5. **Use short-lived credentials**: When possible (e.g., IRSA, Workload Identity)
6. **Never log secrets**: Ensure secrets aren't accidentally logged
7. **Use volume mounts for sensitive files**: Safer than environment variables

### Injecting Secrets into Pods

**Option 1: Environment Variables**
```yaml
env:
- name: DATABASE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: my-app-secrets
      key: database-password
```

**Option 2: Volume Mounts** (recommended for files)
```yaml
volumes:
- name: secrets
  secret:
    secretName: my-app-secrets
volumeMounts:
- name: secrets
  mountPath: /etc/secrets
  readOnly: true

# Accessible as:
# /etc/secrets/database-password
# /etc/secrets/api-key
```

**Option 3: Init Container** (for complex processing)
```yaml
initContainers:
- name: fetch-secrets
  image: my-secret-fetcher:v1
  command: ["/fetch-and-write-secrets.sh"]
  volumeMounts:
  - name: secrets
    mountPath: /secrets
```

---

## Configuration Validation

### Pre-Deployment Validation

**1. Syntax validation**:
```bash
# Validate YAML syntax
kubectl apply --dry-run=client -f deployment.yaml

# Validate Kustomize build
kubectl kustomize apps/my-app/overlays/prod

# Validate Helm chart
helm lint my-chart/
helm template my-chart/ | kubectl apply --dry-run=client -f -
```

**2. Policy validation** (Kyverno, OPA):
```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: enforce
  rules:
  - name: check-resource-limits
    match:
      resources:
        kinds:
        - Pod
    validate:
      message: "Resource limits are required"
      pattern:
        spec:
          containers:
          - resources:
              limits:
                memory: "?*"
                cpu: "?*"
```

**3. Security scanning**:
```bash
# Scan for security issues
kubesec scan deployment.yaml

# Check for misconfigurations
checkov -f deployment.yaml
```

### CI/CD Validation Pipeline

**Example GitHub Actions workflow**:
```yaml
name: Validate Config
on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2

    - name: Validate Kubernetes manifests
      run: |
        kubectl apply --dry-run=client -f apps/

    - name: Validate Kustomize
      run: |
        kubectl kustomize apps/my-app/overlays/prod

    - name: Run Kyverno policies
      run: |
        kyverno apply policies/ --resource apps/

    - name: Security scan
      run: |
        kubesec scan apps/**/*.yaml
```

---

## Common Patterns

### Pattern: 12-Factor Config

**Store config in environment**:
```yaml
env:
- name: DATABASE_URL
  valueFrom:
    configMapKeyRef:
      name: my-app-config
      key: database-url
- name: LOG_LEVEL
  valueFrom:
    configMapKeyRef:
      name: my-app-config
      key: log-level
- name: API_KEY
  valueFrom:
    secretKeyRef:
      name: my-app-secrets
      key: api-key
```

### Pattern: Config File Mounting

**For applications that need config files**:
```yaml
volumes:
- name: config
  configMap:
    name: my-app-config
volumeMounts:
- name: config
  mountPath: /etc/config
  readOnly: true

# Creates files:
# /etc/config/app.yaml
# /etc/config/database.yaml
```

**ConfigMap with files**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
data:
  app.yaml: |
    server:
      port: 8080
      host: 0.0.0.0
    features:
      new_ui: true
  database.yaml: |
    host: postgres.default.svc.cluster.local
    port: 5432
    database: myapp
```

### Pattern: Immutable Configuration

**Mark ConfigMaps/Secrets as immutable**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config-v2
immutable: true
data:
  config.yaml: |
    setting: value
```

**Benefits**:
- Prevents accidental changes
- Improves performance (kubelet doesn't watch)
- Forces versioning (create new ConfigMap for changes)

**Versioning approach**:
```
my-app-config-v1
my-app-config-v2  # New version
my-app-config-v3
```

Update deployment to reference new version.

### Pattern: Dynamic Configuration Reload

**Option 1: Watch ConfigMap** (in application code):
- Application watches for ConfigMap changes
- Reloads config without restart

**Option 2: Sidecar pattern**:
- Sidecar watches ConfigMap
- Writes to shared volume
- Application reads from shared volume

**Option 3: Reloader** (Stakater Reloader):
```bash
# Install Reloader
kubectl apply -f https://raw.githubusercontent.com/stakater/Reloader/master/deployments/kubernetes/reloader.yaml

# Annotate deployment
kubectl annotate deployment my-app \
  reloader.stakater.com/auto="true"

# Now ConfigMap/Secret changes trigger rolling restart
```

### Pattern: Multi-Environment Values

**Using Helm values**:

**values-dev.yaml**:
```yaml
replicaCount: 1
image:
  tag: dev-latest
resources:
  limits:
    memory: 256Mi
```

**values-prod.yaml**:
```yaml
replicaCount: 5
image:
  tag: v1.2.3
resources:
  limits:
    memory: 1Gi
```

**Deploy**:
```bash
helm install my-app ./chart -f values-dev.yaml
helm install my-app ./chart -f values-prod.yaml
```

---

## Quick Reference

### ConfigMap Commands

```bash
# Create from literal
kubectl create configmap my-config --from-literal=key=value

# Create from file
kubectl create configmap my-config --from-file=config.yaml

# Create from directory
kubectl create configmap my-config --from-file=config/

# View ConfigMap
kubectl get configmap my-config -o yaml

# Edit ConfigMap
kubectl edit configmap my-config

# Delete ConfigMap
kubectl delete configmap my-config
```

### Secret Commands

```bash
# Create generic secret
kubectl create secret generic my-secret --from-literal=password=secret

# Create from file
kubectl create secret generic my-secret --from-file=key.pem

# Create TLS secret
kubectl create secret tls my-tls --cert=cert.pem --key=key.pem

# Create Docker registry secret
kubectl create secret docker-registry my-registry \
  --docker-server=registry.example.com \
  --docker-username=user \
  --docker-password=pass

# View secret (base64 encoded)
kubectl get secret my-secret -o yaml

# Decode secret
kubectl get secret my-secret -o jsonpath='{.data.password}' | base64 -d
```

### Kustomize Commands

```bash
# Preview kustomization
kubectl kustomize overlays/prod

# Apply kustomization
kubectl apply -k overlays/prod

# Diff kustomization
kubectl diff -k overlays/prod
```

---

**Related Documentation**:
- Deployment procedures: See deployment.md
- Kubernetes concepts: See kubernetes.md
- Architecture patterns: See architecture.md
- GitOps tools: See tool-specific documentation
