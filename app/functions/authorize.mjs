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
import { checkRateLimit, recordAttempt, recordAuthFailure, getClientIp } from "../lib/rate-limiting.mjs";

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
 * Processes authorization requests and issues authorization codes
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.requestContext - Request context
 * @param {Object} event.requestContext.http - HTTP details
 * @param {string} event.requestContext.http.method - HTTP method
 * @param {string} event.rawPath - Request path
 * @param {string} event.rawQueryString - Query string
 * @param {string} event.body - Request body
 * @param {Object} event.headers - Request headers
 * @returns {Promise<Object>} Lambda response object with redirect or error
 */
export const handler = async (event) => {
  try {
    // Apply rate limiting first
    const clientIp = getClientIp(event);
    const rateLimitResult = await checkRateLimit("authorize", clientIp);
    
    if (!rateLimitResult.allowed) {
      const retryAfter = rateLimitResult.resetTime - Math.floor(Date.now() / 1000);
      log("authorize_rate_limited", clientIp, `retry_after_${retryAfter}s`);
      
      return {
        statusCode: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": "20",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
        },
        body: JSON.stringify({
          error: "rate_limit_exceeded",
          error_description: "Too many authorization requests. Please try again later.",
          retry_after: retryAfter,
        }),
      };
    }

    const method = event.requestContext?.http?.method || "GET";
    const url = new URL(event.rawPath + (event.rawQueryString ? "?" + event.rawQueryString : ""), "https://issuer");
    const qp = Object.fromEntries(url.searchParams.entries());

    // Only support POST method for security and OAuth2 best practices
    //if (method !== "POST") {
    //  return createJsonResponse(405, { error: "method_not_allowed" });
    //}

    const body = parseFormBody(event);
    for (const [k, v] of body.entries()) qp[k] = v;
    log("authorize", method, JSON.stringify(createSafeQpForLogging(qp)));

    // Record the attempt (not a failure yet)
    await recordAttempt("authorize", clientIp, false);

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

    // Client registry validation
    const client = getClient(qp.client_id);
    if (!client) return createJsonResponse(400, { error: `invalid_client ${qp.client_id}` });

    // Validate redirect URI is allowed for this client
    if (!validateRedirectUri(qp.client_id, qp.redirect_uri)) {
      return createJsonResponse(400, { error: `invalid_redirect_uri ${qp.client_id} ${qp.redirect_uri}` });
    }

    // Validate scopes are allowed for this client
    if (!validateScopes(qp.client_id, qp.scope)) {
      return createJsonResponse(400, { error: `invalid_scope ${p.client_id} ${qp.scope}` });
    }

    // Validate PKCE if required by client or if provided
    if (isPkceRequired(qp.client_id)) {
      if (!qp.code_challenge || !qp.code_challenge_method) {
        return createJsonResponse(400, {
          error: `invalid_request ${qp.code_challenge} ${qp.code_challenge_method}`,
          error_description: "PKCE required but code_challenge or code_challenge_method missing",
        });
      }
    }

    // If PKCE provided, validate it's correct format
    if (qp.code_challenge && qp.code_challenge_method !== "S256") {
      return createJsonResponse(400, {
        error: `invalid_request ${qp.code_challenge} ${qp.code_challenge_method}`,
        error_description: "Only S256 code_challenge_method is supported",
      });
    }

    const username = qp.username || "test-user";
    if (process.env.USERS_TABLE) {
      const got = await get(tables.users, { username });
      // Use a dummy hash if user not found to mitigate timing attacks
      const hash = got.Item?.passwordHash || "$2a$10$zCwQ6QJkQ6QJkQ6QJkQ6QOeQ6QJkQ6QJkQ6QJkQ6QJkQ6QJkQ6QJk"; // bcrypt hash for "dummy"
      const ok = !!qp.password && bcrypt.compareSync(qp.password, hash);
      if (!ok || !got.Item?.passwordHash) {
        // Record authentication failure for rate limiting
        await recordAuthFailure(clientIp, username);
        log("auth_failure", clientIp, username, "invalid_credentials");
        
        // Redirect back to direct login page with error instead of showing form
        const loginUrl =
          `/loginDirect.html?error=${encodeURIComponent("Invalid username or password")}&` +
          `client_id=${encodeURIComponent(qp.client_id || "")}&` +
          `redirect_uri=${encodeURIComponent(qp.redirect_uri || "")}&` +
          `scope=${encodeURIComponent(qp.scope || "")}&` +
          `state=${encodeURIComponent(qp.state || "")}`;
        return { statusCode: 302, headers: { Location: loginUrl }, body: "" };
      }
      log("auth_success", clientIp, username);
    }

    const code = ulid();
    const ttl = Math.floor(Date.now() / 1000) + 180;
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
    return createJsonResponse(500, { error: "server_error", e });
  }
};
