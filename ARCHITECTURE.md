# Architecture Documentation

This document describes the technical architecture, design decisions, and implementation patterns of the OIDC provider.

## System Overview

The OIDC provider is a **serverless OAuth2/OpenID Connect implementation** built on AWS, designed for cost optimization, operational simplicity, and compliance with OIDC specifications.

### Architecture Principles

1. **Pay-per-use**: No fixed costs, scales to zero when not in use
2. **Stateless**: No persistent server state, all data in DynamoDB
3. **Secure by default**: HTTPS everywhere, AWS IAM authentication
4. **Observable**: Comprehensive structured logging and X-Ray tracing
5. **Standards compliant**: Full OAuth2 and OIDC specification adherence

## High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client App    │───▶│    CloudFront    │───▶│  Lambda@Edge    │
└─────────────────┘    │   (CDN + WAF)    │    │  (Auth logic)   │
                       └──────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │  S3 Static Web   │    │   DynamoDB      │
                    │  (Discovery +    │    │  (Codes, Users, │
                    │   Web Assets)    │    │   JWT Keys)     │
                    └──────────────────┘    └─────────────────┘
```

## Component Architecture

### 1. Frontend Layer (CloudFront + S3)

**Purpose**: Content delivery, SSL termination, request routing

**Components**:
- **CloudFront Distribution**: CDN with custom domain and ACM certificate
- **S3 Web Bucket**: Static web assets (login forms, CSS, JavaScript)
- **S3 Well-Known Bucket**: OIDC discovery documents
- **Origin Access Control (OAC)**: Secure S3 access, blocks public access

**Request Flow**:
```
Client → CloudFront → Lambda Function URL (via OAC signing)
       → S3 Bucket (for static assets)
