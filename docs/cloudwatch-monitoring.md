# CloudWatch Dashboard Configuration for OIDC Provider

This document describes the CloudWatch metrics and dashboard setup for monitoring the OIDC provider.

## Available Metrics

### Authentication Metrics
- `OIDC/Provider/AuthenticationAttempts` - Total auth attempts by client and result
- `OIDC/Provider/AuthenticationSuccess` - Successful authentications by client
- `OIDC/Provider/AuthenticationFailure` - Failed authentications by client and reason
- `OIDC/Provider/AuthenticationDuration` - Auth request processing time

### API Performance Metrics
- `OIDC/Provider/ApiRequests` - API requests by endpoint and method
- `OIDC/Provider/ApiResponses` - API responses by endpoint and status code
- `OIDC/Provider/ApiDuration` - API request processing time
- `OIDC/Provider/ApiErrors` - API errors by endpoint and status code

### Rate Limiting Metrics
- `OIDC/Provider/RateLimitEvents` - Rate limit events by endpoint and action
- `OIDC/Provider/RateLimitBlocked` - Blocked requests by endpoint
- `OIDC/Provider/RateLimitRemaining` - Remaining capacity by endpoint

### User Management Metrics
- `OIDC/Provider/UserMgmtOperations` - User management operations by type and result
- `OIDC/Provider/AdminOperations` - Admin operations by type and result

### Token Operations Metrics
- `OIDC/Provider/TokenOperations` - Token introspection/revocation by type and result
- `OIDC/Provider/TokenOperationDuration` - Token operation processing time

### System Health Metrics
- `OIDC/Provider/ComponentHealth` - Component health status
- `OIDC/Provider/ComponentResponseTime` - Component response times

## Standard Dimensions

All metrics include these standard dimensions:
- `Environment` - Environment name (dev, staging, prod)
- `Provider` - Always "oidc-provider"

Additional dimensions vary by metric type:
- `ClientId` - OAuth client identifier
- `Endpoint` - API endpoint name
- `Method` - HTTP method
- `StatusCode` - HTTP status code
- `Result` - Operation result (success/failure)
- `Reason` - Failure reason
- `UserRole` - User role performing operation
- `Component` - System component name

## Sample Dashboard Widgets

### Authentication Success Rate
```json
{
    "type": "metric",
    "properties": {
        "metrics": [
            [ "OIDC/Provider", "AuthenticationSuccess", { "stat": "Sum" } ],
            [ ".", "AuthenticationFailure", { "stat": "Sum" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "Authentication Success vs Failure",
        "period": 300
    }
}
```

### API Performance Overview
```json
{
    "type": "metric",
    "properties": {
        "metrics": [
            [ "OIDC/Provider", "ApiDuration", "Endpoint", "authorize", { "stat": "Average" } ],
            [ "...", "token", { "stat": "Average" } ],
            [ "...", "userinfo", { "stat": "Average" } ],
            [ "...", "jwks", { "stat": "Average" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "API Response Times by Endpoint",
        "period": 300,
        "yAxis": {
            "left": {
                "min": 0
            }
        }
    }
}
```

### Rate Limiting Status
```json
{
    "type": "metric",
    "properties": {
        "metrics": [
            [ "OIDC/Provider", "RateLimitBlocked", "Endpoint", "authorize", { "stat": "Sum" } ],
            [ "...", "token", { "stat": "Sum" } ],
            [ "...", "userMgmt", { "stat": "Sum" } ]
        ],
        "view": "timeSeries",
        "stacked": true,
        "region": "us-east-1",
        "title": "Rate Limited Requests by Endpoint",
        "period": 300
    }
}
```

## Recommended Alarms

### High Authentication Failure Rate
```json
{
    "AlarmName": "OIDC-HighAuthFailureRate",
    "AlarmDescription": "Authentication failure rate is high",
    "MetricName": "AuthenticationFailure",
    "Namespace": "OIDC/Provider",
    "Statistic": "Sum",
    "Period": 300,
    "EvaluationPeriods": 2,
    "Threshold": 10,
    "ComparisonOperator": "GreaterThanThreshold"
}
```

### API Response Time Alert
```json
{
    "AlarmName": "OIDC-HighAPILatency",
    "AlarmDescription": "API response time is high",
    "MetricName": "ApiDuration",
    "Namespace": "OIDC/Provider",
    "Statistic": "Average",
    "Period": 300,
    "EvaluationPeriods": 2,
    "Threshold": 1000,
    "ComparisonOperator": "GreaterThanThreshold"
}
```

### Rate Limiting Alert
```json
{
    "AlarmName": "OIDC-ExcessiveRateLimiting",
    "AlarmDescription": "High number of requests being rate limited",
    "MetricName": "RateLimitBlocked",
    "Namespace": "OIDC/Provider",
    "Statistic": "Sum",
    "Period": 300,
    "EvaluationPeriods": 1,
    "Threshold": 50,
    "ComparisonOperator": "GreaterThanThreshold"
}
```

## Integration Examples

### In Lambda Functions
```javascript
import { recordAuthMetrics, recordApiMetrics } from "./lib/metrics.mjs";

export const handler = async (event) => {
  const startTime = Date.now();
  
  try {
    // Your business logic here
    const result = await processAuthentication(event);
    
    // Record successful metrics
    recordAuthMetrics(clientId, "success", null, Date.now() - startTime);
    recordApiMetrics("authorize", "POST", 302, Date.now() - startTime);
    
    return result;
  } catch (error) {
    // Record failure metrics
    recordAuthMetrics(clientId, "failure", error.message, Date.now() - startTime);
    recordApiMetrics("authorize", "POST", 500, Date.now() - startTime);
    
    throw error;
  }
};
```

### With Middleware
```javascript
import { metricsMiddleware } from "./lib/metrics.mjs";

export const handler = metricsMiddleware("userMgmt")(async (event) => {
  // Your handler logic here
  // Metrics are automatically recorded
});
```

## Cost Considerations

CloudWatch metrics pricing (us-east-1):
- First 10,000 metrics: $0.30 per metric
- Next 240,000 metrics: $0.10 per metric
- Additional metrics: $0.05 per metric

Estimated monthly cost for typical usage:
- ~50 unique metrics: $15/month
- ~1M data points: $0.50/month
- Custom dashboards: $3/month per dashboard

Total estimated cost: ~$20-30/month for comprehensive monitoring.

## Best Practices

1. **Use Dimensions Wisely**: Don't create too many unique dimension combinations
2. **Batch Metrics**: Use the built-in batching to reduce API calls
3. **Monitor Costs**: Set up billing alerts for CloudWatch usage
4. **Retention**: CloudWatch retains metrics for 15 months
5. **Aggregation**: Use proper statistics (Sum, Average, Maximum) based on metric type