/**
 * Token Flow Operations
 * Abstracts the token exchange flow logic into composable, testable functions
 */
import * as crypto from "node:crypto";
import { get, conditionalDelete, tables } from "./db.mjs";
import { validateClientAuth, isPkceRequired } from "./clients.mjs";
import { log, logError, maskSensitive } from "./utils.mjs";
import { time } from "./time.mjs";
import { createTokenPair } from "./jwt-ops.mjs";
import { createOidcError, createOidcResponse } from "./oidc-handler.mjs";

/**
 * Validates client authentication for token request
 * @param {string} clientId - Client identifier
 * @param {string} [clientSecret] - Client secret (for confidential clients)
 * @returns {Object} Validation result
 */
export const validateTokenClientAuth = (clientId, clientSecret) => {
  if (!validateClientAuth(clientId, clientSecret)) {
    logError("client_auth_failed", null, { client_id: clientId });
    return {
      success: false,
      error: createOidcError("invalid_client", "Client authentication failed", 401),
    };
  }

  log("client_authenticated", clientId);
  return { success: true };
};

/**
 * Validates PKCE requirements for token request
 * @param {string} clientId - Client identifier
 * @param {string} [codeVerifier] - PKCE code verifier
 * @returns {Object} Validation result
 */
export const validateTokenPkce = (clientId, codeVerifier) => {
  const pkceRequired = isPkceRequired(clientId);

  if (pkceRequired && !codeVerifier) {
    logError("pkce_required_but_missing", null, { client_id: clientId });
    return {
      success: false,
      error: createOidcError("invalid_request", "PKCE required but no code_verifier provided"),
    };
  }

  log("token_request_parameters_validated", clientId, {
    hasPkceVerifier: !!codeVerifier,
    pkceRequired,
  });

  return { success: true };
};

/**
 * Retrieves and validates authorization code
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} Code validation result
 */
export const validateAuthorizationCode = async (code) => {
  try {
    const row = await get(tables.codes, { code });
    log("authorization_code_lookup", { codeExists: !!row.Item }, maskSensitive(code));

    if (!row.Item) {
      logError("authorization_code_not_found", null, { code: maskSensitive(code) });
      return {
        success: false,
        error: createOidcError("invalid_grant", "Authorization code not found"),
      };
    }

    log(
      "authorization_code_found",
      {
        sub: row.Item?.sub,
        client: row.Item?.client,
      },
      maskSensitive(code),
    );

    // Check if code is expired or used
    const now = time.nowSeconds();
    if (row.Item.used === true || (row.Item.ttl && row.Item.ttl <= now)) {
      logError("authorization_code_invalid", null, {
        used: row.Item.used,
        ttl: row.Item.ttl,
        now,
      });
      return {
        success: false,
        error: createOidcError("invalid_grant", "Authorization code is expired or already used"),
      };
    }

    log("authorization_code_timing_valid", {
      used: row.Item.used === true,
      ttl: row.Item.ttl,
      now,
    });

    return { success: true, authCode: row.Item };
  } catch (error) {
    logError("authorization_code_lookup_error", error, { code: maskSensitive(code) });
    return {
      success: false,
      error: createOidcError("server_error", "Failed to validate authorization code", 500),
    };
  }
};

/**
 * Validates token request parameters against stored auth code
 * @param {Object} authCode - Stored authorization code data
 * @param {Object} params - Token request parameters
 * @returns {Object} Validation result
 */
export const validateTokenParameters = (authCode, params) => {
  const { client_id, redirect_uri } = params;

  // Validate that client_id matches what was stored in the auth code
  if (authCode.client !== client_id) {
    logError("client_id_mismatch", null, {
      stored: authCode.client,
      provided: client_id,
    });
    return {
      success: false,
      error: createOidcError("invalid_grant", "Client ID mismatch"),
    };
  }

  // Validate that redirect_uri matches what was stored in the auth code
  if (authCode.redirect !== redirect_uri) {
    logError("redirect_uri_mismatch", null, {
      stored: authCode.redirect,
      provided: redirect_uri,
    });
    return {
      success: false,
      error: createOidcError("invalid_grant", "Redirect URI mismatch"),
    };
  }

  log("authorization_code_parameters_validated", {
    clientValidated: true,
    redirectValidated: true,
  });

  return { success: true };
};

