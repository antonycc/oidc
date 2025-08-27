1. **Review the code for duplications and add simple abstraction sin the form of helpers.**

2. **Standardise auth‑code record fields and update usage flag.**

   * **Why:** The checklist expects an `expires_at` field and a `used` flag updated atomically.  The implementation uses `ttl` and deletes the record entirely.
   * **How:** Either (a) document that TTL and conditional deletion fulfil the same purpose, or (b) change the code record to include `expires_at` (UNIX timestamp) and update the `used` flag via `conditionalUpdate` so the record remains but cannot be reused.  Adjust tests accordingly.

3. **Support confidential clients if needed.**

   * **Why:** Should the Cognito IdP ever be configured with a client secret, the token endpoint must support `client_secret_basic` and advertise it in discovery.
   * **How:** Modify the token handler to accept HTTP Basic credentials in the `Authorization` header and parse them into `client_id`/`client_secret`.  Extend `validateClientAuth` to check for `client_secret_basic`.  Update the discovery document to include `"client_secret_basic"` in `token_endpoint_auth_methods_supported`.  Add a confidential client to the registry with a `clientSecret`.

4. **Store private key securely.**

   * **Why:** The private RSA key is persisted in the Dynamo `codes` table.  A managed secrets service (AWS Secrets Manager or SSM Parameter Store with KMS encryption) provides better isolation and rotation options.
   * **How:** On startup, read the JWK from Secrets Manager; if absent, generate a new key and store it encrypted.  Update `crypto.mjs` to use the secrets API instead of Dynamo.  Adjust IAM permissions accordingly.

5. **Differentiate destruction policies by environment.**

   * **Why:** All Dynamo tables currently use `RemovalPolicy.DESTROY`.  In production, this risks data loss.
   * **How:** In the CDK stack, conditionally set `RemovalPolicy.RETAIN` when `envName` indicates a production environment; use `DESTROY` only for non‑production.  Also consider point‑in‑time recovery for DynamoDB.

6. **Add/expand tests to cover untested scenarios.**
   Specific tests to add (Vitest for functions; Playwright or k6 for flow):

   * **Valid PKCE flow:** Simulate an authorization request with a valid `code_challenge`/`code_verifier`; then exchange the code and assert that `id_token` includes `iss`, `sub`, `aud` (=`cognito-web`), `nonce` and the requested claims.  Use the JWK to verify the signature.
   * **Invalid verifier / challenge:** Ensure that mismatched `code_verifier` yields `invalid_grant`.
   * **Nonce echo:** Send a `nonce` value in `/authorize`; after exchange, decode the ID token (without verifying) and assert the `nonce` matches.
   * **Single use of code:** Attempt to redeem the same authorization code twice; expect `invalid_grant` on the second call.
   * **JWKS stability:** Call `/jwks` twice and ensure the returned key and `kid` remain stable over time.
   * **Discovery completeness:** Write a test that fetches `/.well-known/openid-configuration` and asserts presence of `grant_types_supported`, `token_endpoint_auth_methods_supported` and `code_challenge_methods_supported`.
   * **Profile scope:** Extend the `userinfo` tests to verify that `name`, `given_name` and `family_name` are returned only when the `profile` scope is requested.
   * **CORS:** After tightening CORS, add an integration test to confirm that cross‑origin requests to `/token` are rejected or do not include `Access-Control-Allow-Origin: *`.

7. **Improve error handling on the authorization endpoint.**

   * **Why:** The authorization handler currently returns plain‑text error strings such as `"invalid_client"` and `"invalid_scope"`.  RFC 6749 expects error responses in JSON for token endpoints and as redirect parameters for authorization endpoints.
   * **How:** For browser‑initiated authorization flows, consider returning an error page that includes an `error` and `error_description` in the query string of the redirect.  For direct form submissions, respond with a JSON object containing `error` and `error_description`.  Update tests to check for proper error formats.

Implementing the above steps will close the remaining gaps and align the `antonycc/oidc` repository with the checklist.  Most of the core OIDC flows—discovery, authorization, token exchange, userinfo, and JWKS—are already correct and tested, so the required changes are primarily around security hardening, key storage, production readiness, and expanding test coverage.
