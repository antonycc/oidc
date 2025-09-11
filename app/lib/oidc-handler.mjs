/**
 * OIDC Handler Factory
 * Provides a higher-order function that wraps Lambda handlers with common OIDC functionality
 * including request/response lifecycle, error handling, validation, and logging patterns.
 */
import { logRequestStart, logRequestEnd, logError, createJsonResponse, parseFormBody } from "./utils.mjs";
import { safeValidateParams } from "./validation.mjs";

/**
 * Configuration for handler behavior
 * @typedef {Object} HandlerConfig
 * @property {string} [method] - Required HTTP method (optional, defaults to any)
 * @property {import('zod').ZodSchema} [schema] - Validation schema for request parameters
 * @property {Function} [paramExtractor] - Function to extract parameters from event
 * @property {boolean} [requireAuth] - Whether authorization header is required
 */

/**
 * Default parameter extractor for query string and form body
 * @param {Object} event - Lambda event
 * @returns {Object} Combined parameters
 */
const defaultParamExtractor = (event) => {
  const url = new URL(event.rawPath + (event.rawQueryString ? "?" + event.rawQueryString : ""), "https://issuer");
  const qp = Object.fromEntries(url.searchParams.entries());

  // Parse form body and merge with query parameters
  const body = parseFormBody(event);
  for (const [k, v] of body.entries()) qp[k] = v;

  return qp;
};

/**
 * Creates an OIDC handler with common functionality
 * @param {HandlerConfig} config - Handler configuration
 * @param {Function} businessLogic - The main business logic function
 * @returns {Function} Lambda handler function
 */
export const createOidcHandler = (config, businessLogic) => {
  return async (event) => {
    const method = event.requestContext?.http?.method || "GET";
    const path = event.rawPath || "/unknown";
    const correlationId = logRequestStart(method, path);

    try {
      // Method validation if specified
      if (config.method && method !== config.method) {
        logRequestEnd(405, { error: "method_not_allowed" });
        return createJsonResponse(405, { error: "method_not_allowed" });
      }

      // Parameter extraction
      const paramExtractor = config.paramExtractor || defaultParamExtractor;
      const rawParams = paramExtractor(event);

      // Parameter validation if schema provided
      let params = rawParams;
      if (config.schema) {
        const validation = safeValidateParams(rawParams, config.schema);
        if (!validation.success) {
          logError("parameter_validation_failed", null, {
            errors: validation.errors,
            correlationId,
          });
          logRequestEnd(400, { error: "invalid_request" });
          return createJsonResponse(400, {
            error: "invalid_request",
            error_description: `Parameter validation failed: ${validation.errors.join(", ")}`,
          });
        }
        params = validation.data;
      }

      // Authorization check if required
      if (config.requireAuth) {
        const authHeader = event?.headers?.authorization || event?.headers?.Authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          logError("missing_authorization_header", null, { correlationId });
          logRequestEnd(401, { error: "invalid_request" });
          return createJsonResponse(401, {
            error: "invalid_request",
            error_description: "Missing or invalid Authorization header",
          });
        }
        params.authToken = authHeader.slice("Bearer ".length);
      }

      // Execute business logic
      const result = await businessLogic({
        params,
        event,
        correlationId,
        method,
        path,
      });

      // Handle business logic response
      if (result.redirect) {
        logRequestEnd(302, { redirect: true });
        return {
          statusCode: 302,
          headers: { Location: result.location },
          body: "",
        };
      }

      logRequestEnd(result.statusCode || 200, result.logData || {});
      return createJsonResponse(result.statusCode || 200, result.body, result.headers);
    } catch (e) {
      logError(`${config.name || "handler"}_error`, e, { correlationId });
      logRequestEnd(500, { error: "server_error" });
      return createJsonResponse(500, { error: "server_error" });
    }
  };
};

/**
 * Factory for creating OIDC error responses with consistent patterns
 * @param {string} error - Error code
 * @param {string} [description] - Error description
 * @param {number} [statusCode=400] - HTTP status code
 * @returns {Object} Error response object
 */
export const createOidcError = (error, description, statusCode = 400) => {
  return {
    statusCode,
    body: {
      error,
      ...(description && { error_description: description }),
    },
  };
};

/**
 * Factory for creating OIDC redirect responses
 * @param {string} location - Redirect URL
 * @returns {Object} Redirect response object
 */
export const createOidcRedirect = (location) => {
  return {
    redirect: true,
    location,
  };
};

/**
 * Factory for creating OIDC success responses
 * @param {Object} body - Response body
 * @param {Object} [headers] - Additional headers
 * @param {Object} [logData] - Data to include in request end log
 * @returns {Object} Success response object
 */
export const createOidcResponse = (body, headers, logData) => {
  return {
    statusCode: 200,
    body,
    headers,
    logData,
  };
};
