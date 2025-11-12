# Monitoring and Observability

## Metrics

We use Prometheus for metrics collection and Grafana for visualization.

### Key Metrics to Monitor

1. **Application Performance**
   - Request latency (p50, p95, p99)
   - Request rate
   - Error rate

2. **Infrastructure Health**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network throughput

3. **Database Performance**
   - Connection pool usage
   - Query latency
   - Slow query count

## Alerting

Alerts are configured in AlertManager.

### Critical Alerts

- Pod crash loops
- High error rate (> 5%)
- Response time > 1000ms (p95)
- Database connection failures

### Warning Alerts

- Memory usage > 80%
- CPU usage > 75%
- Disk space < 20%

## Dashboards

Access Grafana dashboards at: https://grafana.example.com

Key dashboards:
- Application Overview
- Infrastructure Health
- Database Performance
- Error Tracking

## Logs

Logs are collected by Fluentd and stored in Elasticsearch.

Query logs in Kibana: https://kibana.example.com

Common log queries:
- `level:ERROR` - All errors
- `status:500` - HTTP 500 errors
- `service:api AND level:WARN` - API warnings

## Troubleshooting

### High CPU Usage

1. Check current pods:
   ```bash
   kubectl top pods -n production
   ```

2. Identify resource-intensive processes

3. Scale horizontally if needed:
   ```bash
   kubectl scale deployment/app --replicas=5 -n production
   ```

### Database Connection Errors

1. Check connection pool stats in metrics
2. Verify database is reachable
3. Review connection string configuration
4. Check for connection leaks in application logs

Last updated: 2025-11-11
