# Credential Generation System Implementation Summary

This document summarizes the changes made to implement deployment-time credential generation and remove hardcoded test credentials.

## Overview

The implementation replaces the hardcoded `TEST_USERNAME` and `TEST_PASSWORD` environment variables with a dynamic credential generation system that creates test credentials at deployment time and makes them available to both the website UI and automated tests.

## Key Changes

### 1. Credential Generation Library (`app/lib/credential-generator.mjs`)

- **`generateTestCredentials()`**: Generates static demo credentials for deployment-time use
- **`generateTestCredentialsForTest(prefix)`**: Generates unique test credentials for individual test runs
- Uses `bcryptjs` for password hashing and `ulid` for unique identifiers
- Can be run as CLI script or imported as library

### 2. CDK Infrastructure Updates (`infra/main/java/com/antonycc/oidc/OidcProviderStack.java`)

- **`createDemoCredentials()`** method: Custom resource that generates demo credentials JSON and deploys to S3
- **User Provisioning**: Automatically provisions the demo user in DynamoDB during deployment
- **CloudFront Invalidation**: Ensures demo credentials are immediately available after deployment
- **S3 Deployment**: Writes `public-demo-credentials.json` to the web bucket

### 3. Website UI Updates (`web/loginDirect.html` & `web/oidc.css`)

- **Credential Display Section**: Shows generated credentials prominently next to login form
- **Auto-fill Functionality**: "Use These Credentials" button pre-fills the login form
- **Async Loading**: Fetches credentials from `/public-demo-credentials.json` via JavaScript
- **Styled UI Components**: Professional-looking credentials display with proper CSS

### 4. Test System Updates

#### API Tests (`tests/api.live.test.ts`)
- Uses `generateTestCredentialsForTest()` to create unique credentials per test
- Automatically provisions test users in DynamoDB before test execution
- Cleans up test users after test completion
- No longer depends on environment variables

#### Web Tests (`tests/web.live.test.ts`)
- Similar credential generation and cleanup pattern
- Supports both successful and failed login scenarios
- Each test gets isolated credentials

#### Load Tests (`tests/load.live.test.js`)
- Attempts to fetch demo credentials from deployed endpoint
- Falls back to environment variables if needed for backwards compatibility

### 5. Environment Variable Cleanup

#### Removed from `.env.ci` and `.env.prod`:
- `export TEST_USERNAME=test-user`

#### GitHub Actions Updates (`.github/workflows/deploy.yml` & `.github/workflows/load-test.yml`):
- Removed `TEST_USERNAME` and `TEST_PASSWORD` environment variables
- Removed manual user provisioning step (`npm run users:provision`)
- Updated test execution to pass `USERS_TABLE` for dynamic user management

### 6. Script Updates

#### `scripts/update-screenshots.mjs`:
- Now fetches demo credentials from deployment instead of hardcoded values
- Graceful fallback to defaults if credentials unavailable

## Benefits

1. **Security**: No hardcoded passwords in environment variables or code
2. **Deployment Independence**: Each deployment gets unique demo credentials
3. **Test Isolation**: Each test run uses unique credentials, preventing conflicts
4. **User Experience**: Clear display of test credentials directly in the UI
5. **Maintenance**: No need to manage shared test credentials across environments

## Architecture Flow

1. **Deployment Time**:
   - CDK stack generates demo credentials
   - Credentials written to `public-demo-credentials.json` in S3
   - Demo user provisioned in DynamoDB with hashed password
   - CloudFront cache invalidated

2. **Website Usage**:
   - User visits `/loginDirect.html`
   - Page fetches `/public-demo-credentials.json`
   - Credentials displayed in UI with "Use These Credentials" button

3. **Test Execution**:
   - Each test generates unique credentials using utility library
   - Test provisions user in DynamoDB (if `USERS_TABLE` available)
   - Test executes with generated credentials
   - Test cleans up user from DynamoDB

## Files Modified

- `app/lib/credential-generator.mjs` (new)
- `infra/main/java/com/antonycc/oidc/OidcProviderStack.java`
- `web/loginDirect.html`
- `web/oidc.css`
- `web/public-demo-credentials.json` (new, for testing)
- `tests/api.live.test.ts`
- `tests/web.live.test.ts`
- `tests/load.live.test.js`
- `scripts/update-screenshots.mjs`
- `.env.ci`
- `.env.prod`
- `.github/workflows/deploy.yml`
- `.github/workflows/load-test.yml`
- `app/test/demo-credentials.test.mjs` (new)

## Testing

All unit tests, system tests, and infrastructure tests pass successfully. The implementation maintains backward compatibility while providing a more secure and maintainable credential management system.