# Developer Guide

This guide provides detailed information for developers working on the OIDC provider, including development workflows, testing strategies, and contribution guidelines.

## Development Environment Setup

### Prerequisites Validation

Before starting development, validate your environment:

```bash
# Check versions
node --version  # Should be v22.x.x
java -version   # Should be openjdk 21.x.x

# Validate development setup
npm run formatting  # Should pass without errors
npm test           # Should pass all unit tests
```

### IDE Configuration

**VS Code (Recommended)**
```json
{
  "eslint.useFlatConfig": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.eol": "\n",
  "java.home": "/usr/lib/jvm/java-21-openjdk-amd64"
}
```

**Extensions:**
- ESLint (dbaeumer.vscode-eslint)
- Prettier (esbenp.prettier-vscode)
- Extension Pack for Java (vscjava.vscode-java-pack)

### Local Development Workflow

1. **Start Development Server**
   ```bash
   # Start local Express server for testing
   node app/bin/express-server.mjs
   ```

2. **Run Tests in Watch Mode**
   ```bash
   # Unit tests with file watching
   npx vitest --watch
   
   # System tests
   npm run test:system
   ```

3. **Format Code Automatically**
   ```bash
   # Format on every save (recommended)
   npm run formatting-fix
   ```

## Architecture Deep Dive

### Request Flow

```
CloudFront → Lambda Function URL → Lambda Handler
     ↓
   DynamoDB ← JWT Signing ← Business Logic
```

**Authentication Flow:**
1. User hits `/authorize` with OAuth2 parameters
2. Lambda validates client, redirects, scopes
3. User submits credentials via POST
4. Lambda validates user, generates authorization code
5. Client exchanges code for tokens at `/token`
6. Tokens used for `/userinfo` access

### Database Schema

**Users Table (`oidc-{domain}-{env}-users`)**
```json
{
  "username": "string (primary key)",
  "passwordHash": "string (bcrypt)",
  "email": "string",
  "name": "string", 
  "emailVerified": "boolean",
  "createdAt": "number (timestamp)"
}
```

**Authorization Codes Table (`oidc-{domain}-{env}-codes`)**
```json
{
  "code": "string (primary key, ULID)",
  "sub": "string (username)",
  "client": "string (client_id)",
  "redirectUri": "string",
  "scope": "string",
  "nonce": "string (optional)",
  "codeChallenge": "string",
  "codeChallengeMethod": "string",
  "used": "boolean",
  "ttl": "number (expiration timestamp)"
}
```

**JWKS Table (`oidc-{domain}-{env}-jwks`)**
```json
{
  "id": "string (primary key)",
  "publicKey": "string (PEM format)",
  "privateKey": "string (PEM format)", 
  "kid": "string (key ID)",
  "createdAt": "number (timestamp)",
  "ttl": "number (key rotation)"
}
```

## Testing Strategy

### Unit Tests (`npm test`)
- **Scope**: Individual functions and modules
- **Environment**: In-memory mocks, no AWS dependencies
- **Speed**: Fast (< 1 second total)
- **Coverage**: Business logic, utilities, edge cases

**Example Test:**
```javascript
import { test, expect } from 'vitest';
import { maskSensitive } from '../lib/utils.mjs';

test('maskSensitive hides passwords', () => {
  expect(maskSensitive('secret123')).toBe('***9chars');
});
```

### System Tests (`npm run test:system`)
- **Scope**: Express server integration
- **Environment**: Local HTTP server, in-memory database
- **Speed**: Moderate (< 5 seconds)
- **Coverage**: Full OAuth2 flow, API compatibility

### End-to-End Tests (Playwright)
- **Scope**: Complete user flows against deployed environment
- **Environment**: Real AWS infrastructure
- **Speed**: Slow (30-90 seconds)
- **Coverage**: Browser interaction, production scenarios

**Running E2E Tests Locally:**
```bash
# Set environment variables
cp .env.ci .env
# Edit .env with your deployment URL

# Run tests
npm run test:web        # Headless
npm run test:web:headed # With browser UI
npm run test:web:ui     # Interactive mode
```

