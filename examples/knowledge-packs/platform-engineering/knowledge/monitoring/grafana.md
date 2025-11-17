# Grafana Dashboard Guide

**Last Updated:** 2025-11-17

## Overview

Grafana is our visualization platform for Prometheus metrics. This guide covers creating dashboards, configuring panels, and setting up alerts.

## Access

- **URL:** https://grafana.company.com
- **Login:** Use your company SSO credentials
- **Datasource:** Prometheus (pre-configured)

## Creating a Dashboard

### Quick Start

1. Click **+ → Dashboard** in left sidebar
2. Click **Add visualization**
3. Select **Prometheus** as datasource
4. Enter PromQL query
5. Choose visualization type
6. Click **Apply**

### Dashboard from Template

We provide standard templates for common use cases:

**Application Dashboard:**
```bash
# Import from Grafana.com
Dashboard ID: 12345
Or upload: templates/app-dashboard.json
```

**Kubernetes Dashboard:**
```bash
# Import from Grafana.com
Dashboard ID: 15758
Or upload: templates/k8s-dashboard.json
```

## Panel Types

### Time Series (Graph)

Best for: Trends over time (CPU, memory, request rate)

**Example: Request Rate**
```promql
sum(rate(http_requests_total{app="my-app"}[5m])) by (endpoint)
```

**Panel settings:**
- Visualization: Time series
- Legend: {{ endpoint }}
- Unit: requests/sec
- Y-axis: Min 0

### Stat (Single Value)

Best for: Current status, totals, percentages

**Example: Current Error Rate**
```promql
(
  sum(rate(http_requests_total{status=~"5..",app="my-app"}[5m]))
  /
  sum(rate(http_requests_total{app="my-app"}[5m]))
) * 100
```

**Panel settings:**
- Visualization: Stat
- Unit: percent (0-100)
- Thresholds:
  - Green: 0-1
  - Yellow: 1-5
  - Red: 5-100

### Gauge

Best for: Current usage vs. limits

**Example: Memory Usage**
```promql
(
  sum(container_memory_working_set_bytes{app="my-app"})
  /
  sum(container_spec_memory_limit_bytes{app="my-app"})
) * 100
```

**Panel settings:**
- Visualization: Gauge
- Unit: percent (0-100)
- Min: 0, Max: 100
- Thresholds:
  - Green: 0-70
  - Yellow: 70-90
  - Red: 90-100

### Table

Best for: Lists, comparisons across multiple services

**Example: Pod Resource Usage**
```promql
sum(rate(container_cpu_usage_seconds_total{app="my-app"}[5m])) by (pod)
```

**Panel settings:**
- Visualization: Table
- Transform: Organize fields (rename columns)
- Sort by: Value descending

### Heatmap

Best for: Distribution analysis (latency percentiles)

**Example: Request Latency Distribution**
```promql
sum(rate(http_request_duration_seconds_bucket{app="my-app"}[5m])) by (le)
```

**Panel settings:**
- Visualization: Heatmap
- Data format: Time series buckets
- Color scheme: Spectral

## Common Dashboards

### Application Overview

**Panels to include:**

1. **Request Rate (Time Series)**
   ```promql
   sum(rate(http_requests_total{app="my-app"}[5m]))
   ```

2. **Error Rate (Stat)**
   ```promql
   (sum(rate(http_requests_total{status=~"5..",app="my-app"}[5m])) / sum(rate(http_requests_total{app="my-app"}[5m]))) * 100
   ```

3. **P95 Latency (Time Series)**
   ```promql
   histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="my-app"}[5m])) by (le))
   ```

4. **Active Pods (Gauge)**
   ```promql
   count(up{app="my-app"} == 1)
   ```

5. **CPU Usage (Time Series)**
   ```promql
   sum(rate(container_cpu_usage_seconds_total{app="my-app"}[5m])) by (pod)
   ```

6. **Memory Usage (Time Series)**
   ```promql
   sum(container_memory_working_set_bytes{app="my-app"}) by (pod)
   ```

### Infrastructure Overview

1. **Node CPU (Time Series)**
   ```promql
   100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
   ```

2. **Node Memory (Time Series)**
   ```promql
   (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
   ```

3. **Disk Usage (Gauge per node)**
   ```promql
   100 - ((node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100)
   ```

4. **Network I/O (Time Series)**
   ```promql
   rate(node_network_receive_bytes_total[5m])
   rate(node_network_transmit_bytes_total[5m])
   ```

## Variables

Use variables for dynamic dashboards:

### Creating a Variable

1. Dashboard Settings → Variables → Add variable
2. **Name:** `namespace`
3. **Type:** Query
4. **Datasource:** Prometheus
5. **Query:** `label_values(kube_pod_info, namespace)`
6. **Multi-value:** Yes
7. **Include All:** Yes

### Using Variables in Queries

```promql
sum(rate(http_requests_total{namespace="$namespace",app="$app"}[5m]))
```

