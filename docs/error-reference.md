# Error Reference Guide

This document provides comprehensive information about error conditions, messages, and resolution strategies for the OIDC provider.

## Error Response Format

All endpoints return standardized error responses following OAuth2 and OIDC specifications:

```json
{
  "error": "error_code",
  "error_description": "Human-readable description of the error condition"
}
```

## Authorization Endpoint Errors (`/authorize`)

### Client Errors (400 Bad Request)

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `invalid_request` | Missing or malformed request parameters | Missing required parameters like `client_id`, `redirect_uri`, `response_type`, `scope`, or `state` | Verify all required parameters are included in the request |
| `invalid_client` | Client identifier not found | `client_id` not registered in the client registry | Register the client or use a valid `client_id` |
| `invalid_redirect_uri` | Redirect URI not allowed for client | `redirect_uri` not in client's allowed list | Use a registered redirect URI for the client |
| `invalid_scope` | Requested scopes not permitted | Scopes not supported or not allowed for this client | Request only supported scopes: `openid`, `email`, `profile` |
| `unsupported_response_type` | Response type not supported | `response_type` is not `code` | Use `response_type=code` (only supported type) |

### PKCE-Related Errors

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `invalid_request` (PKCE) | PKCE required but missing parameters | Missing `code_challenge` or `code_challenge_method` for PKCE-enabled clients | Include both PKCE parameters |
| `invalid_request` (method) | Invalid code challenge method | `code_challenge_method` is not `S256` | Use `code_challenge_method=S256` only |

### Authentication Errors

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| Login redirect | Invalid username or password | Incorrect credentials or user not found | Redirects to login page with error message |

### Method Errors (405 Method Not Allowed)

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `method_not_allowed` | HTTP method not supported | Using GET instead of POST | Use POST method only |

## Token Endpoint Errors (`/token`)

### Grant Type Errors (400 Bad Request)

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `unsupported_grant_type` | Grant type not supported | `grant_type` is not `authorization_code` | Use `grant_type=authorization_code` |
| `invalid_request` | Missing required parameters | Missing `code`, `client_id`, or `redirect_uri` | Include all required parameters |

### Authorization Code Errors

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `invalid_grant` | Authorization code invalid | Code expired, already used, or not found | Use a fresh, valid authorization code |
| `invalid_grant` (expired) | Authorization code expired | Code older than 3 minutes | Request new authorization code |
| `invalid_grant` (used) | Authorization code already used | Code used more than once | Request new authorization code |

### Client Authentication Errors (401 Unauthorized)

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `invalid_client` | Client authentication failed | Invalid `client_id` or authentication method | Verify client credentials |
| `unauthorized_client` | Client not authorized for grant type | Client not configured for authorization_code grant | Check client configuration |

### PKCE Verification Errors

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `invalid_request` (PKCE) | PKCE verification failed | `code_verifier` doesn't match `code_challenge` | Verify PKCE implementation |
| `invalid_request` (missing) | Missing PKCE verifier | Required `code_verifier` not provided | Include `code_verifier` parameter |

## UserInfo Endpoint Errors (`/userinfo`)

### Authentication Errors (401 Unauthorized)

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `invalid_request` | Missing or malformed Authorization header | No `Authorization` header or not Bearer format | Include `Authorization: Bearer <token>` header |
| `invalid_token` | Access token invalid or expired | Token expired, malformed, or signature invalid | Use a valid, current access token |

### Token Validation Errors

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `invalid_token` (signature) | JWT signature verification failed | Token signed with wrong key or corrupted | Verify token integrity and JWKS |
| `invalid_token` (expired) | Token expired | Token past expiration time | Obtain new access token |
| `invalid_token` (format) | Token format invalid | Malformed JWT or encoding issues | Check token format and encoding |

## JWKS Endpoint Errors (`/jwks`)

### Server Errors (500 Internal Server Error)

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `server_error` | Key retrieval failed | Database connectivity or key generation issues | Retry request, check system health |

## General Server Errors (500 Internal Server Error)

