/**
 * Enhanced logging and utility functions for OIDC provider
 * Provides consistent logging, error handling, correlation IDs, and response patterns
 */
import { ulid } from "ulid";
import { time } from "./time.mjs";

// Request context storage for correlation IDs
const requestContext = new Map();

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
 * Generate a correlation ID for request tracking
 * @returns {string} Unique correlation ID
 */
export const generateCorrelationId = () => ulid();

/**
 * Set correlation ID for current request context
 * @param {string} correlationId - Correlation ID to set
 */
export const setCorrelationId = (correlationId) => {
  requestContext.set("correlationId", correlationId);
};

/**
 * Get current correlation ID
 * @returns {string|null} Current correlation ID or null
 */
export const getCorrelationId = () => {
  return requestContext.get("correlationId") || null;
};

/**
 * Enhanced structured logging function with correlation ID and metadata
 * @param {string} event - Event name/type
 * @param {...any} args - Additional arguments to log
 */
export const log = (event, ...args) => {
  const correlationId = getCorrelationId();
  const payload = {
    level: "info",
    ts: time.nowIso(),
    event,
    msg: args.map(safeStringify).join(" "),
  };

  if (correlationId) {
    payload.correlationId = correlationId;
  }

  console.log(JSON.stringify(payload));
};

/**
 * Enhanced structured error logging function
 * @param {string} event - Error event name
 * @param {Error|any} err - Error object or additional context
 * @param {Object} metadata - Additional metadata
 */
export const logError = (event, err, metadata = {}) => {
  const correlationId = getCorrelationId();
  const payload = {
    level: "error",
    ts: time.nowIso(),
    event,
    ...metadata,
  };

  if (correlationId) {
    payload.correlationId = correlationId;
  }

  if (err) {
    if (err instanceof Error) {
      payload.error = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
    } else {
      payload.error = err;
    }
  }

  console.error(JSON.stringify(payload));
};

/**
 * Log with additional metadata
 * @param {string} event - Event name
 * @param {Object} metadata - Structured metadata
 * @param {...any} args - Additional arguments
 */
export const logWithMetadata = (event, metadata = {}, ...args) => {
  const correlationId = getCorrelationId();
  const payload = {
    level: "info",
    ts: time.nowIso(),
    event,
    ...metadata,
  };

  if (args.length > 0) {
    payload.msg = args.map(safeStringify).join(" ");
  }

  if (correlationId) {
    payload.correlationId = correlationId;
  }

  console.log(JSON.stringify(payload));
};

/**
 * Log request start with automatic correlation ID
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {Object} metadata - Additional metadata
 * @returns {string} Generated correlation ID
 */
export const logRequestStart = (method, path, metadata = {}) => {
  const correlationId = generateCorrelationId();
  setCorrelationId(correlationId);

  logWithMetadata("request_start", {
    method,
    path,
    correlationId,
    ...metadata,
  });

  return correlationId;
};

/**
 * Log request end
 * @param {number} statusCode - Response status code
 * @param {Object} metadata - Additional metadata
 */
export const logRequestEnd = (statusCode, metadata = {}) => {
  const correlationId = getCorrelationId();

  logWithMetadata("request_end", {
    statusCode,
    correlationId,
    ...metadata,
  });

  // Clean up request context
  requestContext.delete("correlationId");
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
