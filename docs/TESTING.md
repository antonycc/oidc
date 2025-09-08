# Testing Strategy and Best Practices

This document outlines the comprehensive testing approach for the OIDC Provider, including unit tests, integration tests, system tests, and end-to-end testing strategies.

## Testing Philosophy

Our testing strategy follows the **testing pyramid** principle:

```
    /\     E2E Tests (Few, High Value)
   /  \    
  /____\   Integration Tests (Some, Critical Paths)
 /      \  
/_______\  Unit Tests (Many, Fast Feedback)
```

### Principles

- **Fast Feedback**: Unit tests run in <5 seconds for rapid development cycles
- **Realistic Integration**: System tests use real AWS services in isolated environments
- **Production Validation**: E2E tests run against live deployments
- **Security First**: All tests validate security properties and error conditions
- **Comprehensive Coverage**: Test both happy paths and error scenarios

## Test Levels

### 1. Unit Tests (Vitest)

**Location**: `app/test/`  
**Runtime**: ~1-2 seconds  
**Purpose**: Test individual functions and modules in isolation

#### Configuration

```javascript
// vitest.config.js
export default {
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
};
```

#### Test Structure

```javascript
// Example: app/test/utils.test.mjs
import { describe, it, expect } from 'vitest';
import { maskSensitive, parseFormBody } from '../lib/utils.mjs';

describe('utils', () => {
  describe('maskSensitive', () => {
    it('masks short strings completely', () => {
      expect(maskSensitive('abc')).toBe('***');
    });
    
    it('shows length for longer strings', () => {
      expect(maskSensitive('password123')).toBe('***11chars');
    });
  });
});
```

#### Mocking Strategy

```javascript
// Mock AWS SDK calls
import { vi } from 'vitest';

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({
      send: vi.fn()
    }))
  }
}));
```

#### Running Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run with coverage
npm run test:unit -- --coverage

# Watch mode for development
npm run test:unit -- --watch

# Run specific test file
npm run test:unit -- app/test/utils.test.mjs
```

### 2. System Tests (Vitest + Express)

**Location**: `app/system/`  
**Runtime**: ~5-10 seconds  
**Purpose**: Test complete authentication flows with mocked infrastructure

#### Express Test Server

```javascript
// app/bin/express-server.mjs
import express from 'express';
import { handler as authorizeHandler } from '../functions/authorize.mjs';

const app = express();

// Convert Lambda handlers to Express middleware
app.post('/authorize', async (req, res) => {
  const event = createLambdaEvent(req);
  const response = await authorizeHandler(event);
  res.status(response.statusCode).json(response.body);
});
```

#### Complete Flow Testing

```javascript
// app/system/api.system.test.mjs
describe('system: express server authorize -> token -> userinfo', () => {
  it('flows from authorize to userinfo', async () => {
    // 1. Authorization request
    const authResponse = await request(app)
      .post('/authorize')
      .send({
        client_id: 'self-client',
        username: 'test-user',
        password: 'test-password',
        // ... other OAuth params
      });
    
    // 2. Extract authorization code
    const code = extractCodeFromRedirect(authResponse.headers.location);
    
    // 3. Token exchange
    const tokenResponse = await request(app)
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        code,
        // ... other params
      });
    
    // 4. UserInfo request
    const userInfoResponse = await request(app)
      .get('/userinfo')
      .set('Authorization', `Bearer ${tokenResponse.body.access_token}`);
      
    expect(userInfoResponse.body.sub).toBe('test-user');
  });
});
```

#### JSDOM Testing

```javascript
// app/system/web.system.test.mjs - Browser behavior simulation
describe('system(jsdom): web UI basics without Playwright', () => {
  it('index.html shows login status and logout functionality', async () => {
    // Load HTML and execute JavaScript
    loadHtmlAndScripts('web/index.html');
    
    // Simulate logged-in state
    localStorage.setItem('oidc_tokens', JSON.stringify({
      access_token: 'test-token',
      userinfo: { name: 'Test User' }
    }));
    
    // Trigger page load
    document.dispatchEvent(new Event('DOMContentLoaded'));
    
    // Verify UI state
    const status = document.querySelector('.login-status');
    expect(status.textContent).toContain('Logged in as Test User');
  });
});
```

### 3. Infrastructure Tests (JUnit 5)

**Location**: `infra/test/java/`  
**Runtime**: ~8-10 seconds  
**Purpose**: Validate CDK infrastructure synthesis and configuration

#### CDK Stack Testing

```java
// infra/test/java/com/antonycc/oidc/StackTest.java
@Test
public void testOidcProviderStackSynthesis() {
    App app = new App();
    
    OidcProviderStack stack = new OidcProviderStack(app, "test-stack", 
        OidcProviderStackProps.builder()
            .env(Environment.builder().account("123456789012").region("us-east-1").build())
            .domainName("test.example.com")
            .certificateArn("arn:aws:acm:us-east-1:123456789012:certificate/test")
            .build());
    
    Template template = Template.fromStack(stack);
    
    // Verify Lambda functions exist
    template.hasResourceProperties("AWS::Lambda::Function", Map.of(
        "Runtime", "nodejs22.x",
        "Handler", "authorize.handler"
    ));
    
    // Verify DynamoDB tables have TTL configured
    template.hasResourceProperties("AWS::DynamoDB::Table", Map.of(
        "TimeToLiveSpecification", Map.of("Enabled", true)
    ));
}
```

#### Running Infrastructure Tests

```bash
# Run Java tests
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./mvnw test

