import { describe, it, expect, vi } from "vitest";
import { handler as authorize } from "../functions/authorize.mjs";

// Mock the database calls
vi.mock("../lib/db.mjs", () => ({
  get: vi.fn(),
  put: vi.fn(),
  tables: {
    codes: "test-codes-table",
    users: "test-users-table"
  }
}));

const baseEvent = () => ({
  rawPath: "/authorize",
  rawQueryString: "",
  requestContext: { http: { method: "GET" } },
});

describe("authorize", () => {
  it("renders login form when missing username", async () => {
    const e = {
      ...baseEvent(),
      rawQueryString:
        "client_id=x&redirect_uri=https://example.com/cb&response_type=code&scope=openid&state=st&nonce=n&code_challenge=abc&code_challenge_method=S256",
    };
    const r = await authorize(e);
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("text/html");
  });

  it("returns invalid_client for unknown client_id", async () => {
    const e = {
      ...baseEvent(),
      rawQueryString:
        "client_id=unknown&redirect_uri=https://example.com/cb&response_type=code&scope=openid&state=st&nonce=n&code_challenge=abc&code_challenge_method=S256&username=test",
    };
    const r = await authorize(e);
    expect(r.statusCode).toBe(400);
    expect(r.body).toBe("invalid_client");
  });

  it("returns invalid_redirect_uri for unauthorized redirect_uri", async () => {
    const e = {
      ...baseEvent(),
      rawQueryString:
        "client_id=cognito-web&redirect_uri=https://evil.com/cb&response_type=code&scope=openid&state=st&nonce=n&code_challenge=abc&code_challenge_method=S256&username=test",
    };
    const r = await authorize(e);
    expect(r.statusCode).toBe(400);
    expect(r.body).toBe("invalid_redirect_uri");
  });

  it("returns invalid_scope for unauthorized scopes", async () => {
    const e = {
      ...baseEvent(),
      rawQueryString:
        "client_id=cognito-web&redirect_uri=https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/idpresponse&response_type=code&scope=openid+admin&state=st&nonce=n&code_challenge=abc&code_challenge_method=S256&username=test",
    };
    const r = await authorize(e);
    expect(r.statusCode).toBe(400);
    expect(r.body).toBe("invalid_scope");
  });

  it("rejects self-client with invalid redirect URI", async () => {
    // Ensure BASE_URL is not set so it falls back to localhost:8080
    const originalBaseUrl = process.env.BASE_URL;
    delete process.env.BASE_URL;
    
    try {
      const e = {
        ...baseEvent(),
        rawQueryString:
          "client_id=self-client&redirect_uri=https://evil.com/post-auth.html&response_type=code&scope=openid+email+profile&state=st&nonce=n&code_challenge=abc&code_challenge_method=S256&username=test",
      };
      const r = await authorize(e);
      expect(r.statusCode).toBe(400);
      expect(r.body).toBe("invalid_redirect_uri");
    } finally {
      // Restore original BASE_URL
      if (originalBaseUrl !== undefined) {
        process.env.BASE_URL = originalBaseUrl;
      }
    }
  });
});
