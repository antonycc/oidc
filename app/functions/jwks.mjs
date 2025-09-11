import { publicJwks } from "../lib/crypto.mjs";
import { createOidcHandler, createOidcResponse } from "../lib/oidc-handler.mjs";
import { log } from "../lib/utils.mjs";

/**
 * Business logic for JWKS endpoint
 * @param {Object} context - Handler context
 * @returns {Promise<Object>} JWKS response
 */
const jwksBusinessLogic = async () => {
  log("jwks_request");

  // Get the current public keys
  const jwks = await publicJwks();

  return createOidcResponse(
    jwks,
    {
      "cache-control": "public, max-age=3600", // Cache for 1 hour since keys are stable
    },
    { jwksProvided: true },
  );
};

/**
 * OIDC JWKS (JSON Web Key Set) endpoint handler
 * Returns the public keys used for token verification
 *
 * @param {Object} event - Lambda event object (unused for JWKS)
 * @returns {Promise<Object>} Lambda response object with JWKS or error
 */
export const handler = createOidcHandler(
  {
    name: "jwks",
    paramExtractor: () => ({}), // No parameters needed for JWKS
  },
  jwksBusinessLogic,
);