```

### 2. Application Layer (Lambda Functions)

**Purpose**: OIDC protocol implementation, business logic

**Functions**:

#### Authorization Function (`/authorize`)
- **Runtime**: Node.js 22 ESM
- **Purpose**: Process authorization requests, authenticate users
- **Input**: Form data (POST only for security)
- **Output**: HTTP 302 redirect with authorization code
- **Key Operations**:
  - Client validation
  - Scope validation  
  - User authentication (bcrypt)
  - PKCE challenge validation
  - Authorization code generation (ULID)

#### Token Function (`/token`)
- **Runtime**: Node.js 22 ESM
- **Purpose**: Exchange authorization codes for JWT tokens
- **Input**: Form data (authorization_code grant)
- **Output**: JSON with access_token and id_token
- **Key Operations**:
  - Authorization code validation
  - PKCE verifier validation
  - JWT token generation (RS256)
  - Refresh token handling (future)

#### UserInfo Function (`/userinfo`)
- **Runtime**: Node.js 22 ESM  
- **Purpose**: Return user information based on access token
- **Input**: Bearer token in Authorization header
- **Output**: JSON with user claims
- **Key Operations**:
  - JWT token verification
  - Scope-based claim filtering
  - User data retrieval

#### JWKS Function (`/jwks`)
- **Runtime**: Node.js 22 ESM
- **Purpose**: Provide public keys for JWT verification
- **Input**: None
- **Output**: JSON Web Key Set
- **Key Operations**:
  - RSA public key retrieval
  - JWKS formatting

### 3. Data Layer (DynamoDB)

**Purpose**: Persistent storage for codes, users, and cryptographic keys

**Tables**:

#### Codes Table
- **Purpose**: Authorization codes and JWT signing keys
- **Partition Key**: `code` (string)
- **TTL**: Yes, for automatic cleanup
- **Items**:
  - Authorization codes (5-minute expiry)
  - JWT signing key pairs (1-year persistence)
- **Billing**: On-demand (pay per request)

#### Users Table (Optional)
- **Purpose**: User account storage
- **Partition Key**: `username` (string)
- **Items**: User profiles with bcrypt password hashes
- **Note**: Can integrate with external identity providers instead

#### Refresh Table (Future)
- **Purpose**: Refresh token storage
- **Partition Key**: `refresh_token` (string)
- **TTL**: Yes, for automatic cleanup

## Security Architecture

### 1. Network Security

**HTTPS Everywhere**:
- CloudFront enforces HTTPS with HTTP→HTTPS redirect
- ACM certificate management with automatic renewal
- TLS 1.2+ required for all connections

**Origin Security**:
- S3 buckets block public access
- Lambda Function URLs use AWS_IAM authentication
- CloudFront OAC signs requests to origins

### 2. Authentication & Authorization

**Client Authentication**:
- Public clients: PKCE required (S256 method)
- Confidential clients: Client secret authentication (future)
- Client registry in code (configurable per environment)

**User Authentication**:
- bcrypt password hashing (cost factor 10)
- Structured logging masks sensitive data
- Authentication failure rate limiting via CloudFront

**Token Security**:
- JWT tokens signed with RS256 (2048-bit RSA keys)
- Short token lifetime (5-15 minutes recommended)
- Key rotation via DynamoDB persistence
- Canonical base64url encoding enforcement

### 3. Data Protection

**Encryption at Rest**:
- DynamoDB: AWS-owned encryption keys (zero cost)
- S3: Default encryption with AWS-managed keys
- CloudWatch Logs: Default encryption

**Encryption in Transit**:
- TLS 1.2+ for all communications
- AWS service-to-service encryption via VPC endpoints

**Sensitive Data Handling**:
- Passwords: bcrypt hashed, never logged
- Tokens: Masked in logs (show only length/prefix)
- Client secrets: Environment variable injection

## Operational Architecture

### 1. Observability

**Structured Logging**:
```javascript
const log = (...a) => console.log(JSON.stringify({
  level: 'info',
  ts: new Date().toISOString(),
  msg: a.join(' ')
}));
```

**Log Groups**:
- Lambda functions: `/aws/lambda/{FunctionName}`
- Retention: 1 week (cost optimization)
- Format: JSON for easy parsing

**Tracing**:
- AWS X-Ray enabled for all Lambda functions
- Automatic trace correlation across services
- Performance bottleneck identification

**Metrics**:
- CloudWatch automatic metrics for Lambda (duration, errors, invocations)
- Custom metrics via CloudWatch API
- DynamoDB automatic metrics (consumed capacity, throttling)

### 2. Deployment

**Infrastructure as Code**:
- AWS CDK in Java 21
- Predictable resource naming
- Environment-specific configurations
- Automated rollback capabilities

**CI/CD Pipeline**:
```
GitHub Push → GitHub Actions → CDK Deploy → E2E Tests → Production
```

**Deployment Environments**:
- **Development**: `dev.oidc.example.com` - Feature testing
- **Staging**: `staging.oidc.example.com` - Pre-production validation  
- **Production**: `oidc.example.com` - Live service

### 3. Cost Optimization

**Serverless Design**:
- No fixed costs when unused
- Pay-per-request billing for all services
- Automatic scaling to zero

**Resource Optimization**:
- DynamoDB on-demand billing (no provisioned capacity)
- Lambda memory sizing based on profiling
- CloudWatch log retention: 1 week
- S3 lifecycle policies for old deployment artifacts

## Design Decisions

### 1. Technology Choices

#### Node.js 22 ESM
**Decision**: Use latest Node.js with native ES modules
**Rationale**:
- Modern JavaScript features and performance
- Native ESM support eliminates transpilation
- Smaller deployment packages
- Better cold start performance

**Trade-offs**: Requires Node.js 22+ environments

#### Java CDK vs TypeScript CDK
**Decision**: Use Java CDK for infrastructure
**Rationale**:
- Strong typing and IDE support
- Familiar to enterprise developers
- Excellent AWS service coverage
- Mature ecosystem

**Trade-offs**: Requires Java runtime for deployment

#### DynamoDB vs RDS
**Decision**: DynamoDB for all storage
**Rationale**:
- Serverless scaling (pay per request)
- Built-in encryption and backups
- Low latency (single-digit milliseconds)
- No connection pool management

**Trade-offs**: NoSQL query limitations, AWS vendor lock-in

#### Function URLs vs API Gateway
**Decision**: Lambda Function URLs with CloudFront
**Rationale**:
- Lower cost (no API Gateway charges)
- Simpler architecture
- CloudFront provides WAF and rate limiting
- IAM authentication through OAC

**Trade-offs**: Less advanced API management features

### 2. Security Decisions

#### PKCE Enforcement
**Decision**: Require PKCE for all OAuth2 flows
**Rationale**:
- Protects against code interception attacks
- Required by OAuth 2.1 draft specification
- No additional complexity for legitimate clients

**Implementation**: S256 method only, reject plain text challenges

#### JWT Key Management
**Decision**: RSA keys persisted in DynamoDB with 1-year TTL
**Rationale**:
- Consistent keys across Lambda invocations
- Automatic key rotation via TTL expiry
- Cost-effective compared to KMS/S3 solutions

**Future Enhancement**: Move to KMS with S3 JWKS persistence for production key rotation

#### Password Hashing
**Decision**: bcrypt with cost factor 10
**Rationale**:
- Industry standard for password hashing
- Adjustable cost factor for future-proofing
- Resistant to rainbow table attacks

**Trade-offs**: Higher CPU cost compared to faster hashes

### 3. Performance Decisions

#### Lambda Memory Allocation
**Decision**: 512MB for most functions, 1024MB for crypto-heavy operations
**Rationale**:
- Balance between performance and cost
- Lambda CPU scales with memory allocation
- Profiled cold start and execution times

#### DynamoDB Consistency
**Decision**: Eventually consistent reads for non-critical operations
**Rationale**:
- Lower cost and higher performance
- OIDC flows can tolerate slight delays
- Strong consistency used for authorization codes

#### CloudFront Caching
**Decision**: Cache static assets, bypass cache for API endpoints
**Rationale**:
- Improve performance for web assets
- Ensure fresh data for OIDC operations
- Regional edge location benefits

## Integration Patterns

### 1. AWS Cognito Integration

**Pattern**: External Identity Provider
```
Cognito User Pool → OIDC Provider → User Authentication
                 ← Identity Provider Config
