# Environment Variables Reference

This document provides comprehensive documentation for all environment variables used in the OIDC Provider.

## Deployment Variables

These variables control CDK deployment behavior and are typically set in CI/CD environments or `.env` files.

### Required for Deployment

| Variable | Description | Example | Default |
|----------|-------------|---------|---------|
| `HOSTED_ZONE_NAME` | Route53 hosted zone for domain | `example.com` | `example.com` |
| `HOSTED_ZONE_ID` | Route53 hosted zone ID | `Z000EXAMPLE` | `Z000EXAMPLE` |
| `CERTIFICATE_ARN` | ACM certificate ARN (us-east-1) | `arn:aws:acm:us-east-1:123456789012:certificate/abc` | Auto-generated |

### Optional Deployment Variables

| Variable | Description | Example | Default |
|----------|-------------|---------|---------|
| `ENV_NAME` | Environment name for stack naming | `prod`, `ci`, `dev` | `dev` |
| `DEPLOYMENT_NAME` | Specific deployment identifier | `ci`, `feature-branch` | Value of `ENV_NAME` |
| `DOMAIN_NAME` | Primary OIDC provider domain | `oidc.example.com` | Computed from deployment |
| `CDK_DEFAULT_ACCOUNT` | AWS account ID for deployment | `123456789012` | Auto-detected |
| `CDK_DEFAULT_REGION` | AWS region for deployment | `us-east-1` | Auto-detected |

### Domain Computation Logic

The system automatically computes domain names based on deployment patterns:

- **Production** (`DEPLOYMENT_NAME=prod`): `oidc.example.com`
- **CI** (`DEPLOYMENT_NAME=ci`): `ci.oidc.example.com`  
- **Branch** (`DEPLOYMENT_NAME=feature-xyz`): `feature-xyz.oidc.example.com`

## Runtime Variables

These variables affect Lambda function behavior at runtime and are automatically injected by CDK.

### DynamoDB Tables

| Variable | Description | Example | Set By |
|----------|-------------|---------|---------|
| `USERS_TABLE` | DynamoDB table for user storage | `OidcProviderStack-prod-Users` | CDK |
| `CODES_TABLE` | DynamoDB table for auth codes | `OidcProviderStack-prod-AuthCodes` | CDK |
| `TOKENS_TABLE` | DynamoDB table for refresh tokens | `OidcProviderStack-prod-RefreshTokens` | CDK |
| `KEYS_TABLE` | DynamoDB table for JWKS storage | `OidcProviderStack-prod-Keys` | CDK |

### Application Configuration

| Variable | Description | Example | Set By |
|----------|-------------|---------|---------|
| `BASE_URL` | OIDC provider base URL | `https://oidc.antonycc.com` | CDK |
| `ISSUER_URL` | OAuth2/OIDC issuer identifier | `https://oidc.antonycc.com` | CDK |
| `NODE_ENV` | Node.js environment | `production` | CDK |

### AWS Service Configuration

| Variable | Description | Purpose |
|----------|-------------|---------|
| `AWS_REGION` | AWS region for services | Set by Lambda runtime |
| `AWS_LAMBDA_FUNCTION_NAME` | Lambda function name | Set by Lambda runtime |
| `AWS_LAMBDA_FUNCTION_VERSION` | Function version | Set by Lambda runtime |
| `AWS_EXECUTION_ENV` | Execution environment | Set by Lambda runtime |

## Testing Variables

Variables used specifically for testing and development.

### Local Development

| Variable | Description | Example | Usage |
|----------|-------------|---------|-------|
| `NODE_ENV` | Node environment | `development`, `test` | Local testing |
| `DEBUG` | Enable debug logging | `true`, `false` | Verbose logging |
| `PORT` | Express server port | `3000` | Local development server |

### E2E Testing Variables

| Variable | Description | Example | Required For |
|----------|-------------|---------|-------------|
| `BASE_URL` | Target OIDC provider URL | `https://oidc.antonycc.com` | Playwright tests |
| `COGNITO_DOMAIN` | Cognito domain for testing | `test-oidc.auth.us-east-1.amazoncognito.com` | Cognito integration tests |
| `COGNITO_CLIENT_ID` | Cognito client ID | `1234567890abcdef` | Cognito integration tests |

### Test User Management

| Variable | Description | Example | Usage |
|----------|-------------|---------|-------|
| `USERS_TABLE` | Target DynamoDB users table | `OidcProviderStack-ci-Users` | User provisioning scripts |
| `AWS_PROFILE` | AWS CLI profile | `default`, `oidc-dev` | Local AWS authentication |

## CI/CD Variables

Variables set in GitHub Actions and CI/CD environments.

### GitHub Actions

| Variable | Description | Example | Set By |
|----------|-------------|---------|---------|
| `DEPLOY_ROLE_ARN` | IAM role for GitHub OIDC | `arn:aws:iam::123456789012:role/deploy` | Repository secrets |
| `GITHUB_TOKEN` | GitHub API token | `ghp_xxxx` | GitHub Actions |
| `GITHUB_ACTOR` | GitHub username | `antonycc` | GitHub Actions |

