# Troubleshooting Guide

This guide covers common issues encountered when deploying, configuring, or using the OIDC Provider.

## Quick Diagnosis

### Health Check Commands

```bash
# Check current deployment status
curl -s https://oidc.antonycc.com/.well-known/openid-configuration | jq

# Verify JWKS endpoint
curl -s https://oidc.antonycc.com/jwks | jq

# Test basic connectivity
curl -I https://oidc.antonycc.com/authorize
```

### Log Analysis

```bash
# View Lambda function logs (requires AWS CLI setup)
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/OidcProviderStack"

# Stream live logs for authorization endpoint
aws logs tail "/aws/lambda/OidcProviderStack-prod-authorize" --follow

# Get CloudTrail events
aws logs tail "/aws/cloudtrail/oidc-provider" --since 1h
```

## Deployment Issues

### 1. CDK Synthesis Failures

**Symptoms:**
```
ERROR: Cannot read property 'getStackElement' of undefined
```

**Causes & Solutions:**

- **Java Version Mismatch**
  ```bash
  # Check Java version
  java -version
  # Should show Java 21
  
  # Fix: Set JAVA_HOME correctly
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
  sudo update-alternatives --config java
  ```

- **Missing Environment Variables**
  ```bash
  # Check required variables
  echo $HOSTED_ZONE_NAME
  echo $HOSTED_ZONE_ID
  echo $CERTIFICATE_ARN
  
  # Fix: Set variables in .env file
  HOSTED_ZONE_NAME=example.com
  HOSTED_ZONE_ID=Z000EXAMPLE
  CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/abc
  ```

- **Node.js Version Issues**
  ```bash
  # Check Node version
  node --version
  # Should be v22.x.x
  
  # Fix: Install correct version
  nvm install 22 && nvm use 22
  ```

### 2. Stack Deployment Failures

**Symptoms:**
```
CREATE_FAILED: Resource handler returned message: "Access Denied"
```

**Causes & Solutions:**

- **IAM Permissions**
  ```bash
  # Check your IAM role has necessary permissions:
  # - CloudFormation full access
  # - Lambda service role permissions
  # - DynamoDB admin
  # - CloudFront admin
  # - Route53 domain management
  
  # Verify deployment role
  aws sts get-caller-identity
  ```

- **Certificate Issues**
  ```bash
  # Verify certificate exists and is validated
  aws acm describe-certificate --certificate-arn $CERTIFICATE_ARN
  
  # Check certificate status
  aws acm list-certificates --region us-east-1
  ```

- **Domain/DNS Issues**
  ```bash
  # Verify hosted zone
  aws route53 get-hosted-zone --id $HOSTED_ZONE_ID
  
  # Check DNS propagation
  dig NS example.com
  nslookup oidc.example.com
  ```

### 3. Lambda Function Failures

**Symptoms:**
```
{"errorType": "Runtime.ImportModuleError", "errorMessage": "Unable to import module 'index'"}
```

**Causes & Solutions:**

- **Missing Dependencies**
  ```bash
  # Ensure all dependencies are installed
  npm ci
  
  # Check package.json workspace configuration
  cat package.json | jq .workspaces
  ```

- **Module Resolution Issues**
  ```bash
  # Verify ESM configuration
  grep '"type": "module"' package.json
  
  # Check file extensions
  find app/functions -name "*.js" # Should be .mjs
  ```

## Runtime Issues

### 1. Authentication Failures

**Symptoms:**
```json
{"error": "invalid_client"}
```

**Debug Steps:**

1. **Check Client Configuration**
   ```bash
   # Look for client in clients.mjs
   grep -n "self-client" app/lib/clients.mjs
   ```

2. **Verify Redirect URI**
   ```bash
   # Check if redirect URI is allowed
   curl -X POST https://oidc.antonycc.com/authorize \
     -d "client_id=self-client" \
     -d "redirect_uri=https://your-app.com/callback" \
     -d "response_type=code" \
     -d "scope=openid"
   ```

3. **Validate Credentials**
   ```bash
   # Test with known good credentials
   npm run users:provision test-user TestPassword123
   ```

### 2. Token Validation Errors

**Symptoms:**
```json
{"error": "invalid_token"}
```

**Debug Steps:**

1. **Check JWT Structure**
   ```bash
   # Decode JWT header and payload (do not expose in production)
   echo "eyJ..." | base64 -d | jq
   ```

2. **Verify JWKS Endpoint**
   ```bash
   # Check key availability
   curl -s https://oidc.antonycc.com/jwks | jq '.keys | length'
   ```

3. **Time Synchronization**
   ```bash
   # Check server time
   date -u
   # JWT exp/iat times are UTC
   ```

### 3. CORS Issues

**Symptoms:**
```
Access to fetch at 'https://oidc.antonycc.com/token' from origin 'https://myapp.com' has been blocked by CORS policy
```

**Solutions:**

1. **Update Function URLs**
   ```javascript
   // Check CORS headers in Lambda responses
   headers: {
     "Access-Control-Allow-Origin": "*",
     "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
     "Access-Control-Allow-Headers": "Content-Type, Authorization"
   }
   ```

2. **CloudFront Configuration**
   ```bash
   # Check CloudFront CORS policy
   aws cloudfront get-distribution-config --id $DISTRIBUTION_ID
   ```

## Performance Issues

### 1. Cold Start Latency

**Symptoms:**
- First requests take >5 seconds
- Intermittent timeouts

**Solutions:**