```

**Configuration**:
- Provider type: OIDC
- Attribute mapping: email, name, given_name, family_name
- Scopes: openid, email, profile

### 2. Client Application Integration

**Pattern**: Authorization Code Flow with PKCE
```
Client App → /authorize (with PKCE challenge)
           ← Authorization code
           → /token (with PKCE verifier)  
           ← Access token + ID token
           → /userinfo (with access token)
           ← User claims
```

### 3. Multi-Tenant Architecture (Future)

**Pattern**: Tenant isolation via client configuration
```
Tenant A Client → Tenant A Keys & Config
Tenant B Client → Tenant B Keys & Config
```

**Implementation**:
- Tenant-specific client registry
- Isolated DynamoDB partitions
- Separate JWT signing keys per tenant

## Performance Characteristics

### Expected Performance

**Cold Start**: 
- ~200-500ms for Lambda initialization
- ~50-100ms additional for crypto operations
- Mitigated by CloudFront caching and provisioned concurrency

**Warm Execution**:
- Authorization: ~50-100ms
- Token generation: ~100-200ms (includes JWT signing)
- UserInfo: ~20-50ms
- JWKS: ~10-20ms

**Throughput**:
- DynamoDB: Unlimited with on-demand billing
- Lambda: 1000 concurrent executions per region (soft limit)
- CloudFront: Global edge location distribution

### Scalability Limits

**AWS Service Limits**:
- Lambda concurrent executions: 1000 per region (soft limit, can increase)
- DynamoDB read/write capacity: Unlimited on-demand
- CloudFront requests: No practical limit

**Application Limits**:
- JWT key rotation: Manual process (future: automated)
- Client registry: Code-based (future: database-driven)
- User storage: Single table (future: partitioning strategy)

## Future Architecture Evolution

### Phase 2: Enhanced Security
- KMS integration for JWT key management
- HSM support for cryptographic operations
- Advanced threat detection via GuardDuty

### Phase 3: Multi-Tenancy
- Tenant-specific configurations
- Isolated data partitions
- Usage-based billing per tenant

### Phase 4: Advanced Features
- Refresh token support
- Device flow implementation
- Federation with external IdPs

### Phase 5: Global Distribution
- Multi-region deployment
- Global DynamoDB tables
- Regional failover capabilities

## Compliance and Standards

### OIDC Compliance
- **OpenID Connect Core 1.0**: Full implementation
- **OAuth 2.0 RFC 6749**: Authorization Code flow
- **OAuth 2.0 Security Best Practices**: PKCE enforcement
- **JWT RFC 7519**: RS256 signing algorithm

### AWS Well-Architected Framework

**Security Pillar**: 
- Defense in depth, encryption, IAM least privilege

**Reliability Pillar**: 
- Multi-AZ deployment, automatic failover, backup strategies

**Performance Efficiency**: 
- Right-sizing resources, monitoring, performance testing

**Cost Optimization**: 
- Pay-per-use pricing, resource optimization, cost monitoring

**Operational Excellence**: 
- Infrastructure as code, monitoring, automation

### Security Standards
- **NIST Cybersecurity Framework**: Implementation of security controls
- **OWASP Top 10**: Protection against common vulnerabilities
- **SOC 2 Type II**: Audit trail and access controls (future)

## Troubleshooting Architecture

### Observability Stack
```
Application Errors → CloudWatch Logs → Log Insights
Performance Issues → X-Ray Traces → Service Map
Infrastructure → CloudWatch Metrics → Dashboards
Security Events → CloudTrail → Security Hub
```

### Common Architecture Issues

**Lambda Cold Starts**: 
- Monitor via X-Ray duration metrics
- Consider provisioned concurrency for high-traffic endpoints

**DynamoDB Throttling**:
- Rare with on-demand billing
- Monitor consumed capacity metrics
- Implement exponential backoff

**Certificate Expiration**:
- ACM automatic renewal (if DNS validation possible)
- CloudWatch alarms for certificate expiry
- Automated deployment pipeline validation

---

This architecture documentation provides a comprehensive view of the system design, decisions, and evolution path. For implementation details, see the source code and inline documentation. For operational procedures, see `OPERATIONS.md`.