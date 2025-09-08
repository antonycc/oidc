# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by email to: **security@antonycc.com**

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

### Information to Include

Please include the following information in your security report:

- **Type of issue** (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- **Full paths of source file(s)** related to the manifestation of the issue
- **The location of the affected source code** (tag/branch/commit or direct URL)
- **Any special configuration required** to reproduce the issue
- **Step-by-step instructions to reproduce** the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact of the issue**, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

## Security Considerations

### Authentication & Authorization

This OIDC provider implements industry-standard security practices:

- **OAuth 2.0 + OIDC**: Full compliance with RFCs 6749, 6750, and OpenID Connect Core 1.0
- **PKCE Support**: Proof Key for Code Exchange (RFC 7636) for public clients
- **JWT Security**: RS256 signatures with rotating keys stored in DynamoDB
- **Secure Headers**: Appropriate CORS, CSP, and security headers
- **HTTPS Only**: All endpoints enforce HTTPS communication

### Infrastructure Security

- **AWS IAM**: Least privilege access patterns throughout
- **VPC Isolation**: Lambda functions operate in secure AWS environment
- **CloudFront Distribution**: WAF and DDoS protection via CloudFront
- **DynamoDB Encryption**: Data encrypted at rest using AWS-managed keys
- **CloudWatch Logging**: Comprehensive audit logging with sensitive data masking

### Data Protection

- **Sensitive Data Masking**: Passwords, tokens, and PKCE verifiers are masked in logs
- **Token TTL**: Short-lived access tokens (1 hour) and auth codes (10 minutes)
- **Secure Storage**: User credentials hashed with bcryptjs
- **No PII Logging**: Personal information excluded from CloudWatch logs

### Input Validation

- **Parameter Validation**: All OAuth2/OIDC parameters validated per specifications
- **CORS Restrictions**: Strict origin validation for browser requests
- **Request Size Limits**: Lambda payload limits prevent resource exhaustion
- **SQL Injection Prevention**: NoSQL DynamoDB queries prevent injection attacks

## Security Response Process

### Initial Response

1. **Acknowledgment**: We will acknowledge receipt within 48 hours
2. **Initial Assessment**: Security team reviews and triages the report
3. **Severity Classification**: Using CVSS 3.1 scoring methodology
4. **Investigation**: Detailed technical analysis of the vulnerability

### Resolution Timeline

- **Critical (CVSS 9.0-10.0)**: Fix within 1 business day
- **High (CVSS 7.0-8.9)**: Fix within 7 business days
- **Medium (CVSS 4.0-6.9)**: Fix within 30 business days
- **Low (CVSS 0.1-3.9)**: Fix within 90 business days

### Disclosure Timeline

1. **Immediate**: Internal security team notified
2. **24-48 hours**: Initial assessment and response to reporter
3. **7-30 days**: Fix developed and tested (depending on severity)
4. **Post-fix**: Security advisory published (if warranted)
5. **30 days post-fix**: Full technical details may be disclosed

## Security Best Practices

### For Integrators

When integrating with this OIDC provider:

- **Use HTTPS**: Always use HTTPS for redirect URIs
- **Validate State**: Always validate the `state` parameter to prevent CSRF
- **Implement PKCE**: Use PKCE for all authorization flows
- **Token Validation**: Verify JWT signatures using our JWKS endpoint
- **Secure Storage**: Store tokens securely (HttpOnly cookies or secure storage)
- **Token Refresh**: Implement proper token refresh flows

### For Developers

When contributing to this project:

- **Dependency Updates**: Keep dependencies updated and scan for vulnerabilities
- **Code Review**: All changes require security-focused code review
- **Testing**: Include security test cases in all PR submissions
- **Logging**: Never log passwords, tokens, or other sensitive data
- **Error Handling**: Avoid information disclosure in error responses

## Vulnerability Disclosure Policy

We follow responsible disclosure principles:

### Our Commitments

- **Acknowledgment**: We will acknowledge receipt of your report promptly
- **Communication**: We will keep you updated on our progress
- **Credit**: We will credit you in our security advisory (unless you prefer anonymity)
- **No Legal Action**: We will not pursue legal action against researchers who:
  - Report vulnerabilities in good faith
  - Avoid privacy violations, data destruction, and service disruption
  - Give us reasonable time to address issues before public disclosure

### Scope

**In Scope:**
- Authentication and authorization flaws
- JWT token vulnerabilities
- Input validation issues
- Infrastructure security issues
- Business logic flaws in OAuth2/OIDC flows

**Out of Scope:**
- Social engineering attacks
- Physical attacks
- Denial of service attacks
- Issues in third-party dependencies (report directly to vendors)
- Issues requiring unlikely user interaction

## Contact

- **Security Email**: security@antonycc.com
- **General Issues**: Use GitHub Issues for non-security bugs
- **Project Maintainer**: [@antonycc](https://github.com/antonycc)

## References

- [OAuth 2.0 Security Best Current Practice](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)
- [OIDC Security Considerations](https://openid.net/specs/openid-connect-core-1_0.html#Security)
- [AWS Security Best Practices](https://aws.amazon.com/architecture/security-identity-compliance/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

Thank you for helping keep the OIDC Provider secure! 🔒