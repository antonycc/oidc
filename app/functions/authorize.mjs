import { createOidcHandler } from "../lib/oidc-handler.mjs";
import { authorizeRequestSchema } from "../lib/validation.mjs";
import { processAuthorizationRequest } from "../lib/auth-flow.mjs";
import { log } from "../lib/utils.mjs";

/**
 * Business logic for authorization endpoint
 * @param {Object} context - Handler context
 * @param {Object} context.params - Validated request parameters
 * @param {string} context.method - HTTP method
 * @returns {Promise<Object>} Authorization result
 */
const authorizeBusinessLogic = async ({ params, method }) => {
  log("authorize_request_validated", method, {
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    scope: params.scope,
  });

  // Process the complete authorization flow
  const result = await processAuthorizationRequest(params);

  if (!result.success) {
    return result.error;
  }

  return result.result;
};

/**
 * OIDC Authorization endpoint handler
 * Processes authorization requests and issues authorization codes
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.requestContext - Request context
 * @param {Object} event.requestContext.http - HTTP details
 * @param {string} event.requestContext.http.method - HTTP method
 * @param {string} event.rawPath - Request path
 * @param {string} event.rawQueryString - Query string
 * @param {string} event.body - Request body
 * @param {Object} event.headers - Request headers
 * @returns {Promise<Object>} Lambda response object with redirect or error
 */
export const handler = createOidcHandler(
  {
    name: "authorize",
    schema: authorizeRequestSchema,
  },
  authorizeBusinessLogic,
);
