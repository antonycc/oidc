# Troubleshooting Guide

This guide covers common issues encountered when developing, deploying, or using the OIDC provider.

## Quick Diagnostic Checklist

If you're experiencing issues, run through this checklist first:

1. **Environment versions**:
   ```bash
   node --version  # Should be v22.x.x
   java -version   # Should be openjdk 21.x.x
   ```

2. **Dependencies installed**:
   ```bash
   npm ci          # Should complete without errors
   ```

3. **Tests passing**:
   ```bash
   npm test        # Should show all tests passing
   ```

4. **CDK synthesis**:
   ```bash
   export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
   npx cdk synth   # Should synthesize without errors
   ```

## Development Issues

### Node.js Version Errors

**Problem**: `error: This module requires Node.js 22 or higher`

**Solution**:
```bash
# Install and use Node 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 22 && nvm use 22
```

**Prevention**: Set up `.nvmrc` in your shell profile to automatically use Node 22.

### Java Version Issues

**Problem**: CDK synthesis fails with Java version errors

**Solution**:
```bash
# Ubuntu/Debian
sudo update-alternatives --config java
# Select Java 21 from the list

# Set JAVA_HOME
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

# Verify
java -version  # Should show version 21.x.x
```

**Prevention**: Add `JAVA_HOME` export to your shell profile (`.bashrc`, `.zshrc`).

### npm Install Failures

**Problem**: `npm ci` fails with dependency resolution errors

**Solution**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# If that fails, try
npm cache clean --force
npm ci
```

**Alternative**: Use the exact Node version specified in `.nvmrc` or `package.json`.

### CDK Synthesis Hangs

**Problem**: `npx cdk synth` appears to hang or takes very long

**Solution**:
```bash
# Ensure Java 21 is selected
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
sudo update-alternatives --config java

# Clean and rebuild
./mvnw clean compile
npx cdk synth
```

**Timeout**: CDK synthesis typically takes 8-10 seconds. Wait at least 120 seconds before canceling.

## Testing Issues

### Unit Tests Failing

**Problem**: Vitest tests fail with import/module errors

**Solution**:
```bash
# Ensure using Node 22 ESM mode
node --version  # v22.x.x
grep '"type": "module"' package.json  # Should exist

# Check test file extensions
find app/test -name "*.test.mjs" | head -5  # Should use .mjs
```

**Debug single test**:
```bash
npx vitest run app/test/authorize.test.mjs --reporter=verbose
```

### Playwright Tests Failing

**Problem**: E2E tests fail with browser or network errors

**Solution**:
```bash
# Install browsers (one-time setup)
npx playwright install --with-deps

# Set required environment variables
export BASE_URL=https://oidc.antonycc.com
export TEST_USERNAME=test-user
export TEST_PASSWORD=c810fb39-86a9-4d2f-8107-119ade9605f8

# Run with debugging
npx playwright test --headed --debug
```

**Common issues**:
- **Missing browsers**: Run `npx playwright install --with-deps`
- **Network timeouts**: Check BASE_URL is accessible
- **Authentication failures**: Verify TEST_USERNAME and TEST_PASSWORD

### Memory Issues During Tests

**Problem**: Tests fail with "out of memory" errors

**Solution**:
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
npm test

# Run tests in smaller batches
npx vitest run app/test/utils.test.mjs
npx vitest run app/test/clients.test.mjs
```

## Deployment Issues

### AWS Credentials

**Problem**: CDK deploy fails with credential errors

**Solution**:
```bash
# Configure AWS CLI
aws configure
# Or use environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1

# Verify credentials
aws sts get-caller-identity
```

### Missing Environment Variables

**Problem**: CDK deploy fails with missing required variables

**Required variables**:
```bash
export HOSTED_ZONE_ID=Z123456789ABCDEF
export HOSTED_ZONE_NAME=example.com
export DOMAIN_NAME=oidc.example.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789:certificate/xyz
```

