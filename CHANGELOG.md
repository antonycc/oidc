# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive documentation refresh including contributing guidelines
- Security policy and vulnerability reporting procedures
- OpenAPI specification for all endpoints
- Troubleshooting guide for common deployment and operational issues
- Environment variables documentation
- Architecture decision records
- Enhanced inline code documentation with JSDoc annotations

### Changed
- Improved repository documentation structure and organization
- Enhanced README.md with additional integration examples
- Updated code comments for better maintainability

### Security
- Added formal security policy and responsible disclosure guidelines
- Enhanced input validation documentation
- Documented security best practices for integrators

## [0.1.0] - 2024-12-08

### Added
- Initial release of serverless OIDC provider
- Full OAuth 2.0 and OpenID Connect Core 1.0 compliance
- AWS CDK infrastructure for serverless deployment
- PKCE support for public clients
- JWT token generation with RS256 signatures
- DynamoDB storage for users, authorization codes, and refresh tokens
- CloudFront distribution with WAF protection
- Comprehensive test suite (unit, integration, E2E)
- Playwright-based end-to-end testing
- Production deployment on oidc.antonycc.com
- CI/CD pipeline with GitHub Actions
- Load testing with k6
- Performance monitoring and observability

### Security
- bcryptjs password hashing
- Sensitive data masking in logs
- HTTPS-only endpoints
- CORS protection
- Input validation for all OAuth2/OIDC parameters
- Short-lived tokens with automatic cleanup

### Infrastructure
- Multi-environment support (prod, ci, branch deployments)
- AWS CloudWatch logging and monitoring
- DynamoDB with TTL for automatic cleanup
- Route53 DNS management
- ACM certificate management
- Cost-optimized serverless architecture

### Documentation
- Comprehensive README with integration guides
- API documentation with examples
- Developer setup instructions
- AWS compliance documentation
- Performance benchmarks and metrics

---

## Release Notes Format

Each release includes the following categories when applicable:

- **Added** for new features
- **Changed** for changes in existing functionality  
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes and security improvements

## Version Numbering

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR.MINOR.PATCH** (e.g., 1.2.3)
- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

## Development Releases

Development versions may include additional identifiers:
- **Alpha**: `1.2.3-alpha.1` (early development)
- **Beta**: `1.2.3-beta.1` (feature complete, testing)
- **Release Candidate**: `1.2.3-rc.1` (final testing)

## Links

- [Repository](https://github.com/antonycc/oidc)
- [Production Instance](https://oidc.antonycc.com)
- [Issues](https://github.com/antonycc/oidc/issues)
- [Releases](https://github.com/antonycc/oidc/releases)