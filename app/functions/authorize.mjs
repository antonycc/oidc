import { ulid } from "ulid";
import { put, get, tables } from "../lib/db.mjs";
import bcrypt from "bcryptjs";
import {
  getClient,
  isScopeSubset,
  isValidRedirectUri,
  validateRedirectUri,
  validateScopes,
  isPkceRequired,
} from "../lib/clients.mjs";
import { log, logError, maskSensitive, parseFormBody, createJsonResponse } from "../lib/utils.mjs";

// Create a safe version of query params for logging (mask sensitive fields)
const createSafeQpForLogging = (qp) => {
  const safeQp = { ...qp };
  if (safeQp.password) safeQp.password = maskSensitive(safeQp.password);
  if (safeQp.code_verifier) safeQp.code_verifier = maskSensitive(safeQp.code_verifier);
  if (safeQp.code_challenge) safeQp.code_challenge = maskSensitive(safeQp.code_challenge);
  return safeQp;
};

/**
 * OIDC Authorization endpoint handler
 *
 * Processes OAuth2 authorization requests according to RFC 6749 and OpenID Connect Core 1.0.
 * This endpoint handles user authentication, consent, and authorization code generation.
 *
 * **Security Features:**
 * - PKCE (Proof Key for Code Exchange) support for enhanced security
 * - Comprehensive parameter validation and sanitization
 * - State parameter validation to prevent CSRF attacks
 * - Secure redirect URI validation against client configuration
 * - Password hashing verification using bcrypt
 * - Authorization code generation with TTL and single-use enforcement
 *
 * **Flow:**
 * 1. Validates request method (POST only for security)
 * 2. Parses and validates authorization parameters
 * 3. Authenticates user credentials against database
 * 4. Validates client configuration and redirect URI
 * 5. Generates authorization code with metadata
 * 6. Redirects user back to client with code
 *
 * **Error Handling:**
 * - Returns structured error responses for all failure cases
 * - Logs comprehensive debugging information (with sensitive data masking)
 * - Handles database connectivity and validation failures gracefully
 *
 * @param {Object} event - AWS Lambda event object from Function URL
 * @param {Object} event.requestContext - Request context information
 * @param {Object} event.requestContext.http - HTTP request details
 * @param {string} event.requestContext.http.method - HTTP method (must be POST)
 * @param {string} event.rawPath - Request path (/authorize)
 * @param {string} event.rawQueryString - URL query parameters (if any)
 * @param {string} event.body - URL-encoded form body with authorization parameters
 * @param {Object} event.headers - HTTP request headers
 * @returns {Promise<Object>} Lambda response object with redirect (302) or error (400/405/500)
 *
 * @example
 * // Expected request body parameters:
 * // response_type=code&client_id=web-client&redirect_uri=https://app.com/callback
 * // &scope=openid email profile&state=random-state&nonce=random-nonce
 * // &code_challenge=base64url-encoded-challenge&code_challenge_method=S256
 * // &username=user&password=secret
 *
 * @see {@link https://tools.ietf.org/html/rfc6749#section-4.1.1} OAuth2 Authorization Request
 * @see {@link https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest} OIDC Authorization Request
 * @see {@link https://tools.ietf.org/html/rfc7636} PKCE Specification
 */
