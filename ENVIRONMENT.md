# Environment Variables Reference

This document describes all environment variables used by the OIDC provider, their purposes, formats, and usage contexts.

## Quick Reference

| Variable | Required | Context | Purpose |
|----------|----------|---------|---------|
| `USERS_TABLE` | Runtime | Lambda | DynamoDB table for user data |
| `CODES_TABLE` | Runtime | Lambda | DynamoDB table for authorization codes |
| `REFRESH_TABLE` | Runtime | Lambda | DynamoDB table for refresh tokens |
| `ISSUER` | Runtime | Lambda | OIDC issuer URL |
| `BASE_URL` | Runtime | Lambda/Tests | Base URL for self-client redirects |
| `HOSTED_ZONE_ID` | Deployment | CDK | Route53 hosted zone identifier |
| `HOSTED_ZONE_NAME` | Deployment | CDK | Route53 hosted zone domain |
| `DOMAIN_NAME` | Deployment | CDK | OIDC provider domain name |
| `CERTIFICATE_ARN` | Deployment | CDK | ACM certificate ARN |
| `ENV_NAME` | Deployment | CDK | Environment name (dev/staging/prod) |
| `COGNITO_DOMAIN_PREFIX` | Deployment | CDK | Cognito user pool domain prefix |
| `TEST_USERNAME` | Testing | E2E Tests | Username for automated tests |
| `TEST_PASSWORD` | Testing | E2E Tests | Password for automated tests |

## Runtime Environment Variables

These variables are used by Lambda functions during execution.

### Database Configuration

#### `USERS_TABLE`
- **Purpose**: DynamoDB table name for user account storage
- **Format**: String (table name)
- **Required**: No (optional user storage)
- **Example**: `OidcProviderStack-prod-UsersTable`
- **Usage**: 
  ```javascript
  if (process.env.USERS_TABLE && tables.users) {
    const userRecord = await get(tables.users, { username: payload.sub });
  }
  ```

#### `CODES_TABLE`
- **Purpose**: DynamoDB table name for authorization codes and JWT keys
- **Format**: String (table name)  
- **Required**: Yes (for production)
- **Example**: `OidcProviderStack-prod-CodesTable`
- **Usage**: Stores temporary authorization codes and persistent JWT signing keys

#### `REFRESH_TABLE`
- **Purpose**: DynamoDB table name for refresh tokens (if implemented)
- **Format**: String (table name)
- **Required**: No (refresh tokens not currently implemented)
- **Example**: `OidcProviderStack-prod-RefreshTable`

### Service Configuration

#### `ISSUER`
- **Purpose**: OIDC issuer identifier URL
- **Format**: HTTPS URL
- **Required**: Yes
- **Example**: `https://oidc.antonycc.com`
- **Usage**: Included in JWT tokens as `iss` claim
- **Note**: Must match the domain where OIDC discovery document is served

#### `BASE_URL`
- **Purpose**: Base URL for the OIDC provider (used for self-client redirects)
- **Format**: HTTPS URL
- **Required**: No (defaults to ISSUER value)
- **Example**: `https://oidc.antonycc.com`
- **Usage**: Generates redirect URIs for the built-in `self-client`

### Testing Overrides

For local development and testing, these prefixes enable in-memory storage:

```bash
# Use memory storage instead of DynamoDB
export USERS_TABLE=mem_users
export CODES_TABLE=mem_codes  
export REFRESH_TABLE=mem_refresh

# Local development URLs
export ISSUER=http://localhost:3000
export BASE_URL=http://localhost:3000
```

## Deployment Environment Variables

These variables are used during CDK deployment to configure AWS resources.

### DNS and SSL Configuration

#### `HOSTED_ZONE_ID`
- **Purpose**: Route53 hosted zone identifier for DNS management
- **Format**: AWS Route53 zone ID (starts with 'Z')
- **Required**: Yes (for custom domain)
- **Example**: `Z123456789ABCDEFG`
- **How to find**:
  ```bash
  aws route53 list-hosted-zones --query 'HostedZones[?Name==`example.com.`].Id'
  ```

#### `HOSTED_ZONE_NAME`
- **Purpose**: Route53 hosted zone domain name
- **Format**: Domain name (with trailing dot)
- **Required**: Yes (for custom domain)
- **Example**: `example.com.`
- **Note**: Must include trailing dot and match the hosted zone

