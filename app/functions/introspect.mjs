/**
 * OAuth2 Token Introspection endpoint (RFC 7662)
 * Allows authorized clients to determine token metadata and validity
 *
 * This endpoint provides a way to query the authorization server to determine
 * the active state of an OAuth 2.0 token and to determine meta-information
 * about this token.
 */

import { verifyJwt } from "../lib/crypto.mjs";
import { get, tables } from "../lib/db.mjs";
import { validateClientAuth } from "../lib/clients.mjs";
import { log, logError, createJsonResponse, parseFormBody } from "../lib/utils.mjs";
import { checkRateLimit, recordAttempt, getClientIp } from "../lib/rate-limiting.mjs";

/**
 * Token Introspection endpoint handler
 * Implements RFC 7662 OAuth2 Token Introspection
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.requestContext - Request context
 * @param {Object} event.requestContext.http - HTTP details
 * @param {string} event.requestContext.http.method - HTTP method
 * @param {string} event.body - Request body containing introspection parameters
 * @param {Object} event.headers - Request headers
 * @returns {Promise<Object>} Lambda response object with token information or error
 */
export const handler = async (event) => {
  try {
    if (event.requestContext.http.method !== "POST") {
      return createJsonResponse(405, { error: "method_not_allowed" });
    }

    // Apply rate limiting
    const clientIp = getClientIp(event);
    const rateLimitResult = await checkRateLimit("introspect", clientIp);
    
    if (!rateLimitResult.allowed) {
      const retryAfter = rateLimitResult.resetTime - Math.floor(Date.now() / 1000);
      log("introspect_rate_limited", clientIp, `retry_after_${retryAfter}s`);
      
      return {
        statusCode: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
        },
        body: JSON.stringify({
          error: "rate_limit_exceeded",
          error_description: "Too many introspection requests. Please try again later.",
          retry_after: retryAfter,
        }),
      };
    }

    // Record the attempt
    await recordAttempt("introspect", clientIp, false);

    const body = parseFormBody(event);
    const token = body.get("token");
    const tokenTypeHint = body.get("token_type_hint") || "access_token";

    log("introspect_request", clientIp, tokenTypeHint, token ? "has_token" : "no_token");

    if (!token) {
      return createJsonResponse(400, {
        error: "invalid_request",
        error_description: "Missing required parameter: token",
      });
    }

    // Authenticate the client making the introspection request
    const clientAuth = await validateClientAuth(event);
    if (!clientAuth.authenticated) {
      log("introspect_client_auth_failed", clientIp, clientAuth.error);
      return createJsonResponse(401, {
        error: "invalid_client",
        error_description: "Client authentication failed",
      });
    }

    log("introspect_client_authenticated", clientAuth.clientId);

    // Introspect the token
    try {
      const introspectionResult = await introspectToken(token, tokenTypeHint, clientAuth.clientId);
      
      log("introspect_result", clientAuth.clientId, `active_${introspectionResult.active}`);
      
      return createJsonResponse(200, introspectionResult, {
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
      });
    } catch (error) {
      logError("introspect_token_error", clientAuth.clientId, error);
      
      // Return inactive status for any token that can't be validated
      return createJsonResponse(200, { active: false }, {
        "Cache-Control": "no-store", 
        "Pragma": "no-cache",
      });
    }
  } catch (error) {
    logError("introspect_error", error);
    return createJsonResponse(500, { error: "server_error" });
  }
};

/**
 * Introspect a token and return its metadata
 * @param {string} token - The token to introspect
 * @param {string} tokenTypeHint - Hint about token type (access_token, refresh_token)
 * @param {string} clientId - ID of client making the request
 * @returns {Promise<Object>} Token introspection result
 */
async function introspectToken(token, tokenTypeHint, clientId) {
  // Try to verify as JWT first (for access tokens and ID tokens)
  if (tokenTypeHint === "access_token" || tokenTypeHint === "id_token") {
    try {
      const payload = await verifyJwt(token);
      const now = Math.floor(Date.now() / 1000);
      
      // Check if token is expired
      if (payload.exp && payload.exp < now) {
        log("introspect_jwt_expired", clientId, payload.sub);
        return { active: false };
      }
      
      // Check if token is not yet valid
      if (payload.nbf && payload.nbf > now) {
        log("introspect_jwt_not_yet_valid", clientId, payload.sub);
        return { active: false };
      }
      
      // Return active token information
      const result = {
        active: true,
        scope: payload.scope,
        client_id: payload.aud,
        username: payload.sub,
        token_type: payload.token_use || "access_token",
        exp: payload.exp,
        iat: payload.iat,
        nbf: payload.nbf,
        sub: payload.sub,
        aud: payload.aud,
        iss: payload.iss,
        jti: payload.jti,
      };
      
      // Add email and profile info if present
      if (payload.email) result.email = payload.email;
      if (payload.email_verified !== undefined) result.email_verified = payload.email_verified;
      if (payload.given_name) result.given_name = payload.given_name;
      if (payload.family_name) result.family_name = payload.family_name;
      if (payload.picture) result.picture = payload.picture;
      
      // Remove undefined fields
      Object.keys(result).forEach(key => {
        if (result[key] === undefined) {
          delete result[key];
        }
      });
      
      log("introspect_jwt_valid", clientId, payload.sub, `expires_${payload.exp}`);
      return result;
    } catch (jwtError) {
      log("introspect_jwt_invalid", clientId, "jwt_verification_failed");
      // Continue to check if it might be a refresh token
    }
  }
  
  // Try to look up as refresh token in database
  if (tokenTypeHint === "refresh_token" || tokenTypeHint === "access_token") {
    try {
      // Check refresh tokens table
      const refreshResult = await get(tables.refresh, { refresh_token: token });
      if (refreshResult?.Item) {
        const refreshToken = refreshResult.Item;
        const now = Math.floor(Date.now() / 1000);
        
        // Check if refresh token is expired
        if (refreshToken.ttl && refreshToken.ttl < now) {
          log("introspect_refresh_expired", clientId, refreshToken.sub);
          return { active: false };
        }
        
        // Check if refresh token has been used/revoked
        if (refreshToken.revoked) {
          log("introspect_refresh_revoked", clientId, refreshToken.sub);
          return { active: false };
        }
        
        const result = {
          active: true,
          token_type: "refresh_token",
          client_id: refreshToken.client_id,
          username: refreshToken.sub,
          sub: refreshToken.sub,
          scope: refreshToken.scope,
          exp: refreshToken.ttl,
          iat: refreshToken.created_at,
        };
        
        log("introspect_refresh_valid", clientId, refreshToken.sub);
        return result;
      }
    } catch (dbError) {
      logError("introspect_db_lookup_failed", clientId, dbError);
    }
  }
  
  // If we get here, the token is not active/valid
  log("introspect_token_inactive", clientId, tokenTypeHint);
  return { active: false };
}