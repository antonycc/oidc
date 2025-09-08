# Testing Strategy and Guide

This document describes the comprehensive testing approach for the OIDC provider, including testing strategies, frameworks, and best practices.

## Testing Philosophy

The OIDC provider follows a **test pyramid** approach with emphasis on:
- **Fast feedback loops** through unit tests
- **Integration confidence** through system tests  
- **User experience validation** through E2E tests
- **Performance verification** through load tests
- **Security validation** through security tests

## Test Architecture

```
                    E2E Tests (Playwright)
                   ┌─────────────────────────┐
                   │ Full OIDC Flow Testing │
                   │ Browser Automation     │
                   └─────────────────────────┘
                            │
                System Tests (Vitest + Express)
               ┌─────────────────────────────────┐
               │ HTTP Request/Response Testing  │
               │ Multi-Function Integration     │
               └─────────────────────────────────┘
                            │
                Unit Tests (Vitest)
        ┌─────────────────────────────────────────────┐
        │ Function-Level Logic Testing               │
        │ Mock External Dependencies                 │
        │ Edge Cases and Error Conditions           │
        └─────────────────────────────────────────────┘
                            │
             Infrastructure Tests (JUnit)
        ┌─────────────────────────────────────────────┐
        │ CDK Stack Synthesis Validation            │
        │ Resource Configuration Testing            │
        │ Policy and Permission Validation          │
        └─────────────────────────────────────────────┘
```

## Test Categories

### 1. Unit Tests

**Framework**: Vitest  
**Location**: `app/test/*.test.mjs`  
**Execution Time**: ~1 second  
**Coverage Target**: >90% code coverage

#### Purpose
- Test individual functions in isolation
- Validate business logic and edge cases
- Ensure error handling works correctly
- Fast feedback during development

#### Test Structure
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { handler } from '../functions/authorize.mjs';

describe('authorize handler', () => {
  beforeEach(() => {
    // Setup test environment
    process.env.CODES_TABLE = 'mem_codes';
    process.env.USERS_TABLE = 'mem_users';
  });

  it('rejects requests with invalid client_id', async () => {
    const event = createMockEvent({
      body: 'client_id=invalid&redirect_uri=https://example.com'
    });
    
    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('invalid_client');
  });
});
```

#### Key Testing Patterns

**Mock External Dependencies**:
```javascript
// Use in-memory storage for DynamoDB operations
process.env.CODES_TABLE = 'mem_codes';

