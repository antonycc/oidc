import * as crypto from "node:crypto";
import { get, conditionalDelete, put, update, tables } from "../lib/db.mjs";
import { signJwt } from "../lib/crypto.mjs";
import { validateClientAuth, isPkceRequired } from "../lib/clients.mjs";
import { log, logError, maskSensitive, parseFormBody, createJsonResponse } from "../lib/utils.mjs";

/**
 * OIDC Token endpoint handler
 *
 * Exchanges authorization codes for access tokens and ID tokens according to OAuth2 RFC 6749
 * and OpenID Connect Core 1.0. This is the second step of the authorization code flow.
 *
 * **Security Features:**
 * - Single-use authorization code validation with TTL enforcement
 * - PKCE (Proof Key for Code Exchange) verification for enhanced security
 * - Client authentication (currently supports public clients only)
 * - Comprehensive parameter validation and sanitization
 * - JWT token generation with RS256 signatures
 * - Automatic code revocation after successful exchange
 *
 * **Token Types Issued:**
 * - **Access Token**: Short-lived JWT for accessing protected resources (userinfo endpoint)
 * - **ID Token**: JWT containing user authentication information and claims
 * - **Refresh Token**: Currently not implemented (future enhancement)
 *
 * **Flow:**
 * 1. Validates grant type (only 'authorization_code' supported)
 * 2. Validates required parameters (code, client_id, redirect_uri)
 * 3. Performs client authentication (public clients only)
 * 4. Retrieves and validates authorization code from database
 * 5. Verifies PKCE code_verifier against stored code_challenge
 * 6. Generates access token and ID token as signed JWTs
 * 7. Marks authorization code as used (single-use enforcement)
 * 8. Returns token response with metadata
 *
 * **Error Handling:**
 * - Comprehensive validation with descriptive error messages
 * - Secure logging with sensitive data masking
 * - Database connectivity and cryptographic failure handling
 * - Standard OAuth2 error response format
 *
 * @param {Object} event - AWS Lambda event object from Function URL
 * @param {Object} event.requestContext - Request context information
 * @param {Object} event.requestContext.http - HTTP request details
 * @param {string} event.requestContext.http.method - HTTP method (must be POST)
 * @param {string} event.body - URL-encoded form body with token request parameters
 * @param {Object} event.headers - HTTP request headers (for future client auth)
 * @returns {Promise<Object>} Lambda response object with tokens (200) or error (400/401/405/500)
 *
 * @example
 * // Expected request body parameters:
 * // grant_type=authorization_code&code=ABC123&redirect_uri=https://app.com/callback
 * // &client_id=web-client&code_verifier=PKCE-verifier-string
 *
 * @see {@link https://tools.ietf.org/html/rfc6749#section-4.1.3} OAuth2 Token Request
 * @see {@link https://openid.net/specs/openid-connect-core-1_0.html#TokenRequest} OIDC Token Request
 * @see {@link https://tools.ietf.org/html/rfc7636#section-4.5} PKCE Verification
 */
