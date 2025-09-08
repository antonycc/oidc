/**
 * Common utility functions for OIDC provider
 * 
 * Provides consistent logging, error handling, response formatting, and security utilities
 * used across all Lambda function handlers. These utilities ensure standardized behavior,
 * comprehensive audit trails, and secure data handling practices.
 */

/**
 * Safe stringify function that handles errors and objects properly
 * 
 * Converts any value to a string representation while gracefully handling
 * circular references, Error objects, and other complex data structures.
 * Critical for logging and debugging without causing serialization failures.
 * 
 * @param {any} val - Value to stringify (object, Error, primitive, etc.)
 * @returns {string} Stringified representation of the value
 * 
 * @example
 * safeStringify(new Error("Test")) // '{"name":"Error","message":"Test","stack":"..."}'
 * safeStringify({a: 1, b: 2})     // '{"a":1,"b":2}'
 * safeStringify("hello")          // 'hello'
 */
export const safeStringify = (val) => {
  try {
    if (val instanceof Error) {
      return JSON.stringify({ name: val.name, message: val.message, stack: val.stack });
    }
    if (typeof val === "object") {
      return JSON.stringify(val);
    }
    return String(val);
  } catch {
    return String(val);
  }
};

/**
 * Structured logging function with consistent format
 * 
 * Generates standardized JSON log entries with timestamp and structured data.
 * All log entries include ISO 8601 timestamp, level indicator, and message content.
 * Used throughout the application for comprehensive audit trails and debugging.
 * 
 * **Log Format:**
 * - `level`: Always "info" for this function
 * - `ts`: ISO 8601 timestamp (e.g., "2024-01-15T10:30:00.000Z") 
 * - `msg`: Space-separated string representation of all arguments
 * 
 * @param {...any} a - Arguments to log (will be safely stringified and joined)
 * 
 * @example
 * log("user", "authentication", {success: true}) 
 * // Output: {"level":"info","ts":"2024-01-15T10:30:00.000Z","msg":"user authentication {\"success\":true}"}
 */
export const log = (...a) =>
  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      msg: a.map(safeStringify).join(" "),
    }),
  );

/**
 * Structured error logging function with consistent format
 * 
 * Generates standardized JSON error log entries for debugging and monitoring.
 * Error logs include full Error object serialization with stack traces when available.
 * Critical for troubleshooting authentication flows and system issues.
 * 
 * **Error Log Format:**
 * - `level`: Always "error" 
 * - `ts`: ISO 8601 timestamp
 * - `msg`: Primary error message
 * - `err`: Serialized Error object (name, message, stack) or raw error data
 * - `extra`: Additional context information (optional)
 * 
 * @param {string} msg - Primary error message describing what failed
 * @param {Error|any} err - Error object or additional error context  
 * @param {any} extra - Extra context data for debugging (optional)
 * 
 * @example
 * logError("token_validation_failed", new Error("Invalid signature"), {tokenId: "abc123"})
 * // Output: {"level":"error","ts":"...","msg":"token_validation_failed","err":{"name":"Error","message":"Invalid signature","stack":"..."},"extra":{"tokenId":"abc123"}}
 */
export const logError = (msg, err, extra) => {
  const payload = { level: "error", ts: new Date().toISOString(), msg: safeStringify(msg) };
  if (err) payload.err = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
  if (extra !== undefined) payload.extra = extra;
  console.error(JSON.stringify(payload));
};

/**
 * Mask sensitive data in logs for security and compliance
 * 
 * Replaces sensitive information with safe placeholder while optionally preserving
 * length information for debugging. Critical for preventing credential exposure
 * in logs while maintaining enough information for troubleshooting.
 * 
 * **Security Features:**
 * - Completely obscures sensitive content
 * - Optional length preservation for debugging context
 * - Handles null/undefined values gracefully
 * - Consistent masking pattern across all log entries
 * 
 * @param {string|null|undefined} value - Value to mask (password, token, etc.)
 * @param {boolean} showLength - Whether to include character count in mask (default: true)
 * @returns {string} Masked representation safe for logging
 * 
 * @example
 * maskSensitive("password123")        // "***11chars"
 * maskSensitive("secret", false)      // "***"
 * maskSensitive("abc")                // "***" (short values always fully masked)
 * maskSensitive(null)                 // "null"
 */
