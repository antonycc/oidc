# API Integration Guide

This guide provides detailed examples and patterns for integrating with the OIDC provider API, including error handling and troubleshooting.

## Complete Authorization Code Flow

### Step 1: Generate PKCE Parameters

```javascript
import crypto from 'crypto';

const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
```

### Step 2: Direct User to Authorization Endpoint

```javascript
const authUrl = new URL('https://oidc.antonycc.com/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', 'self-client');
authUrl.searchParams.set('redirect_uri', 'https://your-app.com/callback');
authUrl.searchParams.set('scope', 'openid email profile');
authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
authUrl.searchParams.set('nonce', crypto.randomBytes(16).toString('hex'));
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

// Redirect user to authUrl.toString()
window.location.href = authUrl.toString();
```

### Step 3: Handle Callback and Exchange Code

```javascript
// In your callback handler
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');
const error = urlParams.get('error');

// Handle errors
if (error) {
  console.error('Authorization failed:', error);
  console.error('Description:', urlParams.get('error_description'));
  return;
}

// Verify state matches what you sent (implement state storage)
if (state !== storedState) {
  console.error('State mismatch - possible CSRF attack');
  return;
}

// Exchange code for tokens
const tokenResponse = await fetch('https://oidc.antonycc.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    client_id: 'self-client',
    redirect_uri: 'https://your-app.com/callback',
    code_verifier: codeVerifier
  })
});

if (!tokenResponse.ok) {
  const error = await tokenResponse.json();
  console.error('Token exchange failed:', error);
  return;
}

const tokens = await tokenResponse.json();
// Store tokens securely
localStorage.setItem('access_token', tokens.access_token);
localStorage.setItem('id_token', tokens.id_token);
```

### Step 4: Access User Information

```javascript
const accessToken = localStorage.getItem('access_token');

const userInfoResponse = await fetch('https://oidc.antonycc.com/userinfo', {
  headers: { Authorization: `Bearer ${accessToken}` }
});

if (!userInfoResponse.ok) {
  if (userInfoResponse.status === 401) {
    console.error('Access token expired or invalid');
    // Redirect to login
    return;
  }
  const error = await userInfoResponse.json();
  console.error('UserInfo request failed:', error);
  return;
}

const userInfo = await userInfoResponse.json();
console.log('User ID:', userInfo.sub);
console.log('Email:', userInfo.email);
console.log('Name:', userInfo.name);
```

## JWT Token Validation

### Client-Side Token Validation

```javascript
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://oidc.antonycc.com/jwks'));

async function validateIdToken(idToken) {
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: 'https://oidc.antonycc.com',
      audience: 'self-client'
    });
    
    // Verify nonce if provided
    if (storedNonce && payload.nonce !== storedNonce) {
      throw new Error('Nonce mismatch');
    }
    
    return payload;
  } catch (error) {
    console.error('Token validation failed:', error.message);
    throw error;
  }
}
```

### Server-Side Token Validation

```javascript
// Node.js server example
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://oidc.antonycc.com/jwks'));

export async function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://oidc.antonycc.com'
    });
    
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token', details: error.message });
  }
}
```

## Error Handling

### Common Error Scenarios

#### invalid_request
- **Cause**: Missing or malformed parameters
- **HTTP Status**: 400
- **Solution**: Check all required parameters are present and correctly formatted
- **Example**: Missing `client_id` or `redirect_uri`

```javascript
// Example handling
if (error.error === 'invalid_request') {
  console.error('Request validation failed:', error.error_description);
  // Show user-friendly error message
  showError('Please try again. If the problem persists, contact support.');
}
```

#### invalid_client
- **Cause**: Client not found or configuration invalid
- **HTTP Status**: 400
- **Solution**: Verify client ID exists and configuration in `/app/lib/clients.mjs`
- **Current clients**: `self-client`, `cognito-web`

#### access_denied
- **Cause**: Authentication failed or user denied access
- **HTTP Status**: 400
- **Solution**: Check username/password credentials, ensure user exists
- **Test credentials**: `<test-username>` / `<test-password>` (Provision these securely; do not use real credentials in documentation. See your credential management process.)