/**
 * Validates PKCE challenge if present
 * @param {Object} authCode - Stored authorization code data
 * @param {string} [codeVerifier] - PKCE code verifier from token request
 * @returns {Object} Validation result
 */
export const validatePkceChallenge = (authCode, codeVerifier) => {
  // Validate PKCE challenge method
  if (authCode.ccm && authCode.ccm !== "S256") {
    logError("invalid_pkce_method", null, { method: authCode.ccm });
    return {
      success: false,
      error: createOidcError("invalid_grant", "Invalid PKCE challenge method"),
    };
  }

  log("authorization_code_challenge_method_valid", authCode.ccm || "none");

  // Validate PKCE challenge if present in authorization code
  const pkceRequired = isPkceRequired(authCode.client);

  if (pkceRequired && authCode.ccm) {
    // If we have a challenge method, we must have a verifier
    if (!codeVerifier) {
      logError("pkce_verifier_missing", null, { client_id: authCode.client });
      return {
        success: false,
        error: createOidcError("invalid_grant", "PKCE challenge present but no code_verifier provided"),
      };
    }

    const expectedChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    if (expectedChallenge !== authCode.ch) {
      logError("pkce_challenge_verification_failed", null, { client_id: authCode.client });
      return {
        success: false,
        error: createOidcError("invalid_grant", "PKCE challenge verification failed"),
      };
    }

    log("pkce_verification_success", { challengeMethod: authCode.ccm });
  } else {
    log("no_pkce_challenge_to_verify", {
      hasVerifier: !!codeVerifier,
      hasChallenge: !!authCode.ch,
    });
  }

  return { success: true };
};

/**
 * Consumes (deletes) the authorization code to ensure one-time use
 * @param {string} code - Authorization code to consume
 * @returns {Promise<Object>} Consumption result
 */
export const consumeAuthorizationCode = async (code) => {
  try {
    await conditionalDelete(tables.codes, { code }, "attribute_exists(code)");
    log("authorization_code_consumed", maskSensitive(code));
    return { success: true };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logError("authorization_code_already_used", null, { code: maskSensitive(code) });
      return {
        success: false,
        error: createOidcError("invalid_grant", "Authorization code has already been used"),
      };
    } else {
      logError("authorization_code_delete_failed", error, { code: maskSensitive(code) });
      return {
        success: false,
        error: createOidcError("server_error", "Failed to consume authorization code", 500),
      };
    }
  }
};

/**
 * Orchestrates the complete token exchange flow
 * @param {Object} params - Validated token request parameters
 * @returns {Promise<Object>} Token exchange result
 */
export const processTokenRequest = async (params) => {
  const { grant_type, code, client_id, redirect_uri, code_verifier, client_secret } = params;

  // Validate client authentication
  const clientAuthResult = validateTokenClientAuth(client_id, client_secret);
  if (!clientAuthResult.success) {
    return clientAuthResult;
  }

  // Validate PKCE requirements
  const pkceResult = validateTokenPkce(client_id, code_verifier);
  if (!pkceResult.success) {
    return pkceResult;
  }

  // Get and validate authorization code
  const codeResult = await validateAuthorizationCode(code);
  if (!codeResult.success) {
    return codeResult;
  }

  const authCode = codeResult.authCode;

  // Validate token parameters against auth code
  const paramsResult = validateTokenParameters(authCode, params);
  if (!paramsResult.success) {
    return paramsResult;
  }

  // Validate PKCE challenge if present
  const challengeResult = validatePkceChallenge(authCode, code_verifier);
  if (!challengeResult.success) {
    return challengeResult;
  }

  log(
    "authorization_code_validated",
    client_id,
    {
      codeValidated: true,
      sub: authCode?.sub,
    },
    maskSensitive(code),
  );

  // Consume the authorization code
  const consumeResult = await consumeAuthorizationCode(code);
  if (!consumeResult.success) {
    return consumeResult;
  }

  // Create token pair
  const tokenData = {
    sub: authCode.sub,
    aud: authCode.client,
    scope: authCode.scope,
    nonce: authCode.nonce,
  };

  const tokens = await createTokenPair(tokenData);

  return {
    success: true,
    result: createOidcResponse(tokens, {}, { tokensIssued: true }),
  };
};
