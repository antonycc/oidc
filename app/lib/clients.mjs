// Client registry for OIDC provider
// In production, this could be stored in DynamoDB or another data store

import { log } from "./utils.mjs";

// Get the base URL for self-client redirects (for direct OP login flow)
const getSelfClientBaseUrl = () => {
  return process.env.BASE_URL || "http://localhost:8080";
};

// Load this from a yml file in the project root
export const clients = {
  "submit-diyaccounting-co-uk": {
    get redirectUris() {
      return [
        "http://localhost:3000/auth/loginWithAntonyccCallback.html",
        "https://wanted-finally-anteater.ngrok-free.app/auth/loginWithAntonyccCallback.html",
        "https://ci.submit.diyaccounting.co.uk/auth/loginWithAntonyccCallback.html",
        "https://ci.auth.submit.diyaccounting.co.uk/oauth2/idpresponse",
        "https://ci-lambdas2.submit.diyaccounting.co.uk/auth/loginWithAntonyccCallback.html",
        "https://ci-lambdas2.auth.submit.diyaccounting.co.uk/oauth2/idpresponse",
        "https://submit.diyaccounting.co.uk/auth/loginWithAntonyccCallback.html",
        "https://auth.submit.diyaccounting.co.uk/oauth2/idpresponse",
      ];
    },
    grantTypes: ["authorization_code"],
    scopes: ["openid", "email", "profile"],
    pkceRequired: false,
    clientSecret: null,
  },
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
  if (!client.clientSecret) {
    log("client_auth_success", "public_client", clientId);
    return true;
  }

  // For confidential clients, secret must match
  const isValid = client.clientSecret === clientSecret;
  log("client_auth", clientId, isValid ? "success" : "failed");
  return isValid;
}
