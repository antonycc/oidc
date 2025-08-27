/* @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as crypto from "node:crypto";
import { start as startServer } from "../bin/express-server.mjs";

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function randomString(length = 64) {
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  return base64url(bytes).slice(0, length);
}

function buildPkce() {
  const code_verifier = randomString(64);
  const hash = crypto.createHash("sha256").update(code_verifier).digest();
  const code_challenge = base64url(hash);
  return { code_verifier, code_challenge, code_challenge_method: "S256" };
}

function parseParam(url, name) {
  const u = new URL(url);
  return u.searchParams.get(name);
}

describe("system: express server authorize -> token -> userinfo", () => {
  /** @type {{stop: () => Promise<void>, url: string}} */
  let srv;
  let BASE_URL;

  beforeAll(async () => {
    srv = await startServer({ port: 0, env: { CODES_TABLE: "mem_codes" } });
    BASE_URL = srv.url;
  });

  afterAll(async () => {
    await srv.stop();
  });

  it("flows from authorize to userinfo", async () => {
    const redirect_uri = new URL("/post-auth.html", BASE_URL).toString();
    const state = randomString(32);
    const scope = "openid email profile";
    const client_id = "self-client";
    const { code_verifier, code_challenge, code_challenge_method } = buildPkce();

    // Step 1: /authorize
    const authorizeUrl = new URL("/authorize", BASE_URL);
    const body = new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri,
      scope,
      state,
      nonce: randomString(16),
      code_challenge,
      code_challenge_method,
      username: "test-user",
      password: "irrelevant",
    }).toString();

    const authRes = await fetch(authorizeUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual",
      body,
    });
    expect([200, 302]).toContain(authRes.status);
    const location = authRes.headers.get("location") || authRes.url;
    expect(location).toContain("code=");
    const code = parseParam(location, "code");
    expect(code).toBeTruthy();

    // Step 2: /token
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri,
      client_id,
      code_verifier,
    });
    const tokenRes = await fetch(new URL("/token", BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });
    const tokenText = await tokenRes.text();
    expect(tokenRes.status, `token body: ${tokenText}`).toBe(200);
    const tokenJson = JSON.parse(tokenText);
    expect(tokenJson.id_token).toBeTruthy();
    expect(tokenJson.access_token).toBeTruthy();

    // Step 3: /userinfo
    const uiRes = await fetch(new URL("/userinfo", BASE_URL), {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    const uiText = await uiRes.text();
    expect(uiRes.status, `userinfo body: ${uiText}`).toBe(200);
    const claims = JSON.parse(uiText);
    expect(claims.sub).toBeTruthy();
  });
});
