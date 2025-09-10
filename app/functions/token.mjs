import * as crypto from "node:crypto";
import { get, conditionalDelete, put, update, tables } from "../lib/db.mjs";
import { signJwt } from "../lib/crypto.mjs";
import { validateClientAuth, isPkceRequired } from "../lib/clients.mjs";
import { log, logError, maskSensitive, parseFormBody, createJsonResponse } from "../lib/utils.mjs";

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
    if (pkceRequired && row.Item.ccm) {
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
