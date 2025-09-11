/**
 * Authorization Flow Operations
 * Abstracts the complex authorization flow logic into composable, testable functions
 */
import { ulid } from "ulid";
import bcrypt from "bcryptjs";
import { put, get, tables } from "./db.mjs";
import { getClient, validateRedirectUri, validateScopes, isPkceRequired } from "./clients.mjs";
import { log, logError, maskSensitive } from "./utils.mjs";
import { ttl } from "./time.mjs";
import { config } from "./config.mjs";
import { createOidcError, createOidcRedirect } from "./oidc-handler.mjs";

/**
 * Validates client registration and parameters
 * @param {Object} params - Authorization request parameters
 * @returns {Object} Validation result with success flag and client data
 */
export const validateClient = (params) => {
  const client = getClient(params.client_id);
  if (!client) {
    logError("client_not_found", null, { client_id: params.client_id });
    return {
      success: false,
      error: createOidcError("invalid_client", `Client not found: ${params.client_id}`),
    };
  }

  return { success: true, client };
};

/**
 * Validates redirect URI for the client
 * @param {string} clientId - Client identifier
 * @param {string} redirectUri - Redirect URI to validate
 * @returns {Object} Validation result
 */
export const validateClientRedirectUri = (clientId, redirectUri) => {
  if (!validateRedirectUri(clientId, redirectUri)) {
    logError("invalid_redirect_uri", null, {
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    return {
      success: false,
      error: createOidcError("invalid_redirect_uri", `Invalid redirect URI for client: ${clientId}`),
    };
  }

  return { success: true };
};

/**
 * Validates requested scopes for the client
 * @param {string} clientId - Client identifier
 * @param {string} scope - Requested scopes
 * @returns {Object} Validation result
 */
export const validateClientScopes = (clientId, scope) => {
  if (!validateScopes(clientId, scope)) {
    logError("invalid_scope", null, {
      client_id: clientId,
      scope: scope,
    });
    return {
      success: false,
      error: createOidcError("invalid_scope", `Invalid scope for client: ${clientId}`),
    };
  }

  return { success: true };
};

/**
 * Validates PKCE parameters if required
 * @param {Object} params - Authorization request parameters
 * @returns {Object} Validation result
 */
export const validatePkce = (params) => {
  const pkceRequired = isPkceRequired(params.client_id);

  if (pkceRequired && (!params.code_challenge || !params.code_challenge_method)) {
    logError("pkce_required_but_missing", null, { client_id: params.client_id });
    return {
      success: false,
      error: createOidcError("invalid_request", "PKCE required but code_challenge or code_challenge_method missing"),
    };
  }

  return { success: true };
};

/**
 * Authenticates user credentials
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} Authentication result
 */
export const authenticateUser = async (username, password) => {
  if (!config.tables.users) {
    // No user table configured, skip authentication
    log("no_user_authentication_configured");
    return { success: true, username };
  }

  try {
    const got = await get(tables.users, { username });

    // Use a dummy hash if user not found to mitigate timing attacks
    const hash = got.Item?.passwordHash || "$2a$10$zCwQ6QJkQ6QJkQ6QJkQ6QOeQ6QJkQ6QJkQ6QJkQ6QJkQ6QJkQ6QJk";
    const ok = !!password && bcrypt.compareSync(password, hash);

    if (!ok || !got.Item?.passwordHash) {
      log("authentication_failed", username);
      return { success: false, username };
    }

    log("user_authenticated", username);
    return { success: true, username };
  } catch (error) {
    logError("user_authentication_error", error, { username });
    return { success: false, username };
  }
};

/**
 * Creates and stores authorization code
 * @param {Object} params - Authorization parameters
 * @param {string} username - Authenticated username
 * @returns {Promise<Object>} Code creation result
 */
export const createAuthorizationCode = async (params, username) => {
  const code = ulid();
  const authCodeTtl = ttl.authCode(config.tokens.authCodeTtlSeconds);

  try {
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

    log("authorization_code_issued", { sub: username, client: params.client_id });
    return { success: true, code };
  } catch (error) {
    logError("authorization_code_creation_failed", error, {
      client: params.client_id,
      sub: username,
    });
    return {
      success: false,
      error: createOidcError("server_error", "Failed to create authorization code", 500),
    };
  }
};

/**
 * Creates login redirect URL for authentication failure
 * @param {Object} params - Authorization parameters
 * @param {string} errorMessage - Error message to display
 * @returns {string} Login redirect URL
 */
export const createLoginRedirect = (params, errorMessage) => {
  const loginUrl =
    `/loginDirect.html?error=${encodeURIComponent(errorMessage)}&` +
    `client_id=${encodeURIComponent(params.client_id || "")}&` +
    `redirect_uri=${encodeURIComponent(params.redirect_uri || "")}&` +
    `scope=${encodeURIComponent(params.scope || "")}&` +
    `state=${encodeURIComponent(params.state || "")}`;

  return loginUrl;
};

/**
 * Creates successful authorization redirect
 * @param {Object} params - Authorization parameters
 * @param {string} code - Authorization code
 * @returns {string} Success redirect URL
 */
export const createAuthorizationRedirect = (params, code) => {
  return `${params.redirect_uri}?code=${code}&state=${encodeURIComponent(params.state)}`;
};

/**
 * Orchestrates the complete authorization flow
 * @param {Object} params - Validated authorization parameters
 * @returns {Promise<Object>} Authorization result
 */
export const processAuthorizationRequest = async (params) => {
  // Validate client
  const clientValidation = validateClient(params);
  if (!clientValidation.success) {
    return clientValidation;
  }

  // Validate redirect URI
  const redirectValidation = validateClientRedirectUri(params.client_id, params.redirect_uri);
  if (!redirectValidation.success) {
    return redirectValidation;
  }

  // Validate scopes
  const scopeValidation = validateClientScopes(params.client_id, params.scope);
  if (!scopeValidation.success) {
    return scopeValidation;
  }

  // Validate PKCE
  const pkceValidation = validatePkce(params);
  if (!pkceValidation.success) {
    return pkceValidation;
  }

  // Authenticate user
  const username = params.username || "test-user";
  const authResult = await authenticateUser(username, params.password);

  if (!authResult.success) {
    const loginUrl = createLoginRedirect(params, "Invalid username or password");
    return {
      success: true, // Not an error, just redirect to login
      result: createOidcRedirect(loginUrl),
    };
  }

  // Create authorization code
  const codeResult = await createAuthorizationCode(params, authResult.username);
  if (!codeResult.success) {
    return codeResult;
  }

  // Create success redirect
  const location = createAuthorizationRedirect(params, codeResult.code);
  return {
    success: true,
    result: createOidcRedirect(location),
  };
};