**Check current variables**:
```bash
env | grep -E "(HOSTED_ZONE|DOMAIN|CERTIFICATE)"
```

### Certificate Issues

**Problem**: ACM certificate not found or invalid

**Solution**:
```bash
# List available certificates
aws acm list-certificates --region us-east-1

# Verify certificate covers your domain
aws acm describe-certificate --certificate-arn $CERTIFICATE_ARN

# For wildcard certificates, ensure domain matches
# *.example.com covers oidc.example.com
```

### Route53 Issues

**Problem**: DNS resolution fails after deployment

**Solution**:
```bash
# Verify hosted zone exists
aws route53 list-hosted-zones

# Check DNS propagation
dig oidc.example.com
nslookup oidc.example.com

# Wait for propagation (can take up to 48 hours)
```

## Runtime Issues

### Lambda Function Errors

**Problem**: HTTP 500 errors from OIDC endpoints

**Debug steps**:
1. **Check CloudWatch logs**:
   ```bash
   aws logs describe-log-groups --log-group-name-prefix "/aws/lambda"
   aws logs tail /aws/lambda/OidcProviderStack-prod-AuthorizeFunction --follow
   ```

2. **Look for structured log messages**:
   ```json
   {
     "level": "error",
     "ts": "2024-01-01T00:00:00.000Z",
     "msg": "Error message",
     "err": {"name": "Error", "message": "Details"}
   }
   ```

3. **Common error patterns**:
   - `client_not_found`: Invalid client_id in request
   - `invalid_redirect_uri`: Redirect URI not registered for client
   - `invalid_scope`: Requested scope not allowed for client
   - `pkce_verification_failed`: Code verifier doesn't match challenge

### DynamoDB Issues

**Problem**: Database operation errors

**Debug**:
```bash
# Check table exists and status
aws dynamodb describe-table --table-name OidcProviderStack-prod-CodesTable

# Check for throttling
aws dynamodb describe-table --table-name OidcProviderStack-prod-CodesTable \
  --query 'Table.ProvisionedThroughput'

# Manual table query (for debugging)
aws dynamodb scan --table-name OidcProviderStack-prod-CodesTable --max-items 5
```

**Common issues**:
- **Table not found**: CDK deployment didn't complete successfully
- **Access denied**: Lambda execution role missing DynamoDB permissions
- **Throttling**: Too many requests (should not happen with on-demand billing)

### JWT Token Issues

**Problem**: Token verification failures

**Debug**:
1. **Check JWKS endpoint**:
   ```bash
   curl -s https://oidc.example.com/jwks | jq .
   ```

2. **Verify token structure**:
   ```bash
   # Decode JWT header and payload (don't verify signature)
   echo "your-jwt-token" | cut -d. -f1 | base64 -d | jq .
   echo "your-jwt-token" | cut -d. -f2 | base64 -d | jq .
   ```

3. **Common token errors**:
   - `signature verification failed`: JWKS key mismatch
   - `token expired`: Check `exp` claim in payload
   - `invalid issuer`: Token not issued by this provider

### Client Authentication Issues

**Problem**: Authorization requests fail with client errors

**Debug checklist**:
1. **Verify client configuration** in `app/lib/clients.mjs`:
   ```javascript
   const client = getClient('your-client-id');
   console.log('Client config:', client);
   ```

2. **Check redirect URI** is exactly registered:
   ```javascript
   // Must match exactly, including protocol, domain, path, query params
   "https://example.com/callback" !== "http://example.com/callback"
   "https://example.com/callback" !== "https://example.com/callback/"
   ```

3. **Verify PKCE implementation**:
   ```javascript
   // Code verifier: 43-128 character random string
   const codeVerifier = crypto.randomBytes(32).toString('base64url');
   
   // Code challenge: SHA256 hash of verifier, base64url encoded
   const challenge = crypto.createHash('sha256')
     .update(codeVerifier)
     .digest('base64url');
   ```

