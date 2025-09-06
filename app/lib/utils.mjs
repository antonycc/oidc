/**
 * Common utility functions for OIDC provider
 * Provides consistent logging, error handling, and response patterns
 */

/**
 * Safe stringify function that handles errors and objects properly
 * @param {any} val - Value to stringify
 * @returns {string} Stringified value
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
 * @param {...any} a - Arguments to log
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
 * @param {string} msg - Error message
 * @param {Error|any} err - Error object or additional context
 * @param {any} extra - Extra context data
 */
export const logError = (msg, err, extra) => {
  const payload = { level: "error", ts: new Date().toISOString(), msg: safeStringify(msg) };
  if (err) payload.err = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
  if (extra !== undefined) payload.extra = extra;
  console.error(JSON.stringify(payload));
};

/**
 * Mask sensitive data in logs for security compliance
 * @param {string|null} value - Value to mask
 * @param {boolean} showLength - Whether to show the length
 * @returns {string} Masked value
 */
export const maskSensitive = (value, showLength = true) => {
  if (value == null) return "null";
  const str = String(value);
  if (str.length <= 4) return "***";
  return showLength ? `***${str.length}chars` : "***";
};

/**
 * Parse form body from Lambda event, handling both URL-encoded and JSON formats
 * @param {object} event - Lambda event object
 * @returns {URLSearchParams} Parsed form parameters
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
 * Create consistent JSON response
 * @param {number} statusCode - HTTP status code
 * @param {object} body - Response body object
 * @param {object} headers - Additional headers
 * @returns {object} Lambda response object
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

/**
 * Create error response with consistent format
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Error code or message
 * @returns {object} Lambda response object
 */
export const createErrorResponse = (statusCode, error) => ({
  statusCode,
  headers: { "content-type": "text/plain", "cache-control": "no-store" },
  body: error,
});

/**
 * Validate that required parameters are present
 * @param {object} params - Parameters object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @returns {string|null} Error message if validation fails, null if valid
 */
export const validateRequiredParams = (params, requiredFields) => {
  for (const field of requiredFields) {
    if (!params[field]) {
      return `missing ${field}`;
    }
  }
  return null;
};

/**
 * Validate HTTP method matches expected method
 * @param {object} event - Lambda event object
 * @param {string} expectedMethod - Expected HTTP method
 * @returns {boolean} True if method matches, false otherwise
 */
export const validateHttpMethod = (event, expectedMethod) => {
  const method = event.requestContext?.http?.method || "GET";
  return method === expectedMethod;
};

/**
 * Get HTTP method from event
 * @param {object} event - Lambda event object
 * @param {string} defaultMethod - Default method if not found
 * @returns {string} HTTP method
 */
export const getHttpMethod = (event, defaultMethod = "GET") => {
  return event.requestContext?.http?.method || defaultMethod;
};

/**
 * Environment configuration utilities
 * Provides centralized access to environment variables with defaults
 */
export const env = {
  /**
   * Get ISSUER environment variable
   * @param {string} defaultValue - Default value if not set
   * @returns {string} ISSUER value
   */
  getIssuer: (defaultValue = "http://localhost:3000") => process.env.ISSUER || defaultValue,
  
  /**
   * Get BASE_URL environment variable
   * @param {string} defaultValue - Default value if not set
   * @returns {string} BASE_URL value
   */
  getBaseUrl: (defaultValue = "http://localhost:3000") => process.env.BASE_URL || defaultValue,
  
  /**
   * Get USERS_TABLE environment variable
   * @returns {string|undefined} USERS_TABLE value
   */
  getUsersTable: () => process.env.USERS_TABLE,
  
  /**
   * Get CODES_TABLE environment variable
   * @returns {string|undefined} CODES_TABLE value
   */
  getCodesTable: () => process.env.CODES_TABLE,
  
  /**
   * Get REFRESH_TABLE environment variable
   * @returns {string|undefined} REFRESH_TABLE value
   */
  getRefreshTable: () => process.env.REFRESH_TABLE,
  
  /**
   * Check if environment variable is set and truthy
   * @param {string} name - Environment variable name
   * @returns {boolean} True if set and truthy
   */
  has: (name) => Boolean(process.env[name]),
};