#### `DOMAIN_NAME`
- **Purpose**: Specific domain name for the OIDC provider
- **Format**: Fully qualified domain name
- **Required**: Yes
- **Example**: `oidc.example.com`
- **Note**: Must be within the hosted zone (subdomain of HOSTED_ZONE_NAME)

#### `CERTIFICATE_ARN`
- **Purpose**: AWS Certificate Manager (ACM) certificate ARN for HTTPS
- **Format**: AWS ARN for ACM certificate
- **Required**: Yes (for HTTPS)
- **Example**: `arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012`
- **Requirements**:
  - Certificate must be in `us-east-1` region (CloudFront requirement)
  - Must cover the DOMAIN_NAME (exact match or wildcard)
  - Must be in VALIDATED status

### Environment Management

#### `ENV_NAME`
- **Purpose**: Environment identifier for resource naming and separation
- **Format**: String (alphanumeric, hyphens allowed)
- **Required**: No (defaults to 'dev')
- **Example**: `prod`, `staging`, `dev`
- **Usage**: 
  - Resource naming: `OidcProviderStack-{ENV_NAME}-ResourceName`
  - Stack naming: `OidcProviderStack-{ENV_NAME}`
  - Environment separation and management

#### `COGNITO_DOMAIN_PREFIX`
- **Purpose**: Prefix for Cognito user pool domain (if Cognito stack is deployed)
- **Format**: String (lowercase, alphanumeric, hyphens)
- **Required**: No (only needed for Cognito integration)
- **Example**: `oidc-prod`, `oidc-dev`
- **Note**: Must be globally unique across all AWS accounts

## Testing Environment Variables

These variables are used for automated testing, particularly E2E tests.

#### `TEST_USERNAME`
- **Purpose**: Username for automated test authentication
- **Format**: String
- **Required**: For E2E tests
- **Example**: `test-user`
- **Security**: Use dedicated test account, not production user

#### `TEST_PASSWORD`
- **Purpose**: Password for automated test authentication
- **Format**: String
- **Required**: For E2E tests  
- **Example**: `c810fb39-86a9-4d2f-8107-119ade9605f8`
- **Security**: Store in GitHub Secrets or secure credential store

## Environment-Specific Configuration

### Development Environment

```bash
# Local development with in-memory storage
export ENV_NAME=dev
export USERS_TABLE=mem_users
export CODES_TABLE=mem_codes
export REFRESH_TABLE=mem_refresh
export ISSUER=http://localhost:3000
export BASE_URL=http://localhost:3000

# For CDK deployment to dev environment
export HOSTED_ZONE_ID=Z123456789ABCDEFG
export HOSTED_ZONE_NAME=example.com.
export DOMAIN_NAME=dev.oidc.example.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/dev-cert
```

### Staging Environment

```bash
# Staging deployment
export ENV_NAME=staging
export HOSTED_ZONE_ID=Z123456789ABCDEFG
export HOSTED_ZONE_NAME=example.com.
export DOMAIN_NAME=staging.oidc.example.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/staging-cert
export COGNITO_DOMAIN_PREFIX=oidc-staging

# Runtime variables (set by CDK during deployment)
# USERS_TABLE=OidcProviderStack-staging-UsersTable
# CODES_TABLE=OidcProviderStack-staging-CodesTable
# ISSUER=https://staging.oidc.example.com
```

### Production Environment

```bash
# Production deployment
export ENV_NAME=prod
export HOSTED_ZONE_ID=Z123456789ABCDEFG
export HOSTED_ZONE_NAME=example.com.
export DOMAIN_NAME=oidc.example.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/prod-cert
export COGNITO_DOMAIN_PREFIX=oidc-prod

# Runtime variables (set by CDK during deployment)
# USERS_TABLE=OidcProviderStack-prod-UsersTable
# CODES_TABLE=OidcProviderStack-prod-CodesTable  
# ISSUER=https://oidc.example.com
```

## Variable Validation

### Required Variable Checks

The CDK deployment validates required variables:

```java
// In CDK stack constructor
String domainName = System.getenv("DOMAIN_NAME");
if (domainName == null || domainName.isEmpty()) {
    throw new IllegalArgumentException("DOMAIN_NAME environment variable is required");
}
```

### Format Validation

Common validation patterns:

```javascript
// URL format validation
const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

// AWS ARN validation
const isValidArn = (arn) => {
    return arn && arn.startsWith('arn:aws:') && arn.split(':').length >= 6;
};

// Domain name validation  
const isValidDomain = (domain) => {
    return domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
};
```

