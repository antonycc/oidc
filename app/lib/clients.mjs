// Client registry for OIDC provider
// In production, this could be stored in DynamoDB or another data store

const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.join(" ") }));

export const clients = {
  "cognito-web": {
    // This will be replaced with actual Cognito domain during deployment
    redirectUris: [
      "https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"
    ],
    grantTypes: ["authorization_code"],
    scopes: ["openid", "email", "profile"],
    pkceRequired: true,
    // No client secret for public client (Cognito doesn't send one by default)
    clientSecret: null
  }
};

/**
 * Get client configuration by client_id
 * @param {string} clientId - The client identifier
 * @returns {object|null} Client configuration or null if not found
 */
export function getClient(clientId) {
  const client = clients[clientId] || null;
  if (client) {
    log("client_found", clientId);
  } else {
    log("client_not_found", clientId);
  }
  return client;
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
  log("redirect_validation", clientId, redirectUri, isValid ? "valid" : "invalid");
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
  const allValid = requestedScopes.every(scope => allowedScopes.includes(scope));
  
  log("scope_validation", clientId, scopes, allValid ? "valid" : "invalid");
  return allValid;
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