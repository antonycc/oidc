/**
 * OAuth2 Token Revocation endpoint (RFC 7009)
 * Allows clients to notify the authorization server that a token is no longer needed
 *
 * This endpoint enables clients to signal to the authorization server that a previously
 * obtained refresh or access token is no longer needed and should be revoked.
 */

import { verifyJwt } from "../lib/crypto.mjs";
import { get, put, update, tables } from "../lib/db.mjs";
import { validateClientAuth } from "../lib/clients.mjs";
import { log, logError, createJsonResponse, parseFormBody } from "../lib/utils.mjs";
import { checkRateLimit, recordAttempt, getClientIp } from "../lib/rate-limiting.mjs";

/**
 * Token Revocation endpoint handler  
 * Implements RFC 7009 OAuth2 Token Revocation
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.requestContext - Request context
 * @param {Object} event.requestContext.http - HTTP details
 * @param {string} event.requestContext.http.method - HTTP method
 * @param {string} event.body - Request body containing revocation parameters
 * @param {Object} event.headers - Request headers
 * @returns {Promise<Object>} Lambda response object
 */
export const handler = async (event) => {
  try {
    if (event.requestContext.http.method !== "POST") {
      return createJsonResponse(405, { error: "method_not_allowed" });
    }

    // Apply rate limiting
    const clientIp = getClientIp(event);
    const rateLimitResult = await checkRateLimit("revoke", clientIp);
    
    if (!rateLimitResult.allowed) {
      const retryAfter = rateLimitResult.resetTime - Math.floor(Date.now() / 1000);
      log("revoke_rate_limited", clientIp, `retry_after_${retryAfter}s`);
      
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
          error_description: "Too many revocation requests. Please try again later.",
          retry_after: retryAfter,
        }),
      };
    }

    // Record the attempt
    await recordAttempt("revoke", clientIp, false);

    const body = parseFormBody(event);
    const token = body.get("token");
    const tokenTypeHint = body.get("token_type_hint") || "access_token";

    log("revoke_request", clientIp, tokenTypeHint, token ? "has_token" : "no_token");

    if (!token) {
      return createJsonResponse(400, {
        error: "invalid_request",
        error_description: "Missing required parameter: token",
      });
    }

    // Authenticate the client making the revocation request
    const clientAuth = await validateClientAuth(event);
    if (!clientAuth.authenticated) {
      log("revoke_client_auth_failed", clientIp, clientAuth.error);
      return createJsonResponse(401, {
        error: "invalid_client",
        error_description: "Client authentication failed",
      });
    }

    log("revoke_client_authenticated", clientAuth.clientId);

    // Revoke the token
    try {
      const revocationResult = await revokeToken(token, tokenTypeHint, clientAuth.clientId);
      
      log("revoke_result", clientAuth.clientId, `success_${revocationResult.success}`);
      
      // RFC 7009 specifies that the revocation endpoint should return 200 OK
      // regardless of whether the token was successfully revoked or not
      return createJsonResponse(200, {}, {
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
      });
    } catch (error) {
      logError("revoke_token_error", clientAuth.clientId, error);
      
      // Even on error, return 200 as per RFC 7009
      // The client should not know if revocation failed
      return createJsonResponse(200, {}, {
        "Cache-Control": "no-store",
        "Pragma": "no-cache", 
      });
    }
  } catch (error) {
    logError("revoke_error", error);
    return createJsonResponse(500, { error: "server_error" });
  }
};

/**
 * Revoke a token
 * @param {string} token - The token to revoke
 * @param {string} tokenTypeHint - Hint about token type (access_token, refresh_token)
 * @param {string} clientId - ID of client making the request
 * @returns {Promise<Object>} Revocation result
 */
