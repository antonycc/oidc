# Security Documentation

This document outlines security considerations, threat model, security controls, and best practices for the OIDC provider.

## Security Overview

The OIDC provider implements **defense-in-depth** security architecture with multiple layers of protection:

1. **Network Security**: HTTPS everywhere, CloudFront WAF protection
2. **Application Security**: OIDC-compliant authentication, input validation
3. **Data Security**: Encryption at rest and in transit, secure key management
4. **Operational Security**: Comprehensive logging, monitoring, and incident response
5. **Infrastructure Security**: AWS security services, IAM least privilege

## Threat Model

### Assets and Data Classification

#### Critical Assets
- **JWT Signing Keys**: Private keys used for token signing
- **User Credentials**: Usernames and bcrypt password hashes
- **Authorization Codes**: Short-lived codes for token exchange
- **Access Tokens**: Bearer tokens for API access

#### Data Classification
| Data Type | Sensitivity | Storage | Encryption | Retention |
|-----------|-------------|---------|------------|-----------|
| JWT Private Keys | Critical | DynamoDB | At-rest + in-transit | 1 year |
| User Passwords | Critical | DynamoDB (hashed) | At-rest + in-transit | Indefinite |
| Auth Codes | High | DynamoDB | At-rest + in-transit | 5 minutes |
| Access Tokens | High | Client-side only | In-transit | 15-60 minutes |
| User Claims | Medium | DynamoDB | At-rest + in-transit | Indefinite |
| Audit Logs | Medium | CloudWatch | At-rest + in-transit | 7 days |

### Threat Actors

#### External Attackers
- **Skill Level**: Script kiddies to advanced persistent threats
- **Motivation**: Data theft, service disruption, credential harvesting
- **Attack Vectors**: Network attacks, application exploits, social engineering

#### Malicious Clients
- **Skill Level**: Moderate technical knowledge
- **Motivation**: Unauthorized access, privilege escalation
- **Attack Vectors**: Client impersonation, redirect URI manipulation

#### Insider Threats
- **Skill Level**: High (system access)
- **Motivation**: Data exfiltration, sabotage
- **Attack Vectors**: Privileged access abuse, configuration tampering

### Attack Scenarios

#### 1. Authorization Code Interception
**Scenario**: Attacker intercepts authorization code during redirect
**Impact**: Account takeover, unauthorized access
**Mitigations**:
- PKCE required for all flows
- Short code lifetime (5 minutes)
- HTTPS enforcement
- Client authentication

#### 2. Token Replay Attack  
**Scenario**: Attacker captures and replays access tokens
**Impact**: Unauthorized API access, data theft
**Mitigations**:
- Short token lifetime (15-60 minutes)
- TLS everywhere
- Token binding (future enhancement)
- Rate limiting via CloudFront

#### 3. JWT Key Compromise
**Scenario**: Private signing keys are exposed
**Impact**: Token forgery, complete system compromise
**Mitigations**:
- Key rotation capabilities
- Secure key storage in DynamoDB
- Monitoring for anomalous key access
- Incident response procedures

#### 4. Client Impersonation
**Scenario**: Attacker registers malicious client or compromises existing client
**Impact**: Unauthorized access to user accounts
**Mitigations**:
- Client registration validation
- Redirect URI whitelist enforcement
- PKCE prevents code interception
- Client authentication (confidential clients)

## Security Controls

### 1. Authentication Security

#### Password Security
```javascript
// bcrypt with appropriate cost factor
const saltRounds = 10; // ~10 hashes per second
const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

// Secure password verification
const isValid = await bcrypt.compare(plainPassword, hashedPassword);
```

**Controls**:
- bcrypt password hashing (cost factor 10)
- No password length limits (prevent truncation attacks)
- Password masking in all logs
- No password storage in plaintext anywhere

#### Multi-Factor Authentication (Future)
- TOTP support for enhanced security
- SMS backup (with SIM-swapping awareness)
- Hardware security keys (WebAuthn)
- Risk-based authentication

### 2. Token Security

#### JWT Implementation
```javascript
// Secure JWT signing
const payload = {
  sub: user.username,
  aud: client.clientId,
  iss: process.env.ISSUER,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900, // 15 minute expiry
  scope: validatedScopes.join(' ')
};

const token = await new jose.SignJWT(payload)
  .setProtectedHeader({ alg: 'RS256', kid: 'kid-1' })
  .sign(privateKey);
```

