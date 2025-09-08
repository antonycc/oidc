# Contributing to OIDC Provider

Thank you for your interest in contributing to this OpenID Connect provider! This guide will help you get started with development, testing, and submitting contributions.

## Quick Start

### Prerequisites

- **Node.js 22+** (enforced by package.json engines)
- **Java 21** (required for CDK and Maven)
- **AWS CLI** configured (for deployment)
- **Git** for version control

### Environment Setup

1. **Install Node 22**:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   nvm install 22 && nvm use 22
   ```

2. **Install Java 21**:
   ```bash
   # Ubuntu/Debian
   sudo apt update && sudo apt install -y openjdk-21-jdk
   sudo update-alternatives --config java  # Select Java 21
   export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
   
   # macOS
   brew install openjdk@21
   export JAVA_HOME=$(/usr/libexec/java_home -v 21)
   ```

3. **Clone and setup**:
   ```bash
   git clone https://github.com/antonycc/oidc.git
   cd oidc
   npm ci  # Install dependencies (~2 seconds)
   ```

4. **Install Playwright browsers** (one-time setup):
   ```bash
   npx playwright install --with-deps  # Takes ~60 seconds
   ```

## Development Workflow

### Project Structure

```
├── app/                    # Node.js OIDC application
│   ├── functions/          # Lambda handlers (authorize, token, userinfo, jwks)
│   ├── lib/                # Shared libraries (crypto, db, clients, utils)
│   ├── test/               # Unit tests (Vitest)
│   └── system/             # System integration tests
├── infra/                  # Java CDK infrastructure
│   └── main/java/          # CDK stack definitions
│   └── test/java/          # Infrastructure tests (JUnit 5)
├── tests/                  # E2E tests (Playwright)
├── web/                    # Static web assets
├── well-known/             # OIDC discovery documents
├── api/                    # OpenAPI specification
└── docs/                   # Documentation
```

### Building and Testing

**Quick validation** (runs in ~30 seconds):
```bash
npm test                    # Unit tests (Vitest)
npm run test:system        # System integration tests
```

**Infrastructure validation** (runs in ~20 seconds):
```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./mvnw --errors test       # Java CDK tests
npx cdk synth              # Validate CDK synthesis
```

**End-to-end testing** (requires deployed environment):
```bash
# Set environment variables first
export BASE_URL=https://your-deployed-instance.com
export TEST_USERNAME=test-user
export TEST_PASSWORD=your-test-password

npx playwright test        # Full E2E test suite
```

### Code Style and Standards

**JavaScript/Node.js**:
- ESM modules only (`.mjs` files for tests)
- Use `import/export` syntax, avoid CommonJS
- Follow existing JSDoc patterns for documentation
- Structured logging with `log()` and `logError()` utilities

**Java/CDK**:
- Target Java 21
- Follow AWS CDK best practices
- Use builder patterns for complex configurations
- Explicit resource naming and removal policies

**Testing**:
- Unit tests in `app/test/` with `.test.mjs` extension
- Infrastructure tests in `infra/test/java/`
- E2E tests in `tests/` directory
- Mock external dependencies in unit tests

### Running Specific Tests

```bash
# Unit tests only
npm run test:unit

# Single test file
npx vitest run app/test/authorize.test.mjs

# Single test case
npx vitest run app/test/authorize.test.mjs -t "renders login form"

# Infrastructure tests
./mvnw --errors test

# E2E tests (requires deployment)
BASE_URL=https://oidc.antonycc.com npx playwright test

# E2E tests with UI
npx playwright test --ui
```

### Development Environment

**Local development** uses in-memory storage:
- Tables starting with `mem_` use local Map storage
- No AWS resources required for unit/system tests
- Perfect for rapid development and testing

**Environment variables** for local development:
```bash
export USERS_TABLE=mem_users
export CODES_TABLE=mem_codes  
export REFRESH_TABLE=mem_refresh
export ISSUER=http://localhost:3000
export BASE_URL=http://localhost:3000
```

## Making Changes

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Development Guidelines

**For Lambda Functions**:
- Add comprehensive JSDoc documentation
- Include structured logging at key decision points
- Handle errors gracefully with appropriate HTTP status codes
- Mask sensitive data in logs (passwords, tokens)

**For Infrastructure**:
- Use predictable resource naming
- Set appropriate removal policies (DESTROY for dev/test)
- Include environment variable injection
- Document CDK constructs and their purposes

**For Tests**:
- Test both success and failure scenarios
- Mock external dependencies appropriately  
- Use descriptive test names
- Include edge cases and error conditions

### 3. Code Quality Checks

Run these before committing:

```bash
# Formatting check
npm run formatting

# Fix formatting issues
npm run formatting-fix

# Full test suite
npm test
./mvnw --errors test
```

### 4. Documentation

Update relevant documentation:
- **README.md**: For user-facing changes
- **API docs**: Update `api/openapi.yaml` for API changes
- **JSDoc comments**: For new functions and significant changes
- **Architecture docs**: For infrastructure or design changes

## Testing Strategy

### Unit Tests (Fast - ~1 second)

- Test individual functions in isolation
- Use in-memory storage (`mem_` prefixed tables)
- Mock external dependencies (AWS services, HTTP calls)
- Focus on business logic and edge cases

```javascript
import { describe, it, expect } from 'vitest';
import { handler } from '../functions/authorize.mjs';