## Code Organization

### Directory Structure
```
app/
├── functions/          # Lambda handlers (authorize, token, userinfo, jwks)
├── lib/               # Shared utilities (clients, crypto, db, utils)
├── bin/               # CLI scripts (provision-user, clear-users)
├── test/              # Unit tests
└── system/            # System integration tests

infra/                 # CDK infrastructure (Java)
├── main/              # CDK app and stack definitions
└── test/              # Infrastructure tests

tests/                 # Playwright end-to-end tests
web/                   # Static web assets
docs/                  # Documentation
```

### Coding Standards

**JavaScript/Node.js:**
- ESM modules (`"type": "module"`)
- Async/await for all async operations
- Structured logging with JSON format
- NEVER log sensitive data (passwords, tokens)

**Error Handling Pattern:**
```javascript
export const handler = async (event) => {
  try {
    log('function_start', event.requestContext?.http?.method);
    
    // Business logic with detailed logging
    const result = await processRequest(event);
    
    log('function_success', { resultType: typeof result });
    return result;
    
  } catch (error) {
    logError('function_error', error, { 
      eventId: event.requestContext?.requestId 
    });
    return errorResponse(500, 'server_error');
  }
};
```

**Java/CDK:**
- Builder patterns for resource configuration
- Explicit removal policies (DESTROY for dev/test)
- Environment-specific configuration injection

### Security Guidelines

**Authentication:**
- Always validate client_id against registry
- Require PKCE for public clients
- Implement proper redirect URI validation
- Use secure random values for codes/tokens

**Data Protection:**
- Hash passwords with bcrypt (cost factor 10)
- Never log passwords, tokens, or PKCE verifiers
- Use HTTPS-only for all endpoints
- Implement proper CORS policies

**Infrastructure:**
- Use IAM least privilege principles
- Enable CloudTrail for all environments
- Configure proper VPC security groups
- Use AWS Secrets Manager for sensitive config

## Development Patterns

### Adding New Endpoints

1. **Create Handler Function**
   ```javascript
   // app/functions/new-endpoint.mjs
   export const handler = async (event) => {
     // Implementation with logging
   };
   ```

2. **Add Route in CDK**
   ```java
   // infra/main/AppStack.java
   Function newEndpointFunction = Function.Builder.create(this, "NewEndpoint")
     .runtime(Runtime.NODEJS_22_X)
     .handler("new-endpoint.handler")
     .code(Code.fromAsset("../app"))
     .build();
   ```

3. **Add Tests**
   ```javascript
   // app/test/new-endpoint.test.mjs
   test('new endpoint returns expected response', () => {
     // Test implementation
   });
   ```

4. **Update OpenAPI Spec**
   ```yaml
   # openapi.yaml
   /new-endpoint:
     get:
       summary: New endpoint description
   ```

### Adding Client Configurations

1. **Update Client Registry**
   ```javascript
   // app/lib/clients.mjs
   export const clients = {
     "new-client": {
       redirectUris: ["https://app.example.com/callback"],
       grantTypes: ["authorization_code"],
       scopes: ["openid", "email"],
       pkceRequired: true,
       clientSecret: null,
     },
   };
   ```

2. **Add Client Tests**
   ```javascript
   test('new client configuration is valid', () => {
     const client = getClient('new-client');
     expect(client).toBeDefined();
     expect(client.pkceRequired).toBe(true);
   });
   ```

### Environment Configuration

**Development (.env.local)**
```bash
BASE_URL=http://localhost:3000
USERS_TABLE=mem_users
CODES_TABLE=mem_codes
JWKS_TABLE=mem_jwks
```

**CI/Testing (.env.ci)**
```bash
BASE_URL=https://oidc-ci.antonycc.com
USERS_TABLE=oidc-ci-antonycc-com-ci-users
# Other tables from CDK deployment
```