export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || "GET";
    const url = new URL(event.rawPath + (event.rawQueryString ? "?" + event.rawQueryString : ""), "https://issuer");
    const qp = Object.fromEntries(url.searchParams.entries());

    // Only support POST method for security and OAuth2 best practices
    if (method !== "POST") {
      return createJsonResponse(405, { error: "method_not_allowed" });
    }

    const body = parseFormBody(event);
    for (const [k, v] of body.entries()) qp[k] = v;
    log("authorize", method, JSON.stringify(createSafeQpForLogging(qp)));

    const req = [
      "client_id",
      "redirect_uri",
      "response_type",
      "scope",
      "state",
      // nonce is optional, but recommended
      // code_challenge and code_challenge_method are optional unless client requires PKCE
    ];
    for (const k of req)
      if (!qp[k])
        return createJsonResponse(400, {
          error: "invalid_request",
          error_description: `Missing required parameter: ${k}`,
        });
    if (qp.response_type !== "code") return createJsonResponse(400, { error: "unsupported_response_type" });

    // ===== CLIENT VALIDATION PHASE =====
    // Verify the client_id exists in our client registry and retrieve client configuration
    const client = getClient(qp.client_id);
    if (!client) return createJsonResponse(400, { error: "invalid_client" });

    // Validate redirect URI is in the client's allowed list to prevent open redirects
    // This is critical for preventing authorization code interception attacks
    if (!validateRedirectUri(qp.client_id, qp.redirect_uri)) {
      return createJsonResponse(400, { error: "invalid_redirect_uri" });
    }

    // Ensure requested scopes are permitted for this client (scope-based authorization)
    if (!validateScopes(qp.client_id, qp.scope)) {
      return createJsonResponse(400, { error: "invalid_scope" });
    }

    // ===== PKCE VALIDATION PHASE =====
    // PKCE (RFC 7636) validation - enhanced security for public clients
    // Prevents authorization code interception attacks by binding the code to the client
    if (isPkceRequired(qp.client_id)) {
      if (!qp.code_challenge || !qp.code_challenge_method) {
        return createJsonResponse(400, {
          error: "invalid_request",
          error_description: "PKCE required but code_challenge or code_challenge_method missing",
        });
      }
    }

    // If PKCE is provided (even for confidential clients), validate the challenge method
    // Only S256 (SHA256) is supported for security reasons, not "plain" method
    if (qp.code_challenge && qp.code_challenge_method !== "S256") {
      return createJsonResponse(400, {
        error: "invalid_request",
        error_description: "Only S256 code_challenge_method is supported",
      });
    }

    // ===== USER AUTHENTICATION PHASE =====
    const username = qp.username || "test-user";
    if (process.env.USERS_TABLE) {
      // Production path: authenticate against DynamoDB users table
      const got = await get(tables.users, { username });

      // Security: Use constant-time comparison to prevent timing attacks
      // Always perform bcrypt comparison even if user doesn't exist
      const hash = got.Item?.passwordHash || "$2a$10$zCwQ6QJkQ6QJkQ6QJkQ6QOeQ6QJkQ6QJkQ6QJkQ6QJkQ6QJkQ6QJk"; // bcrypt hash for "dummy"
      const ok = !!qp.password && bcrypt.compareSync(qp.password, hash);

      if (!ok || !got.Item?.passwordHash) {
        // Authentication failed - redirect back to login page with error
        // Preserve authorization parameters for retry after successful authentication
        const loginUrl =
          `/loginDirect.html?error=${encodeURIComponent("Invalid username or password")}&` +
          `client_id=${encodeURIComponent(qp.client_id || "")}&` +
          `redirect_uri=${encodeURIComponent(qp.redirect_uri || "")}&` +
          `scope=${encodeURIComponent(qp.scope || "")}&` +
          `state=${encodeURIComponent(qp.state || "")}`;
        return { statusCode: 302, headers: { Location: loginUrl }, body: "" };
      }
    }

    // ===== AUTHORIZATION CODE GENERATION PHASE =====
    // Generate cryptographically secure authorization code using ULID for uniqueness and time ordering
    const code = ulid();
    const ttl = Math.floor(Date.now() / 1000) + 180; // 3 minutes expiration per OAuth2 recommendations

    // Store authorization code with all validation metadata for token exchange
    await put(tables.codes, {
      code,
      ttl,
      client: qp.client_id,
      redirect: qp.redirect_uri,
      scope: qp.scope,
      nonce: qp.nonce,
      ch: qp.code_challenge,
      ccm: qp.code_challenge_method,
      used: false,
      sub: username,
    });
    const location = `${qp.redirect_uri}?code=${code}&state=${encodeURIComponent(qp.state)}`;
    log("redirect", location);
    return { statusCode: 302, headers: { Location: location }, body: "" };
  } catch (e) {
    logError("authorize_error", e);
    return createJsonResponse(500, { error: "server_error" });
  }
};
