# Prometheus Monitoring Guide

**Last Updated:** 2025-11-17

## Overview

Prometheus is our metrics collection and alerting system. This guide covers setting up metrics, writing PromQL queries, and configuring alerts.

## Exposing Metrics

### Add Prometheus Client

**Go:**
```go
import (
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
    http.Handle("/metrics", promhttp.Handler())
    http.ListenAndServe(":8080", nil)
}
```

**Python:**
```python
from prometheus_client import Counter, Histogram, start_http_server

# Start metrics server on port 8000
start_http_server(8000)

# Define metrics
request_count = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint'])
request_duration = Histogram('http_request_duration_seconds', 'HTTP request latency')
```

**Node.js:**
```javascript
const client = require('prom-client');
const express = require('express');
const app = express();

// Collect default metrics
client.collectDefaultMetrics();

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

### ServiceMonitor Configuration

Tell Prometheus to scrape your app:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app
  namespace: my-namespace
  labels:
    app: my-app
spec:
  selector:
    matchLabels:
      app: my-app
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

Or add annotations to your service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
    prometheus.io/path: "/metrics"
spec:
  ports:
  - name: metrics
    port: 8080
```

## Common Metrics

### Standard Metrics to Track

**Request Rate:**
```promql
rate(http_requests_total[5m])
```

**Error Rate:**
```promql
rate(http_requests_total{status=~"5.."}[5m])
```

**Request Duration (p95):**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Request Duration (p99):**
```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

**Error Percentage:**
```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m])) * 100
```

### Infrastructure Metrics

**CPU Usage:**
```promql
# By pod
rate(container_cpu_usage_seconds_total{namespace="my-namespace",pod=~"my-app.*"}[5m])

# By node
100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

**Memory Usage:**
```promql
# Current usage
container_memory_working_set_bytes{namespace="my-namespace",pod=~"my-app.*"}

# As percentage of limit
container_memory_working_set_bytes / container_spec_memory_limit_bytes * 100
```

**Disk Usage:**
```promql
(node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes * 100
```

**Network I/O:**
```promql
# Receive rate
rate(container_network_receive_bytes_total[5m])

# Transmit rate
rate(container_network_transmit_bytes_total[5m])
```

## PromQL Queries

### Basic Queries

**Instant vector (current value):**
```promql
http_requests_total{app="my-app"}
```

**Range vector (time series):**
```promql
http_requests_total{app="my-app"}[5m]
```

**Rate (per-second average):**
```promql
rate(http_requests_total{app="my-app"}[5m])
```

**Sum across dimensions:**
```promql
sum(rate(http_requests_total[5m])) by (endpoint)
```

### Aggregations

**Average:**
```promql
avg(http_request_duration_seconds) by (endpoint)
```

**Maximum:**
```promql
max(http_request_duration_seconds) by (endpoint)
```

**Minimum:**
```promql
min(http_request_duration_seconds) by (endpoint)
```

**Count:**
```promql
count(up{app="my-app"}) by (namespace)
```

### Time Functions

**Predict future (linear regression):**
```promql
predict_linear(disk_usage_bytes[1h], 3600)
```

**Derivative (rate of change):**
```promql
deriv(http_requests_total[5m])
```

**Delta (absolute change):**
```promql
delta(http_requests_total[5m])
```

## Alerting

### PrometheusRule Configuration

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: my-app-alerts
  namespace: my-namespace