### Common Variables

**Namespace:**
```promql
label_values(kube_pod_info, namespace)
```

**Application:**
```promql
label_values(http_requests_total{namespace="$namespace"}, app)
```

**Pod:**
```promql
label_values(kube_pod_info{namespace="$namespace"}, pod)
```

**Environment:**
```
Custom: staging, production
```

## Annotations

Add context to graphs with annotations:

### Deployment Annotations

Show when deployments happened:

1. Dashboard Settings → Annotations → Add annotation query
2. **Name:** Deployments
3. **Datasource:** Prometheus
4. **Query:**
   ```promql
   changes(kube_deployment_status_observed_generation{namespace="my-namespace"}[5m]) > 0
   ```
5. **Title:** Deployment
6. **Tags:** deployment
7. **Color:** Blue

### Alert Annotations

Show when alerts fired:

**Query:**
```promql
ALERTS{alertname="HighErrorRate",namespace="my-namespace"}
```

## Alerts in Grafana

While we use Prometheus Alertmanager for production alerts, Grafana alerts are useful for ad-hoc monitoring:

### Creating an Alert

1. Edit panel
2. Alert tab → Create alert
3. **Condition:**
   - WHEN `avg()` OF `query(A, 5m, now)`
   - IS ABOVE `0.05`
4. **No Data:** Set state to No Data
5. **Execution Error:** Set state to Alerting
6. **Evaluate every:** 1m
7. **For:** 5m

### Alert Notifications

Configure Slack notifications:

1. Alerting → Notification channels → New channel
2. **Type:** Slack
3. **Webhook URL:** `https://hooks.slack.com/services/XXX`
4. **Channel:** `#platform-alerts`
5. **Test** notification

## Templates and Folders

### Dashboard Organization

```
Dashboards/
├── Platform/
│   ├── Infrastructure Overview
│   ├── Kubernetes Cluster
│   └── Network Overview
├── Applications/
│   ├── My App - Production
│   ├── My App - Staging
│   └── Service Mesh
└── Business Metrics/
    ├── API Usage
    └── User Activity
```

### Sharing Dashboards

**Export:**
```bash
# Via UI: Dashboard Settings → JSON Model → Copy
# Save to git: dashboards/my-app-dashboard.json
```

**Import:**
```bash
# Upload JSON file
# Or import from Grafana.com by ID
```

**Template Variables:**
```json
{
  "templating": {
    "list": [
      {
        "name": "namespace",
        "type": "query",
        "datasource": "Prometheus",
        "query": "label_values(kube_pod_info, namespace)",
        "multi": true,
        "includeAll": true
      }
    ]
  }
}
```

## Performance Tips

1. **Limit time ranges:** Default to 6h or 24h, not 30d
2. **Use recording rules:** For expensive queries (see prometheus.md)
3. **Reduce panel refresh:** Set to 30s or 1m instead of 5s
4. **Use variables:** Filter data at query time
5. **Aggregate early:** `sum()` before `rate()` when possible

## Best Practices

### Dashboard Design

- **Golden Signals:** Show request rate, errors, duration, saturation
- **Logical grouping:** Related panels together in rows
- **Consistent colors:** Use same colors across dashboards (red=errors, green=success)
- **Appropriate units:** Use bytes, percent, requests/sec appropriately
- **Meaningful names:** Panel titles should be self-explanatory

### Query Optimization

- Use recording rules for repeated queries
- Limit cardinality (don't graph by pod ID)
- Use `$__interval` for dynamic step sizes
- Add query description in panel

### Alerting

- Use Prometheus Alertmanager for production (more reliable)
- Use Grafana alerts for exploratory analysis
- Don't duplicate alerts across systems
- Set appropriate thresholds (avoid alert fatigue)

## Troubleshooting

### "No data" in panel

1. **Check query syntax:**
   ```bash
   # Test in Prometheus UI first
   http://prometheus:9090/graph
   ```

2. **Verify time range:**
   - Ensure data exists for selected range
   - Try "Last 5 minutes"

3. **Check datasource:**
   - Dashboard Settings → Variables
   - Verify Prometheus datasource is selected

### Slow dashboard loading

1. **Reduce time range:** 6h instead of 7d
2. **Use recording rules:** Pre-calculate expensive queries
3. **Limit panel refresh rate:** 1m instead of 10s
4. **Reduce cardinality:** Aggregate by service not pod

### Variables not populating

1. **Check Prometheus connectivity:**
   ```bash
   curl http://prometheus:9090/api/v1/label/__name__/values
   ```

2. **Verify query returns results:**
   - Test `label_values()` query in Prometheus UI

3. **Check variable dependencies:**
   - Ensure parent variables are set first

## Related Documentation

- [Prometheus Monitoring](prometheus.md) - Writing queries and alerts
- [Kubernetes Deployment](../deployment/kubernetes.md) - Deploying applications
- [Architecture Overview](../architecture/overview.md) - Understanding the platform