## Common Configuration Patterns

### Multi-Environment Setup

Use environment-specific configuration files:

```bash
# .env.dev
ENV_NAME=dev
DOMAIN_NAME=dev.oidc.example.com
CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/dev-cert

# .env.staging
ENV_NAME=staging  
DOMAIN_NAME=staging.oidc.example.com
CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/staging-cert

# .env.prod
ENV_NAME=prod
DOMAIN_NAME=oidc.example.com
CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/prod-cert
```

Load with dotenv:
```bash
npx dotenv -e .env.prod -- npx cdk deploy OidcProviderStack-prod
```

### GitHub Actions Configuration

```yaml
# .github/workflows/deploy.yml
env:
  HOSTED_ZONE_ID: ${{ secrets.HOSTED_ZONE_ID }}
  HOSTED_ZONE_NAME: ${{ secrets.HOSTED_ZONE_NAME }}  
  CERTIFICATE_ARN: ${{ secrets.CERTIFICATE_ARN }}
  TEST_USERNAME: test-user
  TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}

jobs:
  deploy-prod:
    env:
      ENV_NAME: prod
      DOMAIN_NAME: oidc.antonycc.com
      
  deploy-staging:
    env:
      ENV_NAME: staging  
      DOMAIN_NAME: staging.oidc.antonycc.com
```

## Troubleshooting

### Missing Variables

**Problem**: CDK deployment fails with missing variable error

**Solution**:
```bash
# Check current environment variables
env | grep -E "(HOSTED_ZONE|DOMAIN|CERTIFICATE|ENV_NAME)"

# Set missing variables
export DOMAIN_NAME=oidc.example.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/xyz
```

### Invalid Values

**Problem**: Deployment succeeds but runtime errors occur

**Common issues**:
- **Wrong region**: Certificate in wrong region (must be us-east-1 for CloudFront)
- **Domain mismatch**: Certificate doesn't cover DOMAIN_NAME
- **Invalid URLs**: ISSUER not a valid HTTPS URL
- **Table names**: DynamoDB table names contain invalid characters

**Debug**:
```bash
# Verify certificate
aws acm describe-certificate --certificate-arn $CERTIFICATE_ARN --region us-east-1

# Check domain resolution
nslookup $DOMAIN_NAME

# Test OIDC discovery
curl -s https://$DOMAIN_NAME/.well-known/openid-configuration | jq .
```

### Local Development Issues

**Problem**: Local tests fail with AWS credential errors

**Solution**: Use in-memory storage for local development:
```bash
export USERS_TABLE=mem_users
export CODES_TABLE=mem_codes
export REFRESH_TABLE=mem_refresh
export ISSUER=http://localhost:3000
export BASE_URL=http://localhost:3000
```

## Security Considerations

### Sensitive Variables

**Store securely**:
- `TEST_PASSWORD`: GitHub Secrets, not in code
- `CERTIFICATE_ARN`: Not sensitive, but protect from modification
- Database table names: Not sensitive, but validate to prevent injection

**Logging**: Environment variables are automatically logged by CDK. Ensure no secrets are in variable names or values.

### Access Control

**Deployment variables**: Limit access to deployment credentials and environment-specific secrets.

**Runtime variables**: Lambda execution role automatically gets access to environment variables. Use least-privilege IAM policies.

## Best Practices

### Variable Naming

- Use descriptive, consistent names
- Include purpose in name (`USERS_TABLE` not just `TABLE`)
- Use standard formats (`_TABLE`, `_ARN`, `_URL`)

### Documentation

- Document purpose and format in code comments
- Include examples and validation rules
- Update this document when adding new variables

### Validation

- Validate required variables early (CDK constructor)
- Use typed validation where possible
- Provide clear error messages for invalid values

### Environment Management

- Use environment-specific configuration files
- Store secrets in secure credential stores
- Separate development, staging, and production configurations
- Use consistent naming patterns across environments

---

## Quick Reference Commands

```bash
# Check current variables
env | grep -E "(TABLE|ISSUER|DOMAIN|CERTIFICATE|HOSTED_ZONE)"

# Validate certificate  
aws acm describe-certificate --certificate-arn $CERTIFICATE_ARN --region us-east-1

# Find hosted zone
aws route53 list-hosted-zones --query 'HostedZones[?Name==`example.com.`]'

# Test deployment configuration
npx cdk synth  # Should succeed without errors

# Test runtime configuration
npm test       # Should pass with correct variables
```