#### invalid_grant
- **Cause**: Authorization code invalid, expired, or already used
- **HTTP Status**: 400
- **Solution**: Codes expire in 3 minutes and are single-use
- **Debug**: Check authorization code generation timestamp

#### pkce_verification_failed
- **Cause**: PKCE challenge/verifier mismatch
- **HTTP Status**: 400
- **Solution**: Ensure `code_verifier` matches the original value used to generate `code_challenge`

### Error Response Format

All errors follow OAuth2/OIDC standard format:

```json
{
  "error": "error_code",
  "error_description": "Human readable description",
  "error_uri": "https://tools.ietf.org/html/rfc6749#section-4.1.2.1"
}
```

### Comprehensive Error Handling

```javascript
async function handleOAuthError(response) {
  const error = await response.json();
  
  switch (error.error) {
    case 'invalid_request':
      // Log technical details, show user-friendly message
      console.error('Invalid request:', error.error_description);
      showUserError('There was a problem with your request. Please try again.');
      break;
      
    case 'invalid_client':
      // This shouldn't happen in production - log for investigation
      console.error('Client configuration error:', error.error_description);
      showUserError('Application configuration error. Please contact support.');
      break;
      
    case 'access_denied':
      // User authentication failed
      console.log('Authentication failed:', error.error_description);
      showUserError('Invalid username or password. Please try again.');
      break;
      
    case 'invalid_grant':
      // Code expired or already used - restart auth flow
      console.log('Authorization code expired:', error.error_description);
      restartAuthFlow();
      break;
      
    case 'server_error':
      // Temporary server issue
      console.error('Server error:', error.error_description);
      showUserError('Temporary service issue. Please try again in a moment.');
      break;
      
    default:
      console.error('Unknown error:', error);
      showUserError('An unexpected error occurred. Please try again.');
  }
}
```

## Client Configuration

### self-client (Default Test Client)

```javascript
{
  redirectUris: [
    "https://oidc.antonycc.com/post-auth.html",
    "https://oidc.antonycc.com/callback.html", 
    "https://oidc.antonycc.com/login-callback.html"
  ],
  grantTypes: ["authorization_code"],
  scopes: ["openid", "email", "profile"],
  pkceRequired: true,
  clientSecret: null // Public client
}
```

### Custom Client Registration

To register additional clients, modify `/app/lib/clients.mjs` and redeploy:

```javascript
export const clients = {
  "your-app": {
    redirectUris: [
      "https://your-app.com/auth/callback",
      "http://localhost:3000/auth/callback" // for development
    ],
    grantTypes: ["authorization_code"],
    scopes: ["openid", "email", "profile"],
    pkceRequired: true,
    clientSecret: null // Public client
  }
};
```

## Security Best Practices

### PKCE Implementation

```javascript
// Generate cryptographically secure PKCE parameters
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return { codeVerifier, codeChallenge };
}

// Store code verifier securely (session storage, not localStorage for security)
sessionStorage.setItem('code_verifier', codeVerifier);
```

### State Parameter

```javascript
// Generate and store state parameter for CSRF protection
function generateState() {
  const state = crypto.randomBytes(16).toString('hex');
  sessionStorage.setItem('oauth_state', state);
  return state;
}

// Verify state in callback
function verifyState(receivedState) {
  const storedState = sessionStorage.getItem('oauth_state');
  sessionStorage.removeItem('oauth_state'); // Use once
  
  if (receivedState !== storedState) {
    throw new Error('State parameter mismatch - possible CSRF attack');
  }
}
```

### Token Storage

```javascript
// Secure token storage (consider using httpOnly cookies in production)
class TokenManager {
  static setTokens(tokens) {
    // Store access token in memory or short-lived storage
    sessionStorage.setItem('access_token', tokens.access_token);
    
    // Store refresh token more securely if available
    // Consider httpOnly cookies or secure storage
    if (tokens.refresh_token) {
      // Store refresh token securely
    }
  }
  
  static getAccessToken() {
    return sessionStorage.getItem('access_token');
  }
  
  static clearTokens() {
    sessionStorage.removeItem('access_token');
    // Clear other token storage
  }
}
```

## Rate Limiting and Performance