# Run with verbose output
./mvnw test -X

# Run specific test class
./mvnw test -Dtest=StackTest
```

### 4. End-to-End Tests (Playwright)

**Location**: `tests/`  
**Runtime**: ~30-60 seconds  
**Purpose**: Test complete user journeys against deployed environments

#### Playwright Configuration

```javascript
// playwright.config.js
export default {
  testDir: './tests',
  timeout: 90000, // Accommodate Lambda cold starts
  use: {
    baseURL: process.env.BASE_URL || 'https://oidc.antonycc.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
};
```

#### Complete Authentication Flow

```javascript
// tests/web.live.test.ts
test('complete OIDC authentication flow', async ({ page }) => {
  // Navigate to authorization endpoint
  await page.goto('/authorize?client_id=self-client&...');
  
  // Fill login form
  await page.fill('[name="username"]', 'test-user');
  await page.fill('[name="password"]', 'c810fb39-86a9-4d2f-8107-119ade9605f8');
  
  // Submit form and wait for redirect
  await page.click('[type="submit"]');
  await page.waitForURL('**/post-auth.html*');
  
  // Verify tokens were received
  const tokensElement = await page.locator('#tokens');
  const tokensText = await tokensElement.textContent();
  expect(tokensText).toContain('access_token');
  expect(tokensText).toContain('id_token');
  
  // Verify user info
  const userInfoElement = await page.locator('#userinfo');
  const userInfo = await userInfoElement.textContent();
  expect(userInfo).toContain('"sub":"test-user"');
});
```

#### Cognito Integration Testing

```javascript
// tests/cognito.live.test.ts
test('AWS Cognito identity provider integration', async ({ page }) => {
  // Test Cognito User Pool with OIDC provider
  const cognitoDomain = process.env.COGNITO_DOMAIN;
  const clientId = process.env.COGNITO_CLIENT_ID;
  
  await page.goto(`https://${cognitoDomain}/login?client_id=${clientId}&...`);
  
  // Select OIDC provider
  await page.click('.socialSignInButton');
  
  // Complete OIDC flow
  await page.fill('[name="username"]', 'test-user');
  await page.fill('[name="password"]', 'c810fb39-86a9-4d2f-8107-119ade9605f8');
  await page.click('[type="submit"]');
  
  // Verify Cognito receives identity
  await page.waitForURL('**/callback*');
  expect(await page.textContent('body')).toContain('SUCCESS');
});
```

#### Running E2E Tests

```bash
# Set environment for target deployment
export BASE_URL=https://oidc.antonycc.com

# Run all E2E tests
npm run test:web

# Run with UI (development)
npm run test:web:ui

# Run headed (see browser)
npm run test:web:headed

# Generate and view report
npx playwright show-report
```

## Test Data Management

### User Provisioning

```bash
# Provision test users
npm run users:provision test-user c810fb39-86a9-4d2f-8107-119ade9605f8

# Clear all test users
npm run users:clear

# Provision multiple users for load testing
npm run users:provision load-user-1 password1
npm run users:provision load-user-2 password2
```

### Test Credentials

**Standard Test Credentials** (used across all test types):
- **Username**: `test-user`
- **Password**: `c810fb39-86a9-4d2f-8107-119ade9605f8`

**Why this specific password?**
- UUID format prevents accidental real passwords in code
- Long enough to meet security requirements
- Easily recognizable as test data in logs

### Database Isolation

```javascript
// Environment-specific table isolation
const getTableName = (baseName) => {
  const env = process.env.ENV_NAME || 'dev';
  return `OidcProviderStack-${env}-${baseName}`;
};

// Use separate tables for each environment
process.env.USERS_TABLE = getTableName('Users');
process.env.CODES_TABLE = getTableName('AuthCodes');
```

## Load Testing

### K6 Performance Tests

```javascript
// tests/load/auth-flow.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 20, // 20 virtual users
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% under 2s
    http_req_failed: ['rate<0.01'],     // <1% failure rate
  }
};