## Performance Issues

### Slow Response Times

**Problem**: API endpoints responding slowly

**Investigation**:
1. **Check CloudWatch metrics**:
   - Lambda duration
   - DynamoDB response times
   - CloudFront cache hit ratio

2. **Enable X-Ray tracing** to identify bottlenecks:
   ```bash
   aws xray get-trace-summaries --time-range-type TimeRangeByStartTime \
     --start-time 2024-01-01T00:00:00 --end-time 2024-01-01T23:59:59
   ```

3. **Common performance issues**:
   - **Cold starts**: Lambda functions not warmed up
   - **DynamoDB throttling**: Too many requests
   - **CloudFront cache misses**: Static assets not cached

### Memory Usage

**Problem**: Lambda functions running out of memory

**Solution**:
1. **Check memory usage** in CloudWatch logs:
   ```
   REPORT RequestId: abc123 Duration: 1000ms Billed Duration: 1000ms 
   Memory Size: 512 MB Max Memory Used: 480 MB
   ```

2. **Increase Lambda memory** in CDK:
   ```java
   Function.Builder.create(this, "AuthorizeFunction")
     .memorySize(1024)  // Increase from 512MB
     // ... other config
     .build();
   ```

## Integration Issues

### AWS Cognito Integration

**Problem**: Users can't authenticate via Cognito

**Debug steps**:
1. **Verify identity provider configuration**:
   ```bash
   aws cognito-idp list-identity-providers --user-pool-id us-east-1_XXXXXXXXX
   ```

2. **Check attribute mapping**:
   ```bash
   aws cognito-idp describe-identity-provider \
     --user-pool-id us-east-1_XXXXXXXXX \
     --provider-name OidcProvider
   ```

3. **Test OIDC discovery**:
   ```bash
   curl -s https://oidc.example.com/.well-known/openid-configuration | jq .
   ```

### Client Application Integration

**Problem**: Client app can't complete OAuth2 flow

**Common issues**:
1. **CORS errors**: OIDC provider doesn't support CORS (use server-side integration)
2. **State parameter mismatch**: Client not preserving state across requests  
3. **PKCE implementation errors**: Code verifier/challenge mismatch
4. **Token exchange failures**: Wrong redirect_uri or client_id in `/token` request

## Security Issues

### Suspicious Authentication Activity

**Problem**: Unusual login patterns or failed attempts

**Investigation**:
1. **Check CloudWatch logs** for failed authentication attempts:
   ```bash
   aws logs filter-log-events \
     --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
     --filter-pattern "invalid_credentials"
   ```

2. **Monitor CloudTrail** for API access patterns:
   ```bash
   aws logs filter-log-events \
     --log-group-name "CloudTrail/APIGatewayCloudWatchRole" \
     --filter-pattern "{ $.sourceIPAddress != \"your-expected-ip\" }"
   ```

3. **Review client configurations** for unauthorized clients

### Token Security

**Problem**: Potential token compromise

**Immediate actions**:
1. **Rotate signing keys**:
   ```bash
   # Delete stored keys to force regeneration
   aws dynamodb delete-item \
     --table-name OidcProviderStack-prod-CodesTable \
     --key '{"code": {"S": "jwk-key-store"}}'
   ```

2. **Monitor token usage**:
   ```bash
   aws logs filter-log-events \
     --log-group-name "/aws/lambda/OidcProviderStack-prod-UserinfoFunction" \
     --filter-pattern "access_token_valid"
   ```

3. **Review refresh token grants** (if implemented)

## Environment-Specific Issues

### Production Issues

**Problem**: Production deployment or runtime failures

**Emergency response**:
1. **Rollback deployment**:
   ```bash
   # Deploy previous known-good version
   git checkout previous-tag
   npx cdk deploy OidcProviderStack-prod
   ```