**Controls**:
- RS256 algorithm (asymmetric signing)
- 2048-bit RSA keys minimum
- Short token lifetime (configurable)
- Canonical base64url encoding enforcement
- Key rotation capabilities

#### Token Validation
```javascript
// Strict signature verification
const isCanonicalJwsSignature = (compact) => {
  const parts = compact.split('.');
  if (parts.length !== 3) return false;
  const sigBytes = Buffer.from(parts[2], 'base64url');
  const canonical = sigBytes.toString('base64url').replace(/=+$/, '');
  return parts[2] === canonical;
};
```

**Controls**:
- Signature verification required
- Issuer validation
- Audience validation  
- Expiration time enforcement
- Not-before time validation

### 3. OAuth2/OIDC Security

#### PKCE Implementation
```javascript
// PKCE challenge validation
const challengeBytes = crypto.createHash('sha256').update(verifier).digest();
const challenge = challengeBytes.toString('base64url');

if (challenge !== storedChallenge) {
  throw new Error('PKCE verification failed');
}
```

**Controls**:
- PKCE required for all authorization code flows
- S256 method only (no plain text challenges)
- Code verifier validation on token exchange
- Challenge/verifier correlation tracking

#### Client Security
```javascript
// Client validation
const client = getClient(clientId);
if (!client) {
  return createErrorResponse(400, 'invalid_client');
}

// Redirect URI validation
if (!client.redirectUris.includes(redirectUri)) {
  return createErrorResponse(400, 'invalid_redirect_uri');
}
```

**Controls**:
- Client registration whitelist
- Redirect URI strict validation
- Scope limitation per client
- Client authentication for confidential clients
- No wildcard redirect URIs

### 4. Input Validation and Sanitization

#### XSS Prevention
```javascript
// HTML escaping for user input
const escapeHtml = (unsafe) => {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
```

**Controls**:
- All user input escaped in HTML output
- Content Security Policy headers
- No eval() or dynamic code execution
- Parameterized queries (DynamoDB operations)

#### Request Validation
```javascript
// Parameter validation
const validateAuthRequest = (params) => {
  const required = ['client_id', 'redirect_uri', 'scope', 'code_challenge'];
  const missing = required.filter(param => !params[param]);
  
  if (missing.length > 0) {
    throw new ValidationError(`Missing required parameters: ${missing.join(', ')}`);
  }
  
  // Additional format validation
  if (!isValidUrl(params.redirect_uri)) {
    throw new ValidationError('Invalid redirect_uri format');
  }
};
```

**Controls**:
- Required parameter validation
- Format validation (URLs, IDs)
- Length limits on input fields
- Character encoding validation

### 5. Cryptographic Security

#### Key Management
```javascript
// Key generation
const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { 
  modulusLength: 2048 
});

// Key storage with metadata
const jwkPrivate = {
  ...await jose.exportJWK(privateKey),
  kid: keyId,
  use: 'sig',
  alg: 'RS256'
};
```

**Controls**:
- RSA-2048 minimum key length
- Secure random key generation
- Key metadata tracking (kid, use, alg)
- Key rotation procedures
- Secure key storage in DynamoDB

#### Random Number Generation
```javascript
// Secure random generation for codes and challenges
const authCode = ulid(); // Uses crypto.getRandomValues()
const nonce = crypto.randomBytes(16).toString('hex');
const state = crypto.randomBytes(32).toString('base64url');
```

**Controls**:
- Cryptographically secure random number generation
- Sufficient entropy for all random values
- No predictable patterns in generated values

### 6. Transport Security

#### TLS Configuration
- **TLS Version**: 1.2+ required (1.3 preferred)
- **Certificate**: ACM-managed with automatic renewal
- **HSTS**: HTTP Strict Transport Security enabled
- **Certificate Transparency**: Monitored via ACM

#### CloudFront Security
```yaml
# CloudFront security configuration
ViewerProtocolPolicy: redirect-to-https
MinimumProtocolVersion: TLSv1.2_2021
SecurityHeadersPolicy: strict-security-headers
```

**Controls**:
- HTTPS required for all communications
- HTTP to HTTPS redirects
- Secure cookie flags
- HSTS headers
- Certificate validation

### 7. Infrastructure Security

#### AWS Security Services
- **CloudTrail**: All API calls logged
- **GuardDuty**: Threat detection
- **Config**: Configuration compliance monitoring  
- **IAM**: Least privilege access policies

