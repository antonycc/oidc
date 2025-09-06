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