| Error Code | Description | Common Causes | Resolution |
|------------|-------------|---------------|------------|
| `server_error` | Internal server error | Database connectivity, configuration, or unexpected exceptions | Check logs, retry request |

## Integration-Specific Errors

### AWS Cognito Integration

| Error Scenario | Description | Resolution |
|----------------|-------------|------------|
| Identity provider creation fails | Invalid OIDC issuer or configuration | Verify discovery endpoint accessibility |
| Attribute mapping fails | Claims not available in userinfo response | Check scope configuration and user data |
| Token validation fails | Cognito can't verify OIDC tokens | Verify JWKS endpoint and key rotation |

### Client Application Integration

| Error Scenario | Description | Resolution |
|----------------|-------------|------------|
| CORS errors | Browser blocks requests due to CORS policy | Configure appropriate CORS headers |
| Redirect loop | Invalid redirect URI configuration | Verify redirect URI matches exactly |
| State mismatch | CSRF protection triggers | Ensure state parameter is preserved |

## Debugging Error Conditions

### Enable Detailed Logging

All endpoints log comprehensive debug information. Check CloudWatch logs for:

```json
{
  "level": "info",
  "ts": "2024-01-15T10:30:00.000Z",
  "msg": "error_type error_details"
}
```

### Common Log Patterns

- `authorize_*`: Authorization endpoint events
- `token_*`: Token exchange events  
- `userinfo_*`: UserInfo retrieval events
- `jwks_*`: Key management events
- `client_*`: Client validation events
- `pkce_*`: PKCE validation events

### Error Resolution Workflow

1. **Identify Error Source**: Check which endpoint returned the error
2. **Review Error Code**: Match against this reference guide
3. **Check Request Format**: Verify parameter names and values
4. **Validate Client Configuration**: Ensure client is properly registered
5. **Test with Known Good Values**: Use test credentials if available
6. **Check System Status**: Verify database and service availability
7. **Review Logs**: Check CloudWatch for detailed error information

### Test Endpoints for Validation

```bash
# Test discovery endpoint
curl https://oidc.antonycc.com/.well-known/openid-configuration

# Test JWKS endpoint  
curl https://oidc.antonycc.com/jwks

# Test with known good credentials
curl -X POST https://oidc.antonycc.com/authorize \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "response_type=code&client_id=web-client&redirect_uri=https://example.com/callback&scope=openid email profile&state=test&username=test-user&password=c810fb39-86a9-4d2f-8107-119ade9605f8"
```

## Error Prevention Best Practices

### For Client Developers

1. **Always validate parameters** before sending requests
2. **Implement proper error handling** for all error codes
3. **Use appropriate HTTP status code checking**
4. **Store and validate state parameters** for CSRF protection
5. **Implement token refresh logic** for expired tokens
6. **Handle redirect URIs exactly** as registered

### For Integration Partners

1. **Register all redirect URIs** during client setup
2. **Use HTTPS for all redirect URIs** in production
3. **Implement proper PKCE** for public clients
4. **Monitor token expiration** and refresh proactively
5. **Validate OIDC discovery** during integration testing
6. **Test error scenarios** during development

### For System Administrators

1. **Monitor CloudWatch logs** for error patterns
2. **Set up alerts** for high error rates
3. **Validate database connectivity** regularly
4. **Check JWKS key rotation** functionality
5. **Test disaster recovery** procedures
6. **Monitor performance metrics** for early warning signs

## Support and Further Assistance

For issues not covered in this guide:

1. **Check GitHub Issues**: https://github.com/antonycc/oidc/issues
2. **Review Documentation**: `/docs` folder for detailed guides
3. **Examine Test Cases**: `/tests` folder for integration examples
4. **Enable Debug Logging**: CloudWatch logs with structured JSON
5. **Test Against Production**: Use https://oidc.antonycc.com for validation

When reporting issues, include:
- Complete error response
- Request parameters (sanitized)
- CloudWatch logs (sanitized)
- Steps to reproduce
- Client configuration details