#### Lambda Security
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:123456789012:table/OidcProviderStack-prod-CodesTable"
      ]
    }
  ]
}
```

**Controls**:
- Least privilege IAM policies
- Resource-specific permissions
- No inline policies
- Regular permission reviews

#### DynamoDB Security
- **Encryption**: AWS-owned keys (at-rest)
- **Access**: IAM-controlled access only
- **Network**: VPC endpoints (future)
- **Backup**: Point-in-time recovery enabled

### 8. Monitoring and Logging

#### Security Event Logging
```javascript
// Security event logging
const logSecurityEvent = (eventType, details) => {
  console.log(JSON.stringify({
    level: 'security',
    ts: new Date().toISOString(),
    event: eventType,
    details: sanitizeForLogging(details)
  }));
};

// Usage
logSecurityEvent('authentication_failure', { 
  username: 'test-user', 
  sourceIp: request.ip,
  userAgent: request.headers['user-agent']
});
```

**Controls**:
- All authentication attempts logged
- Failed login attempt monitoring
- Suspicious pattern detection
- PII masking in logs
- Structured logging for analysis

#### Security Metrics
```javascript
// Custom security metrics
const publishSecurityMetric = async (metricName, value) => {
  await cloudwatch.putMetricData({
    Namespace: 'OIDC/Security',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: 'Count',
      Timestamp: new Date()
    }]
  }).promise();
};
```

**Monitored Events**:
- Authentication failures
- Invalid client attempts
- Token validation failures
- Suspicious IP patterns
- High-frequency requests

## Security Testing

### 1. SAST (Static Application Security Testing)

```bash
# Security linting with ESLint security plugin
npm run lint:security

# Dependency vulnerability scanning
npm audit

# OWASP dependency check
npm install -g owasp-dependency-check
dependency-check --project oidc-provider
```

### 2. DAST (Dynamic Application Security Testing)

```bash
# OWASP ZAP automated scanning
zap-baseline.py -t https://oidc.antonycc.com

# Custom security tests
npm run test:security
```

### 3. Penetration Testing Checklist

#### Authentication Testing
- [ ] Brute force attack resistance
- [ ] Password complexity bypasses
- [ ] Session fixation attacks
- [ ] Credential enumeration
- [ ] Account lockout mechanisms

#### Authorization Testing  
- [ ] Privilege escalation attempts
- [ ] Horizontal access control bypasses
- [ ] Vertical access control bypasses
- [ ] Direct object reference attacks
- [ ] JWT manipulation attacks

#### Input Validation Testing
- [ ] SQL injection (not applicable - DynamoDB)
- [ ] XSS vulnerabilities
- [ ] CSRF attacks
- [ ] Path traversal attacks
- [ ] Parameter pollution

#### Business Logic Testing
- [ ] OAuth2 flow manipulation
- [ ] PKCE bypass attempts
- [ ] Redirect URI manipulation
- [ ] State parameter attacks
- [ ] Scope elevation attacks

## Incident Response

### Security Incident Classification

#### P0 - Critical Security Incident
- Active data breach
- System compromise with admin access
- Mass credential theft
- Cryptographic key compromise

#### P1 - High Security Incident  
- Individual account compromise
- Elevated privilege access
- Suspicious administrator activity
- Failed authentication flooding

#### P2 - Medium Security Incident
- Suspected reconnaissance activity
- Minor configuration vulnerabilities
- Single failed penetration attempt
- Non-critical security policy violation

### Incident Response Procedures

#### Immediate Response (< 15 minutes)
1. **Assess and contain** the incident
2. **Preserve evidence** for forensic analysis
3. **Notify stakeholders** per escalation matrix
4. **Document initial findings**

#### Investigation Phase (< 2 hours)
```bash
# Security forensics commands

# Check authentication patterns
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
  --filter-pattern '{ $.level = "security" }' \
  --start-time $(date -d '24 hours ago' +%s)000

# Analyze CloudTrail for suspicious API activity
aws logs filter-log-events \
  --log-group-name "CloudTrail/APIActivity" \
  --filter-pattern '{ $.sourceIPAddress = "suspicious-ip" }'

# Check for privilege escalation
aws logs filter-log-events \
  --filter-pattern '{ $.eventName = "AssumeRole" || $.eventName = "GetSessionToken" }'
