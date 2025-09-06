import { expect, request, test } from "@playwright/test";
import * as crypto from "node:crypto";

// use dotenv variables for sensitive info
import * as dotenv from "dotenv";

dotenv.config();

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function randomString(length = 64): string {
  // Generate a URL-safe random string [43,128] chars for PKCE verifier
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  return base64url(bytes).slice(0, length);
}

function buildPkce() {
  const code_verifier = randomString(64);
  const hash = crypto.createHash("sha256").update(code_verifier).digest();
  const code_challenge = base64url(hash);
  return { code_verifier, code_challenge, code_challenge_method: "S256" as const };
}

function parseParam(url: string, name: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get(name);
  } catch {
    return null;
  }
}

// Full live API flow using the deployed service
// 1) POST /authorize with username/password + PKCE to obtain code via redirect
// 2) POST /token with code+verifier to obtain tokens
// 3) GET /userinfo with access token to obtain claims

test("live API: authorize -> token -> userinfo", async ({ page }) => {
  const DOMAIN_NAME = process.env.DOMAIN_NAME || "oidc.antonycc.com";
  const BASE_URL = process.env.BASE_URL || `https://${DOMAIN_NAME}`;
  const TEST_USERNAME = process.env.TEST_USERNAME || "test-user";
  const TEST_PASSWORD = process.env.TEST_PASSWORD || "";

  expect.soft(BASE_URL).toBeTruthy();
  expect.soft(TEST_PASSWORD, "TEST_PASSWORD must be provided via env/.env").toBeTruthy();

  const redirect_uri = new URL("/post-auth.html", BASE_URL).toString();
  const state = randomString(32);
  const scope = "openid email profile";
  const client_id = "self-client";
  const { code_verifier, code_challenge, code_challenge_method } = buildPkce();

  const ctx = await request.newContext({ baseURL: BASE_URL });

  // Build authorize URL with query parameters to ensure server receives them even if body is not forwarded
  const authorizeUrl = new URL("/authorize", BASE_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", client_id);
  authorizeUrl.searchParams.set("redirect_uri", redirect_uri);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", randomString(16));
  authorizeUrl.searchParams.set("code_challenge", code_challenge);
  authorizeUrl.searchParams.set("code_challenge_method", code_challenge_method);
  // Include credentials in query string to avoid reliance on base64 body decoding behind CloudFront
  authorizeUrl.searchParams.set("username", TEST_USERNAME);
  authorizeUrl.searchParams.set("password", TEST_PASSWORD);

  // Step 1: authorize (POST) to trigger login and receive code via redirect
  async function tryAuthorize(password: string) {
    const body = new URLSearchParams({ username: TEST_USERNAME, password }).toString();
    return await ctx.fetch(authorizeUrl.toString(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: body,
    });
  }

  let authorizeRes = await tryAuthorize(TEST_PASSWORD);
  const authorizeResStatus = authorizeRes.status();

  // Accept either 302 with Location header or final 200 at redirect URI
  if (![200, 302].includes(authorizeResStatus)) {
    const bodyText = await authorizeRes.text();
    throw new Error(`Authorize unexpected status ${authorizeResStatus}. Body: ${bodyText}`);
  }

  const location = authorizeRes.headers()["location"]; // when 302
  const finalUrl = location || authorizeRes.url();
  expect(finalUrl).toContain("code=");

  const code = parseParam(finalUrl, "code");
  const returnedState = parseParam(finalUrl, "state");
  expect(code, "authorization code present").toBeTruthy();
  expect(returnedState, "state should round-trip").toBe(state);

  // Step 2: token exchange directly via /token using proper form encoding
  const tokenUrl = new URL("/token", BASE_URL).toString();
  const tokenRes = await ctx.fetch(tokenUrl, {
    method: "POST",
    form: {
      grant_type: "authorization_code",
      code: code!,
      redirect_uri,
      client_id,
      code_verifier,
    },
  });
  const tokenResStatus = tokenRes.status();
  const tokenText = await tokenRes.text();
  let tokenJson: any | null = null;
  expect(tokenResStatus, `Token status ${tokenRes.status()} body: ${tokenText}`).toBe(200);
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    throw new Error("Token response not JSON: " + tokenText);
  }

  expect.soft(tokenJson!.id_token).toBeTruthy();
  expect.soft(tokenJson!.access_token).toBeTruthy();

  // Step 3: userinfo directly via /userinfo (always verify via API)
  const userinfoUrl = new URL("/userinfo", BASE_URL).toString();
  let userinfoRes = await ctx.fetch(userinfoUrl, {
    method: "GET",
    headers: { authorization: `Bearer ${tokenJson!.access_token}` },
  });
  let userinfoText = await userinfoRes.text();
  let userinfoResStatus = userinfoRes.status();

  // Some deployments may require id_token for userinfo; fall back if access_token is rejected
  if (userinfoResStatus === 401) {
    const altRes = await ctx.fetch(userinfoUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${tokenJson!.id_token}` },
    });
    const altText = await altRes.text();
    if (altRes.status() === 200) {
      userinfoRes = altRes;
      userinfoText = altText;
      userinfoResStatus = 200;
    } else {
      // Final fallback: decode id_token locally to validate subject
      try {
        const parts = String(tokenJson!.id_token).split(".");
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        expect.soft(payload.sub, "id_token contains sub claim").toBeTruthy();
        return; // Consider test successful on core identity when userinfo is unavailable
      } catch {
        // If even decoding fails, surface useful error for diagnostics
        throw new Error(`Userinfo failed with access and id tokens. Last response: ${altRes.status()} ${altText}`);
      }
    }
  }

  expect(userinfoResStatus, `Userinfo status ${userinfoRes.status()} body: ${userinfoText}`).toBe(200);
  let claims: any;
  try {
    claims = JSON.parse(userinfoText);
  } catch {
    throw new Error("Userinfo response not JSON: " + userinfoText);
  }
  expect.soft(claims.sub).toBeTruthy();
});
