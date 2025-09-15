/**
 * Rate limiting and brute force protection for OIDC endpoints
 * 
 * This module provides:
 * - Per-IP rate limiting for authentication attempts
 * - Progressive delays for failed authentication attempts
 * - DynamoDB-based rate limit storage with TTL
 * - Configurable limits per endpoint type
 */

import { put, get, update, tables } from "./db.mjs";
import { log, logError } from "./utils.mjs";

// Rate limiting configuration
const RATE_LIMITS = {
  // Authorization endpoint: generous limits for legitimate auth flows
  authorize: {
    windowSeconds: 300, // 5 minutes
    maxAttempts: 20,
    blockDurationSeconds: 900, // 15 minutes
  },
  // Token endpoint: stricter limits as it's machine-to-machine
  token: {
    windowSeconds: 60, // 1 minute  
    maxAttempts: 10,
    blockDurationSeconds: 600, // 10 minutes
  },
  // Failed login attempts: progressive blocking
  authFailure: {
    windowSeconds: 300, // 5 minutes
    maxAttempts: 5,
    blockDurationSeconds: 1800, // 30 minutes
  },
  // JWKS endpoint: very generous as it's public and cacheable
  jwks: {
    windowSeconds: 60,
    maxAttempts: 100,
    blockDurationSeconds: 300, // 5 minutes
  },
};

/**
 * Get rate limiting table name
 * @returns {string} DynamoDB table name for rate limiting
 */
const getRateLimitTable = () => {
  return tables.codes; // Reuse existing table with different partition key pattern
};

/**
 * Generate rate limit key for an IP and endpoint
 * @param {string} endpoint - Endpoint name (authorize, token, etc.)
 * @param {string} clientIp - Client IP address
 * @returns {string} Rate limit key
 */
const getRateLimitKey = (endpoint, clientIp) => {
  // Use IP with endpoint prefix to avoid collisions with auth codes
  return `ratelimit:${endpoint}:${clientIp}`;
};

/**
 * Extract client IP from Lambda event
 * @param {Object} event - Lambda event object
 * @returns {string} Client IP address
 */
export const getClientIp = (event) => {
  // Check CloudFront headers first (most reliable for our setup)
  if (event.headers?.["cloudfront-viewer-address"]) {
    return event.headers["cloudfront-viewer-address"].split(":")[0];
  }
  
  // Check X-Forwarded-For header
  if (event.headers?.["x-forwarded-for"]) {
    return event.headers["x-forwarded-for"].split(",")[0].trim();
  }
  
  // Fallback to source IP from request context
  return event.requestContext?.http?.sourceIp || "unknown";
};

/**
 * Check if a request should be rate limited
 * @param {string} endpoint - Endpoint name
 * @param {string} clientIp - Client IP address
 * @returns {Promise<{allowed: boolean, remaining: number, resetTime: number}>}
 */
export const checkRateLimit = async (endpoint, clientIp) => {
  // Skip rate limiting in test mode to avoid interfering with other tests
  if (process.env.NODE_ENV === "test") {
    return { allowed: true, remaining: Infinity, resetTime: 0 };
  }

  const config = RATE_LIMITS[endpoint];
  if (!config) {
    // No rate limiting configured for this endpoint
    return { allowed: true, remaining: Infinity, resetTime: 0 };
  }

  const key = getRateLimitKey(endpoint, clientIp);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - config.windowSeconds;
  
  try {
    // Get current rate limit data
    const result = await get(getRateLimitTable(), { id: key });
    
    if (!result || !result.attempts) {
      // No previous attempts recorded
      log("rate_limit_check", endpoint, clientIp, "no_previous_attempts");
      return { 
        allowed: true, 
        remaining: config.maxAttempts - 1,
        resetTime: now + config.windowSeconds 
      };
    }

    const attempts = result.attempts || [];
    
    // Filter attempts within the current window
    const recentAttempts = attempts.filter(timestamp => timestamp > windowStart);
    
    // Check if currently blocked
    if (result.blockedUntil && result.blockedUntil > now) {
      log("rate_limit_blocked", endpoint, clientIp, `blocked_until_${result.blockedUntil}`);
      return { 
        allowed: false, 
        remaining: 0,
        resetTime: result.blockedUntil 
      };
    }

    // Check if within rate limits
    if (recentAttempts.length < config.maxAttempts) {
      const remaining = config.maxAttempts - recentAttempts.length - 1;
      log("rate_limit_allowed", endpoint, clientIp, `attempts_${recentAttempts.length}_remaining_${remaining}`);
      return { 
        allowed: true, 
        remaining,
        resetTime: now + config.windowSeconds 
      };
    }

    // Rate limit exceeded
    log("rate_limit_exceeded", endpoint, clientIp, `attempts_${recentAttempts.length}_max_${config.maxAttempts}`);
    return { 
      allowed: false, 
      remaining: 0,
      resetTime: now + config.windowSeconds 
    };

  } catch (error) {
    logError("rate_limit_check_error", endpoint, clientIp, error);
    // On error, allow the request (fail open for availability)
    return { allowed: true, remaining: Infinity, resetTime: 0 };
  }
};