1. **Provisioned Concurrency** (costs money)
   ```typescript
   // Add to CDK stack
   fn.addProvisionedConcurrencyConfig('warmup', {
     provisionedConcurrencyCapacity: 2
   });
   ```

2. **Bundle Optimization**
   ```bash
   # Check bundle size
   ls -la app/functions/*.mjs
   
   # Minimize dependencies
   npm ls --depth=0
   ```

### 2. DynamoDB Throttling

**Symptoms:**
```json
{"errorType": "ProvisionedThroughputExceededException"}
```

**Solutions:**

1. **Switch to On-Demand**
   ```typescript
   // CDK configuration
   billingMode: BillingMode.PAY_PER_REQUEST
   ```

2. **Add Backoff Retry**
   ```javascript
   // In Lambda functions
   import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
   const client = new DynamoDBClient({
     maxAttempts: 3,
     retryMode: "adaptive"
   });
   ```

## Monitoring & Debugging

### 1. CloudWatch Logs

**Essential Log Groups:**
```
/aws/lambda/OidcProviderStack-prod-authorize
/aws/lambda/OidcProviderStack-prod-token
/aws/lambda/OidcProviderStack-prod-userinfo
/aws/lambda/OidcProviderStack-prod-jwks
/aws/cloudtrail/oidc-provider
```

**Useful Queries:**
```
# Find authentication failures
fields @timestamp, @message
| filter @message like /invalid_client/
| sort @timestamp desc

# Track token issuance
fields @timestamp, level, msg
| filter msg like /token_issued/
| stats count() by bin(5m)
```

### 2. X-Ray Tracing

**Enable X-Ray:**
```typescript
// In CDK stack
import { Tracing } from 'aws-cdk-lib/aws-lambda';

const fn = new Function(this, 'AuthorizeFunction', {
  tracing: Tracing.ACTIVE,
  // ... other props
});
```

**View Traces:**
```bash
# Get trace summaries
aws xray get-trace-summaries --time-range-type TimeRangeByStartTime \
  --start-time 2024-01-01T00:00:00Z --end-time 2024-01-01T23:59:59Z
```

### 3. Custom Metrics

**Create Alarms:**
```typescript
// CDK alarm for high error rate
new Alarm(this, 'HighErrorRate', {
  metric: fn.metricErrors(),
  threshold: 10,
  evaluationPeriods: 2
});
```

## Load Testing Issues

### 1. Rate Limiting

**Symptoms:**
```
HTTP 429 Too Many Requests
```

**Solutions:**

1. **CloudFront Rate Limiting**
   ```typescript
   // Increase rate limits in CDK
   webAcl: {
     rules: [{
       name: 'RateLimitRule',
       action: { allow: {} },
       statement: {
         rateBasedStatement: {
           limit: 10000, // Increase from default
           aggregateKeyType: 'IP'
         }
       }
     }]
   }
   ```

2. **Lambda Concurrency**
   ```typescript
   // Set reserved concurrency
   fn.addReservedConcurrency(1000);
   ```

## Security Issues

### 1. Token Leakage

**Prevention:**
```javascript
// Ensure tokens are masked in logs
const log = (...args) => {
  const safe = args.map(arg => 
    typeof arg === 'string' && arg.includes('eyJ') 
      ? maskSensitive(arg) 
      : arg
  );
  console.log(JSON.stringify({ level: 'info', msg: safe.join(' ') }));
};
```

### 2. PKCE Bypass

**Validation:**
```bash
# Test PKCE requirement
curl -X POST https://oidc.antonycc.com/token \
  -d "grant_type=authorization_code" \
  -d "code=test" \
  -d "client_id=self-client" \
  -d "redirect_uri=https://test.com"
# Should return error about missing code_verifier
```

## Getting Help

### 1. Enable Debug Logging

```bash
# Set environment variable for more verbose logging
export DEBUG=true

# Deploy with debug configuration
npx cdk deploy --context debug=true
```

### 2. Collect Information

Before requesting help, collect:

- **Environment Details**: Node/Java versions, deployment environment
- **Error Messages**: Full error text and stack traces
- **Request/Response**: Sanitized HTTP requests and responses
- **Logs**: Relevant CloudWatch log entries
- **Timestamps**: When the issue occurred (UTC)

### 3. Support Channels

- **GitHub Issues**: https://github.com/antonycc/oidc/issues
- **Security Issues**: security@antonycc.com
- **Performance Issues**: Include load testing results
- **Documentation Issues**: Submit PR with corrections

### 4. Minimal Reproduction

Create a minimal test case:

```bash
# Simple auth flow test
curl -X POST https://oidc.antonycc.com/authorize \
  -d "client_id=self-client" \
  -d "redirect_uri=https://example.com/callback" \
  -d "response_type=code" \
  -d "scope=openid" \
  -d "username=test-user" \
  -d "password=your-password"
```

## Known Issues

### 1. First Deployment Certificate Delay

**Issue**: Certificate validation can take up to 30 minutes
**Workaround**: Pre-create and validate certificates manually

### 2. DynamoDB TTL Propagation

**Issue**: TTL deletion may take up to 48 hours
**Workaround**: Manual cleanup for testing environments

### 3. Lambda Function URL CORS

**Issue**: OPTIONS preflight not handled automatically
**Workaround**: Explicit CORS handling in function code

---

**Still need help?** Check the [GitHub repository](https://github.com/antonycc/oidc) for the latest troubleshooting information and community support.