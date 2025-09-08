import { verifyJwt } from "../lib/crypto.mjs";
import { get, tables } from "../lib/db.mjs";
import { log, logError, createJsonResponse } from "../lib/utils.mjs";

/**
 * OIDC UserInfo endpoint handler
 * 
 * Returns user information and claims based on the provided access token and originally
 * granted scopes. This endpoint implements the OpenID Connect UserInfo specification.
 * 
 * **Authentication:**
 * - Requires valid Bearer access token in Authorization header
 * - Token must be obtained from /token endpoint
 * - Token signature verification using JWKS public keys
 * - Automatic token expiration validation
 * 
 * **Supported Claims by Scope:**
 * - **openid** (always): `sub` (subject identifier)
 * - **email**: `email`, `email_verified`
 * - **profile**: `name`, `given_name`, `family_name`
 * 
 * **Data Sources:**
 * - Claims returned based on user data from DynamoDB users table
 * - Fallback to minimal claims if user database not configured
 * - Scope-based filtering applied to returned claims
 * 
 * **Security Features:**
 * - JWT signature verification against current JWKS
 * - Access token expiration validation
 * - Scope-based claim filtering
 * - Comprehensive request logging for audit trails
 * - No sensitive data exposure in error responses
 * 
 * **Flow:**
 * 1. Extracts Bearer token from Authorization header
 * 2. Verifies JWT signature and expiration
 * 3. Retrieves user record from database (if configured)
 * 4. Filters claims based on original token scopes
 * 5. Returns user information as JSON response
 * 
 * **Error Handling:**
 * - Missing/malformed Authorization header → 401 invalid_request
 * - Invalid/expired access token → 401 invalid_token
 * - Database connectivity issues → 500 server_error
 * - Standard OAuth2 error response format
 * 
 * @param {Object} event - AWS Lambda event object from Function URL
 * @param {Object} event.headers - HTTP request headers
 * @param {string} event.headers.authorization - Bearer token authorization header (required)
 * @param {string} event.headers.Authorization - Alternative header name (case-insensitive)
 * @returns {Promise<Object>} Lambda response object with user claims (200) or error (401/500)
 * 
 * @example
 * // Expected Authorization header:
 * // Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
 * 
 * // Example response for full scopes:
 * // {
 * //   "sub": "test-user",
 * //   "email": "user@example.com", 
 * //   "email_verified": true,
 * //   "name": "Test User",
 * //   "given_name": "Test",
 * //   "family_name": "User"
 * // }
 * 
 * @see {@link https://openid.net/specs/openid-connect-core-1_0.html#UserInfo} OIDC UserInfo Endpoint
 * @see {@link https://tools.ietf.org/html/rfc6750} OAuth2 Bearer Token Usage
 */
// Handler expects an event object with headers
export const handler = async (event) => {
  try {
    log("userinfo_request");
    const authHeader = event?.headers?.authorization || event?.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createJsonResponse(401, {
        error: "invalid_request",
        error_description: "Missing or invalid Authorization header",
      });
    }

    const accessToken = authHeader.slice("Bearer ".length);
    log("validating_access_token");

    // Verify the JWT access token
    const payload = await verifyJwt(accessToken);
    if (!payload) {
      return createJsonResponse(401, {
        error: "invalid_token",
        error_description: "Access token is invalid or expired",
      });
    }

    log("access_token_valid", "sub:", payload.sub);

    // Get user information from database if available
    let userInfo = { sub: payload.sub };

    if (process.env.USERS_TABLE && tables.users) {
      try {
        const userRecord = await get(tables.users, { username: payload.sub });
        if (userRecord.Item) {
          // Build user info based on requested scopes
          const scopes = payload.scope ? payload.scope.split(" ") : [];

          // Always include sub
          userInfo.sub = payload.sub;

          // Include email claims if email scope was requested
          if (scopes.includes("email") && userRecord.Item.email) {
            userInfo.email = userRecord.Item.email;
            userInfo.email_verified = userRecord.Item.emailVerified || false;
          }

          // Include profile claims if profile scope was requested
          if (scopes.includes("profile")) {
            if (userRecord.Item.name) userInfo.name = userRecord.Item.name;
            if (userRecord.Item.given_name) userInfo.given_name = userRecord.Item.given_name;
            if (userRecord.Item.family_name) userInfo.family_name = userRecord.Item.family_name;
            if (userRecord.Item.picture) userInfo.picture = userRecord.Item.picture;
          }

          log("userinfo_from_db", "scopes:", scopes.join(","));
        } else {
          log("user_not_found_in_db", payload.sub);
        }
      } catch (dbError) {
        log("userinfo_db_error", dbError.message);
        // Continue with basic userinfo if DB lookup fails
      }
    } else {
      log("no_users_table_configured");
    }

    return createJsonResponse(200, userInfo);
  } catch (e) {
    logError("userinfo_error", e);
    return createJsonResponse(500, { error: "server_error" });
  }
};