```

#### Recovery Phase
1. **Implement fixes** for identified vulnerabilities
2. **Rotate compromised credentials** (keys, tokens, passwords)
3. **Update security controls** based on incident learnings
4. **Validate system integrity** through testing

#### Post-Incident Activities
1. **Root cause analysis** documentation
2. **Security control improvements**
3. **Staff training updates**
4. **Monitoring enhancement**

## Compliance and Standards

### Regulatory Compliance

#### GDPR Compliance (EU Users)
- **Data minimization**: Only collect necessary user data
- **Purpose limitation**: Data used only for stated purposes
- **Data portability**: User data export capabilities
- **Right to erasure**: User account deletion procedures
- **Privacy by design**: Default secure configurations

#### SOC 2 Type II (Future)
- **Security**: Access controls and monitoring
- **Availability**: System uptime and disaster recovery
- **Processing Integrity**: Complete and accurate data processing
- **Confidentiality**: Sensitive data protection
- **Privacy**: Personal information handling

### Industry Standards

#### NIST Cybersecurity Framework
- **Identify**: Asset management, risk assessment
- **Protect**: Access control, data security, awareness training
- **Detect**: Security monitoring, anomaly detection
- **Respond**: Incident response, communications
- **Recover**: Recovery planning, improvements

#### OWASP Top 10 Protection
1. **Injection**: Parameterized queries, input validation
2. **Broken Authentication**: MFA, secure session management
3. **Sensitive Data Exposure**: Encryption, data classification
4. **XML External Entities**: Not applicable (no XML processing)
5. **Broken Access Control**: RBAC, least privilege
6. **Security Misconfiguration**: Secure defaults, hardening
7. **Cross-Site Scripting**: Output encoding, CSP
8. **Insecure Deserialization**: No untrusted deserialization
9. **Known Vulnerabilities**: Regular updates, scanning
10. **Insufficient Logging**: Comprehensive audit trails

## Security Hardening

### Application Hardening
```javascript
// Security headers
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

// Apply to all responses
Object.entries(securityHeaders).forEach(([key, value]) => {
  response.headers[key] = value;
});
```

### Infrastructure Hardening
```yaml
# AWS Config rules for compliance
AWSConfigRules:
  - s3-bucket-public-access-prohibited
  - cloudtrail-enabled
  - iam-password-policy
  - lambda-function-settings-check
  - dynamodb-table-encryption-enabled
```

### Network Hardening
- **CloudFront**: WAF protection, geo-blocking capabilities
- **VPC**: Private subnets for sensitive components (future)
- **Security Groups**: Minimal port exposure
- **NACLs**: Additional network-level filtering

## Security Metrics and KPIs

### Security Metrics Dashboard
```javascript
const securityMetrics = {
  authenticationFailureRate: {
    metric: 'failed_logins / total_login_attempts',
    target: '< 5%',
    alert: '> 10%'
  },
  
  suspiciousActivityEvents: {
    metric: 'security_events / hour',
    target: '< 5',
    alert: '> 20'
  },
  
  certificateExpirationDays: {
    metric: 'days_until_cert_expiry',
    target: '> 30',
    alert: '< 14'
  },
  
  vulnerabilityAge: {
    metric: 'days_since_vuln_discovery',
    target: '< 30',
    alert: '> 90'
  }
};
```

### Security Review Frequency
- **Daily**: Security logs and alert review
- **Weekly**: Vulnerability scan results
- **Monthly**: Access review and permissions audit
- **Quarterly**: Penetration testing and security assessment
- **Annually**: Comprehensive security architecture review

---

## Security Quick Reference

### Emergency Security Actions
```bash
# Rotate JWT signing keys immediately
aws dynamodb delete-item \
  --table-name OidcProviderStack-prod-CodesTable \
  --key '{"code": {"S": "jwk-key-store"}}'

# Check recent authentication failures
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
  --filter-pattern "invalid_credentials" \
  --start-time $(date -d '1 hour ago' +%s)000

# Emergency system disable (point to maintenance page)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789ABCDEFG \
  --change-batch file://emergency-maintenance.json
```

### Security Contacts
- **Security Issues**: Report via GitHub Issues with "security" label
- **Vulnerability Reports**: Email maintainer directly
- **Emergency**: Use emergency escalation procedures

This security documentation provides comprehensive coverage of threats, controls, and procedures. Regular updates ensure it stays current with the evolving threat landscape and security best practices.