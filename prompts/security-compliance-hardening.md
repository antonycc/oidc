# Security & Compliance Hardening Prompt

> Formatting and style: Defer to the repo’s formatters — ESLint (flat) + Prettier for JS (ESM) and Spotless (Palantir Java Format) for Java. Use npm run formatting / npm run formatting-fix. See README for details.

Analyze the current OIDC provider implementation and enhance security posture while ensuring compliance readiness for production deployment.

Focus on:
- Comprehensive security audit and vulnerability assessment
- OIDC-specific security patterns and attack vector mitigation
- Compliance framework validation (SOC2, PCI DSS, GDPR, HIPAA considerations)
- Advanced threat protection and monitoring capabilities
- Security incident response procedures and automation
- Token lifecycle management and revocation strategies
- Rate limiting, DDoS protection, and abuse prevention
- Penetration testing frameworks and security validation

## OIDC-Specific Security Areas

Examine these critical OIDC provider security domains:

### Identity and Authentication Security
- Multi-factor authentication integration patterns
- Credential stuffing and brute force protection
- Session management and timeout policies
- Account lockout and suspicious activity detection
- Password policy enforcement and complexity requirements
- Social engineering attack prevention

### Token Security and Lifecycle Management
- JWT security patterns and claims validation
- Token encryption at rest and in transit
- Refresh token rotation and revocation strategies
- Token introspection endpoint security
- Short-lived access token patterns
- Token binding and proof-of-possession validation
- JWKS rotation and key management automation

### OAuth 2.0 and OIDC Flow Security
- Authorization code injection attack prevention
- PKCE implementation validation and enforcement
- Redirect URI validation and allowlist management
- State parameter validation and CSRF protection
- Nonce validation for replay attack prevention
- Client authentication and registration security
- Scope validation and privilege escalation prevention

### Federation and Integration Security
- Identity provider chaining security
- SAML assertion validation when federating
- Cross-origin resource sharing (CORS) policies
- API rate limiting and quota management
- Webhook security and payload validation
- Third-party integration security patterns

## Compliance and Governance Framework

Address regulatory and compliance requirements:

### SOC2 Type II Preparation
- Security control documentation and evidence collection
- Access control reviews and privilege management
- Data processing and retention policy implementation
- Incident response procedure documentation
- Vulnerability management and patch procedures
- Third-party vendor risk assessment

### GDPR and Privacy Compliance
- Data protection impact assessment (DPIA) for identity data
- Consent management and withdrawal mechanisms
- Right to erasure (data deletion) implementation
- Data portability and export capabilities
- Privacy by design architectural review
- Cross-border data transfer security measures

### Industry-Specific Compliance
- PCI DSS considerations for payment-related authentication
- HIPAA compliance patterns for healthcare identity
- FedRAMP security controls for government use
- ISO 27001 security management system alignment
- Financial services regulations (PSD2, Open Banking)

## Infrastructure Security Hardening

Strengthen the AWS serverless architecture:

### Lambda Function Security
- Runtime security and dependency vulnerability scanning
- Environment variable encryption and secrets management
- Function execution role privilege minimization
- VPC configuration for network isolation
- Dead letter queue security and monitoring
- Cold start attack mitigation strategies

### DynamoDB Security Enhancement
- Fine-grained access control and resource-based policies
- Encryption at rest with customer-managed keys
- Point-in-time recovery and backup encryption
- VPC endpoint configuration for private access
- Audit logging and access pattern monitoring
- Data masking and anonymization for non-production

### CloudFront and CDN Security
- Web Application Firewall (WAF) rule implementation
- Geographic restriction and IP allowlist management
- Origin access control (OAC) validation
- Cache poisoning attack prevention
- SSL/TLS configuration and HSTS enforcement
- Real-time logging and threat detection

### API Gateway and Endpoint Security
- Request validation and input sanitization
- SQL injection and XSS attack prevention
- API versioning security considerations
- Throttling and quotas for abuse prevention
- Request signing and authentication validation
- Response header security configuration

## Monitoring and Incident Response

Implement comprehensive security monitoring:

### Security Information and Event Management (SIEM)
- Centralized log aggregation and correlation
- Real-time threat detection and alerting
- Automated incident response workflows
- Forensic log preservation and chain of custody
- Compliance reporting and audit trail generation
- Security dashboard and visualization

### Advanced Threat Detection
- Anomaly detection for authentication patterns
- Machine learning-based fraud detection
- Geographic access pattern analysis
- Device fingerprinting and risk scoring
- Behavioral analytics for insider threats
- Integration with threat intelligence feeds

### Vulnerability Management
- Automated dependency vulnerability scanning
- Infrastructure vulnerability assessment
- Penetration testing procedures and schedules
- Bug bounty program setup and management
- Security patch management workflows
- Zero-day vulnerability response procedures

## Implementation Recommendations

Provide specific, actionable security improvements that:

### Immediate Security Wins
- Implement security headers (CSP, HSTS, X-Frame-Options)
- Add rate limiting to all authentication endpoints
- Enable AWS GuardDuty and Security Hub
- Configure CloudTrail for comprehensive audit logging
- Implement secrets rotation for JWT signing keys
- Add input validation and sanitization everywhere

### Progressive Security Enhancements
- Deploy AWS WAF with OWASP top 10 protection
- Implement comprehensive security testing pipeline
- Add fraud detection and risk scoring
- Configure advanced CloudWatch security metrics
- Implement security incident response automation
- Establish security training and awareness programs

### Compliance and Governance
- Document security controls and procedures
- Implement data classification and handling policies
- Establish vendor risk management processes
- Create security incident response playbooks
- Implement regular security assessments
- Maintain compliance evidence and documentation

## Success Criteria

Security hardening must achieve:
- **Zero Critical Vulnerabilities**: No high-risk security issues in production
- **Compliance Readiness**: Documented controls for major compliance frameworks
- **Monitoring Coverage**: 100% visibility into authentication and authorization events
- **Incident Response**: <30 minute mean time to detection for security events
- **Penetration Testing**: Annual third-party security assessment with remediation
- **Developer Security**: Security-first development practices and training

Consider the impact on:
- **User Experience**: Security measures should not significantly impact performance
- **Operational Complexity**: Security tools should integrate seamlessly
- **Cost Management**: Security investments should be proportional to risk
- **Compliance Deadlines**: Implementation should align with regulatory timelines
- **Third-Party Integrations**: Security should not break existing integrations
- **Development Velocity**: Security processes should enable, not hinder, development

Focus on creating a security-first culture while maintaining the serverless architecture's advantages of scalability, cost-effectiveness, and operational simplicity.