async function revokeToken(token, tokenTypeHint, clientId) {
  let revokedRefreshTokens = 0;
  let revokedAccessTokens = 0;

  // Try to revoke as refresh token first if hinted
  if (tokenTypeHint === "refresh_token" || tokenTypeHint === "access_token") {
    try {
      const refreshResult = await get(tables.refresh, { refresh_token: token });
      if (refreshResult?.Item) {
        const refreshToken = refreshResult.Item;
        
        // Verify the client has permission to revoke this token
        if (refreshToken.client_id === clientId) {
          // Mark refresh token as revoked
          const updatedRefreshToken = {
            ...refreshToken,
            revoked: true,
            revoked_at: Math.floor(Date.now() / 1000),
            revoked_by: clientId,
          };
          
          await put(tables.refresh, updatedRefreshToken);
          revokedRefreshTokens++;
          log("revoke_refresh_token_success", clientId, refreshToken.sub);
          
          // If this was a refresh token, also revoke any associated access tokens
          // This helps prevent token leakage scenarios
          await revokeAssociatedAccessTokens(refreshToken.sub, refreshToken.client_id, refreshToken.jti);
          
          return { success: true, revokedRefreshTokens, revokedAccessTokens };
        } else {
          log("revoke_refresh_token_unauthorized", clientId, refreshToken.client_id);
          return { success: false, error: "unauthorized_token" };
        }
      }
    } catch (dbError) {
      logError("revoke_refresh_lookup_failed", clientId, dbError);
    }
  }

  // Try to revoke as JWT access token
  if (tokenTypeHint === "access_token" || tokenTypeHint === "refresh_token") {
    try {
      const payload = await verifyJwt(token);
      
      // Verify the client has permission to revoke this token
      // Access tokens should have the client_id in the 'aud' claim
      if (payload.aud === clientId || payload.client_id === clientId) {
        // For JWT tokens, we'll maintain a revocation list in the database
        // This allows introspection to check revocation status
        const revocationEntry = {
          token_id: payload.jti || token, // Use jti if available, otherwise token hash
          token_type: "access_token",
          client_id: clientId,
          sub: payload.sub,
          revoked_at: Math.floor(Date.now() / 1000),
          revoked_by: clientId,
          // Set TTL to token expiration to auto-cleanup
          ttl: payload.exp || Math.floor(Date.now() / 1000) + 3600, // 1 hour default
        };
        
        // Store in the same table as refresh tokens but with different key pattern
        await put(tables.refresh, {
          ...revocationEntry,
          refresh_token: `revoked_access_${payload.jti || token}`, // Unique key
        });
        
        revokedAccessTokens++;
        log("revoke_access_token_success", clientId, payload.sub, payload.jti);
        
        // Also revoke any refresh tokens for this user/client/session
        if (payload.jti) {
          await revokeAssociatedRefreshTokens(payload.sub, clientId, payload.jti);
        }
        
        return { success: true, revokedRefreshTokens, revokedAccessTokens };
      } else {
        log("revoke_access_token_unauthorized", clientId, payload.aud);
        return { success: false, error: "unauthorized_token" };
      }
    } catch (jwtError) {
      log("revoke_jwt_invalid", clientId, "jwt_verification_failed");
      // Continue - token might be some other type
    }
  }

  // If we get here, the token wasn't found or wasn't valid
  // But per RFC 7009, we should still return success
  log("revoke_token_not_found", clientId, tokenTypeHint);
  return { success: true, revokedRefreshTokens: 0, revokedAccessTokens: 0 };
}

/**
 * Revoke all access tokens associated with a refresh token session
 * @param {string} sub - Subject (user ID)
 * @param {string} clientId - Client ID
 * @param {string} sessionId - Session ID (jti from refresh token)
 */
async function revokeAssociatedAccessTokens(sub, clientId, sessionId) {
  // This is a simplified implementation
  // In a production system, you might maintain a session table
  // or have more sophisticated token tracking
  log("revoke_associated_access_tokens", clientId, sub, sessionId || "no_session_id");
  
  // For now, we'll just log this action
  // A more complete implementation would query for all access tokens
  // issued for this user/client/session and mark them as revoked
}

/**
 * Revoke all refresh tokens associated with an access token session
 * @param {string} sub - Subject (user ID)
 * @param {string} clientId - Client ID  
 * @param {string} sessionId - Session ID (jti from access token)
 */
async function revokeAssociatedRefreshTokens(sub, clientId, sessionId) {
  // This is a simplified implementation
  // In a production system, you might maintain better token relationships
  log("revoke_associated_refresh_tokens", clientId, sub, sessionId || "no_session_id");
  
  // For now, we'll just log this action
  // A more complete implementation would query for all refresh tokens
  // issued for this user/client/session and mark them as revoked
}