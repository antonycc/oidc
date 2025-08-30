# Using Cognito Hosted UI with OIDC Provider

This document explains how to use Amazon Cognito's Hosted UI as the primary login interface for your OIDC provider, instead of the direct login form.

## Overview

The repository supports two authentication methods:

1. **Cognito Hosted UI (Recommended)** - Professional, secure login screens provided by AWS Cognito
2. **Direct OIDC Provider Login** - Simple form for testing and development

## Architecture

```
User → Cognito Hosted UI → Your OIDC Provider → User authenticated
```

1. User visits your application and clicks "Login with Cognito"
2. User is redirected to Cognito's hosted login page
3. Cognito authenticates the user using your OIDC provider as an identity provider
4. User is redirected back to your application with authorization code
5. Application receives confirmation of successful authentication

## Setup Steps

### 1. Deploy the Infrastructure

Deploy both the OIDC Provider and Cognito stacks:

```bash
# Deploy OIDC Provider first
npx cdk deploy OidcProviderStack-$ENV_NAME

# Deploy Cognito stack
npx cdk deploy CognitoStack-$ENV_NAME
```

### 2. Update Web Configuration

After deployment, update the web configuration with the actual Cognito client ID:

```bash
# Extract Cognito client ID from CDK outputs and update web config
./scripts/update-web-config.sh $ENV_NAME cdk.out/cdk-outputs-cognito.json
```

Alternatively, manually update `web/config.js`:

```javascript
// Find your environment section and add the client ID
if (currentDomain === 'oidc.antonycc.com') {
  this.environment = 'production';
  this.cognitoDomain = 'auth.oidc.antonycc.com';
  this.cognitoClientId = 'YOUR_ACTUAL_CLIENT_ID_HERE'; // Replace with real client ID
}
```

### 3. Test the Flow

1. Visit your OIDC provider domain (e.g., `https://oidc.antonycc.com`)
2. Click the "Login with Cognito" button
3. You'll be redirected to Cognito's hosted login page
4. After authentication, you'll be redirected back to `/post-auth.html`

## Configuration Details

### Cognito Domain Mapping

The system automatically determines the Cognito domain based on your OIDC provider domain:

- `oidc.antonycc.com` → `auth.oidc.antonycc.com`
- `ci.oidc.antonycc.com` → `ci.auth.oidc.antonycc.com`
- `ci-branch.oidc.antonycc.com` → `ci-branch.auth.oidc.antonycc.com`

### Required Environment Variables

Ensure these are set in your deployment environment:

- `DOMAIN_NAME` - Your OIDC provider domain
- `AUTH_DOMAIN_NAME` - Your Cognito domain
- `AUTH_CERTIFICATE_ARN` - SSL certificate for Cognito domain

### CDK Outputs Used

The system uses these CDK outputs:

- `CognitoAuthDomain` - The Cognito domain name
- `UserPoolClientId` - The client ID for OAuth flows

## User Experience

### Home Page Features

- **Primary Cognito Login Button** - Prominent button to start Cognito authentication
- **Configuration Status** - Shows whether Cognito is properly configured
- **Alternative Direct Login** - Link to direct OIDC provider login for testing

### Post-Authentication Page

- **Flow Detection** - Automatically detects whether authentication came from Cognito or direct login
- **Visual Indicators** - Clear indication of which authentication method was used
- **Success Guidance** - Next steps and helpful information after successful login

## Troubleshooting

### "Configuration needed" Message

If you see "Configuration needed: Client ID", this means:

1. The CognitoStack hasn't been deployed yet, or
2. The web configuration hasn't been updated with the actual client ID

**Solution**: Deploy CognitoStack and run the update script:

```bash
npx cdk deploy CognitoStack-$ENV_NAME
./scripts/update-web-config.sh $ENV_NAME
```

### Cognito Login Button Disabled

If the button is disabled and shows "Cognito domain not configured":

1. Check that your domain follows the expected pattern
2. Verify environment variables are set correctly
3. Ensure DNS records are properly configured

### Authentication Errors

Check the post-auth page for detailed error information. Common issues:

- **Client ID mismatch** - Verify the client ID in config.js matches the CDK output
- **Redirect URI mismatch** - Ensure Cognito is configured with the correct callback URL
- **Domain resolution** - Verify DNS records for both OIDC and Cognito domains

## Development vs Production

### Development Environment

- Uses placeholder values in config.js
- Shows configuration guidance messages
- Direct login form available for testing

### Production Environment

- Automatic domain detection
- Seamless Cognito integration
- Cognito Hosted UI as primary login method

## Security Considerations

- **HTTPS Required** - Both OIDC and Cognito domains must use HTTPS
- **Domain Validation** - System validates redirect URIs to prevent security issues
- **Token Handling** - Tokens are stored securely in localStorage with expiration
- **PKCE Support** - Both direct and Cognito flows support PKCE for enhanced security

## Next Steps

1. **Customize Cognito UI** - Configure Cognito Hosted UI branding and styling
2. **Add User Management** - Implement user registration and profile management
3. **Configure MFA** - Enable multi-factor authentication in Cognito
4. **Monitor Usage** - Set up CloudWatch monitoring for authentication flows