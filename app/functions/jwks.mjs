import { publicJwks } from "../lib/crypto.mjs";
import { log, logError, createJsonResponse } from "../lib/utils.mjs";

/**
 * OIDC JWKS (JSON Web Key Set) endpoint handler
 * Returns the public keys used for token verification
 *
 * @param {Object} event - Lambda event object (unused for JWKS)
 * @returns {Promise<Object>} Lambda response object with JWKS or error
 */
export const handler = async (event) => {
  try {
    log("jwks_request");

    // Get the current public keys
    const jwks = await publicJwks();

    return createJsonResponse(200, jwks, {
      "cache-control": "public, max-age=3600", // Cache for 1 hour since keys are stable
    });
  } catch (e) {
    logError("jwks_error", e);
    return createJsonResponse(500, { error: "server_error" }, { "cache-control": "no-store" });
  }
};