2. **Enable detailed monitoring**:
   ```bash
   # Increase log retention temporarily
   aws logs put-retention-policy \
     --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
     --retention-in-days 14
   ```

3. **Scale up resources** if needed:
   ```java
   // In CDK, increase Lambda provisioned concurrency
   Function.Builder.create(this, "AuthorizeFunction")
     .reservedConcurrentExecutions(100)
     .build();
   ```

### Development vs Production Differences

**Common discrepancies**:
- **Environment variables**: Different table names, domains
- **AWS regions**: Resources deployed to different regions
- **Certificate domains**: Dev certificates not matching production domains
- **Client configurations**: Different redirect URIs for environments

## Getting Additional Help

### Log Analysis

**Structured log format**:
```json
{
  "level": "info|error",
  "ts": "2024-01-01T00:00:00.000Z", 
  "msg": "Human readable message",
  "err": {"name": "ErrorType", "message": "Error details"}
}
```

**Useful log searches**:
```bash
# Authentication failures
aws logs filter-log-events --filter-pattern "invalid_credentials"

# Client errors  
aws logs filter-log-events --filter-pattern "client_not_found"

# PKCE failures
aws logs filter-log-events --filter-pattern "pkce_verification_failed"

# Token issues
aws logs filter-log-events --filter-pattern "signature verification failed"
```

### Monitoring and Alerting

**Key metrics to monitor**:
- Lambda error rate and duration
- DynamoDB throttled requests
- HTTP 4xx/5xx error rates
- CloudFront cache hit ratio

**CloudWatch alarms**:
```bash
# High error rate
aws cloudwatch put-metric-alarm \
  --alarm-name "OIDC-HighErrorRate" \
  --alarm-description "OIDC provider error rate > 5%" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --threshold 5.0 \
  --comparison-operator GreaterThanThreshold
```

### Support Channels

1. **GitHub Issues**: For bugs and feature requests
2. **GitHub Discussions**: For general questions and community support
3. **Documentation**: Check `README.md`, `CONTRIBUTING.md`, and `docs/`
4. **Code Review**: Submit PR for complex issues

### Creating Effective Bug Reports

Include this information:
1. **Environment details**: Node/Java versions, OS
2. **Steps to reproduce**: Exact commands and configuration
3. **Expected vs actual behavior**: What should happen vs what happens
4. **Log excerpts**: Relevant CloudWatch logs (sanitize sensitive data)
5. **Configuration**: Environment variables, client settings (sanitize secrets)

**Example bug report template**:
```markdown
## Bug Description
Brief description of the issue

## Environment  
- Node version: v22.1.0
- Java version: openjdk 21.0.1
- OS: Ubuntu 22.04

## Steps to Reproduce
1. Run `npm test`
2. Execute specific test case
3. Observe failure

## Expected Behavior
Test should pass with 200 response

## Actual Behavior  
Test fails with 500 error

## Logs
```
{"level":"error","ts":"2024-01-01T00:00:00.000Z","msg":"client_not_found demo-client"}
```

## Configuration
- BASE_URL: http://localhost:3000
- Client ID: demo-client
```

---

## Quick Reference

**Essential debugging commands**:
```bash
# Environment check
node --version && java -version

# Test everything  
npm test && ./mvnw test

# View recent logs
aws logs tail /aws/lambda/function-name --follow

# Check table status
aws dynamodb describe-table --table-name table-name

# Test OIDC endpoints
curl -s https://oidc.example.com/.well-known/openid-configuration | jq .
```

**Common fix patterns**:
- Environment version issues → Use correct Node 22 / Java 21
- CDK synthesis issues → Set JAVA_HOME and use Java 21
- Test failures → Check file extensions (.mjs) and ESM imports  
- Deployment issues → Verify AWS credentials and required environment variables
- Runtime issues → Check CloudWatch logs for structured error messages

This troubleshooting guide covers the most common issues. For complex problems, please create a GitHub issue with detailed information following the bug report template above.