- **Token Endpoint**: No explicit rate limiting (AWS Lambda auto-scaling)
- **JWKS Caching**: Keys cached for 1 hour client-side - implement local caching
- **Cold Starts**: Initial Lambda invocation may take 1-3 seconds
- **Concurrent Users**: Supports thousands of concurrent authentications

### Handling Cold Starts

```javascript
// Implement retry logic for cold start scenarios
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      
      // If it's a 5xx error and we have retries left, wait and retry
      if (response.status >= 500 && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

## Testing and Debugging

### Testing Against Production

```javascript
// Test authentication flow against production OIDC provider
const testConfig = {
  issuer: 'https://oidc.antonycc.com',
  clientId: 'self-client',
  redirectUri: 'https://your-app.com/test-callback',
  scopes: ['openid', 'email', 'profile']
};

// Test credentials (for testing only)
const testCredentials = {
  username: 'test-user',
  password: 'check-deployment-logs'
};
```

### Debugging Tips

1. **Check Browser Network Tab**: Inspect actual request/response data
2. **Validate PKCE**: Ensure `S256(code_verifier) === code_challenge`
3. **Verify Timing**: Authorization codes expire in 3 minutes
4. **Check Scopes**: Requested scopes must be supported by client
5. **Inspect JWT Claims**: Use [jwt.io](https://jwt.io) to decode tokens and verify claims
6. **Monitor CORS**: Ensure proper CORS configuration for your domain

### Common Integration Issues

**CORS Errors**
```javascript
// If you get CORS errors, check that your redirect URI is properly registered
// The OIDC provider allows CORS for registered redirect URI origins
```

**Token Expiration**
```javascript
// Implement token refresh logic
async function refreshTokenIfNeeded() {
  // Check if token is close to expiration
  const token = localStorage.getItem('access_token');
  if (!token) return null;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    
    // Refresh if token expires in next 5 minutes
    if (exp - now < 5 * 60 * 1000) {
      // Implement refresh logic or re-authenticate
      return await startNewAuthFlow();
    }
    
    return token;
  } catch (error) {
    console.error('Token parsing error:', error);
    return null;
  }
}
```

## Framework-Specific Examples

### React Integration

```jsx
// React hook for OIDC authentication
import { useState, useEffect } from 'react';

export function useOIDCAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Check for existing token or handle callback
    const handleAuth = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      
      if (code) {
        // Handle callback
        try {
          await handleCallback(code);
        } catch (error) {
          console.error('Auth callback failed:', error);
        }
      } else {
        // Check existing session
        const token = localStorage.getItem('access_token');
        if (token) {
          try {
            const userInfo = await fetchUserInfo(token);
            setUser(userInfo);
          } catch (error) {
            // Token invalid, clear it
            localStorage.removeItem('access_token');
          }
        }
      }
      setLoading(false);
    };
    
    handleAuth();
  }, []);
  
  const login = () => {
    // Start OIDC flow
    const { codeVerifier, codeChallenge } = generatePKCE();
    sessionStorage.setItem('code_verifier', codeVerifier);
    
    const authUrl = new URL('https://oidc.antonycc.com/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', 'self-client');
    authUrl.searchParams.set('redirect_uri', window.location.origin + '/callback');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', generateState());
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    window.location.href = authUrl.toString();
  };
  
  const logout = () => {
    localStorage.removeItem('access_token');
    sessionStorage.clear();
    setUser(null);
  };
  
  return { user, loading, login, logout };
}
```

### Express.js Backend

```javascript
// Express middleware for OIDC token validation
import express from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const app = express();
const JWKS = createRemoteJWKSet(new URL('https://oidc.antonycc.com/jwks'));

// OIDC authentication middleware
async function authenticateOIDC(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://oidc.antonycc.com'
    });
    
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ 
      error: 'Invalid token', 
      details: error.message 
    });
  }
}

// Protected route
app.get('/api/profile', authenticateOIDC, (req, res) => {
  res.json({
    user: req.user.sub,
    email: req.user.email,
    name: req.user.name
  });
});
```

This guide provides comprehensive examples for integrating with the OIDC provider. For additional questions or support, refer to the main documentation or create an issue in the repository.