# Contributing to OIDC Provider

We welcome contributions to the OIDC Provider project! This document provides guidelines for contributing code, documentation, and bug reports.

## Development Setup

### Prerequisites

- **Node.js 22**: Required for the application runtime
- **Java 21**: Required for CDK infrastructure and Maven builds
- **AWS CLI**: For deployment and AWS service interaction
- **CDK v2**: For infrastructure synthesis and deployment

### Quick Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/antonycc/oidc.git
   cd oidc
   ```

2. **Install Node.js 22** (using nvm):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   nvm install 22 && nvm use 22
   ```

3. **Install Java 21**:
   ```bash
   # On Ubuntu/Debian
   sudo apt update && sudo apt install -y openjdk-21-jdk
   sudo update-alternatives --config java  # Select Java 21
   export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
   ```

4. **Install dependencies**:
   ```bash
   npm ci
   ```

5. **Install Playwright browsers** (for E2E tests):
   ```bash
   npx playwright install --with-deps
   ```

## Development Workflow

### Running Tests

- **Unit tests**: `npm test` or `npm run test:unit`
- **System tests**: `npm run test:system`
- **Infrastructure tests**: `./mvnw --errors test`
- **E2E tests** (requires deployment): `npm run test:web`

### Building and Validation

- **CDK synthesis**: `npx cdk synth` (validates infrastructure)
- **Code formatting**: `npm run formatting-fix`
- **Code linting**: `npm run formatting` (check only)

### Local Development

- **Start development server**: `node app/bin/express-server.mjs`
- **Provision test users**: `npm run users:provision <username> <password>`
- **Clear test users**: `npm run users:clear`

## Code Standards

### Code Style

- **ESM modules only**: Use `.mjs` extensions for all JavaScript files
- **Prettier formatting**: Code is automatically formatted with Prettier
- **ESLint compliance**: Follow Google JavaScript style guide with security rules
- **No CommonJS**: Avoid `require()` statements, use ES6 `import`/`export`

### Documentation Standards

- **JSDoc comments**: All functions should have JSDoc documentation
- **Type annotations**: Include parameter and return types in JSDoc
- **Error handling**: Document expected errors and error responses
- **Logging**: Use structured logging with appropriate log levels

### Example Function Documentation

```javascript
/**
 * OIDC Authorization endpoint handler
 * Processes authorization requests and issues authorization codes
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.requestContext - Request context
 * @param {Object} event.requestContext.http - HTTP details
 * @param {string} event.requestContext.http.method - HTTP method
 * @param {string} event.body - Request body
 * @returns {Promise<Object>} Lambda response object with redirect or error
 */
export const handler = async (event) => {
  // Implementation
};
```

### Testing Standards

- **Test coverage**: Aim for high test coverage on business logic
- **Integration tests**: Test complete auth flows end-to-end
- **Mocking**: Mock AWS services in unit tests
- **Test data**: Use consistent test credentials across all tests

## Architecture Guidelines

### Security First

- **No secrets in logs**: Always mask sensitive data in logging
- **Input validation**: Validate all inputs at handler boundaries
- **AWS IAM**: Use least privilege access patterns
- **HTTPS only**: All endpoints must use HTTPS

### Performance Considerations

- **Lambda cold starts**: Design for fast cold start performance
- **DynamoDB efficiency**: Use appropriate query patterns and TTL
- **CloudFront caching**: Leverage caching for static assets
- **Structured logging**: Use JSON logging for CloudWatch efficiency

### Infrastructure as Code

- **CDK Java**: All infrastructure defined in CDK with type safety
- **Environment separation**: Clear separation between prod/ci/dev environments
- **Parameterization**: Use environment variables for configuration
- **Monitoring**: Include observability in all infrastructure definitions

## Contribution Types

### Bug Reports

When reporting bugs, please include:

- **Clear description**: What you expected vs. what happened
- **Reproduction steps**: Minimal steps to reproduce the issue
- **Environment details**: Node.js version, deployment environment
- **Error logs**: Relevant error messages and stack traces
- **Screenshots**: For UI-related issues

### Feature Requests

For new features, please provide:

- **Use case description**: Why this feature is needed
- **Proposed solution**: How you envision the feature working
- **Alternative approaches**: Other solutions you considered
- **Breaking changes**: Any potential impact on existing functionality

### Pull Requests

#### Before Submitting

1. **Run all tests**: Ensure all tests pass locally
2. **Check formatting**: Run `npm run formatting` to verify code style
3. **Update documentation**: Update relevant documentation for changes
4. **Test E2E flows**: For significant changes, test complete auth flows

#### Pull Request Guidelines

- **Small, focused changes**: Keep PRs manageable and focused
- **Clear descriptions**: Explain what changes and why
- **Link issues**: Reference any related issues or feature requests
- **Include tests**: Add or update tests for new functionality
- **Update CHANGELOG**: Add entry to CHANGELOG.md for user-facing changes

#### Review Process

- **Automated checks**: All CI checks must pass
- **Code review**: At least one maintainer review required
- **Testing**: E2E tests run automatically for main branch
- **Documentation**: Documentation updates reviewed for accuracy

## Security

### Reporting Security Issues

**DO NOT** create public GitHub issues for security vulnerabilities.

Instead, please email security issues to: [security@antonycc.com](mailto:security@antonycc.com)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if available)

### Security Guidelines

- **Authentication flows**: Follow OIDC and OAuth2 best practices
- **Token handling**: Secure token generation and validation
- **Input sanitization**: Validate and sanitize all user inputs
- **Error responses**: Avoid information disclosure in error messages

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):
- **Major version**: Breaking changes
- **Minor version**: New features, backward compatible
- **Patch version**: Bug fixes, backward compatible

### Deployment Environments

- **Production** (`main` branch): `oidc.antonycc.com`
- **CI** (manual dispatch): `ci.oidc.antonycc.com`
- **Branch testing**: `<branch>.oidc.antonycc.com`

## Community

### Getting Help

- **GitHub Discussions**: For questions and community discussions
- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: Check README.md and docs/ folder first

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. All contributors are expected to follow our Code of Conduct (see CODE_OF_CONDUCT.md).

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License that covers the project.

---

Thank you for contributing to the OIDC Provider project! 🚀