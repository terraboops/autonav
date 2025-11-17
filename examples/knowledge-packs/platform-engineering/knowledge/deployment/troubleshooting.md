# Deployment Troubleshooting Guide

**Last Updated:** 2025-11-17

## Overview

Common deployment issues and their solutions for Kubernetes and AWS deployments.

## Image Pull Failures

### Symptom

```
Pod Status: ImagePullBackOff
Events: Failed to pull image "registry.company.com/my-app:v1.0.0": authentication required
```

### Solution

1. **Verify image exists:**
   ```bash
   docker pull registry.company.com/my-app:v1.0.0
   ```

2. **Check image pull secret:**
   ```bash
   kubectl get secrets -n my-namespace | grep regcred
   kubectl describe secret regcred -n my-namespace
   ```

3. **Recreate image pull secret if needed:**
   ```bash
   kubectl create secret docker-registry regcred \
     --docker-server=registry.company.com \
     --docker-username=$REGISTRY_USER \
     --docker-password=$REGISTRY_PASS \
     -n my-namespace
   ```

4. **Add to deployment spec:**
   ```yaml
   spec:
     imagePullSecrets:
     - name: regcred
   ```

## CrashLoopBackOff

### Symptom

```
Pod Status: CrashLoopBackOff
Restarts: 5
```

### Solution

1. **Check logs:**
   ```bash
   kubectl logs my-app-7d8f9c8b-xyz12 -n my-namespace
   kubectl logs my-app-7d8f9c8b-xyz12 -n my-namespace --previous
   ```

2. **Common causes:**
   - **Missing environment variables:** Check ConfigMaps and Secrets
   - **Failed health checks:** Increase initialDelaySeconds
   - **Port conflicts:** Verify containerPort matches service
   - **Database connection failure:** Check DATABASE_URL and network policies

3. **Debug with modified deployment:**
   ```bash
   # Temporarily override command to keep container running
   kubectl set env deployment/my-app DEBUG=true -n my-namespace
   kubectl exec -it deployment/my-app -n my-namespace -- /bin/bash
   # Run app manually to see error
   ./my-app
   ```

## Pods Not Ready

### Symptom

```
NAME                      READY   STATUS    RESTARTS   AGE
my-app-7d8f9c8b-xyz12     0/1     Running   0          5m
```

### Solution

1. **Check readiness probe:**
   ```bash
   kubectl describe pod my-app-7d8f9c8b-xyz12 -n my-namespace
   # Look for "Readiness probe failed"
   ```

2. **Test health endpoint manually:**
   ```bash
   kubectl exec my-app-7d8f9c8b-xyz12 -n my-namespace -- curl localhost:8080/ready
   ```

3. **Common fixes:**
   - Increase `initialDelaySeconds` (app needs more startup time)
   - Fix health endpoint implementation
   - Check if app is actually listening on specified port

## Resource Constraints

### Symptom

```
Pod Status: Pending
Events: 0/5 nodes are available: insufficient memory
```

### Solution

1. **Check resource usage:**
   ```bash
   kubectl top nodes
   kubectl describe nodes
   ```

2. **Reduce resource requests:**
   ```yaml
   resources:
     requests:
       memory: "128Mi"  # Reduced from 512Mi
       cpu: "100m"      # Reduced from 500m
   ```

3. **Or scale cluster:**
   ```bash
   # AWS EKS
   eksctl scale nodegroup --cluster=my-cluster --name=my-nodegroup --nodes=5
   ```

## Networking Issues

### Service Not Accessible

**Symptom:** Cannot reach service endpoint

**Solution:**

1. **Verify service exists:**
   ```bash
   kubectl get svc my-app -n my-namespace
   kubectl describe svc my-app -n my-namespace
   ```

2. **Check service selector matches pod labels:**
   ```bash
   kubectl get svc my-app -n my-namespace -o yaml | grep -A 3 selector
   kubectl get pods -n my-namespace --show-labels
   ```

3. **Test from within cluster:**
   ```bash
   kubectl run debug --image=curlimages/curl -it --rm -- \
     curl http://my-app.my-namespace.svc.cluster.local:8080
   ```

4. **Check endpoints:**
   ```bash
   kubectl get endpoints my-app -n my-namespace
   # Should show pod IPs
   ```

### Ingress Not Working

**Symptom:** External URL returns 404 or 502

**Solution:**

1. **Verify ingress configuration:**
   ```bash
   kubectl get ingress -n my-namespace
   kubectl describe ingress my-app -n my-namespace
   ```

2. **Check ingress controller logs:**
   ```bash
   kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
   ```

3. **Verify TLS certificate:**
   ```bash
   kubectl get certificate -n my-namespace
   kubectl describe certificate my-app-tls -n my-namespace
   ```

## Configuration Issues

### Missing Environment Variables

**Symptom:** App crashes with "environment variable not set"

**Solution:**

