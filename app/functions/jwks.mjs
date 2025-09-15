import { publicJwks } from "../lib/crypto.mjs";
import { log, logError, createJsonResponse } from "../lib/utils.mjs";
import { checkRateLimit, recordAttempt, getClientIp } from "../lib/rate-limiting.mjs";

/**
 * OIDC JWKS (JSON Web Key Set) endpoint handler
 * Returns the public keys used for token verification
 *
 * @param {Object} event - Lambda event object (unused for JWKS)
 * @returns {Promise<Object>} Lambda response object with JWKS or error
 */
export const handler = async (event) => {
  try {
    // Apply rate limiting
    const clientIp = getClientIp(event);
    const rateLimitResult = await checkRateLimit("jwks", clientIp);
    
    if (!rateLimitResult.allowed) {
      const retryAfter = rateLimitResult.resetTime - Math.floor(Date.now() / 1000);
      log("jwks_rate_limited", clientIp, `retry_after_${retryAfter}s`);
      
      return {
        statusCode: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": "100",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
          "cache-control": "no-store",
        },
        body: JSON.stringify({
          error: "rate_limit_exceeded",
          error_description: "Too many JWKS requests. Please try again later.",
          retry_after: retryAfter,
        }),
      };
    }

    log("jwks_request", clientIp);
    
    // Record the attempt 
    await recordAttempt("jwks", clientIp, false);

    // Get the current public keys
    const jwks = await publicJwks();

    const response = createJsonResponse(200, jwks, {
      "cache-control": "public, max-age=3600", // Cache for 1 hour since keys are stable
    });
    
    // Add rate limit headers
    if (response.headers) {
      response.headers["X-RateLimit-Limit"] = "100";
      response.headers["X-RateLimit-Remaining"] = Math.max(0, rateLimitResult.remaining).toString();
      response.headers["X-RateLimit-Reset"] = rateLimitResult.resetTime.toString();
    }
    
    return response;
  } catch (e) {
    logError("jwks_error", e);
    return createJsonResponse(500, { error: "server_error" }, { "cache-control": "no-store" });
  }
};
