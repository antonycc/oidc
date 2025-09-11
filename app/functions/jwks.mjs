import { publicJwks } from "../lib/crypto.mjs";
import { log, logError, logRequestStart, logRequestEnd, createJsonResponse } from "../lib/utils.mjs";

/**
 * OIDC JWKS (JSON Web Key Set) endpoint handler
 * Returns the public keys used for token verification
 *
 * @param {Object} event - Lambda event object (unused for JWKS)
 * @returns {Promise<Object>} Lambda response object with JWKS or error
 */
export const handler = async (event) => {
  const correlationId = logRequestStart(event.requestContext?.http?.method || "GET", event.rawPath || "/jwks");

  try {
    log("jwks_request");

    // Get the current public keys
    const jwks = await publicJwks();

    logRequestEnd(200, { jwksProvided: true });
    return createJsonResponse(200, jwks, {
      "cache-control": "public, max-age=3600", // Cache for 1 hour since keys are stable
    });
  } catch (e) {
    logError("jwks_handler_error", e, { correlationId });
    logRequestEnd(500, { error: "server_error" });
    return createJsonResponse(500, { error: "server_error" }, { "cache-control": "no-store" });
  }
};
