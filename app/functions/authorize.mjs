import bcrypt from "bcryptjs";
import { ulid } from "ulid";

import {
  getClient,
  isPkceRequired,
  isScopeSubset,
  isValidRedirectUri,
  validateRedirectUri,
  validateScopes,
} from "../lib/clients.mjs";
import { get, put, tables } from "../lib/db.mjs";
import { createErrorResponse, getHttpMethod, log, logError, maskSensitive, parseFormBody, validateHttpMethod, validateRequiredParams } from "../lib/utils.mjs";

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
    const method = getHttpMethod(event);
    const url = new URL(event.rawPath + (event.rawQueryString ? "?" + event.rawQueryString : ""), "https://issuer");
    const qp = Object.fromEntries(url.searchParams.entries());

    // Only support POST method for security and OAuth2 best practices
    if (!validateHttpMethod(event, "POST")) {
      return createErrorResponse(405, "method_not_allowed");
    }

    const body = parseFormBody(event);
    for (const [k, v] of body.entries()) qp[k] = v;
    log("authorize", method, JSON.stringify(createSafeQpForLogging(qp)));

    // Validate required parameters
    const requiredParams = ["client_id", "redirect_uri", "response_type", "scope", "state"];
    const validationError = validateRequiredParams(qp, requiredParams);
    if (validationError) {
      return createErrorResponse(400, validationError);
    }
    if (qp.response_type !== "code") return createErrorResponse(400, "unsupported_response_type");

    // Client registry validation
    const client = getClient(qp.client_id);
    if (!client) return createErrorResponse(400, "invalid_client");

    // Validate redirect URI is allowed for this client
    if (!validateRedirectUri(qp.client_id, qp.redirect_uri)) {
      return createErrorResponse(400, "invalid_redirect_uri");
    }

    // Validate scopes are allowed for this client
    if (!validateScopes(qp.client_id, qp.scope)) {
      return createErrorResponse(400, "invalid_scope");
    }

    // Validate PKCE if required by client or if provided
    if (isPkceRequired(qp.client_id)) {
      if (!qp.code_challenge || !qp.code_challenge_method) {
        return createErrorResponse(400, "pkce_required");
      }
    }

    // If PKCE provided, validate it's correct format
    if (qp.code_challenge && qp.code_challenge_method !== "S256") {
      return createErrorResponse(400, "invalid_request");
    }

    const username = qp.username || "test-user";
    if (process.env.USERS_TABLE) {
      const got = await get(tables.users, { username });
      // Use a dummy hash if user not found to mitigate timing attacks
      const hash = got.Item?.passwordHash || "$2a$10$zCwQ6QJkQ6QJkQ6QJkQ6QOeQ6QJkQ6QJkQ6QJkQ6QJkQ6QJkQ6QJk"; // bcrypt hash for "dummy"
      const ok = !!qp.password && bcrypt.compareSync(qp.password, hash);
      if (!ok || !got.Item?.passwordHash) {
        // Redirect back to direct login page with error instead of showing form
        const loginUrl =
          `/loginDirect.html?error=${encodeURIComponent("Invalid username or password")}&` +
          `client_id=${encodeURIComponent(qp.client_id || "")}&` +
          `redirect_uri=${encodeURIComponent(qp.redirect_uri || "")}&` +
          `scope=${encodeURIComponent(qp.scope || "")}&` +
          `state=${encodeURIComponent(qp.state || "")}`;
        return { statusCode: 302, headers: { Location: loginUrl }, body: "" };
      }
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
    return createErrorResponse(500, "server_error");
  }
};
