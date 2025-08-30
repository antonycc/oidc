/**
 * Comprehensive test for concurrent authorization flows
 * Tests the complete auth->token->userinfo flow with multiple scenarios
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as crypto from "node:crypto";
import { start as startServer } from "../bin/express-server.mjs";

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
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
  try {
    const u = new URL(url);
    return u.searchParams.get(name);
  } catch {
    return null;
  }
}

describe("Concurrent auth->token->userinfo flows", () => {
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

  async function completeAuthFlow(username = "test-user", clientId = "self-client") {
    const redirect_uri = new URL("/post-auth.html", BASE_URL).toString();
    const state = randomString(32);
    const scope = "openid email profile";
    const { code_verifier, code_challenge, code_challenge_method } = buildPkce();

    // Step 1: POST /authorize
    const authorizeBody = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri,
      scope,
      state,
      nonce: randomString(16),
      code_challenge,
      code_challenge_method,
      username,
      password: "irrelevant",
    }).toString();

    const authRes = await fetch(new URL("/authorize", BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual",
      body: authorizeBody,
    });

    expect([200, 302]).toContain(authRes.status);
    const location = authRes.headers.get("location") || authRes.url;
    expect(location).toContain("code=");

    const code = parseParam(location, "code");
    const returnedState = parseParam(location, "state");
    expect(code).toBeTruthy();
    expect(returnedState).toBe(state);

    // Step 2: POST /token
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri,
      client_id: clientId,
      code_verifier,
    });

    const tokenRes = await fetch(new URL("/token", BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    expect(tokenRes.status).toBe(200);
    const tokenJson = await tokenRes.json();
    expect(tokenJson.id_token).toBeTruthy();
    expect(tokenJson.access_token).toBeTruthy();

    // Ensure access_token is a JWT (three segments)
    const parts = String(tokenJson.access_token).split(".");
    expect(parts.length).toBe(3);

    // Step 3: GET /userinfo
    const uiRes = await fetch(new URL("/userinfo", BASE_URL), {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });

    expect(uiRes.status).toBe(200);
    const userinfo = await uiRes.json();
    expect(userinfo.sub).toBeTruthy();

    return { code, tokenJson, userinfo };
  }

  it("completes single auth flow successfully", async () => {
    const result = await completeAuthFlow();
    expect(result.tokenJson.access_token).toBeTruthy();
    expect(result.userinfo.sub).toBe("test-user");
  });

  it("handles multiple concurrent auth flows", async () => {
    const promises = Array.from({ length: 5 }, (_, i) => 
      completeAuthFlow(`user-${i}`, "self-client")
    );

    const results = await Promise.all(promises);
    
    // Verify all flows completed successfully
    expect(results).toHaveLength(5);
    results.forEach((result, i) => {
      expect(result.tokenJson.access_token).toBeTruthy();
      expect(result.userinfo.sub).toBe(`user-${i}`);
    });

    // Verify all codes are unique
    const codes = results.map(r => r.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(5);
  });

  it("rejects GET requests to /authorize", async () => {
    const getRes = await fetch(new URL("/authorize?client_id=test", BASE_URL), {
      method: "GET",
    });
    
    expect(getRes.status).toBe(405);
    const text = await getRes.text();
    expect(text).toBe("method_not_allowed");
  });

  it("rejects invalid client_id in concurrent requests", async () => {
    const promises = Array.from({ length: 3 }, () => {
      const body = new URLSearchParams({
        response_type: "code",
        client_id: "invalid-client",
        redirect_uri: "https://example.com/cb",
        scope: "openid",
        state: randomString(16),
        nonce: randomString(16),
        username: "test-user",
        password: "test",
      }).toString();

      return fetch(new URL("/authorize", BASE_URL), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
    });

    const results = await Promise.all(promises);
    
    // All should return 400 invalid_client
    results.forEach(async (res) => {
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("invalid_client");
    });
  });

  it("handles token reuse attempts", async () => {
    const { code, tokenJson } = await completeAuthFlow();
    
    // Try to use the same code again
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: new URL("/post-auth.html", BASE_URL).toString(),
      client_id: "self-client",
      code_verifier: randomString(64),
    });

    const tokenRes = await fetch(new URL("/token", BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    // Should fail because code was already used
    expect(tokenRes.status).toBe(400);
  });

  it("validates access tokens correctly", async () => {
    const { tokenJson } = await completeAuthFlow();
    
    // Valid token should work
    const validRes = await fetch(new URL("/userinfo", BASE_URL), {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    expect(validRes.status).toBe(200);

    // Invalid token should fail
    const invalidRes = await fetch(new URL("/userinfo", BASE_URL), {
      headers: { authorization: "Bearer invalid.jwt.token" },
    });
    expect(invalidRes.status).toBe(401);
  });
});