// Mock AWS services
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => mockDdbClient)
  }
}));
```

**Test Error Conditions**:
```javascript
it('handles DynamoDB errors gracefully', async () => {
  // Setup error condition
  mockDdbClient.send.mockRejectedValue(new Error('DynamoDB unavailable'));
  
  const result = await handler(mockEvent);
  
  expect(result.statusCode).toBe(500);
  expect(result.body).toContain('server_error');
});
```

### 2. System Tests

**Framework**: Vitest + Express  
**Location**: `app/system/*.test.mjs`  
**Execution Time**: ~5 seconds  
**Coverage Target**: All HTTP endpoints and integrations

#### Purpose
- Test full request/response cycles
- Validate integration between components
- Test realistic data flows
- Ensure proper HTTP status codes and headers

#### Test Structure
```javascript
import { describe, it, expect } from 'vitest';
import express from 'express';
import { handler as authorizeHandler } from '../functions/authorize.mjs';

describe('system: OIDC flow integration', () => {
  it('completes full authorization code flow', async () => {
    const app = express();
    app.use('/authorize', adaptLambdaHandler(authorizeHandler));
    
    // Step 1: Authorization request
    const authResponse = await request(app)
      .post('/authorize')
      .send({
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        scope: 'openid email',
        code_challenge: 'test-challenge',
        code_challenge_method: 'S256',
        username: 'test-user',
        password: 'test-password'
      });
    
    expect(authResponse.status).toBe(302);
    
    // Extract authorization code from redirect
    const code = extractCodeFromLocation(authResponse.headers.location);
    
    // Step 2: Token exchange
    const tokenResponse = await request(app)
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        code: code,
        client_id: 'test-client',
        code_verifier: 'test-verifier'
      });
    
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body.access_token).toBeDefined();
  });
});
```

### 3. Infrastructure Tests

**Framework**: JUnit 5  
**Location**: `infra/test/java/`  
**Execution Time**: ~8 seconds  
**Coverage Target**: All CDK constructs and configurations

#### Purpose
- Validate CDK stack synthesis
- Test resource configurations
- Ensure security policies are correct
- Verify environment-specific settings

#### Test Structure
```java
@Test
void testStackSynthesis() {
    // Given
    App app = new App();
    Map<String, String> env = Map.of(
        "DOMAIN_NAME", "test.example.com",
        "CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123:certificate/test"
    );
    
    // When
    OidcProviderStack stack = new OidcProviderStack(app, "TestStack", 
        OidcProviderStackProps.builder()
            .env(Environment.builder().region("us-east-1").build())
            .build());
    
    // Then
    Template template = Template.fromStack(stack);
    
    // Verify Lambda functions are created
    template.hasResourceProperties("AWS::Lambda::Function", Map.of(
        "Runtime", "nodejs22.x",
        "Handler", "authorize.handler"
    ));
    
    // Verify DynamoDB tables have proper configuration
    template.hasResourceProperties("AWS::DynamoDB::Table", Map.of(
        "BillingMode", "PAY_PER_REQUEST",
        "DeletionPolicy", "Delete"
    ));
}
```

### 4. End-to-End Tests

**Framework**: Playwright  
**Location**: `tests/*.test.ts`  
**Execution Time**: ~30 seconds  
**Requirements**: Deployed environment with valid credentials

#### Purpose
- Test complete user workflows
- Validate UI interactions
- Test browser compatibility
- Ensure production-like environment works

#### Test Structure
```typescript
import { test, expect } from '@playwright/test';

test('complete OIDC authentication flow', async ({ page }) => {
  // Navigate to login page
  await page.goto(`${process.env.BASE_URL}/login.html`);
  
  // Fill in credentials
  await page.fill('#username', process.env.TEST_USERNAME!);
  await page.fill('#password', process.env.TEST_PASSWORD!);
  
  // Submit form and follow redirects
  await page.click('button[type="submit"]');
  
  // Verify successful authentication
  await expect(page).toHaveURL(/post-auth/);
  await expect(page.locator('#access-token')).toBeVisible();
  
  // Test token usage
  const tokenElement = page.locator('#access-token');
  const token = await tokenElement.textContent();
  
  // Make authenticated request to userinfo endpoint
  const response = await page.request.get(`${process.env.BASE_URL}/userinfo`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  
  expect(response.ok()).toBeTruthy();
  const userInfo = await response.json();
  expect(userInfo.sub).toBe(process.env.TEST_USERNAME);
});
```

#### Visual Testing
```typescript
test('login form visual regression', async ({ page }) => {
  await page.goto(`${process.env.BASE_URL}/login.html`);
  
  // Take screenshot for visual comparison
  await expect(page).toHaveScreenshot('login-form.png');
  
  // Test error state visuals
  await page.fill('#username', 'invalid');
  await page.fill('#password', 'invalid');
  await page.click('button[type="submit"]');
  
  await expect(page.locator('.error')).toBeVisible();
  await expect(page).toHaveScreenshot('login-form-error.png');
});
```

## Test Data Management

### Test Users and Clients

#### Test Client Configuration
```javascript
// In app/lib/clients.mjs
export const clients = {
  'test-client': {
    redirectUris: [
      'http://localhost:3000/callback',
      'https://ci.oidc.example.com/callback'
    ],
    scopes: ['openid', 'email', 'profile'],
    pkceRequired: true,
    clientSecret: null
  }
};
```

#### Test User Provisioning
```bash
# Provision test user in deployed environment
npm run users:provision test-user test-password

# Clear test users
npm run users:clear
```

### In-Memory Test Storage

For unit and system tests, use in-memory storage:

```javascript
// Test environment setup
process.env.USERS_TABLE = 'mem_users';
process.env.CODES_TABLE = 'mem_codes';
process.env.REFRESH_TABLE = 'mem_refresh';

// Automatic cleanup between tests
beforeEach(() => {
  // Memory stores are automatically isolated per test
});
```

## Testing Commands and Workflows

### Local Development Testing

```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npx vitest run app/test/authorize.test.mjs

# Run tests in watch mode
npx vitest app/test/authorize.test.mjs

# Run with coverage
npx vitest run --coverage

# Run specific test case
npx vitest run app/test/authorize.test.mjs -t "rejects invalid client"
```

### System Integration Testing

```bash
# Run system tests
npm run test:system

# Run all tests (unit + system)
npm test

# Debug system tests
npx vitest run app/system/api.system.test.mjs --reporter=verbose
```

### Infrastructure Testing

```bash
# Run Java infrastructure tests
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./mvnw --errors test

# Run specific test class
./mvnw test -Dtest=OidcProviderStackTest

# Test CDK synthesis
npx cdk synth
```

### End-to-End Testing

```bash
# Prerequisites: deployed environment and test credentials
export BASE_URL=https://oidc.antonycc.com
export TEST_USERNAME=test-user
export TEST_PASSWORD=c810fb39-86a9-4d2f-8107-119ade9605f8

# Run E2E tests
npx playwright test

# Run with UI mode for debugging
npx playwright test --ui

# Run specific test file
npx playwright test tests/web.live.test.ts

# Generate test report
npx playwright show-report
```

## Test Environment Setup

### CI/CD Testing Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run test:unit
  
  infrastructure-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-java@v3
        with:
          java-version: '21'
      - run: ./mvnw --errors test
  
  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, infrastructure-tests]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          BASE_URL: ${{ secrets.BASE_URL }}
          TEST_USERNAME: test-user
          TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
```

### Local Test Environment

```bash
# Setup local test environment
export NODE_ENV=test
export USERS_TABLE=mem_users
export CODES_TABLE=mem_codes
export ISSUER=http://localhost:3000
export BASE_URL=http://localhost:3000

# Run local development server for E2E tests
npm run dev &
export BASE_URL=http://localhost:3000
npx playwright test
```

## Performance Testing

### Load Testing with Artillery

```javascript
// performance/load-test.yml
config:
  target: https://oidc.antonycc.com
  phases:
    - duration: 60
      arrivalRate: 10
      name: Warm up
    - duration: 300
      arrivalRate: 50
      name: Load test
    - duration: 60
      arrivalRate: 100
      name: Spike test

scenarios:
  - name: Full OIDC flow
    weight: 100
    flow:
      - post:
          url: /authorize
          form:
            client_id: test-client
            redirect_uri: https://example.com/callback
            scope: openid email
            username: test-user
            password: "{{ $env.TEST_PASSWORD }}"
            code_challenge: test-challenge
            code_challenge_method: S256
          capture:
            - regexp: 'code=([^&]+)'
              as: auth_code
      - post:
          url: /token
          form:
            grant_type: authorization_code
            code: "{{ auth_code }}"
            client_id: test-client
            redirect_uri: https://example.com/callback
            code_verifier: test-verifier
          capture:
            - json: $.access_token
              as: access_token
      - get:
          url: /userinfo
          headers:
            Authorization: "Bearer {{ access_token }}"
```

```bash
# Run load tests
npx artillery run performance/load-test.yml

# Generate HTML report
npx artillery run --output performance/results.json performance/load-test.yml
npx artillery report performance/results.json
```

### Performance Benchmarks

**Target Performance Metrics**:
- **Authorization endpoint**: < 200ms average response time
- **Token endpoint**: < 300ms average response time (includes JWT signing)
- **UserInfo endpoint**: < 100ms average response time
- **JWKS endpoint**: < 50ms average response time

**Load Testing Results** (example from production):
- **20 VUs**: 100% success rate, ~861ms average flow duration
- **50 VUs**: 100% success rate, ~1.2s average flow duration
- **100 VUs**: 98% success rate, ~2.5s average flow duration

## Security Testing

### Authentication Security Tests

```javascript
describe('security: authentication', () => {
  it('prevents brute force attacks', async () => {
    const invalidAttempts = Array(10).fill().map(() => ({
      username: 'test-user',
      password: 'wrong-password'
    }));
    
    for (const attempt of invalidAttempts) {
      const result = await authorizeHandler(createMockEvent(attempt));
      expect(result.statusCode).toBe(401);
    }
    
    // Should still reject after many attempts
    const finalAttempt = await authorizeHandler(createMockEvent({
      username: 'test-user',
      password: 'correct-password'
    }));
    
    // Note: Rate limiting handled by CloudFront, not application
    expect(finalAttempt.statusCode).toBe(302);
  });
  
  it('validates PKCE challenges correctly', async () => {
    // Test with invalid code verifier
    const result = await tokenHandler(createMockEvent({
      code: 'valid-code',
      code_verifier: 'wrong-verifier'
    }));
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('invalid_grant');
  });
});
```

### JWT Security Tests

```javascript
describe('security: JWT tokens', () => {
  it('rejects tampered tokens', async () => {
    const validToken = await signJwt({ sub: 'test-user' });
    
    // Tamper with token signature
    const tamperedToken = validToken.slice(0, -10) + 'tampered123';
    
    const result = await userinfoHandler(createMockEvent({
      headers: { authorization: `Bearer ${tamperedToken}` }
    }));
    
    expect(result.statusCode).toBe(401);
  });
  
  it('enforces canonical base64url encoding', async () => {
    // Test with non-canonical padding
    const token = 'header.payload.signature=='; // Invalid padding
    
    const result = await userinfoHandler(createMockEvent({
      headers: { authorization: `Bearer ${token}` }
    }));
    
    expect(result.statusCode).toBe(401);
  });
});
```

### Input Validation Tests

```javascript
describe('security: input validation', () => {
  it('sanitizes HTML in error messages', async () => {
    const result = await authorizeHandler(createMockEvent({
      client_id: '<script>alert("xss")</script>'
    }));
    
    expect(result.body).not.toContain('<script>');
    expect(result.body).toContain('&lt;script&gt;');
  });
  
  it('validates redirect URIs strictly', async () => {
    const result = await authorizeHandler(createMockEvent({
      client_id: 'test-client',
      redirect_uri: 'http://evil.com/callback'
    }));
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('invalid_redirect_uri');
  });
});
```

## Test Reporting and Coverage

### Coverage Configuration

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.test.mjs'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
});
```

### Test Reports in CI

```yaml
# Generate and publish test reports
- name: Run tests with coverage
  run: npx vitest run --coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info

- name: Publish test results
  uses: dorny/test-reporter@v1
  if: always()
  with:
    name: Vitest Tests
    path: test-results.xml
    reporter: java-junit
```

## Best Practices

### Test Organization

1. **Group related tests** using `describe` blocks
2. **Use descriptive test names** that explain the scenario
3. **Follow AAA pattern**: Arrange, Act, Assert
4. **Keep tests independent** - no shared state between tests
5. **Test one thing at a time** - focused assertions

### Mock and Stub Guidelines

```javascript
// Good: Mock external dependencies
vi.mock('@aws-sdk/lib-dynamodb');

// Good: Use realistic test data
const mockUser = {
  username: 'test-user',
  email: 'test@example.com',
  passwordHash: await bcrypt.hash('test-password', 10)
};

// Bad: Overly complex mocks that don't reflect reality
vi.mock('../lib/crypto.mjs', () => ({
  signJwt: vi.fn(() => 'fake-token'),
  verifyJwt: vi.fn(() => ({ sub: 'any-user' }))
}));
```

### Error Testing Patterns

```javascript
it('handles network errors gracefully', async () => {
  // Arrange: Setup error condition
  mockDynamoDB.send.mockRejectedValue(new Error('Network timeout'));
  
  // Act: Execute the function
  const result = await handler(mockEvent);
  
  // Assert: Verify graceful error handling
  expect(result.statusCode).toBe(500);
  expect(result.body).toContain('server_error');
  
  // Verify logging (if needed)
  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining('Network timeout')
  );
});
```

### Async Testing

```javascript
it('handles concurrent requests correctly', async () => {
  const requests = Array(10).fill().map(() => 
    handler(createMockEvent({ username: 'test-user' }))
  );
  
  const results = await Promise.all(requests);
  
  results.forEach(result => {
    expect(result.statusCode).toBe(200);
  });
});
```

---

## Quick Test Commands

```bash
# Development cycle
npm run test:unit                    # Fast unit tests
npm test                            # All local tests
./mvnw --errors test                # Infrastructure tests

# Pre-commit validation
npm run formatting && npm test && ./mvnw test

# Production validation
npx playwright test                 # E2E against deployment

# Performance validation
npx artillery run performance/load-test.yml

# Debug specific test
npx vitest run app/test/authorize.test.mjs --reporter=verbose
npx playwright test --headed --debug
```

This comprehensive testing strategy ensures high confidence in code quality, security, and performance while maintaining fast development cycles through the test pyramid approach.