export default function() {
  // Complete auth flow with unique user
  const username = `load-user-${__VU}-${__ITER}`;
  
  // 1. Authorization request
  const authResponse = http.post('https://oidc.antonycc.com/authorize', {
    client_id: 'self-client',
    username: username,
    password: 'load-test-password',
    // ... OAuth parameters
  });
  
  check(authResponse, {
    'auth response is 302': (r) => r.status === 302,
    'has authorization code': (r) => r.headers.Location.includes('code=')
  });
  
  // 2. Token exchange
  const code = extractCode(authResponse.headers.Location);
  const tokenResponse = http.post('https://oidc.antonycc.com/token', {
    grant_type: 'authorization_code',
    code: code,
    // ... token parameters
  });
  
  check(tokenResponse, {
    'token response is 200': (r) => r.status === 200,
    'has access token': (r) => JSON.parse(r.body).access_token
  });
}
```

### Running Load Tests

```bash
# Install k6
sudo apt-get install k6

# Run load test
k6 run tests/load/auth-flow.js

# Run with custom configuration
k6 run --vus 50 --duration 5m tests/load/auth-flow.js

# Output results to file
k6 run --out json=results.json tests/load/auth-flow.js
```

## Continuous Integration

### GitHub Actions Test Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - run: npm ci
      - run: npm run test:unit
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  infrastructure-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
      
      - run: ./mvnw test

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, infrastructure-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - run: npm ci
      - run: npx playwright install --with-deps
      
      - name: Run E2E tests
        run: npm run test:web
        env:
          BASE_URL: https://oidc.antonycc.com
      
      - name: Upload Playwright Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### Test Environments

| Environment | Purpose | URL | Test Data |
|-------------|---------|-----|-----------|
| **Production** | Validation testing | `oidc.antonycc.com` | Persistent test users |
| **CI** | Integration testing | `ci.oidc.antonycc.com` | Ephemeral test users |
| **Local** | Development testing | `localhost:3000` | Local DynamoDB |

## Test Coverage Goals

### Coverage Targets

- **Unit Tests**: >90% line coverage for business logic
- **Integration Tests**: 100% coverage of critical authentication paths
- **E2E Tests**: 100% coverage of user-facing flows
- **Error Handling**: 100% coverage of OAuth/OIDC error responses

### Coverage Reports

```bash
# Generate coverage report
npm run test:unit -- --coverage

# View HTML report
open coverage/index.html

# Check coverage thresholds
npm run test:unit -- --coverage --reporter=json-summary
```

## Debugging Tests

### Local Debugging

```bash
# Run tests with debug output
DEBUG=true npm run test:unit

