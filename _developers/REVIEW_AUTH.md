The “missing client\_id” error arises during the *authorize* test in your workflow because the request body isn’t being parsed and because the test is using a `client_id` that isn’t registered in your OIDC provider.

### Why the test fails

1. **Body isn’t decoded in Lambda** – When CloudFront forwards a `POST` request with `Content-Type: application/x‑www‑form‑urlencoded` to a Lambda Function URL, the payload is base64‑encoded and `event.isBase64Encoded` is set to `true`.  The `authorize` handler currently does:

   ```js
   const body = new URLSearchParams(event.body || "");
   ```

   without checking `isBase64Encoded`.  If `isBase64Encoded` is `true`, `event.body` contains a base64 string, so `URLSearchParams` sees an empty query and `client_id` is effectively missing.  The same issue exists in `token.mjs`, which also reads `event.body` without decoding.

2. **No `demo-client` configured** – The test posts `client_id=demo-client` and `redirect_uri=https://example.com/callback`.  Your `clients.mjs` only defines `cognito-web` and `self-client`; neither accepts `https://example.com/callback` as a redirect URI.  Even after decoding the body correctly, `getClient("demo-client")` will return `null`, and the handler will return `invalid_client`.

### Options to fix

#### A. Add a demo client matching the test

If the intention is to allow a simple demo client for automated tests, extend `clients.mjs` to include `demo-client`:

```js
export const clients = {
  "cognito-web": { /* existing config */ },
  "self-client": { /* existing config */ },
  "demo-client": {
    redirectUris: ["https://example.com/callback"],
    grantTypes: ["authorization_code"],
    scopes: ["openid"],
    pkceRequired: true,
    clientSecret: null
  }
};
```

This allows the test’s `client_id` and redirect URI to pass validation.

#### B. Change the test to use a registered client

Alternatively, update `.github/workflows/test-and-deploy.yml` so that the authorize test uses a valid client and redirect URI.  For example:

```bash
client_id=self-client
redirect_uri=https://oidc.antonycc.com/post-auth.html
```

This matches `self-client` in `clients.mjs`, whose redirect URIs include `/post-auth.html` on your domain.

Since the pipeline is part of your repository, adjusting the test may be simpler than adding a permanent “demo-client.”

#### C. Decode base64 bodies in handlers (required either way)

Regardless of which client you use, you need to decode base64‑encoded request bodies.  In both `authorize.mjs` and `token.mjs`, replace the body parsing code with:

```js
// At top of file, import Buffer if needed (Node.js has it globally)
const bodyString = event.isBase64Encoded
  ? Buffer.from(event.body || "", "base64").toString("utf-8")
  : event.body || "";

const body = new URLSearchParams(bodyString);
```

This ensures POSTed form data (including `client_id`, `redirect_uri`, and PKCE values) is parsed correctly when requests come through CloudFront/Function URLs.

After making these changes and redeploying the stack, rerun the GitHub Actions workflow.  The authorize test should then receive a 302 redirect with an authorization code instead of a 400 error.
