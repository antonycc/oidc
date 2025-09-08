# ADR-004: Lambda Function URLs vs API Gateway

## Status

Accepted

## Context

AWS Lambda functions can be exposed to HTTP traffic through several mechanisms:

1. **API Gateway** (REST or HTTP APIs)
2. **Lambda Function URLs** 
3. **Application Load Balancer** (ALB)
4. **CloudFront with Lambda@Edge**

For the OIDC Provider, we need HTTP endpoints that:
- Handle OAuth 2.0/OIDC requests (GET/POST)
- Support CORS for browser clients
- Provide authentication and authorization
- Scale automatically with traffic
- Minimize latency and cost
- Integrate with CloudFront for global distribution

The primary choice is between API Gateway and Lambda Function URLs.

## Decision

We will use **Lambda Function URLs** with CloudFront distribution for the following reasons:

### Function URLs Configuration

```java
// CDK Configuration
FunctionUrl functionUrl = authorizeFn.addFunctionUrl(FunctionUrlOptions.builder()
    .authType(FunctionUrlAuthType.AWS_IAM)
    .cors(FunctionUrlCorsOptions.builder()
        .allowCredentials(false)
        .allowedHeaders(List.of("Content-Type", "Authorization"))
        .allowedMethods(List.of(HttpMethod.GET, HttpMethod.POST, HttpMethod.OPTIONS))
        .allowedOrigins(List.of("*"))
        .maxAge(Duration.hours(1))
        .build())
    .build());
```

### CloudFront Integration

- CloudFront Origin Access Control (OAC) signs requests to Function URLs
- WAF protection at CloudFront edge
- Global caching and distribution
- Custom domain integration

## Consequences

### Positive

- **Lower Cost**: No API Gateway charges ($3.50 per million requests saved)
- **Lower Latency**: Direct invocation without API Gateway overhead (~10-50ms saved)
- **Simpler Architecture**: Fewer components to manage and monitor
- **Native CORS**: Built-in CORS support in Function URLs
- **CloudFront Integration**: OAC provides secure origin access
- **IAM Integration**: Native AWS authentication support

### Negative

- **Limited Features**: No built-in request validation, caching, or rate limiting
- **Less Monitoring**: Fewer built-in metrics compared to API Gateway
- **Newer Service**: Function URLs are relatively new (2022) vs mature API Gateway
- **Manual CORS**: Need to handle OPTIONS requests in function code

### Mitigation Strategies

- **Rate Limiting**: Implemented at CloudFront level via WAF
- **Request Validation**: Handled in Lambda function code with comprehensive logging
- **Monitoring**: CloudWatch metrics and X-Ray tracing provide sufficient observability
- **Caching**: CloudFront provides response caching where appropriate

## Alternatives Considered

### 1. API Gateway REST API

**Pros:**
- Mature service with extensive features
- Built-in request/response validation
- Comprehensive caching options
- Rich monitoring and analytics
- Request/response transformation
- Built-in throttling and rate limiting

**Cons:**
- Additional cost: $3.50 per million requests + $0.09 per GB data transfer
- Added latency: 10-50ms per request
- More complex IAM setup
- Additional configuration complexity
- Overkill for simple OIDC endpoints

**Decision**: Rejected due to unnecessary cost and complexity for OIDC use case.

### 2. API Gateway HTTP API

**Pros:**
- Lower cost than REST API ($1.00 per million requests)
- Lower latency than REST API
- Built-in JWT authorizers
- CORS support
- Good Lambda integration

**Cons:**
- Still adds cost and latency compared to Function URLs
- Limited features compared to REST API
- Additional component to manage
- Function URLs provide equivalent functionality

**Decision**: Rejected as Function URLs offer better cost and performance.

### 3. Application Load Balancer (ALB)

**Pros:**
- Very mature and stable
- Advanced routing capabilities
- Built-in health checks
- SSL termination
- WebSocket support

**Cons:**
- Fixed monthly cost (~$23/month minimum)
- Designed for traditional server workloads
- Complex configuration for simple use case
- Additional operational overhead
- Slower scaling than serverless options

**Decision**: Rejected due to fixed costs and operational complexity.

### 4. CloudFront + Lambda@Edge

**Pros:**
- Ultimate edge performance
- Global distribution built-in
- Can modify requests/responses at edge
- Very low latency

**Cons:**
- Limited runtime (Node.js 14 max at time of decision)
- 5-second timeout limit
- Complex deployment process
- Higher complexity for debugging
- Limited package size (50MB compressed)
- JWT operations might exceed timeout

