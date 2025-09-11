import { createOidcHandler, createOidcResponse, createOidcError } from "../lib/oidc-handler.mjs";
import { createUserinfoResponse } from "../lib/jwt-ops.mjs";
import { log } from "../lib/utils.mjs";

/**
 * Business logic for userinfo endpoint
 * @param {Object} context - Handler context
 * @param {Object} context.params - Request parameters including authToken
 * @returns {Promise<Object>} Userinfo response
 */
const userinfoBusinessLogic = async ({ params }) => {
  log("userinfo_request");

  const userInfo = await createUserinfoResponse(params.authToken);

  if (!userInfo) {
    return createOidcError("invalid_token", "Access token is invalid or expired", 401);
  }

  return createOidcResponse(userInfo, {}, { userInfoProvided: true });
};

/**
 * OIDC UserInfo endpoint handler
 * Returns user information based on the provided access token
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.headers - Request headers
 * @param {string} event.headers.authorization - Bearer token authorization header
 * @returns {Promise<Object>} Lambda response object with user info or error
 */
export const handler = createOidcHandler(
  {
    name: "userinfo",
    requireAuth: true,
    paramExtractor: () => ({}), // Auth token extracted by handler factory
  },
  userinfoBusinessLogic,
);