# Run single test with detailed logging
npm run test:unit -- --reporter=verbose utils.test.mjs

# Debug Playwright tests
npx playwright test --debug tests/web.live.test.ts
```

### CI Debugging

```bash
# Download artifacts from failed CI run
gh run download <run-id>

# View Playwright traces
npx playwright show-trace trace.zip

# Analyze screenshots
open test-results/*/test-failed-*.png
```

## Performance Benchmarks

### Expected Performance Characteristics

| Test Type | Target Duration | Acceptable Range |
|-----------|----------------|------------------|
| **Unit Tests** | <2 seconds | <5 seconds |
| **System Tests** | <10 seconds | <30 seconds |
| **Infrastructure Tests** | <10 seconds | <30 seconds |
| **E2E Tests** | <60 seconds | <90 seconds |

### Authentication Flow Performance

| Operation | Cold Start | Warm Start |
|-----------|------------|------------|
| **Authorization** | <3 seconds | <200ms |
| **Token Exchange** | <3 seconds | <200ms |
| **UserInfo** | <3 seconds | <100ms |
| **JWKS** | <3 seconds | <50ms |

## Best Practices

### Test Organization

```
tests/
├── unit/           # Fast, isolated tests
├── integration/    # Service integration tests  
├── system/         # End-to-end system tests
├── performance/    # Load and stress tests
├── fixtures/       # Test data and utilities
└── helpers/        # Test helper functions
```

### Test Naming

```javascript
// Descriptive test names
describe('Authorization endpoint', () => {
  describe('when valid credentials provided', () => {
    it('returns 302 redirect with authorization code', () => {
      // Test implementation
    });
  });
  
  describe('when invalid credentials provided', () => {
    it('returns 401 with invalid_grant error', () => {
      // Test implementation  
    });
  });
});
```

### Data-Driven Testing

```javascript
describe.each([
  ['invalid_client', { client_id: 'nonexistent' }],
  ['invalid_scope', { scope: 'invalid_scope' }],
  ['invalid_redirect_uri', { redirect_uri: 'http://evil.com' }]
])('authorization validation errors', (expectedError, params) => {
  it(`returns ${expectedError} for invalid ${Object.keys(params)[0]}`, async () => {
    const response = await request(app).post('/authorize').send({
      ...validParams,
      ...params
    });
    
    expect(response.body.error).toBe(expectedError);
  });
});
```

### Security Testing

```javascript
describe('security validation', () => {
  it('prevents authorization code replay attacks', async () => {
    // Use authorization code once
    const firstTokenResponse = await exchangeCode(authCode);
    expect(firstTokenResponse.status).toBe(200);
    
    // Attempt to reuse same code
    const secondTokenResponse = await exchangeCode(authCode);
    expect(secondTokenResponse.status).toBe(400);
    expect(secondTokenResponse.body.error).toBe('invalid_grant');
  });
  
  it('validates PKCE code challenge', async () => {
    const response = await request(app).post('/token').send({
      grant_type: 'authorization_code',
      code: validCode,
      code_verifier: 'wrong_verifier'
    });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_grant');
  });
});
```

## Troubleshooting Common Test Issues

### E2E Test Failures

**Symptom**: Tests timeout or fail inconsistently
```bash
# Increase timeout for cold starts
# playwright.config.js
timeout: 90000, // 90 seconds
```

**Symptom**: Element not found errors
```javascript
// Use proper wait strategies
await page.waitForSelector('[data-testid="submit-button"]');
await page.waitForLoadState('networkidle');
```

### Unit Test Mocking Issues

**Symptom**: AWS SDK calls failing in tests
```javascript
// Proper mocking setup
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({
      send: vi.fn().mockResolvedValue({ Item: { /* test data */ } })
    }))
  }
}));
```

### Infrastructure Test Issues

**Symptom**: CDK synthesis failures
```bash
# Ensure JAVA_HOME is set correctly
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

# Check Maven dependencies
./mvnw dependency:tree
```

For more troubleshooting information, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

This testing strategy ensures high confidence in the OIDC Provider's security, performance, and reliability across all deployment environments.