**Decision**: Rejected due to runtime limitations and complexity.

## Implementation Details

### Function URL Security

```java
// IAM-authenticated Function URLs
FunctionUrlAuthType.AWS_IAM
```

- CloudFront OAC signs requests using AWS IAM
- Prevents direct access to Function URLs
- Leverages AWS security model

### CORS Handling

```javascript
// CORS headers in Lambda response
headers: {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "3600"
}
```

### Request Flow

```
Client -> CloudFront -> Function URL (with OAC) -> Lambda Function
```

1. Client makes HTTPS request to CloudFront
2. CloudFront applies WAF rules and caching
3. CloudFront signs request with OAC credentials
4. Function URL validates OAC signature
5. Lambda function processes OIDC request
6. Response flows back through CloudFront

## Performance Comparison

| Metric | Function URLs + CloudFront | API Gateway + CloudFront |
|--------|----------------------------|--------------------------|
| **Cold Start** | ~2-3 seconds | ~2-3 seconds |
| **Warm Latency** | ~50-100ms | ~60-150ms |
| **Cost per Million** | CloudFront only (~$0.085) | CloudFront + API Gateway (~$3.585) |
| **Setup Complexity** | Low | Medium |
| **Monitoring** | CloudWatch + X-Ray | CloudWatch + X-Ray + API Gateway metrics |

## Security Considerations

### Function URL Security

- **IAM Authentication**: Prevents unauthorized direct access
- **HTTPS Only**: All Function URLs enforce HTTPS
- **Origin Validation**: CloudFront OAC ensures requests come from CDN
- **Request Signing**: AWS Signature Version 4 for request authentication

### Compared to API Gateway

| Security Feature | Function URLs | API Gateway |
|------------------|---------------|-------------|
| **Authentication** | AWS IAM | AWS IAM + Custom authorizers |
| **Rate Limiting** | CloudFront WAF | Built-in + CloudFront |
| **Input Validation** | Manual in function | Built-in + Manual |
| **DDoS Protection** | CloudFront | CloudFront + AWS Shield |

## Monitoring and Observability

### Available Metrics

```javascript
// CloudWatch metrics for Function URLs
- Invocations
- Duration 
- Errors
- Throttles
- ConcurrentExecutions
- UrlRequestCount (Function URL specific)
```

### X-Ray Tracing

```java
// Enable X-Ray in CDK
.tracing(Tracing.ACTIVE)
```

Provides detailed request tracing through:
- CloudFront
- Function URL
- Lambda execution
- DynamoDB calls

## Cost Analysis

### Monthly Cost Comparison (1M requests)

| Component | Function URLs | API Gateway REST |
|-----------|---------------|------------------|
| **Lambda** | $0.20 | $0.20 |
| **API Gateway** | $0.00 | $3.50 |
| **CloudFront** | $0.085 | $0.085 |
| **DynamoDB** | $0.25 | $0.25 |
| **Total** | **$0.535** | **$4.035** |

**Savings**: 87% cost reduction with Function URLs

### Break-even Analysis

Function URLs provide cost benefits at any scale:
- **Low Traffic** (<1K requests/month): $0.001 vs $0.004
- **Medium Traffic** (100K requests/month): $0.054 vs $0.404  
- **High Traffic** (10M requests/month): $5.35 vs $40.35

## Future Considerations

### When to Reconsider API Gateway

- **Complex Request Validation**: If OIDC spec compliance requires extensive validation
- **Advanced Rate Limiting**: If simple CloudFront WAF rules are insufficient
- **Request Transformation**: If we need to modify requests/responses significantly
- **Multiple Authorizers**: If we need different authentication methods
- **Detailed Analytics**: If Function URL metrics are insufficient

### Function URLs Evolution

- **Enhanced Monitoring**: AWS may add more comprehensive metrics
- **Advanced Features**: Request validation and transformation capabilities
- **Performance Improvements**: Continued optimization of the service

## Related Decisions

- [ADR-001: Serverless Architecture with AWS Lambda](001-serverless-architecture.md)
- [ADR-003: CloudFront for Global Distribution](003-cloudfront-distribution.md)

## References

- [Lambda Function URLs Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [API Gateway vs Function URLs Comparison](https://aws.amazon.com/blogs/compute/announcing-aws-lambda-function-urls-built-in-https-endpoints-for-single-function-microservices/)
- [CloudFront Origin Access Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [API Gateway Pricing](https://aws.amazon.com/api-gateway/pricing/)