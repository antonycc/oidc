import { createOidcHandler } from "../lib/oidc-handler.mjs";
import { tokenRequestSchema } from "../lib/validation.mjs";
import { processTokenRequest } from "../lib/token-flow.mjs";
import { log, maskSensitive } from "../lib/utils.mjs";

/**
 * Business logic for token endpoint
 * @param {Object} context - Handler context
 * @param {Object} context.params - Validated request parameters
 * @returns {Promise<Object>} Token exchange result
 */
const tokenBusinessLogic = async ({ params }) => {
  const { client_id, redirect_uri, code } = params;

  log("token_request_validated", client_id, redirect_uri, code ? `has_code: ${maskSensitive(code)}` : "no_code");

  // Process the complete token exchange flow
  const result = await processTokenRequest(params);

  if (!result.success) {
    return result.error;
  }

  return result.result;
};

/**
 * OIDC Token endpoint handler
 * Exchanges authorization codes for access tokens and ID tokens
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.requestContext - Request context
 * @param {Object} event.requestContext.http - HTTP details
 * @param {string} event.requestContext.http.method - HTTP method
 * @param {string} event.body - Request body containing token request parameters
 * @returns {Promise<Object>} Lambda response object with tokens or error
 */
export const handler = createOidcHandler(
  {
    name: "token",
    method: "POST",
    schema: tokenRequestSchema,
  },
  tokenBusinessLogic,
);
