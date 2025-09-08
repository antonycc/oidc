# ADR-001: Serverless Architecture with AWS Lambda

## Status

Accepted

## Context

The OIDC Provider needs to handle authentication requests with varying load patterns, from zero requests during off-hours to potential spikes during business hours. Traditional server-based architectures would require:

- Always-on infrastructure costs
- Manual scaling management  
- Operational overhead for patching, monitoring, and maintenance
- Complex high-availability setup

We needed an architecture that:
- Scales automatically from zero to thousands of requests
- Minimizes operational overhead
- Provides cost-effective pay-per-use billing
- Integrates well with AWS security and monitoring services

## Decision

We will implement the OIDC Provider using AWS Lambda functions with the following architecture:

- **Lambda Functions**: Separate functions for each OIDC endpoint (authorize, token, userinfo, jwks)
- **Function URLs**: Direct HTTPS endpoints for each Lambda function
- **CloudFront**: Global distribution layer with caching and security
- **DynamoDB**: Serverless database for storing users, tokens, and keys
- **CDK (Java)**: Infrastructure as code for repeatable deployments

### Function Structure

```
app/functions/
├── authorize.mjs    # Authorization endpoint
├── token.mjs        # Token exchange endpoint  
├── userinfo.mjs     # User claims endpoint
└── jwks.mjs         # JSON Web Key Set endpoint
```

### Runtime Configuration

- **Runtime**: Node.js 22 with ESM modules
- **Architecture**: x86_64 (arm64 considered but x86_64 chosen for broader library compatibility)
- **Memory**: 512MB (sufficient for JWT operations)
- **Timeout**: 30 seconds (OAuth flows complete in <5 seconds)

## Consequences

### Positive

- **Zero Infrastructure Costs**: No charges when system is idle
- **Automatic Scaling**: Handles 0 to 1000+ concurrent requests automatically
- **High Availability**: Built-in redundancy across multiple AWS availability zones
- **Security**: Runs in AWS-managed secure environment with IAM integration
- **Monitoring**: Integrated CloudWatch logs, metrics, and X-Ray tracing
- **Fast Deployments**: CDK enables rapid infrastructure updates

### Negative

- **Cold Start Latency**: First request after idle period takes 2-3 seconds
- **Vendor Lock-in**: Tightly coupled to AWS Lambda service
- **Limited Runtime Control**: Cannot customize underlying operating system
- **Timeout Limits**: Maximum 15-minute execution time (not relevant for OIDC)
- **Concurrent Request Limits**: Default 1000 concurrent executions (can be increased)

### Mitigation Strategies

- **Cold Start**: Acceptable for authentication flows; could add provisioned concurrency if needed
- **Vendor Lock-in**: Benefits outweigh lock-in concerns for this use case
- **Monitoring**: Comprehensive CloudWatch logging compensates for limited runtime access

## Alternatives Considered

### 1. Container-based (ECS/EKS)

**Pros:**
- Full control over runtime environment
- No cold start latency
- Can run any containerized application

**Cons:**
- Always-on costs (minimum $50-100/month)
- Operational complexity for scaling and high availability
- Need to manage security patches and updates
- Overkill for simple OIDC endpoints

**Decision**: Rejected due to unnecessary complexity and cost for this use case.

### 2. API Gateway + Lambda

**Pros:**
- More features (request validation, caching, rate limiting)
- Better integration with AWS services
- More granular monitoring

**Cons:**
- Additional cost ($3.50 per million requests)
- Additional latency (API Gateway adds ~10-50ms)
- More complex IAM configuration
- Function URLs provide sufficient functionality

**Decision**: Rejected as Function URLs meet all requirements at lower cost and latency.

### 3. EC2 Auto Scaling

**Pros:**
- Full control over environment
- No timeout limits
- Can optimize for specific workloads

**Cons:**
- Complex auto-scaling configuration
- Minimum running costs
- Manual security patching required
- Need load balancer configuration

**Decision**: Rejected due to operational overhead and minimum cost requirements.

### 4. Fargate Serverless Containers

**Pros:**
- Container flexibility without server management
- Good middle ground between Lambda and EC2
- Can run longer tasks

**Cons:**
- More expensive than Lambda for request-response workloads
- Still has minimum running costs
- Cold start issues similar to Lambda
- Unnecessary complexity for simple functions

**Decision**: Rejected as Lambda provides better cost efficiency for OIDC workloads.

## Implementation Details

### Function Handler Pattern

```javascript
export const handler = async (event) => {
  try {
    log('function_start', event.requestContext?.http?.method);
    
    // Business logic with extensive logging
    const result = await processRequest(event);
    
    log('function_success', result.statusCode);
    return result;
  } catch (error) {
    logError('function_error', error);
    return errorResponse(500, 'server_error');
  }
};
```

### Infrastructure as Code

```java
// CDK Function Definition
Function authorizeFn = Function.Builder.create(this, "AuthorizeFunction")
    .runtime(Runtime.NODEJS_22_X)
    .handler("authorize.handler")
    .code(Code.fromAsset("app/functions"))
    .timeout(Duration.seconds(30))
    .memorySize(512)
    .environment(environmentVars)
    .build();
```

## Performance Characteristics

- **Cold Start**: ~2-3 seconds (first request after idle)
- **Warm Start**: ~50-100ms (subsequent requests)
- **Memory Usage**: ~200MB average for OIDC operations
- **Concurrent Capacity**: 1000+ requests (can be increased)
- **99.9% Availability**: Built-in AWS Lambda SLA

## Related Decisions

- [ADR-002: DynamoDB for Token and User Storage](002-dynamodb-storage.md)
- [ADR-003: CloudFront for Global Distribution](003-cloudfront-distribution.md)
- [ADR-004: Lambda Function URLs vs API Gateway](004-function-urls-vs-api-gateway.md)

## Future Considerations

- **Provisioned Concurrency**: Consider if cold starts become problematic
- **Multi-Region**: Evaluate global deployment if international users require lower latency
- **Container Migration**: Could migrate to Fargate if function complexity increases significantly
- **Edge Computing**: Consider CloudFront Functions for simple request routing

## References

- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/)
- [Lambda Function URLs Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [Serverless Cost Analysis](https://aws.amazon.com/lambda/pricing/)
- [OAuth 2.0 Performance Considerations](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)