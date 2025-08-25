Below is a structured gap / validation checklist plus likely adjustments to ensure seamless Cognito ↔ custom OIDC flow. Apply each item; if already satisfied, no change needed.

## Required end‑to‑end contract (Cognito as OIDC client)
\- Issuer: Exact string (no accidental trailing slash differences) must match `issuer` in `/.well-known/openid-configuration` and the Cognito IdP configuration.  
\- Endpoints exposed over HTTPS: `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`.  
\- Redirect URI: Must exactly equal `https://<your-cognito-domain>/oauth2/idpresponse` and be accepted by your authorization handler for client `cognito-web`.  
\- Client auth: If Cognito IdP config omits client secret, token endpoint must allow public client (no auth). If secret configured, you must support `client_secret_basic` (HTTP Basic) and advertise it in discovery `token_endpoint_auth_methods_supported`.  
\- Response type: Cognito will use `code`. Discovery must include `"response_types_supported": ["code"]`.  
\- Scopes: At minimum `openid` (plus `email`, `profile` if you expect Cognito to request them).  
\- Nonce: Cognito often sends `nonce`; you MUST echo it into ID Token `nonce` claim.  
\- State: Echo unchanged on redirect.  
\- PKCE: Cognito may (currently can) send `code_challenge` with `S256`; support validating it (store challenge in auth code record, verify `code_verifier` at token exchange). If you skip this and Cognito sends PKCE you will get `invalid_grant`.  
\- ID Token: Must include `iss`, `sub`, `aud` (value = configured `client_id` in Cognito IdP settings, i.e. `cognito-web`), `exp`, `iat`, `nonce` (if provided), and any requested standard claims you can supply. Signing algorithm should be `RS256`.  
\- JWKS: Public key(s) published; `kid` in JWT header must match a key. Provide stable key or rotation logic keeping previous key until all issued tokens expired.  
\- UserInfo: Accept `Authorization: Bearer <access_token>`; validate token; return claims consistent with `scope`.  
\- Error format: Use RFC 6749 / OpenID errors (`invalid_request`, `invalid_client`, `invalid_grant`).

## Discovery document (`well-known/openid-configuration`) checklist
\- Contains: `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`.  
\- Arrays: `response_types_supported`, `grant_types_supported` (include `authorization_code`), `scopes_supported`, `subject_types_supported` (usually `["public"]`), `id_token_signing_alg_values_supported` (include `RS256`), `token_endpoint_auth_methods_supported` (match your implementation).  
\- If you support PKCE: add `code_challenge_methods_supported: ["S256"]`. Missing this while receiving PKCE from Cognito can cause mismatch.

## Authorization code storage (DynamoDB)
Each code record should include: `code`, `client_id`, `redirect_uri`, `user_sub`, `scopes`, `nonce`, `code_challenge`, `code_challenge_method`, `expires_at`, `used` flag. Enforce one‑time use atomically (conditional update). TTL on table helps cleanup.

## Token endpoint
Validation sequence (hard fail early, consistent logging):
1. Authenticate client (if secret).
2. Check `grant_type=authorization_code`.
3. Lookup code; verify not expired or used; match `client_id`, `redirect_uri`.
4. If PKCE: verify `code_verifier`.
5. Mark code used (conditional put/update).
6. Issue access token (JWT or opaque). If opaque, you need a lookup table for UserInfo.
7. Issue ID Token with required claims; sign with private key; correct `aud`.
8. Return JSON; do NOT include `refresh_token` unless you implement refresh flow (Cognito generally only needs ID & access tokens).

## UserInfo endpoint
\- Accept only valid access token.  
\- Return at least `sub`.  
\- Include `email`, `email_verified`, `name` only if scope requested.  
\- Avoid leaking unrequested claims.

## Client registry
You stated only a constant string at stack level. Ensure runtime validation actually happens (otherwise any `client_id` works = insecure). Minimal addition (if not present):

```javascript
// JavaScript
// File: app/functions/clients.mjs
export const clients = {
  "cognito-web": {
    redirectUris: [
      // Exact Hosted UI return path
      "https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"
    ],
    grantTypes: ["authorization_code"],
    scopes: ["openid", "email", "profile"],
    pkceRequired: true
  }
};

export function getClient(id) { return clients[id] || null; }
```

Integrate in `authorize` and `token` to enforce: existence, redirect URI match, scope subset, PKCE if required.

## Logging (per instructions)
Verify each handler logs: entry, sanitized inputs (no secrets, no full tokens), decision points, DynamoDB calls (success/failure), exit. Ensure you mask tokens except header.kid maybe.

## Security
\- Ensure no wildcard CORS on auth & token endpoints (not needed; they are server redirects/posts).  
\- IAM least privilege: Lambdas only allowed to their specific DynamoDB tables + KMS (if used for key material).  
\- Key management: If generating RSA keypair at deploy, store private key (e.g. AWS Secrets Manager or SSM Parameter with encryption) not in code. Publish only public JWKS.

## CDK (expected for `OidcProviderStack`)
Check:  
\- Custom domain + ACM cert matching issuer host.  
\- CloudFront (or direct Function URLs) ensures HTTPS and correct origin auth (OAC / IAM).  
\- Environment variables for table names, key IDs, LOG_LEVEL.  
\- RemovalPolicy DESTROY only in non‑prod.  
\- Outputs: Issuer URL to feed into `CognitoStack`.

## CognitoStack
Validate:  
\- User Pool domain created before referencing it in redirect URI (ordering).  
\- OIDC Identity Provider created with `client_id` = `cognito-web`, `client_secret` absent/present matching token endpoint capability.  
\- Attribute mapping from IdP claims to Cognito attributes (e.g. `email`).  
\- User Pool Client allowed identity providers includes the OIDC provider, has `oauth 2.0` code grant enabled, and callback URLs include your application (not the IdP redirect).  
\- If you expect `profile`/`email` ensure those scopes requested in Hosted UI config or query string.

## Potential pitfalls (adjust if present)
\- Discovery missing `grant_types_supported` or `token_endpoint_auth_methods_supported`.  
\- ID Token `aud` incorrectly set to something other than `cognito-web`.  
\- Not persisting and echoing `nonce`.  
\- No PKCE validation while Cognito sends `code_challenge` (results in 400 from your side or security gap).  
\- Authorization code reusable (race condition). Use conditional update.  
\- JWKS single key rotated without overlap causes verification failures.  
\- Mismatch of domain: CloudFront distribution host vs. issuer value (leading to token audience/issuer mismatch errors inside Cognito).  
\- Clock skew: Lambda time vs Cognito; keep `iat` near actual, `exp` reasonable (e.g. 5–10 min for ID token).

## Minimal changes likely needed (if absent)
\- Add runtime client registry & validation.  
\- Implement / validate PKCE.  
\- Ensure nonce pass-through.  
\- Harden code one‑time use.  
\- Expand discovery document completeness.  
\- Confirm ID Token claims & signing algorithm RS256.

If all above already satisfied, no further changes required for seamless integration.

Summary: Validate each checklist item; implement missing ones (especially client validation, PKCE, nonce, discovery completeness, one‑time codes, correct ID token claims). This ensures Cognito’s OIDC flow will complete without intermittent `invalid_request` / `invalid_grant` or token verification failures.