/**
 * Record a request attempt for rate limiting
 * @param {string} endpoint - Endpoint name
 * @param {string} clientIp - Client IP address
 * @param {boolean} isFailure - Whether this was a failed attempt (triggers blocking)
 */
export const recordAttempt = async (endpoint, clientIp, isFailure = false) => {
  // Skip rate limiting in test mode to avoid interfering with other tests  
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const config = RATE_LIMITS[endpoint];
  if (!config) {
    return; // No rate limiting for this endpoint
  }

  const key = getRateLimitKey(endpoint, clientIp);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - config.windowSeconds;
  
  try {
    // Get current attempts
    const result = await get(getRateLimitTable(), { id: key });
    const attempts = result?.attempts || [];
    
    // Add current attempt and filter to window
    const newAttempts = [...attempts, now].filter(timestamp => timestamp > windowStart);
    
    // Check if we should block due to too many failures
    let blockedUntil = result?.blockedUntil || 0;
    if (isFailure && newAttempts.length >= config.maxAttempts) {
      blockedUntil = now + config.blockDurationSeconds;
      log("rate_limit_blocking", endpoint, clientIp, `blocked_until_${blockedUntil}`);
    }

    // Update rate limit record with TTL
    const ttl = Math.max(
      now + config.windowSeconds + 60, // Window + buffer
      blockedUntil + 60 // Block time + buffer
    );

    await put(getRateLimitTable(), {
      id: key,
      attempts: newAttempts,
      blockedUntil,
      ttl, // DynamoDB will auto-delete when expired
      lastUpdated: now,
      endpoint,
      clientIp,
    });

    log("rate_limit_recorded", endpoint, clientIp, `attempts_${newAttempts.length}_blocked_${blockedUntil > now}`);

  } catch (error) {
    logError("rate_limit_record_error", endpoint, clientIp, error);
    // Continue processing even if rate limit recording fails
  }
};

/**
 * Middleware function to apply rate limiting to Lambda handlers
 * @param {string} endpoint - Endpoint name for rate limiting
 * @returns {Function} Middleware function
 */
export const rateLimitMiddleware = (endpoint) => {
  return async (event, next) => {
    const clientIp = getClientIp(event);
    const rateLimitResult = await checkRateLimit(endpoint, clientIp);
    
    if (!rateLimitResult.allowed) {
      // Rate limited - return 429 with retry information
      const retryAfter = rateLimitResult.resetTime - Math.floor(Date.now() / 1000);
      
      return {
        statusCode: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": RATE_LIMITS[endpoint]?.maxAttempts?.toString() || "unknown",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
        },
        body: JSON.stringify({
          error: "rate_limit_exceeded",
          error_description: "Too many requests. Please try again later.",
          retry_after: retryAfter,
        }),
      };
    }

    // Record the attempt before processing
    await recordAttempt(endpoint, clientIp, false);
    
    // Add rate limit headers to response
    const response = await next(event);
    
    if (response && response.headers) {
      response.headers["X-RateLimit-Limit"] = RATE_LIMITS[endpoint]?.maxAttempts?.toString() || "unknown";
      response.headers["X-RateLimit-Remaining"] = Math.max(0, rateLimitResult.remaining).toString();
      response.headers["X-RateLimit-Reset"] = rateLimitResult.resetTime.toString();
    }
    
    return response;
  };
};

/**
 * Record a failed authentication attempt for progressive blocking
 * @param {string} clientIp - Client IP address  
 * @param {string} username - Username that failed (optional, for logging)
 */
export const recordAuthFailure = async (clientIp, username = null) => {
  // Skip rate limiting in test mode to avoid interfering with other tests
  if (process.env.NODE_ENV === "test") {
    log("auth_failure_recorded", clientIp, username || "unknown_user", "test_mode_skipped");
    return;
  }

  await recordAttempt("authFailure", clientIp, true);
  log("auth_failure_recorded", clientIp, username || "unknown_user");
};

/**
 * Clear rate limiting data for an IP (useful for testing or administrative actions)
 * @param {string} endpoint - Endpoint name
 * @param {string} clientIp - Client IP address
 */
export const clearRateLimit = async (endpoint, clientIp) => {
  const key = getRateLimitKey(endpoint, clientIp);
  try {
    // We don't have a delete operation in our db.mjs, so we'll set TTL to expire immediately
    await put(getRateLimitTable(), {
      id: key,
      attempts: [],
      blockedUntil: 0,
      ttl: Math.floor(Date.now() / 1000) + 1, // Expire in 1 second
    });
    log("rate_limit_cleared", endpoint, clientIp);
  } catch (error) {
    logError("rate_limit_clear_error", endpoint, clientIp, error);
  }
};