### AWS Authentication

| Variable | Description | Purpose |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key | Direct AWS authentication |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Direct AWS authentication |
| `AWS_SESSION_TOKEN` | AWS session token | Temporary credential authentication |

## Security Considerations

### Sensitive Variables

**Never log or expose these variables:**

- Any variable containing `SECRET`, `KEY`, or `TOKEN`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- User passwords or credentials

### Masking in Logs

The application automatically masks sensitive data:

```javascript
// Example from utils.mjs
const maskSensitive = (value) => {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= 8) return '*'.repeat(value.length);
  return `***${value.length}chars`;
};
```

### Environment-Specific Security

| Environment | Security Level | Variables Exposed |
|-------------|---------------|-------------------|
| **Production** | Highest | Minimal, AWS-managed |
| **CI** | High | Test credentials only |
| **Development** | Medium | Local test data |

## Configuration Files

### .env Files

The project uses environment-specific `.env` files:

```bash
# .env.prod - Production configuration
ENV_NAME=prod
HOSTED_ZONE_NAME=antonycc.com
HOSTED_ZONE_ID=Z0123456789
CERTIFICATE_ARN=arn:aws:acm:us-east-1:403027849202:certificate/abc

# .env.ci - CI/Testing configuration  
ENV_NAME=ci
HOSTED_ZONE_NAME=antonycc.com
HOSTED_ZONE_ID=Z0123456789
CERTIFICATE_ARN=arn:aws:acm:us-east-1:403027849202:certificate/xyz
```

### Loading Environment Variables

```bash
# Load specific environment
npx dotenv -e .env.prod -- npm run command

# CDK with environment
npx dotenv -e .env.prod -- npx cdk synth

# Playwright tests
npx dotenv -e .env -- playwright test
```

## Variable Validation

### CDK Validation

The CDK app validates required variables at synthesis time:

```java
// App.java validation
String hostedZoneName = System.getenv().getOrDefault("HOSTED_ZONE_NAME", "example.com");
if ("example.com".equals(hostedZoneName)) {
  System.err.println("WARNING: Using default hosted zone name");
}
```

### Runtime Validation

Lambda functions validate variables at startup:

```javascript
// Runtime validation example
const validateEnvironment = () => {
  const required = ['USERS_TABLE', 'CODES_TABLE', 'BASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
```

## Development Setup

### Local Environment

```bash
# 1. Copy environment template
cp .env.example .env.local

# 2. Set local variables
echo "NODE_ENV=development" >> .env.local
echo "DEBUG=true" >> .env.local
echo "PORT=3000" >> .env.local

# 3. Load for local development
npx dotenv -e .env.local -- node app/bin/express-server.mjs
```

### AWS Credentials

For local development, use one of:

1. **AWS CLI Profile**:
   ```bash
   aws configure --profile oidc-dev
   export AWS_PROFILE=oidc-dev
   ```

2. **Environment Variables**:
   ```bash
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   export AWS_REGION=us-east-1
   ```

3. **IAM Roles** (recommended for EC2/Lambda):
   - Attach IAM roles to compute instances
   - No credentials needed in environment

## Common Patterns

### Environment-Specific Configuration

```javascript
// Dynamic configuration based on environment
const config = {
  development: {
    logLevel: 'debug',
    tokenTTL: 3600 * 24, // 24 hours for debugging
    cors: '*'
  },
  production: {
    logLevel: 'info', 
    tokenTTL: 3600, // 1 hour
    cors: process.env.ALLOWED_ORIGINS?.split(',') || []
  }
};

const currentConfig = config[process.env.NODE_ENV] || config.development;
```

### Feature Flags

```javascript
// Feature toggles via environment variables
const features = {
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  enableTracing: process.env.ENABLE_TRACING === 'true',
  debugMode: process.env.DEBUG === 'true'
};
```

## Troubleshooting

### Common Issues

1. **Missing Variables**:
   ```bash
   # Check if variable is set
   echo $HOSTED_ZONE_NAME
   
   # List all environment variables
   env | grep -i oidc
   ```

2. **CDK Synthesis Failures**:
   ```bash
   # Verify required deployment variables
   echo "Zone: $HOSTED_ZONE_NAME"
   echo "Zone ID: $HOSTED_ZONE_ID" 
   echo "Cert: $CERTIFICATE_ARN"
   ```

3. **Runtime Errors**:
   ```bash
   # Check Lambda environment in AWS Console
   aws lambda get-function-configuration --function-name OidcProviderStack-prod-authorize
   ```

### Debug Commands

```bash
# Display computed configuration
npx dotenv -e .env.prod -- node -e "
  console.log('ENV_NAME:', process.env.ENV_NAME);
  console.log('DOMAIN_NAME:', process.env.DOMAIN_NAME || 'computed');
  console.log('BASE_URL:', process.env.BASE_URL || 'runtime-computed');
"

# Test CDK synthesis with specific environment  
npx dotenv -e .env.ci -- npx cdk synth --no-staging
```

For more troubleshooting information, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).