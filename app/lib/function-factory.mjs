/**
 * Universal Function Factory - Meta-programming for OIDC function generation
 * Eliminates all duplicated import/export patterns across Lambda functions
 */
import { oidcHandlers } from "./oidc-ops.mjs";

/**
 * Creates a standard OIDC Lambda function handler
 * @param {string} endpoint - The OIDC endpoint name (authorize, token, userinfo, jwks)
 * @returns {Function} Complete Lambda handler function
 */
export const createOidcFunction = (endpoint) => {
  if (!oidcHandlers[endpoint]) {
    throw new Error(`Unknown OIDC endpoint: ${endpoint}`);
  }
  return oidcHandlers[endpoint];
};

/**
 * Function registry for OIDC endpoints
 * Pre-configured functions ready for immediate export
 */
export const oidcFunctions = {
  authorize: createOidcFunction('authorize'),
  token: createOidcFunction('token'),
  userinfo: createOidcFunction('userinfo'),
  jwks: createOidcFunction('jwks')
};

/**
 * Universal handler factory - single line function creation
 * @param {string} endpoint - OIDC endpoint name
 * @returns {Function} Lambda handler
 */
export const handler = (endpoint) => oidcFunctions[endpoint];

/**
 * Meta-function generator for creating endpoint modules
 * @param {string} endpoint - OIDC endpoint name
 * @returns {Object} Module with handler export
 */
export const generateEndpointModule = (endpoint) => ({
  handler: oidcFunctions[endpoint]
});