# Monitoring and Observability Guide

**Version**: 0.1.0
**Last Updated**: 2025-11-17

This guide covers monitoring setup, observability patterns, alerting strategies, and troubleshooting for cloud-native platforms using Prometheus and Grafana.

---

## Table of Contents

1. [Monitoring Stack Overview](#monitoring-stack-overview)
2. [Prometheus Setup](#prometheus-setup)
3. [Key Metrics](#key-metrics)
4. [Alert Configuration](#alert-configuration)
5. [Grafana Dashboards](#grafana-dashboards)
6. [SLIs and SLOs](#slis-and-slos)
7. [Troubleshooting Monitoring](#troubleshooting-monitoring)
8. [Best Practices](#best-practices)

---

## Monitoring Stack Overview

### Components

**Prometheus**:
- Time-series database
- Metric collection via scraping
- PromQL query language
- Alerting rules

**Grafana**:
- Visualization and dashboards
- Multiple data source support
- Alerting and notification
- User-friendly query builder

**Exporters**:
- **kube-state-metrics**: Kubernetes resource metrics
- **node-exporter**: Node-level metrics (CPU, memory, disk)
- **cAdvisor**: Container metrics (built into Kubelet)
- **Application exporters**: App-specific metrics

**Alertmanager**:
- Alert routing and grouping
- Notification management
- Silence and inhibition rules

### Architecture

```
┌─────────────┐
│   Grafana   │ ← Queries metrics
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ Prometheus  │ ──→ │ Alertmanager │ ──→ Notifications
└──────┬──────┘     └──────────────┘
       │
       ▼ (scrapes)
┌─────────────────────────────────┐
│  Kubernetes Cluster             │
│  ├── kube-state-metrics         │
│  ├── node-exporter              │
│  ├── Application pods           │
│  └── Service monitors           │
└─────────────────────────────────┘
```

---

## Prometheus Setup

### Installation via Helm

```bash
# Add Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus stack (includes Grafana, Alertmanager)
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=15d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi
```

### Verify Installation

```bash
# Check pods
kubectl get pods -n monitoring

# Should see:
# - prometheus-operator
# - prometheus-server
# - alertmanager
# - grafana
# - kube-state-metrics
# - node-exporter (DaemonSet on each node)

# Check services
kubectl get svc -n monitoring
```

### Accessing Prometheus

```bash
# Port forward to Prometheus UI
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Access at http://localhost:9090
```

### Accessing Grafana

```bash
# Get Grafana admin password
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode

# Port forward to Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Access at http://localhost:3000
# Username: admin
# Password: <from above command>
```

### Configuring ServiceMonitor

ServiceMonitor is how Prometheus discovers and scrapes your application metrics.

**Example ServiceMonitor**:
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app-metrics
  namespace: production
  labels:
    app: my-app
    release: prometheus  # Must match Prometheus selector
spec:
  selector:
    matchLabels:
      app: my-app
  endpoints:
  - port: metrics  # Must match service port name
    interval: 30s
    path: /metrics
```

**Corresponding Service**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  namespace: production
  labels:
    app: my-app
spec:
  selector:
    app: my-app
  ports:
  - name: http
    port: 80
    targetPort: 8080
  - name: metrics  # Metrics endpoint
    port: 9090
    targetPort: 9090
```

**Verify ServiceMonitor**:
```bash
# Check ServiceMonitor created
kubectl get servicemonitor -n production

# Verify Prometheus discovered it
# Go to Prometheus UI → Status → Targets
# Should see your app listed
```

---

## Key Metrics

### The Four Golden Signals

1. **Latency**: Time to service requests
2. **Traffic**: Demand on system (requests/sec)
3. **Errors**: Rate of failed requests
4. **Saturation**: Resource utilization

### RED Method (for services)

1. **Rate**: Requests per second
2. **Errors**: Failed requests per second
3. **Duration**: Request latency

### USE Method (for resources)

1. **Utilization**: % time resource is busy
2. **Saturation**: Amount of queued work
3. **Errors**: Error count

### Application Metrics

**HTTP Request Metrics**:
```promql
# Request rate (per second)
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Request duration (p95 latency)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Request duration (p50, p99)
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

**Example Application Metrics Endpoint**:

Your application should expose metrics at `/metrics` in Prometheus format:
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 12345
http_requests_total{method="GET",status="500"} 23

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 8000
http_request_duration_seconds_bucket{le="0.5"} 11000
http_request_duration_seconds_bucket{le="1.0"} 12000
http_request_duration_seconds_bucket{le="+Inf"} 12345
```

### Kubernetes Metrics

**Pod Metrics**:
```promql
# Pod CPU usage
rate(container_cpu_usage_seconds_total{pod="my-app-xyz"}[5m])

# Pod memory usage
container_memory_usage_bytes{pod="my-app-xyz"}

# Pod restart count
kube_pod_container_status_restarts_total{pod="my-app-xyz"}

# Pods by phase
kube_pod_status_phase{namespace="production"}
```

**Deployment Metrics**:
```promql
# Available replicas
kube_deployment_status_replicas_available{deployment="my-app"}

# Desired vs current replicas
kube_deployment_spec_replicas{deployment="my-app"} -
kube_deployment_status_replicas_available{deployment="my-app"}

# Deployment conditions
kube_deployment_status_condition{deployment="my-app",condition="Available"}
```

**Node Metrics**:
```promql
# Node CPU usage
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Node memory usage
100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))

# Node disk usage
100 - ((node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} /
         node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"}) * 100)
```

**Cluster-wide Metrics**:
```promql
# Total pods in cluster
sum(kube_pod_status_phase)

# Total nodes
count(kube_node_info)

# Nodes not ready
count(kube_node_status_condition{condition="Ready",status="false"})

# Cluster CPU usage
sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))

# Cluster memory usage
sum(container_memory_usage_bytes{container!=""})
```

---

## Alert Configuration

### PrometheusRule

Prometheus Operator uses `PrometheusRule` CRD to define alerts.

**Example PrometheusRule**:
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: my-app-alerts
  namespace: production
  labels:
    release: prometheus  # Must match Prometheus selector
spec:
  groups:
  - name: my-app
    interval: 30s
    rules:
    # High error rate alert
    - alert: HighErrorRate
      expr: |
        rate(http_requests_total{status=~"5..",app="my-app"}[5m]) > 0.05
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High error rate on {{ $labels.instance }}"
        description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"

    # High latency alert
    - alert: HighLatency
      expr: |
        histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{app="my-app"}[5m])) > 1
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High request latency on {{ $labels.instance }}"
        description: "P95 latency is {{ $value }}s (threshold: 1s)"

    # Pod not ready
    - alert: PodNotReady
      expr: |
        kube_pod_status_phase{namespace="production",pod=~"my-app-.*",phase!="Running"} == 1
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Pod {{ $labels.pod }} not running"
        description: "Pod is in {{ $labels.phase }} state"

    # High memory usage
    - alert: HighMemoryUsage
      expr: |
        container_memory_usage_bytes{pod=~"my-app-.*"} /
        container_spec_memory_limit_bytes{pod=~"my-app-.*"} > 0.9
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage on {{ $labels.pod }}"
        description: "Memory usage is {{ $value | humanizePercentage }} of limit"

    # High restart count
    - alert: HighRestartCount
      expr: |
        rate(kube_pod_container_status_restarts_total{pod=~"my-app-.*"}[15m]) > 0
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Pod {{ $labels.pod }} restarting"
        description: "Pod has restarted {{ $value }} times in last 15 minutes"
```

**Apply PrometheusRule**:
```bash
kubectl apply -f prometheus-rule.yaml

# Verify rule created
kubectl get prometheusrule -n production

# Check rules in Prometheus UI
# Prometheus UI → Status → Rules
```

### Common Alert Patterns

**Service Availability**:
```yaml
- alert: ServiceDown
  expr: up{job="my-app"} == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Service {{ $labels.instance }} is down"
```

**Request Rate Drop** (potential traffic loss):
```yaml
- alert: RequestRateDrop
  expr: |
    rate(http_requests_total{app="my-app"}[5m]) <
    0.5 * rate(http_requests_total{app="my-app"}[1h] offset 1d)
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Request rate dropped significantly"
```

**Deployment Replica Mismatch**:
```yaml
- alert: DeploymentReplicaMismatch
  expr: |
    kube_deployment_spec_replicas != kube_deployment_status_replicas_available
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Deployment {{ $labels.deployment }} has {{ $value }} replicas unavailable"
```

**Persistent Volume Usage**:
```yaml
- alert: PVCAlmostFull
  expr: |
    kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.85
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "PVC {{ $labels.persistentvolumeclaim }} is 85% full"
```

### Alert Severity Levels

**Critical** (page immediately):
- Service completely down
- Data loss risk
- Security breach
- Major customer impact

**Warning** (notify during business hours):
- Degraded performance
- Approaching resource limits
- Non-critical failures
- Potential future issues

**Info** (log only):
- Configuration changes
- Maintenance events
- Informational notices

### Alertmanager Configuration

**Routing and Notification**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: monitoring
data:
  alertmanager.yml: |
    global:
      resolve_timeout: 5m
      slack_api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'

    route:
      group_by: ['alertname', 'cluster']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'slack-notifications'

      routes:
      # Critical alerts to PagerDuty
      - match:
          severity: critical
        receiver: 'pagerduty'
        continue: true

      # Warnings to Slack
      - match:
          severity: warning
        receiver: 'slack-notifications'

    receivers:
    - name: 'slack-notifications'
      slack_configs:
      - channel: '#platform-alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

    - name: 'pagerduty'
      pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
```

---

## Grafana Dashboards

### Pre-built Dashboards

The kube-prometheus-stack comes with excellent pre-built dashboards:

**Access pre-built dashboards**:
1. Login to Grafana
2. Navigate to Dashboards → Browse
3. Look for folders: "Kubernetes", "Prometheus"

**Key dashboards**:
- **Kubernetes / Compute Resources / Cluster**: Overall cluster view
- **Kubernetes / Compute Resources / Namespace (Pods)**: Pod-level metrics
- **Kubernetes / Compute Resources / Node (Pods)**: Node-level metrics
- **Prometheus**: Prometheus itself monitoring

### Creating Custom Dashboard

**Dashboard for Your Application**:

1. **Create new dashboard**: Dashboards → New → New Dashboard

2. **Add panels**:

**Request Rate Panel**:
```promql
# Query
sum(rate(http_requests_total{app="my-app"}[5m])) by (status)

# Panel settings:
- Visualization: Time series
- Legend: {{ status }}
- Unit: reqps (requests per second)
```

**Error Rate Panel**:
```promql
# Query
sum(rate(http_requests_total{app="my-app",status=~"5.."}[5m])) /
sum(rate(http_requests_total{app="my-app"}[5m])) * 100

# Panel settings:
- Visualization: Stat
- Unit: percent (0-100)
- Thresholds: Green (0-1), Yellow (1-5), Red (5-100)
```

**Latency Panel** (P50, P95, P99):
```promql
# P50
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket{app="my-app"}[5m]))

# P95
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{app="my-app"}[5m]))

# P99
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{app="my-app"}[5m]))

# Panel settings:
- Visualization: Time series
- Unit: seconds (s)
- Multiple queries with labels: P50, P95, P99
```

**Pod Count Panel**:
```promql
# Query
count(kube_pod_status_phase{namespace="production",pod=~"my-app-.*",phase="Running"})

# Panel settings:
- Visualization: Stat
- Color scheme: Green when > 0
```

**Memory Usage Panel**:
```promql
# Query
sum(container_memory_usage_bytes{pod=~"my-app-.*"}) by (pod)

# Panel settings:
- Visualization: Time series
- Unit: bytes (IEC)
- Stack: Normal (to see individual pods)
```

**CPU Usage Panel**:
```promql
# Query
sum(rate(container_cpu_usage_seconds_total{pod=~"my-app-.*"}[5m])) by (pod)

# Panel settings:
- Visualization: Time series
- Unit: cores
```

3. **Dashboard Variables**:

Create variables for flexibility:
- `namespace`: Query = `label_values(kube_namespace_labels, namespace)`
- `app`: Query = `label_values(kube_pod_labels{namespace="$namespace"}, label_app)`

Use in queries: `{namespace="$namespace",app="$app"}`

4. **Set time range and refresh**:
- Time range: Last 1 hour
- Refresh: 30s

5. **Save dashboard**: Click Save, give it a name

### Dashboard Best Practices

1. **Use consistent time ranges** across panels
2. **Group related metrics** (e.g., all latency metrics together)
3. **Use meaningful panel titles**
4. **Add descriptions** to panels explaining what they show
5. **Set appropriate units** (seconds, bytes, percentage)
6. **Use color coding** (green = good, yellow = warning, red = critical)
7. **Create drill-down dashboards** (cluster → namespace → pod)
8. **Export and version control** dashboard JSON in git

### Exporting Dashboard

```bash
# From Grafana UI: Dashboard → Share → Export → Save to file

# Store in git for version control
git add dashboards/my-app-dashboard.json
git commit -m "Add my-app monitoring dashboard"
```

### Importing Dashboard

```bash
# From Grafana UI: Dashboards → Import → Upload JSON file
# Or paste JSON content
```

---

## SLIs and SLOs

### Service Level Indicators (SLIs)

**What to measure** (examples for HTTP service):

1. **Availability**:
   ```promql
   sum(rate(http_requests_total{app="my-app"}[5m])) -
   sum(rate(http_requests_total{app="my-app",status=~"5.."}[5m]))
   /
   sum(rate(http_requests_total{app="my-app"}[5m]))
   ```

2. **Latency** (P95 under threshold):
   ```promql
   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{app="my-app"}[5m])) < 0.5
   ```

3. **Error Rate**:
   ```promql
   sum(rate(http_requests_total{app="my-app",status=~"5.."}[5m])) /
   sum(rate(http_requests_total{app="my-app"}[5m]))
   ```

### Service Level Objectives (SLOs)

**Example SLOs**:

1. **Availability**: 99.9% of requests succeed (non-5xx)
2. **Latency**: 95% of requests complete in < 500ms
3. **Error Budget**: 0.1% of requests can fail (for 99.9% SLO)

**Calculating Error Budget**:
```promql
# Total requests in 30 days
sum(increase(http_requests_total{app="my-app"}[30d]))

# Failed requests
sum(increase(http_requests_total{app="my-app",status=~"5.."}[30d]))

# Error budget remaining (for 99.9% SLO = 0.1% error budget)
(0.001 * sum(increase(http_requests_total{app="my-app"}[30d]))) -
sum(increase(http_requests_total{app="my-app",status=~"5.."}[30d]))
```

**Recording Rules for SLOs**:
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: slo-rules
spec:
  groups:
  - name: slo
    interval: 30s
    rules:
    # Record availability SLI
    - record: my_app:availability:rate5m
      expr: |
        (sum(rate(http_requests_total{app="my-app"}[5m])) -
         sum(rate(http_requests_total{app="my-app",status=~"5.."}[5m]))) /
        sum(rate(http_requests_total{app="my-app"}[5m]))

    # Alert when SLO at risk
    - alert: SLOViolation
      expr: my_app:availability:rate5m < 0.999
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "SLO violation: availability is {{ $value | humanizePercentage }}"
```

---

## Troubleshooting Monitoring

### Prometheus Not Scraping Targets

**Symptoms**:
- Target shows as "down" in Prometheus UI
- Metrics missing for service

**Check**:
```bash
# Verify ServiceMonitor exists
kubectl get servicemonitor -n <namespace>

# Check ServiceMonitor selector matches service labels
kubectl describe servicemonitor <name> -n <namespace>
kubectl describe service <name> -n <namespace>

# Verify Prometheus can reach service
kubectl exec -n monitoring prometheus-<pod> -- wget -O- http://<service>.<namespace>.svc.cluster.local:9090/metrics
```

**Common issues**:
1. ServiceMonitor labels don't match Prometheus selector
2. Service port name doesn't match ServiceMonitor endpoint
3. Network policy blocking Prometheus scrape
4. Application not exposing metrics endpoint

### Metrics Not Appearing

**Symptoms**:
- Queries return no data
- Dashboards show "No data"

**Check**:
```bash
# Verify target is being scraped
# Prometheus UI → Status → Targets
# Should show your service with "UP" status

# Check for scrape errors
# Look for errors in target details

# Query Prometheus directly
curl 'http://localhost:9090/api/v1/query?query=up{job="my-app"}'
```

**Common issues**:
1. Metric name typo in query
2. Label selector doesn't match
3. Metric not being exported by application
4. Scrape interval too long (increase scrape frequency)

### Alerts Not Firing

**Symptoms**:
- Expected alert not triggering
- No notifications received

**Check**:
```bash
# Verify PrometheusRule exists
kubectl get prometheusrule -n <namespace>

# Check alert in Prometheus UI
# Prometheus UI → Alerts
# Should show alert and current state

# Check Alertmanager
# Prometheus UI → Status → Runtime & Build Information → Alertmanagers
# Should show Alertmanager connected

# Check Alertmanager UI
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-alertmanager 9093:9093
# Visit http://localhost:9093
```

**Common issues**:
1. PrometheusRule labels don't match Prometheus selector
2. Alert `expr` never evaluates to true (test query)
3. Alert `for` duration too long
4. Alertmanager routing configuration wrong
5. Notification webhook/integration not configured

### High Cardinality Metrics

**Symptoms**:
- Prometheus using excessive memory
- Queries slow or timing out
- High CPU usage

**Diagnosis**:
```promql
# Check series count
prometheus_tsdb_symbol_table_size_bytes

# Check cardinality by metric
topk(10, count by (__name__)({__name__=~".+"}))

# Check cardinality by label
topk(10, count by (job)({__name__=~".+"}))
```

**Resolution**:
1. Reduce label cardinality (avoid user IDs, request IDs in labels)
2. Increase scrape interval for high-cardinality metrics
3. Use relabeling to drop unnecessary labels
4. Set retention period shorter if needed

### Grafana Dashboard Not Loading

**Symptoms**:
- Dashboard shows loading spinner
- Queries timeout

**Check**:
```bash
# Verify Grafana can reach Prometheus
kubectl logs -n monitoring deployment/prometheus-grafana

# Check Prometheus data source
# Grafana → Configuration → Data Sources → Prometheus
# Click "Test" button

# Verify queries in Prometheus UI first
# Copy query from Grafana panel, test in Prometheus
```

**Common issues**:
1. Prometheus data source URL incorrect
2. Query too expensive (too much data)
3. Time range too large
4. Prometheus overloaded

---

## Best Practices

### Metric Naming

Follow Prometheus naming conventions:
- Use base unit (seconds, bytes, not milliseconds, megabytes)
- Suffix with unit: `_seconds`, `_bytes`, `_total` (for counters)
- Use snake_case: `http_requests_total` not `httpRequestsTotal`

### Label Best Practices

**Good labels**:
- `method="GET"` (low cardinality)
- `status="200"` (low cardinality)
- `endpoint="/api/users"` (low cardinality)

**Bad labels**:
- `user_id="12345"` (high cardinality - millions of users)
- `request_id="abc-xyz-123"` (high cardinality - every request unique)
- `timestamp="2024-01-01T12:00:00Z"` (high cardinality - every second)

### Alert Design

1. **Alert on symptoms, not causes**:
   - ✅ "High error rate" (symptom)
   - ❌ "Database connection pool exhausted" (cause)

2. **Make alerts actionable**:
   - Include runbook link
   - Provide context in annotation
   - Suggest first troubleshooting step

3. **Reduce alert fatigue**:
   - Set appropriate thresholds
   - Use `for` clause to avoid flapping
   - Group related alerts
   - Use appropriate severity levels

4. **Test alerts**:
   - Trigger alerts in staging
   - Verify notifications work
   - Practice incident response

### Dashboard Design

1. **Start with key metrics** (golden signals) at top
2. **Drill down to details** below
3. **Use consistent colors** across dashboards
4. **Add annotations** for deployments, incidents
5. **Group by service** or namespace
6. **Include links** to runbooks, logs, related dashboards

### Monitoring Coverage

**What to monitor**:
- ✅ Application metrics (requests, errors, latency)
- ✅ Kubernetes resources (pods, deployments, nodes)
- ✅ Infrastructure (CPU, memory, disk, network)
- ✅ Dependencies (databases, external APIs)
- ✅ Business metrics (orders, signups, revenue)

**What NOT to monitor**:
- ❌ Debug-level details (use logging)
- ❌ High-cardinality data (use tracing)
- ❌ Ephemeral events (use event logs)

### Retention and Storage

**Prometheus retention**:
- Default: 15 days
- Production: 15-30 days (balance cost vs usefulness)
- Long-term: Use Thanos or Cortex for longer retention

**Storage sizing**:
```
storage_needed = ingestion_rate * retention_period * overhead
```

Example:
- Ingestion rate: 10k samples/sec
- Retention: 15 days
- Overhead: 2x (including WAL)
- Storage: ~25 GB

---

## Quick Reference

### Essential PromQL Queries

```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Pod CPU usage
rate(container_cpu_usage_seconds_total{pod="my-app"}[5m])

# Pod memory usage
container_memory_usage_bytes{pod="my-app"}

# Pod restarts
kube_pod_container_status_restarts_total{pod="my-app"}
```

### Common Commands

```bash
# Port forward to Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Port forward to Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Query Prometheus
curl 'http://localhost:9090/api/v1/query?query=up'

# Reload Prometheus config
curl -X POST http://localhost:9090/-/reload
```

---

**Related Documentation**:
- Kubernetes operations: See kubernetes.md
- Deployment procedures: See deployment.md
- Troubleshooting: See troubleshooting.md
- Incident response: See incident-response.md