**Production (.env.prod)**
```bash
BASE_URL=https://oidc.antonycc.com
USERS_TABLE=oidc-antonycc-com-prod-users
# Other tables from CDK deployment
```

## Performance Considerations

### Lambda Optimization
- **Bundle Size**: Keep dependencies minimal
- **Cold Starts**: Optimize for <3 second initialization
- **Memory**: Functions use 512MB (balance cost/performance)
- **Timeout**: 30 seconds (adequate for OIDC flows)

### DynamoDB Optimization
- **Pay-per-request**: No provisioned capacity needed
- **TTL Attributes**: Automatic cleanup of expired codes
- **Query Patterns**: Primary key access only (no scans)
- **Batch Operations**: Not typically needed for OIDC

### Caching Strategy
- **JWKS**: 1-hour cache headers for public keys
- **Static Assets**: CloudFront caching for web resources
- **Discovery Document**: Cache-friendly metadata

## Debugging and Monitoring

### Local Debugging
```bash
# Enable debug logging
export DEBUG=*

# Run with Node.js inspector
node --inspect app/bin/express-server.mjs

# Use Chrome DevTools at chrome://inspect
```

### Production Debugging
```bash
# View Lambda logs
aws logs tail /aws/lambda/AppStack-prod-authorize --follow

# Check DynamoDB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits

# Examine CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name AppStack-prod
```

### Common Issues

**Token Validation Failures:**
- Check JWKS endpoint accessibility
- Verify token format and signatures
- Confirm audience and issuer claims

**Authentication Errors:**
- Validate client configuration
- Check redirect URI registration
- Verify PKCE implementation

**Performance Issues:**
- Monitor Lambda duration metrics
- Check DynamoDB throttling
- Analyze CloudFront cache hit rates

## Contribution Guidelines

### Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/description
   ```

2. **Implement Changes**
   - Follow coding standards
   - Add comprehensive tests
   - Update documentation

3. **Validate Changes**
   ```bash
   npm run formatting-fix  # Fix formatting
   npm test               # Run unit tests
   npx cdk synth          # Validate infrastructure
   ```

4. **Submit PR**
   - Include clear description
   - Reference related issues
   - Add screenshots for UI changes

### Release Process

1. **Version Update**
   ```bash
   npm version patch|minor|major
   ```

2. **Update Documentation**
   - README.md updates
   - OpenAPI specification
   - CHANGELOG.md entry

3. **Deploy and Test**
   - CI deployment validation
   - E2E test execution
   - Production deployment

### Security Disclosure

For security vulnerabilities:
1. **Do NOT** create public issues
2. Email maintainers directly
3. Provide detailed reproduction steps
4. Allow reasonable disclosure timeline

## Advanced Topics

### Custom Claims Implementation
```javascript
// Add custom claims to ID tokens
const customClaims = {
  role: user.role || 'user',
  department: user.department,
  permissions: user.permissions || []
};

const idToken = await signJwt({
  ...standardClaims,
  ...customClaims
}, privateKey, keyId);
```

### Multi-tenant Client Support
```javascript
// Dynamic client configuration
const getTenantClient = (tenantId) => {
  return {
    redirectUris: [`https://${tenantId}.example.com/callback`],
    scopes: tenant.allowedScopes,
    branding: tenant.branding
  };
};
```

### Performance Monitoring
```javascript
// Custom CloudWatch metrics
const putMetric = (metricName, value, unit = 'Count') => {
  // Implementation for custom metrics
};

// Track authentication success rates
putMetric('AuthenticationSuccess', 1);
putMetric('AuthenticationFailure', 1);
```

## Resources

### References
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

### Tools
- [jwt.io](https://jwt.io/) - JWT token debugging
- [OAuth.tools](https://oauth.tools/) - OAuth flow testing
- [Postman](https://www.postman.com/) - API testing
- [AWS Console](https://console.aws.amazon.com/) - Infrastructure monitoring

### Community
- GitHub Issues for bug reports
- GitHub Discussions for questions
- Pull Requests for contributions