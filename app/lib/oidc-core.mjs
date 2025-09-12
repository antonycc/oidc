/**
 * OIDC Core Operations - Consolidated OIDC functionality
 * Combines crypto, JWT, auth flow, and token flow into a unified interface
 */
import { publicJwks, generateKeyPair, sign, verify } from "./crypto.mjs";
import { createTokenPair, createUserinfoResponse, verifyToken } from "./jwt-ops.mjs";
import { processAuthorizationRequest } from "./auth-flow.mjs";
import { processTokenRequest } from "./token-flow.mjs";
import { success, failure, processResult } from "./result-patterns.mjs";
import { pipe, safeGet, isNotNil, retry } from "./functional.mjs";
import { log } from "./utils.mjs";

/**
 * Core OIDC operations interface
 */
export class OidcCore {
  /**
   * Get public keys for token verification
   * @returns {Promise<Object>} JWKS object
   */
  static async getPublicKeys() {
    return retry(() => publicJwks(), { retries: 2 });
  }

  /**
   * Process authorization request with full validation
   * @param {Object} params - Authorization parameters
   * @returns {Promise<Object>} Authorization result
   */
  static async authorize(params) {
    log("oidc_core_authorize_start", params.client_id);
    return processResult(await processAuthorizationRequest(params));
  }

  /**
   * Process token exchange request with full validation
   * @param {Object} params - Token request parameters
   * @returns {Promise<Object>} Token result
   */
  static async exchangeToken(params) {
    log("oidc_core_token_start", params.client_id);
    return processResult(await processTokenRequest(params));
  }

  /**
   * Get user information from access token
   * @param {string} accessToken - Access token
   * @returns {Promise<Object|null>} User info or null if invalid
   */
  static async getUserInfo(accessToken) {
    log("oidc_core_userinfo_start");
    return createUserinfoResponse(accessToken);
  }

  /**
   * Verify and decode a JWT token
   * @param {string} token - JWT token
   * @param {string} [type='access'] - Token type (access, id, refresh)
   * @returns {Promise<Object|null>} Decoded token or null if invalid
   */
  static async verifyToken(token, type = 'access') {
    log("oidc_core_verify_start", type);
    return verifyToken(token, type);
  }

  /**
   * Create a new key pair (for key rotation)
   * @returns {Promise<Object>} Key pair result
   */
  static async rotateKeys() {
    log("oidc_core_rotate_keys_start");
    return retry(() => generateKeyPair(), { retries: 2 });
  }
}

/**
 * High-level OIDC flow operations
 */
export const oidcFlows = {
  /**
   * Complete authorization code flow
   * @param {Object} params - Flow parameters
   * @returns {Promise<Object>} Flow result
   */
  authorizationCode: async (params) => {
    log("flow_authorization_code_start", safeGet(['client_id'], '', params));
    return OidcCore.authorize(params);
  },

  /**
   * Complete token exchange flow
   * @param {Object} params - Flow parameters
   * @returns {Promise<Object>} Flow result
   */
  tokenExchange: async (params) => {
    log("flow_token_exchange_start", safeGet(['client_id'], '', params));
    return OidcCore.exchangeToken(params);
  },

  /**
   * Complete userinfo flow
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} Flow result
   */
  userInfo: async (accessToken) => {
    log("flow_userinfo_start");
    const userInfo = await OidcCore.getUserInfo(accessToken);
    return userInfo;
  },

  /**
   * JWKS retrieval flow
   * @returns {Promise<Object>} Flow result
   */
  jwks: async () => {
    log("flow_jwks_start");
    const jwks = await OidcCore.getPublicKeys();
    return jwks;
  }
};

/**
 * OIDC endpoint handlers factory
 * Creates standardized handlers for OIDC endpoints
 */
export const createOidcEndpoints = () => ({
  /**
   * Authorization endpoint handler
   * @param {Object} params - Authorization parameters
   * @returns {Promise<Object>} Authorization response
   */
  authorize: (params) => oidcFlows.authorizationCode(params),

  /**
   * Token endpoint handler
   * @param {Object} params - Token parameters
   * @returns {Promise<Object>} Token response
   */
  token: (params) => oidcFlows.tokenExchange(params),

  /**
   * UserInfo endpoint handler
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} UserInfo response
   */
  userinfo: (accessToken) => oidcFlows.userInfo(accessToken),

  /**
   * JWKS endpoint handler
   * @returns {Promise<Object>} JWKS response
   */
  jwks: () => oidcFlows.jwks()
});

// Export singleton instance
export const oidc = createOidcEndpoints();