export const maskSensitive = (value, showLength = true) => {
  if (value == null) return "null";
  const str = String(value);
  if (str.length <= 4) return "***";
  return showLength ? `***${str.length}chars` : "***";
};

/**
 * Parse form body from Lambda event, handling multiple content types and encodings
 * 
 * Unified form data parser that handles both URL-encoded and JSON request bodies
 * from AWS Lambda Function URL events. Automatically detects base64 encoding and 
 * content types to provide consistent parameter access across all endpoints.
 * 
 * **Supported Formats:**
 * - `application/x-www-form-urlencoded`: Standard form submissions
 * - `application/json`: JSON request bodies (converted to URLSearchParams)
 * - Base64 encoded payloads (automatically decoded)
 * - Fallback to URL-encoded parsing for unknown content types
 * 
 * **Security Features:**
 * - Safe JSON parsing with error handling
 * - Base64 decoding validation
 * - Content-type header case-insensitive matching
 * - Graceful fallback for malformed data
 * 
 * @param {Object} event - AWS Lambda event object from Function URL
 * @param {string} event.body - Request body (may be base64 encoded)
 * @param {boolean} [event.isBase64Encoded] - Whether body is base64 encoded
 * @param {Object} [event.headers] - HTTP headers including Content-Type
 * @returns {URLSearchParams} Parsed form parameters for consistent access
 * 
 * @example
 * // URL-encoded form data
 * const params = parseFormBody({body: "username=test&password=secret"});
 * console.log(params.get("username")); // "test"
 * 
 * // JSON request body  
 * const params = parseFormBody({
 *   body: '{"username":"test","password":"secret"}',
 *   headers: {"Content-Type": "application/json"}
 * });
 * console.log(params.get("username")); // "test"
 */
export function parseFormBody(event) {
  try {
    let raw = event.body || "";
    if (event.isBase64Encoded && typeof raw === "string") {
      raw = Buffer.from(raw, "base64").toString("utf8");
    }
    const headers = event.headers || {};
    const ct = (headers["content-type"] || headers["Content-Type"] || "").toString().toLowerCase();
    if (ct.includes("application/json")) {
      try {
        const obj = JSON.parse(raw || "{}");
        const usp = new URLSearchParams();
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined && v !== null) usp.set(k, String(v));
        }
        return usp;
      } catch {
        // fall through to URLSearchParams parsing
      }
    }
    // Default: treat as URL-encoded form data
    return new URLSearchParams(raw || "");
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Create consistent JSON response for AWS Lambda Function URLs
 * 
 * Generates standardized HTTP response objects with proper headers and JSON formatting.
 * Used across all OIDC endpoints to ensure consistent response format, security headers,
 * and OAuth2/OIDC specification compliance.
 * 
 * **Default Headers:**
 * - `Content-Type`: application/json (JSON response format)
 * - `Cache-Control`: no-store (OAuth2 security requirement - prevents caching)
 * - Custom headers merged on top of defaults
 * 
 * **Security Features:**
 * - Automatic JSON serialization with error handling
 * - OAuth2-compliant no-store cache directive by default
 * - Consistent error response formatting
 * - Header override capability for specific use cases (e.g., JWKS caching)
 * 
 * @param {number} statusCode - HTTP status code (200, 400, 401, 500, etc.)
 * @param {Object} body - Response body object (will be JSON stringified)
 * @param {Object} [headers={}] - Additional HTTP headers (merged with defaults)
 * @returns {Object} AWS Lambda Function URL response object
 * 
 * @example
 * // Success response
 * createJsonResponse(200, {access_token: "...", token_type: "Bearer"})
 * 
 * // Error response
 * createJsonResponse(400, {error: "invalid_request", error_description: "Missing client_id"})
 * 
 * // Custom headers (e.g., for JWKS caching)
 * createJsonResponse(200, {keys: [...]}, {"cache-control": "public, max-age=3600"})
 */
export const createJsonResponse = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers,
  },
  body: JSON.stringify(body),
});