1. **List current env vars:**
   ```bash
   kubectl exec deployment/my-app -n my-namespace -- env
   ```

2. **Add missing variables:**
   ```bash
   kubectl set env deployment/my-app NEW_VAR=value -n my-namespace
   ```

3. **Or update ConfigMap:**
   ```bash
   kubectl create configmap my-app-config \
     --from-literal=NEW_VAR=value \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

### Secret Not Found

**Symptom:** `Error: couldn't find key DATABASE_PASSWORD in Secret my-namespace/my-app-secrets`

**Solution:**

```bash
# Create or update secret
kubectl create secret generic my-app-secrets \
  --from-literal=DATABASE_PASSWORD=newpass \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods to pick up new secret
kubectl rollout restart deployment/my-app -n my-namespace
```

## Performance Issues

### High CPU Usage

1. **Identify which pods:**
   ```bash
   kubectl top pods -n my-namespace --sort-by=cpu
   ```

2. **Get CPU profile:**
   ```bash
   kubectl exec my-app-xyz -n my-namespace -- curl localhost:8080/debug/pprof/profile?seconds=30 > cpu.prof
   ```

3. **Temporary mitigation:**
   ```bash
   # Increase CPU limits
   kubectl set resources deployment/my-app -n my-namespace \
     --limits=cpu=1000m
   ```

### High Memory Usage

1. **Check memory usage:**
   ```bash
   kubectl top pods -n my-namespace --sort-by=memory
   ```

2. **Check for memory leaks:**
   ```bash
   kubectl exec my-app-xyz -n my-namespace -- curl localhost:8080/debug/pprof/heap > heap.prof
   ```

3. **Increase limits temporarily:**
   ```bash
   kubectl set resources deployment/my-app -n my-namespace \
     --limits=memory=1Gi
   ```

## Database Connection Issues

### Cannot Connect to Database

**Symptom:** `Error: connection refused` or `timeout connecting to database`

**Solution:**

1. **Verify database is accessible from pod:**
   ```bash
   kubectl exec deployment/my-app -n my-namespace -- \
     nc -zv postgres-service 5432
   ```

2. **Check network policies:**
   ```bash
   kubectl get networkpolicies -n my-namespace
   kubectl describe networkpolicy -n my-namespace
   ```

3. **Verify credentials:**
   ```bash
   kubectl get secret db-credentials -n my-namespace -o yaml
   # Decode base64 values to verify
   echo "encoded-value" | base64 -d
   ```

4. **Test connection manually:**
   ```bash
   kubectl exec -it deployment/my-app -n my-namespace -- /bin/bash
   psql $DATABASE_URL
   ```

## Monitoring and Debugging

### Get Recent Events

```bash
kubectl get events -n my-namespace --sort-by='.lastTimestamp'
```

### Full Pod Description

```bash
kubectl describe pod my-app-xyz -n my-namespace
```

### Resource Usage

```bash
# Current usage
kubectl top pods -n my-namespace
kubectl top nodes

# Historical metrics (see Prometheus)
# Check Grafana dashboards for detailed trends
```

## Emergency Procedures

### Complete Service Outage

1. **Check pod status:**
   ```bash
   kubectl get pods -n my-namespace -l app=my-app
   ```

2. **Scale up immediately:**
   ```bash
   kubectl scale deployment/my-app --replicas=5 -n my-namespace
   ```

3. **If all pods failing, rollback:**
   ```bash
   kubectl rollout undo deployment/my-app -n my-namespace
   ```

4. **Monitor recovery:**
   ```bash
   kubectl get pods -n my-namespace -w
   ```

5. **Notify team and investigate root cause.**

### Database Migration Failure

1. **Check migration job status:**
   ```bash
   kubectl get jobs -n my-namespace
   kubectl logs job/db-migration -n my-namespace
   ```

2. **If migration partially applied:**
   ```bash
   # Do NOT re-run without coordination
   # Check database state first
   kubectl exec -it deployment/my-app -n my-namespace -- psql $DATABASE_URL -c "SELECT * FROM schema_migrations;"
   ```

3. **Manual rollback may be required - coordinate with team!**

## Escalation

If issues persist:

1. **Gather diagnostics:**
   ```bash
   kubectl describe pod my-app-xyz -n my-namespace > pod-describe.txt
   kubectl logs my-app-xyz -n my-namespace > pod-logs.txt
   kubectl get events -n my-namespace > events.txt
   ```

2. **Post in #platform-help Slack channel with:**
   - Service name and namespace
   - What you've tried
   - Attached diagnostics

3. **For production outages:**
   - Page on-call via PagerDuty
   - Post in #incidents
   - Update status page

## Related Documentation

- [Kubernetes Deployment Guide](kubernetes.md) - Standard deployment procedures
- [Prometheus Monitoring](../monitoring/prometheus.md) - Setting up alerts
- [Architecture Overview](../architecture/overview.md) - Understanding the platform
