/**
 * OIDC Operations Suite - Ultra-high-level OIDC endpoint operations
 * Single entry point for all OIDC functionality with complete abstraction
 */
import { createOidcHandler, createOidcResponse, createOidcError } from "./oidc-handler.mjs";
import { authorizeRequestSchema, tokenRequestSchema } from "./validation.mjs";
import { oidc } from "./oidc-core.mjs";
import { log, maskSensitive } from "./utils.mjs";
import { pipe, safeGet } from "./functional.mjs";

/**
 * Ultra-abstracted OIDC endpoint operations
 * Each operation is a complete, self-contained OIDC endpoint handler
 */
export const oidcOps = {
  /**
   * Complete authorization endpoint operation
   * @param {Object} params - Authorization parameters
   * @param {string} method - HTTP method
   * @returns {Promise<Object>} Authorization response
   */
  authorize: async ({ params, method }) => {
    log("authorize_request_validated", method, {
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      scope: params.scope,
    });
    return oidc.authorize(params);
  },

  /**
   * Complete token endpoint operation
   * @param {Object} params - Token parameters
   * @returns {Promise<Object>} Token response
   */
  token: async (params) => {
    const { client_id, redirect_uri, code } = params;
    log("token_request_validated", client_id, redirect_uri, code ? `has_code: ${maskSensitive(code)}` : "no_code");
    return oidc.token(params);
  },

  /**
   * Complete userinfo endpoint operation
   * @param {string} authToken - Authorization token
   * @returns {Promise<Object>} UserInfo response
   */
  userinfo: async (authToken) => {
    log("userinfo_request");
    const userInfo = await oidc.userinfo(authToken);
    
    if (!userInfo) {
      return createOidcError("invalid_token", "Access token is invalid or expired", 401);
    }
    
    return createOidcResponse(userInfo, {}, { userInfoProvided: true });
  },

  /**
   * Complete JWKS endpoint operation
   * @returns {Promise<Object>} JWKS response
   */
  jwks: async () => {
    log("jwks_request");
    const jwks = await oidc.jwks();
    
    return createOidcResponse(
      jwks,
      { "cache-control": "public, max-age=3600" },
      { jwksProvided: true }
    );
  }
};

/**
 * Lambda handler factory for OIDC endpoints
 * Creates complete Lambda handlers with minimal configuration
 */
export const createOidcEndpointHandler = (operation, schema, config = {}) => {
  const handlerConfig = {
    name: operation,
    schema,
    ...config
  };

  return createOidcHandler(handlerConfig, ({ params, method }) => {
    switch (operation) {
      case 'authorize':
        return oidcOps.authorize({ params, method });
      case 'token':
        return oidcOps.token(params);
      case 'userinfo':
        return oidcOps.userinfo(params.authToken);
      case 'jwks':
        return oidcOps.jwks();
      default:
        throw new Error(`Unknown OIDC operation: ${operation}`);
    }
  });
};

/**
 * Pre-configured OIDC endpoint handlers
 * Ready-to-use Lambda handlers for all OIDC endpoints
 */
export const oidcHandlers = {
  /**
   * Authorization endpoint handler
   */
  authorize: createOidcEndpointHandler('authorize', authorizeRequestSchema),

  /**
   * Token endpoint handler
   */
  token: createOidcEndpointHandler('token', tokenRequestSchema, { 
    method: 'POST' 
  }),

  /**
   * UserInfo endpoint handler
   */
  userinfo: createOidcEndpointHandler('userinfo', null, { 
    requireAuth: true,
    paramExtractor: () => ({})
  }),

  /**
   * JWKS endpoint handler
   */
  jwks: createOidcEndpointHandler('jwks', null, {
    paramExtractor: () => ({})
  })
};