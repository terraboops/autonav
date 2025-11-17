# Kubernetes Operations Guide

**Version**: 0.1.0
**Last Updated**: 2025-11-17

This guide covers essential Kubernetes operations, troubleshooting, and best practices for platform engineers.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Essential kubectl Commands](#essential-kubectl-commands)
3. [Pod Management](#pod-management)
4. [Troubleshooting Pod States](#troubleshooting-pod-states)
5. [Service and Networking](#service-and-networking)
6. [Configuration Management](#configuration-management)
7. [Resource Management](#resource-management)
8. [RBAC and Security](#rbac-and-security)
9. [Common Workflows](#common-workflows)

---

## Core Concepts

### Kubernetes Resource Hierarchy

```
Cluster
├── Namespaces (logical isolation)
│   ├── Pods (smallest deployable unit)
│   │   └── Containers (application runtime)
│   ├── Services (stable networking)
│   ├── Deployments (declarative pod management)
│   ├── ConfigMaps (configuration data)
│   ├── Secrets (sensitive data)
│   └── Ingress (HTTP routing)
```

### Pod Lifecycle

1. **Pending**: Pod accepted but not yet scheduled
2. **Running**: Pod bound to node, containers running
3. **Succeeded**: All containers terminated successfully
4. **Failed**: All containers terminated, at least one failed
5. **Unknown**: Pod state cannot be determined

### Container States

- **Waiting**: Container not yet running (pulling image, waiting for dependencies)
- **Running**: Container executing normally
- **Terminated**: Container finished execution or was killed

---

## Essential kubectl Commands

### Cluster Information

```bash
# View cluster info
kubectl cluster-info

# View nodes
kubectl get nodes
kubectl describe node <node-name>

# View all resources in namespace
kubectl get all -n <namespace>

# View resources across all namespaces
kubectl get pods --all-namespaces
kubectl get pods -A  # shorthand
```

### Pod Operations

```bash
# List pods
kubectl get pods
kubectl get pods -n <namespace>
kubectl get pods -o wide  # show more details (node, IP)

# Describe pod (detailed info)
kubectl describe pod <pod-name>

# Get pod logs
kubectl logs <pod-name>
kubectl logs <pod-name> -c <container-name>  # multi-container pod
kubectl logs <pod-name> --previous  # logs from previous crashed container
kubectl logs <pod-name> --follow  # stream logs

# Execute command in pod
kubectl exec <pod-name> -- <command>
kubectl exec -it <pod-name> -- /bin/bash  # interactive shell

# Port forwarding
kubectl port-forward <pod-name> <local-port>:<pod-port>
```

### Deployment Operations

```bash
# List deployments
kubectl get deployments

# Describe deployment
kubectl describe deployment <deployment-name>

# Scale deployment
kubectl scale deployment <deployment-name> --replicas=<count>

# Update deployment image
kubectl set image deployment/<deployment-name> <container-name>=<new-image>

# View rollout status
kubectl rollout status deployment/<deployment-name>

# View rollout history
kubectl rollout history deployment/<deployment-name>

# Rollback deployment
kubectl rollout undo deployment/<deployment-name>
kubectl rollout undo deployment/<deployment-name> --to-revision=<revision>
```

### Service Operations

```bash
# List services
kubectl get services
kubectl get svc  # shorthand

# Describe service
kubectl describe service <service-name>

# Get service endpoints
kubectl get endpoints <service-name>
```

### Configuration Operations

```bash
# ConfigMaps
kubectl get configmaps
kubectl describe configmap <configmap-name>
kubectl create configmap <name> --from-file=<path>
kubectl create configmap <name> --from-literal=<key>=<value>

# Secrets
kubectl get secrets
kubectl describe secret <secret-name>
kubectl create secret generic <name> --from-literal=<key>=<value>
kubectl create secret generic <name> --from-file=<path>
```

### Debugging Commands

```bash
# Get events (sorted by timestamp)
kubectl get events --sort-by='.lastTimestamp'

# Describe resource (shows events at bottom)
kubectl describe <resource-type> <resource-name>

# Get resource YAML
kubectl get <resource-type> <resource-name> -o yaml

# Get resource JSON
kubectl get <resource-type> <resource-name> -o json

# Watch resources for changes
kubectl get pods --watch
kubectl get pods -w  # shorthand
```

---

## Pod Management

### Creating Pods

**From YAML**:
```bash
kubectl apply -f pod.yaml
```

**Example Pod Manifest**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
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
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"
```

### Pod Best Practices

1. **Always set resource requests and limits**
   - Requests: Scheduler uses for placement
   - Limits: Prevents resource starvation

2. **Use liveness and readiness probes**
   ```yaml
   livenessProbe:
     httpGet:
       path: /healthz
       port: 8080
     initialDelaySeconds: 15
     periodSeconds: 20

   readinessProbe:
     httpGet:
       path: /ready
       port: 8080
     initialDelaySeconds: 5
     periodSeconds: 10
   ```

3. **Use proper labels**
   - app: application name
   - version: application version
   - environment: dev/staging/prod

4. **Set security context**
   ```yaml
   securityContext:
     runAsNonRoot: true
     runAsUser: 1000
     fsGroup: 1000
     capabilities:
       drop:
       - ALL
   ```

### Deleting Pods

```bash
# Delete pod
kubectl delete pod <pod-name>

# Force delete (use with caution)
kubectl delete pod <pod-name> --force --grace-period=0

# Delete all pods matching label
kubectl delete pods -l app=<app-name>
```

---

## Troubleshooting Pod States

### Pending

**Symptom**: Pod stuck in `Pending` state.

**Common Causes**:
1. Insufficient cluster resources
2. Pod cannot be scheduled (no matching node)
3. Persistent volume not available

**Diagnostic Steps**:
```bash
# Check pod status and events
kubectl describe pod <pod-name>

# Look for scheduling errors in events section
# Common messages:
# - "Insufficient cpu"
# - "Insufficient memory"
# - "0/3 nodes are available: 3 node(s) had taint..."

# Check node resources
kubectl describe nodes

# Check if PVCs are bound
kubectl get pvc
```

**Resolution**:
- If resource shortage: Scale up cluster or reduce resource requests
- If node selector mismatch: Adjust pod nodeSelector or node labels
- If taint/toleration issue: Add tolerations to pod or remove node taints
- If PVC issue: Check storage class and provisioner

### CrashLoopBackOff

**Symptom**: Pod repeatedly crashes and restarts.

**Common Causes**:
1. Application crashes on startup
2. Missing dependencies or configuration
3. Resource limits too low (OOMKilled)
4. Liveness probe failing too quickly

**Diagnostic Steps**:
```bash
# Check logs from current container
kubectl logs <pod-name>

# Check logs from previous crashed container
kubectl logs <pod-name> --previous

# Check pod events
kubectl describe pod <pod-name>

# Look for:
# - Exit code (137 = OOMKilled, 1 = general error)
# - Restart count
# - Last state reason
```

**Resolution**:
- **Application crash**: Fix application code or configuration
- **OOMKilled**: Increase memory limits
- **Missing config**: Verify ConfigMaps/Secrets are mounted
- **Liveness probe**: Increase `initialDelaySeconds` or `failureThreshold`

**Example OOMKilled Detection**:
```bash
kubectl describe pod <pod-name> | grep -A 5 "Last State"
# Output shows: "Reason: OOMKilled"
```

### ImagePullBackOff

**Symptom**: Pod cannot pull container image.

**Common Causes**:
1. Image doesn't exist or tag is wrong
2. No pull credentials for private registry
3. Network issues reaching registry
4. Image pull timeout

**Diagnostic Steps**:
```bash
# Check pod events
kubectl describe pod <pod-name>

# Look for error messages:
# - "image not found"
# - "unauthorized: authentication required"
# - "manifest unknown"
# - "context deadline exceeded"

# Verify image exists
docker pull <image-name>  # from local machine
```

**Resolution**:
- **Image not found**: Verify image name and tag
- **Authentication failed**: Create/update image pull secret
  ```bash
  kubectl create secret docker-registry <secret-name> \
    --docker-server=<registry-server> \
    --docker-username=<username> \
    --docker-password=<password> \
    --docker-email=<email>

  # Reference in pod spec:
  # imagePullSecrets:
  # - name: <secret-name>
  ```
- **Network issues**: Check cluster egress and registry availability

### Error

**Symptom**: Pod in `Error` state.

**Common Causes**:
1. Container exited with non-zero exit code
2. Command not found
3. Permission issues

**Diagnostic Steps**:
```bash
# Check logs
kubectl logs <pod-name>

# Check exit code
kubectl describe pod <pod-name> | grep "Exit Code"

# Common exit codes:
# - 0: Success
# - 1: General error
# - 126: Command cannot execute (permission)
# - 127: Command not found
# - 137: SIGKILL (OOMKilled)
# - 143: SIGTERM (graceful shutdown)
```

**Resolution**:
- Check container logs for error messages
- Verify command and args in pod spec
- Check file permissions and user context

### ErrImagePull

**Symptom**: Initial image pull failure (becomes ImagePullBackOff if persistent).

**Resolution**: Same as ImagePullBackOff above.

### Unknown

**Symptom**: Pod state cannot be determined.

**Common Causes**:
1. Node communication issues
2. Kubelet not responding
3. Node failure

**Diagnostic Steps**:
```bash
# Check node status
kubectl get nodes

# Check node conditions
kubectl describe node <node-name>

# Check if pod can be deleted and recreated
kubectl delete pod <pod-name>
```

---

## Service and Networking

### Service Types

1. **ClusterIP** (default):
   - Internal cluster communication only
   - Stable internal IP
   ```yaml
   apiVersion: v1
   kind: Service
   metadata:
     name: my-service
   spec:
     selector:
       app: my-app
     ports:
     - protocol: TCP
       port: 80
       targetPort: 8080
     type: ClusterIP
   ```

2. **NodePort**:
   - Exposes service on each node's IP at a static port
   - Range: 30000-32767
   ```yaml
   type: NodePort
   ports:
   - port: 80
     targetPort: 8080
     nodePort: 30080  # optional, auto-assigned if not specified
   ```

3. **LoadBalancer**:
   - Cloud provider load balancer
   - External IP assigned
   ```yaml
   type: LoadBalancer
   ```

4. **ExternalName**:
   - DNS CNAME record
   - Maps to external service
   ```yaml
   type: ExternalName
   externalName: external.example.com
   ```

### Service Discovery

**DNS-based**:
- Service name: `<service-name>.<namespace>.svc.cluster.local`
- Within same namespace: `<service-name>`
- Cross-namespace: `<service-name>.<namespace>`

**Environment variables**:
- Pods get env vars for services in same namespace
- Format: `<SERVICE_NAME>_SERVICE_HOST` and `<SERVICE_NAME>_SERVICE_PORT`

### Debugging Service Connectivity

```bash
# Check if service has endpoints
kubectl get endpoints <service-name>

# If no endpoints, service selector may not match pod labels
kubectl get pods -l <selector-key>=<selector-value>

# Test service from within cluster
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- /bin/bash
# Inside pod:
curl <service-name>:<port>
nslookup <service-name>

# Check service configuration
kubectl describe service <service-name>
```

### Ingress

**Purpose**: HTTP/HTTPS routing to services.

**Example**:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
spec:
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-service
            port:
              number: 80
```

**Debugging Ingress**:
```bash
# Check ingress status
kubectl get ingress
kubectl describe ingress <ingress-name>

# Verify ingress controller is running
kubectl get pods -n ingress-nginx  # or your ingress controller namespace

# Check ingress controller logs
kubectl logs -n ingress-nginx <ingress-controller-pod>
```

---

## Configuration Management

### ConfigMaps

**Use Cases**:
- Application configuration files
- Command-line arguments
- Environment variables
- Configuration data

**Creating ConfigMaps**:
```bash
# From literal values
kubectl create configmap app-config \
  --from-literal=database_url=postgres://db:5432 \
  --from-literal=log_level=info

# From file
kubectl create configmap app-config --from-file=config.yaml

# From directory
kubectl create configmap app-config --from-file=config/
```

**Using ConfigMaps in Pods**:

As environment variables:
```yaml
env:
- name: DATABASE_URL
  valueFrom:
    configMapKeyRef:
      name: app-config
      key: database_url
```

As volume mount:
```yaml
volumes:
- name: config-volume
  configMap:
    name: app-config
volumeMounts:
- name: config-volume
  mountPath: /etc/config
```

### Secrets

**Use Cases**:
- Database passwords
- API keys
- TLS certificates
- Docker registry credentials

**Creating Secrets**:
```bash
# From literal
kubectl create secret generic db-password \
  --from-literal=password='mySecurePassword123'

# From file
kubectl create secret generic tls-cert \
  --from-file=tls.crt=./cert.crt \
  --from-file=tls.key=./cert.key

# TLS secret
kubectl create secret tls tls-secret \
  --cert=path/to/cert.crt \
  --key=path/to/cert.key
```

**Using Secrets in Pods**:

As environment variable:
```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-password
      key: password
```

As volume mount:
```yaml
volumes:
- name: secret-volume
  secret:
    secretName: db-password
volumeMounts:
- name: secret-volume
  mountPath: /etc/secrets
  readOnly: true
```

**Security Best Practices**:
1. Enable encryption at rest for secrets
2. Use RBAC to restrict secret access
3. Rotate secrets regularly
4. Never log secret values
5. Consider external secret management (Vault, AWS Secrets Manager)

---

## Resource Management

### Resource Requests and Limits

**Requests**: Guaranteed resources for pod scheduling
**Limits**: Maximum resources pod can use

```yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "250m"  # 0.25 CPU cores
  limits:
    memory: "128Mi"
    cpu: "500m"  # 0.5 CPU cores
```

### CPU Resources

- Measured in cores
- 1 core = 1000m (millicores)
- Fractional values allowed: 0.5 = 500m
- **Throttled** if exceeds limit (not killed)

### Memory Resources

- Measured in bytes (Mi, Gi)
- **OOMKilled** if exceeds limit
- More critical to set correctly than CPU

### Resource Quotas

**Limit resources at namespace level**:
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: my-namespace
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "10"
```

### Limit Ranges

**Set default requests/limits for pods**:
```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: mem-limit-range
  namespace: my-namespace
spec:
  limits:
  - default:
      memory: 512Mi
      cpu: 500m
    defaultRequest:
      memory: 256Mi
      cpu: 250m
    type: Container
```

### Monitoring Resource Usage

```bash
# View node resource usage
kubectl top nodes

# View pod resource usage
kubectl top pods
kubectl top pods -n <namespace>

# View pod resource usage with containers
kubectl top pods --containers

# Sort by memory usage
kubectl top pods --sort-by=memory

# Sort by CPU usage
kubectl top pods --sort-by=cpu
```

---

## RBAC and Security

### RBAC Components

1. **ServiceAccount**: Identity for pods
2. **Role**: Permissions within namespace
3. **ClusterRole**: Permissions cluster-wide
4. **RoleBinding**: Binds role to user/serviceaccount in namespace
5. **ClusterRoleBinding**: Binds clusterrole cluster-wide

### Creating ServiceAccount

```bash
kubectl create serviceaccount <sa-name>
```

### Creating Role

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: default
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
```

### Creating RoleBinding

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: default
subjects:
- kind: ServiceAccount
  name: my-serviceaccount
  namespace: default
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

### Common Verbs

- **get**: Read individual resource
- **list**: List resources
- **watch**: Watch for resource changes
- **create**: Create new resource
- **update**: Update existing resource
- **patch**: Partially update resource
- **delete**: Delete resource
- **deletecollection**: Delete multiple resources

### Checking Permissions

```bash
# Can I perform action?
kubectl auth can-i <verb> <resource>
kubectl auth can-i create deployments
kubectl auth can-i delete pods --namespace=prod

# Check permissions for service account
kubectl auth can-i get pods --as=system:serviceaccount:default:my-sa
```

### Pod Security

**Security Context (Pod level)**:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
```

**Security Context (Container level)**:
```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
    - ALL
    add:
    - NET_BIND_SERVICE
```

---

## Common Workflows

### Deploying New Application

1. **Create namespace**:
   ```bash
   kubectl create namespace <app-namespace>
   ```

2. **Create secrets/configmaps**:
   ```bash
   kubectl create secret generic app-secret -n <app-namespace> --from-file=...
   kubectl create configmap app-config -n <app-namespace> --from-file=...
   ```

3. **Deploy application**:
   ```bash
   kubectl apply -f deployment.yaml -n <app-namespace>
   ```

4. **Create service**:
   ```bash
   kubectl apply -f service.yaml -n <app-namespace>
   ```

5. **Verify deployment**:
   ```bash
   kubectl get pods -n <app-namespace>
   kubectl get svc -n <app-namespace>
   kubectl logs -n <app-namespace> <pod-name>
   ```

### Updating Application

1. **Update image**:
   ```bash
   kubectl set image deployment/<name> <container>=<new-image> -n <namespace>
   ```

2. **Monitor rollout**:
   ```bash
   kubectl rollout status deployment/<name> -n <namespace>
   ```

3. **Verify pods**:
   ```bash
   kubectl get pods -n <namespace>
   ```

### Debugging Pod Issues

1. **Check pod status**:
   ```bash
   kubectl get pods -n <namespace>
   ```

2. **Describe pod**:
   ```bash
   kubectl describe pod <pod-name> -n <namespace>
   ```

3. **Check logs**:
   ```bash
   kubectl logs <pod-name> -n <namespace>
   kubectl logs <pod-name> --previous -n <namespace>  # if crashed
   ```

4. **Execute into pod**:
   ```bash
   kubectl exec -it <pod-name> -n <namespace> -- /bin/bash
   ```

5. **Check events**:
   ```bash
   kubectl get events -n <namespace> --sort-by='.lastTimestamp'
   ```

### Scaling Application

```bash
# Manual scaling
kubectl scale deployment/<name> --replicas=<count> -n <namespace>

# Autoscaling (HPA)
kubectl autoscale deployment/<name> --min=2 --max=10 --cpu-percent=80 -n <namespace>

# Check HPA status
kubectl get hpa -n <namespace>
```

### Cleaning Up

```bash
# Delete specific resources
kubectl delete deployment <name> -n <namespace>
kubectl delete service <name> -n <namespace>

# Delete all resources with label
kubectl delete all -l app=<app-name> -n <namespace>

# Delete namespace (deletes all resources in it)
kubectl delete namespace <namespace>
```

---

## Quick Reference

### Most Common Commands

```bash
# Get resources
kubectl get pods
kubectl get svc
kubectl get deployments

# Describe (detailed info)
kubectl describe pod <name>

# Logs
kubectl logs <pod-name>
kubectl logs <pod-name> --previous

# Execute
kubectl exec -it <pod-name> -- /bin/bash

# Apply config
kubectl apply -f <file.yaml>

# Delete
kubectl delete pod <name>

# Get events
kubectl get events --sort-by='.lastTimestamp'

# Resource usage
kubectl top nodes
kubectl top pods
```

### Troubleshooting Decision Tree

```
Pod not running?
├── Pending → Check events for scheduling issues
├── CrashLoopBackOff → Check logs (current and previous)
├── ImagePullBackOff → Verify image name and pull secrets
├── Error → Check logs and exit code
└── Unknown → Check node status
```

---

**For more information**:
- Deployment procedures: See deployment.md
- Monitoring setup: See monitoring.md
- Troubleshooting patterns: See troubleshooting.md
- Configuration management: See configuration.md
