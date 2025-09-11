import * as crypto from "node:crypto";
import { get, conditionalDelete, put, update, tables } from "../lib/db.mjs";
import { signJwt } from "../lib/crypto.mjs";
import { validateClientAuth, isPkceRequired } from "../lib/clients.mjs";
import {
  log,
  logError,
  logRequestStart,
  logRequestEnd,
  maskSensitive,
  parseFormBody,
  createJsonResponse,
} from "../lib/utils.mjs";
import { tokenRequestSchema, safeValidateParams } from "../lib/validation.mjs";
import { time, jwt } from "../lib/time.mjs";
import { config } from "../lib/config.mjs";

/**
 * OIDC Token endpoint handler
 * Exchanges authorization codes for access tokens and ID tokens
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.requestContext - Request context
 * @param {Object} event.requestContext.http - HTTP details
 * @param {string} event.requestContext.http.method - HTTP method
 * @param {string} event.body - Request body containing token request parameters
 * @returns {Promise<Object>} Lambda response object with tokens or error
 */
export const handler = async (event) => {
  const correlationId = logRequestStart(event.requestContext.http.method, event.rawPath);

  try {
    if (event.requestContext.http.method !== "POST") {
      logRequestEnd(405, { error: "method_not_allowed" });
      return createJsonResponse(405, { error: "method_not_allowed" });
    }

    const body = parseFormBody(event);
    const params = Object.fromEntries(body.entries());

    // Validate parameters using Zod schema
    const validation = safeValidateParams(params, tokenRequestSchema);
    if (!validation.success) {
      logError("token_parameter_validation_failed", null, {
        errors: validation.errors,
        correlationId,
      });
      logRequestEnd(400, { error: "invalid_request" });
      return createJsonResponse(400, {
        error: "invalid_request",
        error_description: `Parameter validation failed: ${validation.errors.join(", ")}`,
      });
    }

    const validatedParams = validation.data;
    const { grant_type, code, client_id, redirect_uri, code_verifier, client_secret } = validatedParams;

    log("token_request_validated", client_id, redirect_uri, code ? `has_code: ${maskSensitive(code)}` : "no_code");

    // Check if PKCE is required for this client
    const pkceRequired = isPkceRequired(client_id);
    if (pkceRequired && !code_verifier) {
      logError("pkce_required_but_missing", null, { client_id });
      logRequestEnd(400, { error: "invalid_request" });
      return createJsonResponse(400, {
        error: "invalid_request",
        error_description: "PKCE required but no code_verifier provided",
      });
    }

    log("token_request_parameters_validated", client_id, {
      hasCode: !!code,
      hasRedirect: !!redirect_uri,
      hasPkceVerifier: !!code_verifier,
      pkceRequired,
    });

    // Validate client authentication (for public clients, no secret needed)
    if (!validateClientAuth(client_id, client_secret)) {
      logError("client_auth_failed", null, { client_id });
      logRequestEnd(401, { error: "invalid_client" });
      return createJsonResponse(401, {
        error: "invalid_client",
        error_description: "Client authentication failed",
      });
    }

    log("client_authenticated", client_id);

    // Get and validate authorization code
    const row = await get(tables.codes, { code });
    log("authorization_code_lookup", { codeExists: !!row.Item }, maskSensitive(code));

    if (!row.Item) {
      logError("authorization_code_not_found", null, { code: maskSensitive(code) });
      logRequestEnd(400, { error: "invalid_grant" });
      return createJsonResponse(400, { error: "invalid_grant" });
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
      logRequestEnd(400, { error: "invalid_grant" });
      return createJsonResponse(400, { error: "invalid_grant" });
    }

    log("authorization_code_timing_valid", {
      used: row.Item.used === true,
      ttl: row.Item.ttl,
      now,
    });

    // Validate PKCE challenge method
    if (row.Item.ccm && row.Item.ccm !== "S256") {
      logError("invalid_pkce_method", null, { method: row.Item.ccm });
      logRequestEnd(400, { error: "invalid_grant" });
      return createJsonResponse(400, { error: "invalid_grant" });
    }

    log("authorization_code_challenge_method_valid", row.Item.ccm || "none");

    // Validate that client_id and redirect_uri match what was stored in the auth code
    if (row.Item.client !== client_id) {
      logError("client_id_mismatch", null, {
        stored: row.Item.client,
        provided: client_id,
      });
      logRequestEnd(400, { error: "invalid_grant" });
      return createJsonResponse(400, { error: "invalid_grant" });
    }

    if (row.Item.redirect !== redirect_uri) {
      logError("redirect_uri_mismatch", null, {
        stored: row.Item.redirect,
        provided: redirect_uri,
      });
      logRequestEnd(400, { error: "invalid_grant" });
      return createJsonResponse(400, { error: "invalid_grant" });
    }

    log("authorization_code_parameters_validated", {
      clientValidated: true,
      redirectValidated: true,
    });

    // Validate PKCE challenge if present in authorization code
    if (pkceRequired && row.Item.ccm) {
      // If we have a challenge method, we must have a verifier
      if (!code_verifier) {
        logError("pkce_verifier_missing", null, { client_id });
        logRequestEnd(400, { error: "invalid_grant" });
        return createJsonResponse(400, {
          error: "invalid_grant",
          error_description: "PKCE challenge present but no code_verifier provided",
        });
      }

      const expectedChallenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
      if (expectedChallenge !== row.Item.ch) {
        logError("pkce_challenge_verification_failed", null, { client_id });
        logRequestEnd(400, { error: "invalid_grant" });
        return createJsonResponse(400, {
          error: "invalid_grant",
          error_description: "PKCE challenge verification failed",
        });
      }
      log("pkce_verification_success", { challengeMethod: row.Item.ccm });
    } else {
      log("no_pkce_challenge_to_verify", {
        hasVerifier: !!code_verifier,
        hasChallenge: !!row.Item.ch,
      });
    }

    // Use conditional delete to ensure one-time use
    log(
      "authorization_code_validated",
      client_id,
      {
        codeValidated: true,
        sub: row.Item?.sub,
      },
      maskSensitive(code),
    );

    try {
      await conditionalDelete(tables.codes, { code }, "attribute_exists(code)");
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        logError("authorization_code_already_used", null, { code: maskSensitive(code) });
        logRequestEnd(400, { error: "invalid_grant" });
        return createJsonResponse(400, { error: "invalid_grant" });
      } else {
        logError("authorization_code_delete_failed", error, { code: maskSensitive(code) });
      }
      throw error;
    }

    // Build tokens using JWT utilities
    const iss = config.issuer;
    const aud = row.Item.client;
    const sub = row.Item.sub;
    const scope = row.Item.scope;
    const iat = jwt.issuedAt();

    // Build ID token claims
    const idTokenClaims = {
      iss,
      sub,
      aud,
      iat,
      exp: jwt.expiresIn(config.tokens.idTokenTtlSeconds),
      nonce: row.Item.nonce,
    };

    // Add user claims if available and scope permits
    if (config.tables.users && tables.users) {
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
        logError("user_lookup_failed", dbError);
        // Continue without user claims if lookup fails
      }
    }

    const id_token = await signJwt(idTokenClaims);
    const access_token = await signJwt({
      iss,
      sub,
      aud,
      iat,
      exp: jwt.expiresIn(config.tokens.accessTokenTtlSeconds),
      scope: row.Item.scope,
    });

    log("tokens_issued", { sub, client: client_id });
    logRequestEnd(200, { tokensIssued: true });

    return createJsonResponse(200, {
      id_token,
      access_token,
      token_type: "Bearer",
      expires_in: config.tokens.accessTokenTtlSeconds,
    });
  } catch (e) {
    logError("token_handler_error", e, { correlationId });
    logRequestEnd(500, { error: "server_error" });
    return createJsonResponse(500, { error: "server_error" });
  }
};
