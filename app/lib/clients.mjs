/**
 * OAuth 2.0 / OpenID Connect Client Registry and Validation
 * 
 * This module manages client configurations and provides validation functions
 * for OAuth 2.0 and OIDC authentication flows. In production deployments,
 * client configurations could be stored in DynamoDB or external configuration.
 * 
 * Security Considerations:
 * - All clients use PKCE for enhanced security
 * - Public clients (no client_secret) only for trusted applications
 * - Redirect URI validation prevents authorization code interception
 * - Scope validation ensures clients only access permitted resources
 * 
 * Client Types:
 * - Public clients: No client_secret, rely on PKCE and redirect URI validation
 * - Confidential clients: Have client_secret for additional authentication
 */

import { log } from "./utils.mjs";

/**
 * Get the base URL for self-client redirects
 * Used for the built-in test client that allows direct OIDC provider testing
 * 
 * @returns {string} Base URL for redirect URI generation
 */
const getSelfClientBaseUrl = () => {
  return process.env.BASE_URL || "http://localhost:8080";
};

/**
 * OAuth 2.0 Client Registry
 * 
 * Each client must define:
 * - redirectUris: Array of allowed redirect URIs (exact match required)
 * - grantTypes: Supported OAuth 2.0 grant types
 * - scopes: Allowed OAuth 2.0/OIDC scopes  
 * - pkceRequired: Whether PKCE is required for this client
 * - clientSecret: Secret for confidential clients (null for public clients)
 * 
 * Dynamic Properties:
 * - redirectUris can be computed dynamically based on environment
 * - Supports localhost development and production domains
 */
export const clients = {
  /**
   * Production client for submit.diyaccounting.co.uk integration
   * 
   * This client configuration supports:
   * - Local development (localhost:3000)
   * - Ngrok tunnels for development testing
   * - CI environment (ci.submit.diyaccounting.co.uk)  
   * - Production environment (submit.diyaccounting.co.uk)
   */
  "submit-diyaccounting-co-uk": {
    get redirectUris() {
      return [
        `http://localhost:3000/auth/loginWithAntonyccCallback.html`,
        `https://wanted-finally-anteater.ngrok-free.app/auth/loginWithAntonyccCallback.html`,
        `https://ci.submit.diyaccounting.co.uk/auth/loginWithAntonyccCallback.html`,
        `https://submit.diyaccounting.co.uk/auth/loginWithAntonyccCallback.html`,
      ];
    },
    grantTypes: ["authorization_code"],
    scopes: ["openid", "email", "profile"],
    pkceRequired: true,
    clientSecret: null,
  },
  /**
   * Self-testing client for OIDC provider validation
   * 
   * This client enables direct testing of the OIDC provider without
   * external client applications. Redirect URIs are dynamically computed
   * based on the deployment environment to support:
   * - Production: https://oidc.antonycc.com/post-auth.html
   * - CI: https://ci.oidc.antonycc.com/post-auth.html  
   * - Development: http://localhost:3000/post-auth.html
   * 
   * Security: Uses PKCE and origin-restricted redirects for protection
   */
  "self-client": {
    // Client for direct login form testing - allows any redirect URI to the same origin
    get redirectUris() {
      // Get base URL from environment, fallback to localhost for development
      const baseUrl = process.env.BASE_URL || process.env.ISSUER || "http://localhost:3000";
      const url = new URL(baseUrl);
      return [`${url.origin}/post-auth.html`, `${url.origin}/callback.html`, `${url.origin}/login-callback.html`];
    },
    grantTypes: ["authorization_code"],
    scopes: ["openid", "email", "profile"],
    pkceRequired: true,
    // No client secret for public client used in testing
    clientSecret: null,
  },
};

/**
 * Get client configuration by client_id
 * @param {string} clientId - The client identifier
 * @returns {object|null} Client configuration or null if not found
 */
export function getClient(clientId) {
  // Check for exact match in registry
  const client = clients[clientId] || null;
  if (client) {
    log("client_found", clientId);
  } else {
    log("client_not_found", clientId);
  }
  return client;
}

export function isValidRedirectUri(client, redirectUri) {
  if (!client || !redirectUri) return false;
  try {
    const u = new URL(redirectUri);
    return client.redirectPattern?.test(u.toString()) === true;
  } catch {
    return false;
  }
}

/**
 * Validate if a redirect URI is allowed for a client
 * @param {string} clientId - The client identifier
 * @param {string} redirectUri - The redirect URI to validate
 * @returns {boolean} True if redirect URI is allowed
 */
export function validateRedirectUri(clientId, redirectUri) {
  const client = getClient(clientId);
  if (!client) {
    log("redirect_validation_failed", "client_not_found", clientId);
    return false;
  }

  const isValid = client.redirectUris.includes(redirectUri);
  log("redirect_validation in ", client.redirectUris, clientId, redirectUri, isValid ? "valid" : "invalid");
  return isValid;
}

/**
 * Validate if requested scopes are allowed for a client
 * @param {string} clientId - The client identifier
 * @param {string} scopes - Space-separated scopes
 * @returns {boolean} True if all requested scopes are allowed
 */
export function validateScopes(clientId, scopes) {
  const client = getClient(clientId);
  if (!client) {
    log("scope_validation_failed", "client_not_found", clientId);
    return false;
  }

  const requestedScopes = scopes.split(" ");
  const allowedScopes = client.scopes;
  const allValid = requestedScopes.every((scope) => allowedScopes.includes(scope));

  log("scope_validation", clientId, scopes, allValid ? "valid" : "invalid");
  return allValid;
}

export function isScopeSubset(client, requestedScopeStr) {
  if (!client) return false;
  const requested = new Set((requestedScopeStr || "").split(/\s+/).filter(Boolean));
  for (const s of requested) if (!client.scopes.includes(s)) return false;
  return requested.size > 0 && requested.has("openid");
}

/**
 * Check if PKCE is required for a client
 * @param {string} clientId - The client identifier
 * @returns {boolean} True if PKCE is required
 */
export function isPkceRequired(clientId) {
  const client = getClient(clientId);
  return client ? client.pkceRequired : false;
}

/**
 * Validate client authentication (for future use if client secrets are added)
 * @param {string} clientId - The client identifier
 * @param {string|null} clientSecret - The client secret (if any)
 * @returns {boolean} True if authentication is valid
 */
export function validateClientAuth(clientId, clientSecret = null) {
  const client = getClient(clientId);
  if (!client) {
    log("client_auth_failed", "client_not_found", clientId);
    return false;
  }

  // For public clients (like Cognito), no secret is required
  if (client.clientSecret === null && clientSecret === null) {
    log("client_auth_success", "public_client", clientId);
    return true;
  }

  // For confidential clients, secret must match
  const isValid = client.clientSecret === clientSecret;
  log("client_auth", clientId, isValid ? "success" : "failed");
  return isValid;
}
