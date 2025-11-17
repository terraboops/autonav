# Troubleshooting Guide

**Version**: 0.1.0
**Last Updated**: 2025-11-17

This guide provides diagnostic procedures, common failure patterns, and troubleshooting workflows for cloud-native platforms.

---

## Table of Contents

1. [Troubleshooting Methodology](#troubleshooting-methodology)
2. [Common Failure Patterns](#common-failure-patterns)
3. [Diagnostic Decision Trees](#diagnostic-decision-trees)
4. [Container Failures](#container-failures)
5. [Network Issues](#network-issues)
6. [Resource Problems](#resource-problems)
7. [Application Errors](#application-errors)
8. [Log Analysis](#log-analysis)
9. [Debugging Tools](#debugging-tools)

---

## Troubleshooting Methodology

### The Scientific Method for Debugging

1. **Observe**: What is the symptom?
2. **Hypothesize**: What could cause this?
3. **Test**: How can we validate the hypothesis?
4. **Analyze**: What did the test reveal?
5. **Repeat**: Iterate until root cause found

### Structured Troubleshooting Process

**Step 1: Define the Problem**
- What is broken? (specific service, feature, endpoint)
- When did it start? (timestamp, deployment, change)
- Who is affected? (all users, specific segment, internal only)
- What is the impact? (complete outage, degraded performance)

**Step 2: Gather Information**
```bash
# Check service status
kubectl get pods -n <namespace>
kubectl get svc -n <namespace>
kubectl get deployment -n <namespace>

# Check recent events
kubectl get events -n <namespace> --sort-by='.lastTimestamp' | tail -20

# Check metrics
# - Error rate
# - Latency
# - Request volume
# - Resource usage

# Check logs
kubectl logs -n <namespace> <pod-name> --tail=100
```

**Step 3: Form Hypothesis**
Based on gathered information, what are the most likely causes?

**Step 4: Test Hypothesis**
Run specific commands or checks to validate/invalidate hypothesis.

**Step 5: Apply Fix**
Once root cause identified, apply appropriate fix.

**Step 6: Verify Fix**
Confirm the issue is resolved and no new issues introduced.

**Step 7: Document**
Document root cause, fix applied, and lessons learned.

---

## Common Failure Patterns

### Pattern: Cascading Failures

**Symptoms**:
- Multiple services failing simultaneously
- Failures propagating across service boundaries
- Timeouts and connection refused errors

**Common Causes**:
1. Shared dependency failure (database, cache, message queue)
2. Resource exhaustion (CPU, memory, file descriptors)
3. Network partition or degradation

**Diagnostic Steps**:
```bash
# Check all service health
kubectl get pods --all-namespaces

# Check node status
kubectl get nodes

# Check for resource exhaustion
kubectl top nodes
kubectl top pods --all-namespaces --sort-by=memory

# Check network connectivity
kubectl run netshoot --rm -it --image=nicolaka/netshoot -- /bin/bash
# Inside pod: ping, traceroute, curl other services
```

**Resolution**:
1. Identify the root failing component
2. Isolate or fix the root cause
3. Consider circuit breakers to prevent cascading failures
4. Implement proper timeouts and retries

### Pattern: Slow Degradation

**Symptoms**:
- Gradual increase in latency over hours/days
- Slowly increasing error rate
- Memory or disk usage creeping up

**Common Causes**:
1. Memory leak
2. Connection leak
3. Disk filling up
4. Cache not expiring entries
5. Unbounded queue growth

**Diagnostic Steps**:
```bash
# Check resource usage trend (in Prometheus/Grafana)
# Look for linear growth over time

# Check memory usage
kubectl top pods -n <namespace> --sort-by=memory

# Check disk usage
kubectl exec -n <namespace> <pod-name> -- df -h

# Check for file descriptor leaks
kubectl exec -n <namespace> <pod-name> -- lsof | wc -l

# Check connection pool stats
# (app-specific - check application metrics)
```

**Resolution**:
1. Restart affected pods (temporary fix)
2. Identify and fix leak in code
3. Add resource limits to prevent unbounded growth
4. Implement proper cleanup/expiration logic

### Pattern: Intermittent Failures

**Symptoms**:
- Errors occur sporadically
- Cannot consistently reproduce
- Some requests succeed, others fail

**Common Causes**:
1. Race condition in code
2. One unhealthy pod in healthy set
3. Network flakiness
4. Load-dependent issue
5. Time-dependent issue

**Diagnostic Steps**:
```bash
# Check if specific pods are problematic
kubectl get pods -n <namespace>
# Look for restarts, not ready status

# Check logs from all pods
for pod in $(kubectl get pods -n <namespace> -l app=<app-name> -o name); do
  echo "=== $pod ==="
  kubectl logs -n <namespace> $pod --tail=20 | grep -i error
done

# Check if issue correlates with load
# Review request rate vs error rate in Grafana

# Check if issue correlates with time
# (e.g., happens at midnight, every hour)
```

**Resolution**:
1. If one pod is bad: Delete it, let it recreate
2. If race condition: Fix code
3. If load-dependent: Add more replicas or optimize
4. If time-dependent: Check cron jobs, scheduled tasks

### Pattern: Sudden Outage

**Symptoms**:
- Service was working, now completely down
- All requests failing
- Pods not running or not ready

**Common Causes**:
1. Bad deployment
2. Configuration change
3. Infrastructure failure
4. Resource exhaustion
5. Network issue

**Diagnostic Steps**:
```bash
# What changed recently?
kubectl rollout history deployment/<deployment-name> -n <namespace>

# Check deployment status
kubectl get deployment <deployment-name> -n <namespace>

# Check pod status
kubectl get pods -n <namespace> -l app=<app-name>

# Check pod events
kubectl describe pod <pod-name> -n <namespace>

# Check recent changes
kubectl get events -n <namespace> --sort-by='.lastTimestamp' | tail -30
```

**Resolution**:
1. If bad deployment: Rollback immediately
2. If config change: Revert configuration
3. If infrastructure: Check with cloud provider
4. If resources: Scale up or free resources

---

## Diagnostic Decision Trees

### Pod Not Running Decision Tree

```
Pod not in Running state?
│
├─ Pending
│  ├─ Insufficient resources → Scale cluster or reduce requests
│  ├─ Node selector mismatch → Fix selector or node labels
│  ├─ PVC not bound → Check storage class and provisioner
│  └─ Taint/toleration issue → Add toleration or remove taint
│
├─ CrashLoopBackOff
│  ├─ Exit code 137 (OOMKilled) → Increase memory limits
│  ├─ Exit code 0 → App exiting successfully (wrong CMD/entrypoint)
│  ├─ Exit code 1 → Check logs for app error
│  └─ Liveness probe failing → Adjust probe or fix app health endpoint
│
├─ ImagePullBackOff
│  ├─ Image not found → Verify image name and tag
│  ├─ Authentication failed → Create/update image pull secret
│  └─ Timeout → Check network and registry availability
│
├─ Error
│  └─ Check logs for specific error message
│
└─ Unknown
   └─ Check node status
```

### Service Unreachable Decision Tree

```
Service unreachable?
│
├─ From outside cluster
│  ├─ No external IP/hostname
│  │  └─ Check Ingress/LoadBalancer configuration
│  ├─ External IP assigned but not reachable
│  │  ├─ Check DNS resolves to correct IP
│  │  ├─ Check firewall rules
│  │  └─ Check security groups
│  └─ Connection timeout
│     └─ Check load balancer health checks
│
└─ From inside cluster
   ├─ Connection refused
   │  ├─ Check service has endpoints: `kubectl get endpoints`
   │  ├─ If no endpoints → Check pod selector matches labels
   │  └─ If has endpoints → Check container port matches service targetPort
   │
   ├─ DNS not resolving
   │  ├─ Check CoreDNS pods running
   │  └─ Check service name spelling
   │
   └─ Timeout
      ├─ Check NetworkPolicy allows traffic
      └─ Check pod is listening on expected port
```

### High Latency Decision Tree

```
High latency?
│
├─ All requests slow
│  ├─ CPU throttling → Check CPU limits vs usage
│  ├─ Memory pressure → Check for swapping, OOMKilled
│  ├─ Downstream dependency slow → Check dependency latency
│  └─ Network congestion → Check network metrics
│
├─ Some requests slow (p95, p99 high but p50 normal)
│  ├─ Slow database queries → Check query performance
│  ├─ Large response size → Check response size distribution
│  ├─ Cold start penalty → Increase min replicas
│  └─ Lock contention → Profile application
│
└─ Increasing over time
   ├─ Memory leak causing GC pressure → Fix leak
   ├─ Connection pool exhaustion → Increase pool size or fix leaks
   └─ Unbounded cache growth → Implement eviction policy
```

---

## Container Failures

### OOMKilled (Exit Code 137)

**Symptom**: Container killed due to out-of-memory.

**Verification**:
```bash
# Check exit code and reason
kubectl describe pod <pod-name> -n <namespace> | grep -A 10 "Last State"
# Look for: "Reason: OOMKilled"

# Check memory usage
kubectl top pod <pod-name> -n <namespace> --containers

# Check memory limits
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[*].resources.limits.memory}'
```

**Resolution**:
```yaml
# Increase memory limits
resources:
  limits:
    memory: "1Gi"  # Increase from current limit
  requests:
    memory: "512Mi"
```

**Prevention**:
1. Profile application memory usage
2. Set appropriate limits based on actual usage + headroom
3. Monitor memory usage trends
4. Fix memory leaks in code

### Application Crash (Exit Code 1)

**Symptom**: Application exits with error.

**Verification**:
```bash
# Check logs from crashed container
kubectl logs <pod-name> -n <namespace> --previous

# Check exit code
kubectl describe pod <pod-name> -n <namespace> | grep "Exit Code"
```

**Common Causes**:
1. Uncaught exception in code
2. Missing environment variable
3. Cannot connect to dependency
4. Configuration error

**Resolution**:
1. Fix code bug
2. Add missing configuration
3. Verify dependencies are available
4. Add proper error handling

### Container Startup Failures

**Symptom**: Container starts but immediately exits.

**Diagnostic Steps**:
```bash
# Check if command/args are correct
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[*].command}'

# Check logs
kubectl logs <pod-name> -n <namespace>

# Check if startup probe is failing
kubectl describe pod <pod-name> -n <namespace> | grep -A 5 "Startup"
```

**Common Issues**:
1. Wrong command or entrypoint
2. Missing required files
3. Permission issues
4. Startup probe too aggressive

---

## Network Issues

### Pod Cannot Reach Service

**Symptom**: Connection refused or timeout when accessing service.

**Diagnostic Steps**:
```bash
# Check service exists and has endpoints
kubectl get svc <service-name> -n <namespace>
kubectl get endpoints <service-name> -n <namespace>

# If no endpoints, check pod selector
kubectl get svc <service-name> -n <namespace> -o yaml | grep selector
kubectl get pods -n <namespace> --show-labels | grep <app-label>

# Test connectivity from debug pod
kubectl run netshoot --rm -it --image=nicolaka/netshoot -n <namespace> -- /bin/bash
# Inside pod:
nslookup <service-name>
curl <service-name>:<port>
telnet <service-name> <port>
```

**Common Causes**:
1. Service selector doesn't match pod labels
2. Wrong port number
3. NetworkPolicy blocking traffic
4. CoreDNS not working

**Resolution**:
```bash
# Fix service selector
kubectl edit svc <service-name> -n <namespace>

# Check NetworkPolicy
kubectl get networkpolicy -n <namespace>
kubectl describe networkpolicy <policy-name> -n <namespace>

# Check CoreDNS
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns
```

### DNS Resolution Failures

**Symptom**: Cannot resolve service names.

**Diagnostic Steps**:
```bash
# Check CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns

# Check CoreDNS logs
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50

# Test DNS from pod
kubectl exec <pod-name> -n <namespace> -- nslookup <service-name>
kubectl exec <pod-name> -n <namespace> -- cat /etc/resolv.conf
```

**Common Causes**:
1. CoreDNS pods not running
2. CoreDNS out of resources
3. Network policy blocking DNS traffic
4. Incorrect DNS configuration in pod

**Resolution**:
```bash
# Restart CoreDNS
kubectl rollout restart deployment/coredns -n kube-system

# Scale up CoreDNS if overwhelmed
kubectl scale deployment/coredns --replicas=3 -n kube-system

# Check NetworkPolicy allows DNS (port 53 UDP/TCP)
```

### Load Balancer Not Working

**Symptom**: External IP assigned but not reachable.

**Diagnostic Steps**:
```bash
# Check LoadBalancer service
kubectl get svc <service-name> -n <namespace>

# Check endpoints
kubectl get endpoints <service-name> -n <namespace>

# Check cloud provider load balancer
# (AWS: ELB console, GCP: Load Balancing console, etc.)

# Check load balancer health checks
# Health check should point to pod's readiness probe
```

**Common Causes**:
1. No endpoints (pods not ready)
2. Security groups blocking traffic
3. Health check failing
4. Wrong port configuration

---

## Resource Problems

### CPU Throttling

**Symptom**: Application slow despite CPU usage below 100%.

**Detection**:
```bash
# Check for throttling in metrics
# In Prometheus:
rate(container_cpu_cfs_throttled_seconds_total{pod="<pod-name>"}[5m])

# Check CPU usage vs limits
kubectl top pod <pod-name> -n <namespace> --containers
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[*].resources.limits.cpu}'
```

**Resolution**:
```yaml
# Increase CPU limits
resources:
  limits:
    cpu: "1000m"  # Increase from current limit
  requests:
    cpu: "500m"
```

**Prevention**:
1. Profile actual CPU usage
2. Set limits 20-30% above typical usage
3. Consider removing CPU limits if using CPU guarantee (requests = limits)

### Disk Space Issues

**Symptom**: Pods failing, "no space left on device" errors.

**Detection**:
```bash
# Check node disk usage
kubectl describe node <node-name> | grep -A 5 "Conditions"
# Look for DiskPressure condition

# Check disk usage inside container
kubectl exec <pod-name> -n <namespace> -- df -h

# Check ephemeral storage usage
kubectl top pods -n <namespace> --sort-by=ephemeral-storage
```

**Common Causes**:
1. Logs filling disk
2. Large temporary files
3. Unbounded data growth
4. Container image layers accumulating

**Resolution**:
```bash
# Clean up old images on node (SSH to node)
docker system prune -a

# Rotate logs
# Configure log rotation in container

# Set ephemeral storage limits
resources:
  limits:
    ephemeral-storage: "2Gi"
  requests:
    ephemeral-storage: "1Gi"
```

### Node Issues

**Symptom**: Pods on specific node failing or not scheduling.

**Detection**:
```bash
# Check node status
kubectl get nodes

# Describe node for conditions
kubectl describe node <node-name>

# Look for conditions:
# - Ready: False (node not healthy)
# - DiskPressure: True (disk full)
# - MemoryPressure: True (low memory)
# - PIDPressure: True (too many processes)
# - NetworkUnavailable: True (network issues)
```

**Resolution**:
```bash
# Cordon node (prevent new pods)
kubectl cordon <node-name>

# Drain node (evict pods)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# If node is unrecoverable, delete it
kubectl delete node <node-name>
# Cloud provider will create replacement

# Uncordon when node is healthy
kubectl uncordon <node-name>
```

---

## Application Errors

### High Error Rate

**Symptom**: Increased 5xx errors from application.

**Diagnostic Steps**:
```bash
# Check error rate in metrics
# Prometheus: rate(http_requests_total{status=~"5.."}[5m])

# Check recent logs for errors
kubectl logs -n <namespace> -l app=<app-name> --tail=100 | grep -i error

# Check if correlated with deployment
kubectl rollout history deployment/<deployment-name> -n <namespace>

# Check if specific error type
kubectl logs -n <namespace> -l app=<app-name> | grep "500\|502\|503\|504" | head -20
```

**Common Causes**:
1. Bug in new deployment
2. Dependency failure
3. Database issues
4. Configuration error
5. Resource exhaustion

**Resolution**:
1. If after deployment: Rollback immediately
2. If dependency issue: Check dependency health
3. If database: Check database performance
4. If config: Fix configuration
5. If resources: Scale up

### Database Connection Errors

**Symptom**: Application cannot connect to database.

**Diagnostic Steps**:
```bash
# Check database pod/service
kubectl get pods -n <database-namespace> -l app=<database-app>
kubectl get svc -n <database-namespace> <database-service>

# Check connection string in application
kubectl get secret <app-secret> -n <namespace> -o jsonpath='{.data.DATABASE_URL}' | base64 -d

# Test connection from app pod
kubectl exec <pod-name> -n <namespace> -- telnet <database-host> <database-port>

# Check database logs
kubectl logs -n <database-namespace> <database-pod> --tail=50
```

**Common Causes**:
1. Database pod not running
2. Wrong connection string
3. Network policy blocking connection
4. Database credentials incorrect
5. Database connection limit reached

**Resolution**:
1. Fix database pod if crashed
2. Update connection string
3. Check and update NetworkPolicy
4. Verify credentials in secret
5. Increase database connection limit or connection pool

### Timeout Errors

**Symptom**: Requests timing out.

**Diagnostic Steps**:
```bash
# Check if specific endpoint or all endpoints
kubectl logs -n <namespace> -l app=<app-name> | grep timeout

# Check latency metrics
# Prometheus: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Check if downstream dependency is slow
# Check dependency metrics

# Check for CPU throttling or resource limits
kubectl top pods -n <namespace>
```

**Common Causes**:
1. Downstream service slow/unavailable
2. Resource limits causing slowness
3. Database query slow
4. Lock contention
5. Timeout value too low

**Resolution**:
1. Fix downstream service
2. Increase resource limits
3. Optimize slow queries
4. Fix code causing lock contention
5. Increase timeout (if appropriate)

---

## Log Analysis

### Effective Log Searching

**Find errors in recent logs**:
```bash
# Last 100 lines, filter errors
kubectl logs -n <namespace> <pod-name> --tail=100 | grep -i error

# All pods with label, find errors
kubectl logs -n <namespace> -l app=<app-name> | grep -i "error\|exception\|fatal"

# Logs from last hour
kubectl logs -n <namespace> <pod-name> --since=1h | grep -i error

# Follow logs in real-time
kubectl logs -n <namespace> <pod-name> --follow
```

**Find specific patterns**:
```bash
# HTTP 500 errors
kubectl logs -n <namespace> <pod-name> | grep "HTTP/[0-9\.]* 500"

# Specific exception type
kubectl logs -n <namespace> <pod-name> | grep "NullPointerException"

# Slow queries
kubectl logs -n <namespace> <pod-name> | grep "slow query"

# Out of memory
kubectl logs -n <namespace> <pod-name> | grep -i "out of memory\|oom"
```

**Analyzing log patterns**:
```bash
# Count errors by type
kubectl logs -n <namespace> <pod-name> | grep -i error | sort | uniq -c | sort -rn

# Find when errors started
kubectl logs -n <namespace> <pod-name> | grep -i error | head -1

# Check error frequency over time
kubectl logs -n <namespace> <pod-name> --since=1h | grep -i error | cut -d' ' -f1 | uniq -c
```

### Log Aggregation

If using centralized logging (ELK, Loki, Splunk):

**Search across all pods**:
- Query by namespace, app label, time range
- Filter by log level (ERROR, WARN, INFO)
- Aggregate by error type
- Create visualizations for error trends

**Example Loki query**:
```
{namespace="production", app="my-app"} |= "error" | json | level="error"
```

---

## Debugging Tools

### kubectl debug

Create debug container in existing pod:
```bash
# Add debug container to running pod
kubectl debug <pod-name> -n <namespace> -it --image=nicolaka/netshoot -- /bin/bash

# Create copy of pod with different image
kubectl debug <pod-name> -n <namespace> -it --copy-to=<new-pod-name> --image=nicolaka/netshoot
```

### ephemeral containers (alpha/beta feature)

Debug pod without restart:
```bash
kubectl debug -it <pod-name> --image=busybox --target=<container-name>
```

### Network Debugging

**netshoot** (network troubleshooting Swiss army knife):
```bash
kubectl run netshoot --rm -it --image=nicolaka/netshoot -n <namespace> -- /bin/bash

# Inside netshoot:
# - ping, traceroute, dig, nslookup
# - curl, wget, httpie
# - telnet, nc (netcat)
# - iperf3 (bandwidth testing)
# - tcpdump (packet capture)
```

**Test connectivity**:
```bash
# DNS lookup
nslookup <service-name>.<namespace>.svc.cluster.local

# HTTP request
curl http://<service-name>.<namespace>.svc.cluster.local:<port>

# TCP connectivity
telnet <service-name> <port>
nc -zv <service-name> <port>

# Packet capture
tcpdump -i any host <ip-address>
```

### Resource Inspection

**detailed pod information**:
```bash
# JSON output
kubectl get pod <pod-name> -n <namespace> -o json

# YAML output
kubectl get pod <pod-name> -n <namespace> -o yaml

# Specific field
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.status.podIP}'

# Multiple fields
kubectl get pods -n <namespace> -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,IP:.status.podIP
```

### Performance Profiling

**CPU and memory usage**:
```bash
# Current usage
kubectl top pod <pod-name> -n <namespace> --containers

# Watch usage
watch kubectl top pod <pod-name> -n <namespace> --containers
```

**Application profiling** (if app supports):
```bash
# Port forward to profiling endpoint
kubectl port-forward <pod-name> -n <namespace> 6060:6060

# Access profiles (example for Go pprof)
curl http://localhost:6060/debug/pprof/heap > heap.prof
curl http://localhost:6060/debug/pprof/profile?seconds=30 > cpu.prof

# Analyze with profiling tools
go tool pprof heap.prof
```

---

## Escalation Criteria

When to escalate:

**Escalate Immediately**:
- Production outage (P0/P1)
- Data loss risk
- Security breach
- Cannot determine root cause after 30 min

**Escalate if Not Resolved**:
- After standard troubleshooting steps exhausted
- Requires specialized knowledge (database, networking)
- Affects multiple services
- Root cause in upstream/downstream service

**Who to Escalate To**:
- On-call engineer (incidents)
- Service owner (service-specific issues)
- Platform team (infrastructure issues)
- Database team (database issues)
- Security team (security concerns)

---

## Quick Reference

### Essential Troubleshooting Commands

```bash
# Pod status
kubectl get pods -n <namespace>
kubectl describe pod <pod-name> -n <namespace>

# Logs
kubectl logs <pod-name> -n <namespace>
kubectl logs <pod-name> --previous -n <namespace>

# Events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'

# Execute commands
kubectl exec <pod-name> -n <namespace> -- <command>

# Network debug pod
kubectl run netshoot --rm -it --image=nicolaka/netshoot -- /bin/bash

# Resource usage
kubectl top nodes
kubectl top pods -n <namespace>

# Service endpoints
kubectl get endpoints <service-name> -n <namespace>
```

### Common Error Messages

| Error Message | Likely Cause | First Step |
|---------------|--------------|------------|
| CrashLoopBackOff | App crashing on startup | Check logs with `--previous` |
| ImagePullBackOff | Cannot pull image | Verify image name and pull secrets |
| Pending | Cannot schedule | Check events for scheduling error |
| OOMKilled | Out of memory | Increase memory limits |
| Connection refused | Service not listening | Check endpoints and port |
| DNS resolution failed | CoreDNS issue or wrong name | Check CoreDNS pods |
| Context deadline exceeded | Timeout | Check resource limits and downstream services |

---

**Related Documentation**:
- Kubernetes troubleshooting: See kubernetes.md → "Troubleshooting Pod States"
- Monitoring and metrics: See monitoring.md
- Incident response: See incident-response.md
- Deployment issues: See deployment.md → "Common Issues"