describe('authorize handler', () => {
  it('rejects invalid client_id', async () => {
    const result = await handler(createMockEvent({ client_id: 'invalid' }));
    expect(result.statusCode).toBe(400);
  });
});
```

### System Tests (Medium - ~5 seconds)

- Test full request/response cycles
- Use Express server for HTTP simulation
- Validate integration between components
- Test error propagation and logging

### E2E Tests (Slow - ~30 seconds)

- Test against deployed infrastructure
- Use real AWS resources (DynamoDB, Lambda, CloudFront)
- Validate full OAuth2/OIDC flows
- Include UI testing with Playwright

## Deployment and Infrastructure

### Development Deployment

For testing infrastructure changes:

```bash
# Set environment variables
export ENV_NAME=dev
export DOMAIN_NAME=dev.oidc.yourdom ain.com
export HOSTED_ZONE_ID=Z123456789
export CERTIFICATE_ARN=arn:aws:acm:...

# Deploy CDK stack
npx cdk deploy OidcProviderStack-dev
```

### Environment Variables

**Required for deployment**:
- `HOSTED_ZONE_ID`: Route53 hosted zone ID
- `DOMAIN_NAME`: Domain name for the OIDC provider
- `CERTIFICATE_ARN`: ACM certificate ARN

**Optional**:
- `ENV_NAME`: Environment name (dev/staging/prod)
- `COGNITO_DOMAIN_PREFIX`: Cognito user pool domain prefix

## Pull Request Process

### 1. Pre-submission Checklist

- [ ] All tests pass (`npm test && ./mvnw test`)
- [ ] Code follows style guidelines (`npm run formatting`)
- [ ] Documentation updated for user-facing changes
- [ ] JSDoc comments added for new functions
- [ ] No sensitive data committed (keys, passwords, tokens)

### 2. Pull Request Template

**Description**: Brief description of changes

**Type of Change**:
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)  
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

**Testing**:
- [ ] Unit tests added/updated
- [ ] System tests pass
- [ ] E2E tests pass (if applicable)
- [ ] Manual testing completed

**Documentation**:
- [ ] README updated
- [ ] API documentation updated  
- [ ] JSDoc comments added
- [ ] Architecture documentation updated

### 3. Review Process

1. **Automated checks**: CI pipeline runs all tests
2. **Code review**: Maintainer reviews code quality and design
3. **Manual testing**: Reviewer tests functionality if needed
4. **Approval**: At least one maintainer approval required
5. **Merge**: Squash and merge to main branch

## Common Development Tasks

### Adding a New Endpoint

1. **Create Lambda handler** in `app/functions/`:
   ```javascript
   /**
    * Description of endpoint
    * @param {Object} event - Lambda event
    * @returns {Promise<Object>} Response object
    */
   export const handler = async (event) => {
     // Implementation
   };
   ```

2. **Add CDK infrastructure** in `infra/main/java/`:
   ```java
   Function newFunction = Function.Builder.create(this, "NewFunction")
     .runtime(Runtime.NODEJS_22_X)
     .handler("new.handler")
     // ... configuration
     .build();
   ```

3. **Add unit tests** in `app/test/`:
   ```javascript
   describe('new endpoint', () => {
     it('handles valid requests', async () => {
       // Test implementation
     });
   });
   ```

4. **Update API documentation** in `api/openapi.yaml`

### Adding Environment Variables

1. **Update CDK stack** to pass environment variable to Lambda
2. **Document variable** in `ENVIRONMENT.md`  
3. **Add to local development** instructions
4. **Update tests** to handle new variable

### Modifying Database Schema

1. **Update table definitions** in CDK
2. **Add migration logic** if needed for existing data
3. **Update test data structures**
4. **Document schema changes**

## Security Guidelines

### Sensitive Data Handling

- **Never commit** secrets, keys, or passwords
- **Use environment variables** for configuration
- **Mask sensitive data** in logs using `maskSensitive()`
- **Validate all inputs** to prevent injection attacks

### Authentication & Authorization

- **PKCE required** for all OAuth2 flows
- **Validate redirect URIs** against registered clients
- **Verify JWT signatures** for all token operations
- **Use HTTPS** for all communications

### AWS Security

- **Least privilege** IAM policies
- **Encrypt data at rest** (DynamoDB encryption)
- **VPC endpoints** for AWS service communication
- **CloudTrail logging** for all AWS API calls

## Getting Help

### Documentation

- **README.md**: User guide and setup instructions
- **API documentation**: `api/openapi.yaml` OpenAPI specification
- **.junie/guidelines.md**: Detailed development guidelines
- **docs/**: Architecture and design documents

### Issues and Discussions

- **Bug reports**: Use GitHub Issues with bug template
- **Feature requests**: Use GitHub Issues with feature template  
- **Questions**: Use GitHub Discussions
- **Security issues**: Email maintainer directly

### Community

- **Code of Conduct**: Be respectful and constructive
- **Response time**: Expect 24-48 hours for issue responses
- **Pull request reviews**: Usually within 1-2 business days

## Release Process

### Versioning

This project uses semantic versioning (semver):
- **Patch** (0.0.X): Bug fixes and minor improvements
- **Minor** (0.X.0): New features, backwards compatible
- **Major** (X.0.0): Breaking changes

### Release Checklist

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with release notes
3. **Create release branch** from main
4. **Run full test suite** including E2E tests
5. **Tag release** and push to GitHub
6. **Deploy to production** via GitHub Actions
7. **Announce release** in discussions

---

## Quick Reference

**Essential Commands**:
```bash
npm ci                      # Install dependencies
npm test                    # Run all tests
./mvnw --errors test       # Java infrastructure tests
npx cdk synth              # Validate CDK synthesis
npm run formatting-fix      # Fix code formatting
npx playwright test --ui    # E2E tests with UI
```

**Project Philosophy**:
- **Minimal dependencies** for easy understanding
- **Comprehensive testing** at all levels
- **Structured logging** for operational transparency
- **AWS-first design** with cost optimization
- **Security by default** with audit trails

Thank you for contributing to the OIDC provider! 🚀