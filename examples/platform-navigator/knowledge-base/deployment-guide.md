# Deployment Guide

## Production Deployment

To deploy to production, follow these steps:

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Run tests**
   ```bash
   npm test
   ```

3. **Deploy using kubectl**
   ```bash
   kubectl apply -f k8s/production.yaml
   ```

4. **Verify deployment**
   ```bash
   kubectl get pods -n production
   kubectl rollout status deployment/app -n production
   ```

## SSL Configuration

SSL certificates are managed through AWS Certificate Manager (ACM).

To configure SSL:

1. Create or import a certificate in ACM
2. Note the certificate ARN
3. Update the load balancer configuration in `terraform/load-balancer.tf`:
   ```hcl
   certificate_arn = "arn:aws:acm:us-east-1:123456789:certificate/abc-def-123"
   ```

## Rollback Procedure

If deployment fails:

```bash
kubectl rollout undo deployment/app -n production
```

This will roll back to the previous deployment version.

## Environment Variables

Required environment variables for production:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `API_KEY` - External API key
- `LOG_LEVEL` - Set to "info" for production

Last updated: 2025-11-11
