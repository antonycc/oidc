// Runtime client registry and validation utilities for the OIDC provider

export const clients = {
  "cognito-web": {
    grantTypes: ["authorization_code"],
    scopes: ["openid", "email", "profile"],
    pkceRequired: true,
    // Redirect URI must be the Cognito Hosted UI IdP response endpoint.
    // We validate by pattern to avoid hard-coding an environment-specific domain.
    // Pattern: https://<prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse
    redirectPattern: /^https:\/\/[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com\/oauth2\/idpresponse$/,
  },
};

export function getClient(id) {
  return clients[id] || null;
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

export function isScopeSubset(client, requestedScopeStr) {
  if (!client) return false;
  const requested = new Set((requestedScopeStr || "").split(/\s+/).filter(Boolean));
  for (const s of requested) if (!client.scopes.includes(s)) return false;
  return requested.size > 0 && requested.has("openid");
}
