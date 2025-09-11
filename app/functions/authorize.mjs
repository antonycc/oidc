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
import {
  log,
  logError,
  logRequestStart,
  logRequestEnd,
  maskSensitive,
  parseFormBody,
  createJsonResponse,
} from "../lib/utils.mjs";
import { authorizeRequestSchema, safeValidateParams } from "../lib/validation.mjs";
import { ttl } from "../lib/time.mjs";
import { config } from "../lib/config.mjs";

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
  const method = event.requestContext?.http?.method || "GET";
  const correlationId = logRequestStart(method, event.rawPath);

  try {
    const url = new URL(event.rawPath + (event.rawQueryString ? "?" + event.rawQueryString : ""), "https://issuer");
    const qp = Object.fromEntries(url.searchParams.entries());

    // Parse form body and merge with query parameters
    const body = parseFormBody(event);
    for (const [k, v] of body.entries()) qp[k] = v;

    // Validate parameters using Zod schema
    const validation = safeValidateParams(qp, authorizeRequestSchema);
    if (!validation.success) {
      logError("parameter_validation_failed", null, {
        errors: validation.errors,
        correlationId,
      });
      logRequestEnd(400, { error: "invalid_request" });
      return createJsonResponse(400, {
        error: "invalid_request",
        error_description: `Parameter validation failed: ${validation.errors.join(", ")}`,
      });
    }

    const params = validation.data;
    log("authorize_request_validated", method, {
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      scope: params.scope,
    });

    // Client registry validation
    const client = getClient(params.client_id);
    if (!client) {
      logError("client_not_found", null, { client_id: params.client_id });
      logRequestEnd(400, { error: "invalid_client" });
      return createJsonResponse(400, { error: `invalid_client ${params.client_id}` });
    }

    // Validate redirect URI is allowed for this client
    if (!validateRedirectUri(params.client_id, params.redirect_uri)) {
      logError("invalid_redirect_uri", null, {
        client_id: params.client_id,
        redirect_uri: params.redirect_uri,
      });
      logRequestEnd(400, { error: "invalid_redirect_uri" });
      return createJsonResponse(400, {
        error: `invalid_redirect_uri ${params.client_id} ${params.redirect_uri}`,
      });
    }

    // Validate scopes are allowed for this client
    if (!validateScopes(params.client_id, params.scope)) {
      logError("invalid_scope", null, {
        client_id: params.client_id,
        scope: params.scope,
      });
      logRequestEnd(400, { error: "invalid_scope" });
      return createJsonResponse(400, {
        error: `invalid_scope ${params.client_id} ${params.scope}`,
      });
    }

    // Validate PKCE if required by client or if provided
    if (isPkceRequired(params.client_id)) {
      if (!params.code_challenge || !params.code_challenge_method) {
        logError("pkce_required_but_missing", null, { client_id: params.client_id });
        logRequestEnd(400, { error: "invalid_request" });
        return createJsonResponse(400, {
          error: `invalid_request`,
          error_description: "PKCE required but code_challenge or code_challenge_method missing",
        });
      }
    }

    // If PKCE provided, validate it's correct format (already validated by schema)
    const username = params.username || "test-user";

    // User authentication
    if (config.tables.users) {
      const got = await get(tables.users, { username });
      // Use a dummy hash if user not found to mitigate timing attacks
      const hash = got.Item?.passwordHash || "$2a$10$zCwQ6QJkQ6QJkQ6QJkQ6QOeQ6QJkQ6QJkQ6QJkQ6QJkQ6QJkQ6QJk"; // bcrypt hash for "dummy"
      const ok = !!params.password && bcrypt.compareSync(params.password, hash);

      if (!ok || !got.Item?.passwordHash) {
        log("authentication_failed", username);
        // Redirect back to direct login page with error instead of showing form
        const loginUrl =
          `/loginDirect.html?error=${encodeURIComponent("Invalid username or password")}&` +
          `client_id=${encodeURIComponent(params.client_id || "")}&` +
          `redirect_uri=${encodeURIComponent(params.redirect_uri || "")}&` +
          `scope=${encodeURIComponent(params.scope || "")}&` +
          `state=${encodeURIComponent(params.state || "")}`;
        logRequestEnd(302, { redirect: true });
        return { statusCode: 302, headers: { Location: loginUrl }, body: "" };
      }

      log("user_authenticated", username);
    }

    // Generate authorization code
    const code = ulid();
    const authCodeTtl = ttl.authCode(config.tokens.authCodeTtlSeconds);

    await put(tables.codes, {
      code,
      ttl: authCodeTtl,
      client: params.client_id,
      redirect: params.redirect_uri,
      scope: params.scope,
      nonce: params.nonce,
      ch: params.code_challenge,
      ccm: params.code_challenge_method,
      used: false,
      sub: username,
    });

    const location = `${params.redirect_uri}?code=${code}&state=${encodeURIComponent(params.state)}`;
    log("authorization_code_issued", { sub: username, client: params.client_id });
    logRequestEnd(302, { redirect: true });
    return { statusCode: 302, headers: { Location: location }, body: "" };
  } catch (e) {
    logError("authorize_handler_error", e, { correlationId });
    logRequestEnd(500, { error: "server_error" });
    return createJsonResponse(500, { error: "server_error" });
  }
};