spec:
  groups:
  - name: my-app
    interval: 30s
    rules:
    # High error rate
    - alert: HighErrorRate
      expr: |
        (
          sum(rate(http_requests_total{status=~"5..",app="my-app"}[5m]))
          /
          sum(rate(http_requests_total{app="my-app"}[5m]))
        ) > 0.05
      for: 5m
      labels:
        severity: warning
        team: platform
      annotations:
        summary: "High error rate detected for {{ $labels.app }}"
        description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"

    # Service down
    - alert: ServiceDown
      expr: up{app="my-app"} == 0
      for: 2m
      labels:
        severity: critical
        team: platform
      annotations:
        summary: "Service {{ $labels.app }} is down"
        description: "{{ $labels.app }} in {{ $labels.namespace }} has been down for 2 minutes"

    # High latency
    - alert: HighLatency
      expr: |
        histogram_quantile(0.95,
          sum(rate(http_request_duration_seconds_bucket{app="my-app"}[5m])) by (le)
        ) > 1.0
      for: 10m
      labels:
        severity: warning
        team: platform
      annotations:
        summary: "High latency for {{ $labels.app }}"
        description: "p95 latency is {{ $value }}s (threshold: 1s)"

    # High memory usage
    - alert: HighMemoryUsage
      expr: |
        (
          container_memory_working_set_bytes{app="my-app"}
          /
          container_spec_memory_limit_bytes{app="my-app"}
        ) > 0.9
      for: 5m
      labels:
        severity: warning
        team: platform
      annotations:
        summary: "High memory usage for {{ $labels.pod }}"
        description: "Memory usage is {{ $value | humanizePercentage }} of limit"
```

### Alert Severity Levels

- **critical**: Immediate action required, service down or data loss imminent
- **warning**: Should be addressed soon, degraded performance or approaching limits
- **info**: Informational, no action required

### Alertmanager Integration

Configure Slack notifications in Alertmanager:

```yaml
receivers:
- name: 'platform-team'
  slack_configs:
  - api_url: 'https://hooks.slack.com/services/XXX'
    channel: '#platform-alerts'
    title: '{{ .GroupLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

route:
  receiver: 'platform-team'
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
  - match:
      severity: critical
    receiver: 'platform-team'
    continue: true
```

## Recording Rules

Pre-calculate expensive queries for dashboard performance:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: my-app-recording-rules
  namespace: my-namespace
spec:
  groups:
  - name: my-app-recordings
    interval: 30s
    rules:
    # Request rate by endpoint
    - record: job:http_requests:rate5m
      expr: sum(rate(http_requests_total[5m])) by (job, endpoint)

    # Error rate
    - record: job:http_errors:rate5m
      expr: sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)

    # P95 latency
    - record: job:http_request_duration:p95
      expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (job, le))
```

## Testing Queries

### Prometheus UI

Access at: `http://prometheus.company.com`

1. Enter query in expression browser
2. Click "Execute"
3. View "Graph" or "Table" tab
4. Adjust time range as needed

### Command Line

```bash
# Query Prometheus API
curl 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=up{app="my-app"}'

# Query with time range
curl 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=rate(http_requests_total[5m])' \
  --data-urlencode 'start=2025-11-17T00:00:00Z' \
  --data-urlencode 'end=2025-11-17T01:00:00Z' \
  --data-urlencode 'step=60s'
```

## Best Practices

### Metric Naming

Follow Prometheus conventions:

- **Counters:** `{noun}_total` (e.g., `http_requests_total`)
- **Gauges:** `{noun}` (e.g., `memory_usage_bytes`)
- **Histograms:** `{noun}_bucket`, `{noun}_sum`, `{noun}_count`
- **Summaries:** `{noun}_quantile`, `{noun}_sum`, `{noun}_count`

### Labels

- Use labels for dimensions you want to query: `http_requests_total{method="GET", endpoint="/api/users"}`
- Don't use high-cardinality labels (e.g., user IDs) - causes performance issues
- Keep label names lowercase with underscores: `status_code` not `statusCode`

### Performance

- Use recording rules for expensive queries shown in dashboards
- Limit query time ranges - avoid 30d+ ranges
- Use `rate()` instead of `irate()` for alerting (less spiky)
- Aggregate before recording (sum by job, not by pod)

## Related Documentation

- [Grafana Dashboards](grafana.md) - Visualizing Prometheus metrics
- [Kubernetes Deployment](../deployment/kubernetes.md) - Deploying monitored services
- [Architecture Overview](../architecture/overview.md) - Monitoring architecture
