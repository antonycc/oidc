# Security & Production Readiness Prompt

Analyze the current repository and implement security best practices and production readiness features to transform this demonstration-like OIDC provider into a production-capable system.

Focus on:
- Critical security gaps identified in the AWS Well-Architected review
- Production readiness features for reliable operation
- Operational excellence patterns and monitoring
- Compliance with security best practices for identity providers
- High impact/low cost improvements that dramatically enhance security posture

## Security Improvements (High Priority)

### Identity & Authentication
- **Enforce client and redirect URI validation**: Implement client_id registry and redirect_uri validation to prevent open redirection attacks
- **Implement proper credential validation**: Replace username-only authentication with secure password verification or Cognito integration
- **Secure API endpoints**: Move from public Function URLs to API Gateway with IAM authorization and rate limiting
- **Implement proper JWKS management**: Generate, persist, and rotate RSA signing keys; store encrypted in S3 with automatic JWKS updates

### Data Protection
- **Enable encryption at rest**: Configure server-side encryption on all S3 buckets using AWS-managed keys (SSE-S3)
- **Implement input sanitization**: Prevent XSS attacks by properly escaping HTML in forms and query parameters
- **Secure logging practices**: Remove sensitive data from logs (passwords, tokens, codes) and implement structured logging
- **HTTPS enforcement**: Ensure all endpoints serve content over HTTPS with proper security headers

## Production Readiness Features

### Operational Excellence
- **Monitoring and alerting**: Implement CloudWatch metrics, alarms for error rates, and custom metrics for authentication events
- **Error handling and resilience**: Add comprehensive error handling, retry logic, and graceful degradation patterns
- **Rate limiting and DDoS protection**: Implement request throttling and abuse prevention mechanisms
- **Health checks and diagnostics**: Add health check endpoints and diagnostic capabilities

### Observability
- **Structured logging**: Implement consistent, queryable log formats across all Lambda functions
- **Distributed tracing**: Add correlation IDs and tracing for request flow visibility
- **Performance monitoring**: Track response times, cold starts, and resource utilization
- **Security monitoring**: Log authentication attempts, failed requests, and suspicious activity

### Configuration Management
- **Environment-based configuration**: Implement proper configuration management for different deployment environments
- **Secret management**: Use AWS Secrets Manager or Parameter Store for sensitive configuration
- **Feature flags**: Implement toggles for new features and rollback capabilities
- **Resource tagging**: Add comprehensive tagging for cost allocation and resource management

## Compliance and Security Standards

### AWS Security Best Practices
- **Enable AWS CloudTrail**: Log all API calls and management events for audit trails
- **Implement least privilege access**: Review and minimize IAM permissions for all resources
- **Enable AWS Config**: Monitor configuration changes and compliance rules
- **Set up GuardDuty**: Enable threat detection for malicious activity

### OIDC/OAuth2 Security
- **Implement PKCE**: Add Proof Key for Code Exchange for public clients
- **Secure token handling**: Implement proper token expiration, refresh patterns, and secure storage
- **Scope validation**: Add proper scope handling and validation
- **Audit logging**: Log all authentication and authorization events for compliance

## Cost Optimization with Security

### Zero-Cost-at-Rest Maintenance
- **Optimize log retention**: Balance security logging needs with CloudWatch costs
- **Efficient resource usage**: Maintain serverless pay-per-use model while adding security features
- **Smart caching**: Implement caching strategies that reduce costs without compromising security
- **Resource cleanup**: Ensure TTL and cleanup policies maintain cost efficiency

## Implementation Guidelines

Provide specific, actionable recommendations that:
- Address critical security vulnerabilities identified in the Well-Architected review
- Transform the system from demonstration to production-ready
- Maintain the existing zero-cost-at-rest architecture
- Follow AWS security best practices and Well-Architected principles
- Can be implemented incrementally with clear migration paths
- Include comprehensive testing and validation strategies
- Support operational monitoring and incident response
- Enable compliance with security and audit requirements

Consider implementation order based on:
- Security risk reduction (high-risk vulnerabilities first)
- Implementation complexity and dependencies
- Impact on existing functionality
- Cost implications and budget constraints
- Operational readiness and team capabilities

Focus on high-impact improvements that can be implemented with modest code changes while dramatically improving the security posture and production readiness of the OIDC provider.