export const handler = async (event) => {
  try {
    if (event.requestContext.http.method !== "POST") return createJsonResponse(405, { error: "method_not_allowed" });

    const body = parseFormBody(event);
    const grant = body.get("grant_type");
    if (grant !== "authorization_code") return createJsonResponse(400, { error: "unsupported_grant_type" });

    const code = body.get("code");
    const verifier = body.get("code_verifier") || "";

    const clientId = body.get("client_id");
    const redirectUri = body.get("redirect_uri");

    log("token_request", clientId, redirectUri, code ? `has_code: ${maskSensitive(code)}` : "no_code");

    // Validate required parameters
    if (!code || !clientId || !redirectUri) {
      return createJsonResponse(400, {
        error: `invalid_request (!code${code} || !clientId${clientId} || !redirectUri${redirectUri})`,
      });
    }

    // Check if PKCE is required for this client
    const pkceRequired = isPkceRequired(clientId);
    if (pkceRequired && !verifier) {
      return createJsonResponse(400, { error: "invalid_request (PKCE required but no code_verifier provided)" });
    }

    log(
      "token_request_parameters_present",
      clientId,
      { hasCode: !!code, hasRedirect: !!redirectUri, hasPkceVerifier: !!verifier, pkceRequired },
      maskSensitive(code),
    );

    // Validate client authentication (for public clients, no secret needed)
    const clientSecret = body.get("client_secret");
    if (!validateClientAuth(clientId, clientSecret)) {
      return createJsonResponse(401, { error: `invalid_client (!validateClientAuth(${clientId}, clientSecret))` });
    } else {
      log("client_authenticated", clientId);
    }

    const row = await get(tables.codes, { code });
    log("token_request_validation row for code", { codeExists: !!row.Item }, maskSensitive(code));
    if (!row.Item) {
      return createJsonResponse(400, { error: "invalid_grant (!row.Item)" });
    } else {
      log("authorization_code_found", { sub: row.Item?.sub, client: row.Item?.client }, maskSensitive(code));
    }

    const now = Math.floor(Date.now() / 1000);
    if (row.Item.used === true || (row.Item.ttl && row.Item.ttl <= now)) {
      return createJsonResponse(400, { error: `invalid_grant (row.Item.used === true || ${row.Item.ttl} <= now)` });
    } else {
      log("authorization_code_valid", { used: row.Item.used === true, ttl: row.Item.ttl, now });
    }

    if (row.Item.ccm && row.Item.ccm !== "S256") {
      return createJsonResponse(400, { error: `invalid_grant (${row.Item.ccm} !== "S256")` });
    } else {
      log("authorization_code_challenge_method", row.Item.ccm || "none");
    }

    // Validate that client_id and redirect_uri match what was stored in the auth code
    if (row.Item.client !== clientId) {
      log("token_validation_failed", "client_mismatch", `stored: ${row.Item.client}, provided: ${clientId}`);
      return createJsonResponse(400, { error: `invalid_grant (row.Item.client !== ${clientId})` });
    } else {
      log("token_client_id_validated", clientId, { clientValidated: true }, maskSensitive(code));
    }

    if (row.Item.redirect !== redirectUri) {
      log("token_validation_failed", "redirect_mismatch", `stored: ${row.Item.redirect}, provided: ${redirectUri}`);
      return createJsonResponse(400, { error: `invalid_grant (row.Item.redirect !== ${redirectUri})` });
    } else {
      log("token_redirect_uri_validated", redirectUri, { redirectValidated: true }, maskSensitive(code));
    }

    // Validate PKCE challenge if present in authorization code
    if (row.Item.ccm) {
      // If we have a challenge method, we must have a verifier
      if (!verifier) {
        return createJsonResponse(400, {
          error: "invalid_grant (PKCE challenge present but no code_verifier provided)",
        });
      }

      const expectedChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
      if (expectedChallenge !== row.Item.ch) {
        return createJsonResponse(400, { error: "invalid_grant (PKCE challenge verification failed)" });
      }
      log("pkce_verification_success", { challengeMethod: row.Item.ccm });
    } else {
      log("no_pkce_challenge_to_verify", { hasVerifier: !!verifier, hasChallenge: !!row.Item.ch });
    }

    // Use conditional delete to ensure one-time use
    log("token_request_validated", clientId, { codeValidated: true, sub: row.Item?.sub }, maskSensitive(code));
    try {
      await conditionalDelete(tables.codes, { code }, "attribute_exists(code)");
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        log("authorization_code_already_used", maskSensitive(code));
        return createJsonResponse(400, { error: "invalid_grant" });
      } else {
        logError("authorization_code_delete_failed", error, { code: maskSensitive(code) });
      }
      throw error;
    }

    const iss = process.env.ISSUER;
    const aud = row.Item.client;
    const sub = row.Item.sub;
    const scope = row.Item.scope;

    // Build ID token claims
    const idTokenClaims = {
      iss,
      sub,
      aud,
      iat: now,
      exp: now + 300,
      nonce: row.Item.nonce,
    };

    // Add user claims if available and scope permits
    if (process.env.USERS_TABLE && tables.users) {
      log("looking_up_user_claims", sub);
      try {
        const userRecord = await get(tables.users, { username: sub });
        if (userRecord.Item) {
          const scopes = scope ? scope.split(" ") : [];

          // Include email claims if email scope was requested
          if (scopes.includes("email") && userRecord.Item.email) {
            idTokenClaims.email = userRecord.Item.email;
            idTokenClaims.email_verified = userRecord.Item.emailVerified || false;
          }

          // Include profile claims if profile scope was requested
          if (scopes.includes("profile")) {
            if (userRecord.Item.name) idTokenClaims.name = userRecord.Item.name;
            if (userRecord.Item.given_name) idTokenClaims.given_name = userRecord.Item.given_name;
            if (userRecord.Item.family_name) idTokenClaims.family_name = userRecord.Item.family_name;
          }

          log("user_claims_added", "scopes:", scopes.join(","));
        }
      } catch (dbError) {
        log("user_lookup_failed", dbError);
        // Continue without user claims if lookup fails
      }
    }

    const id_token = await signJwt(idTokenClaims);
    const access_token = await signJwt({ iss, sub, aud, iat: now, exp: now + 300, scope: row.Item.scope });

    log("token_issued", sub);
    return createJsonResponse(200, { id_token, access_token, token_type: "Bearer", expires_in: 300 });
  } catch (e) {
    logError("token_error", e);
    return createJsonResponse(500, { error: "server_error" });
  }
};
