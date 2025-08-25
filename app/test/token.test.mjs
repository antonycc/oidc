import { describe, it, expect, vi } from "vitest";
import { handler as token } from "../functions/token.mjs";

// Mock the database calls
vi.mock("../lib/db.mjs", () => ({
  get: vi.fn(),
  conditionalDelete: vi.fn(),
  put: vi.fn(),
  tables: {
    codes: "test-codes-table",
    refresh: "test-refresh-table"
  }
}));

// Mock the crypto module
vi.mock("../lib/crypto.mjs", () => ({
  signJwt: vi.fn().mockResolvedValue("mock.jwt.token")
}));

// Mock environment variables
vi.mock("process", () => ({
  env: {
    ISSUER: "https://test-issuer.com"
  }
}));

const { get, conditionalDelete } = await import("../lib/db.mjs");

describe("token", () => {
  it("returns error for invalid client_id", async () => {
    const event = {
      requestContext: { http: { method: "POST" } },
      body: "grant_type=authorization_code&code=test-code&code_verifier=test-verifier&client_id=invalid-client&redirect_uri=https://example.com/cb"
    };

    const response = await token(event);
    
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("invalid_client");
  });

  it("returns error for missing authorization code", async () => {
    get.mockResolvedValueOnce({ Item: null });

    const event = {
      requestContext: { http: { method: "POST" } },
      body: "grant_type=authorization_code&code=non-existent-code&code_verifier=test-verifier&client_id=cognito-web&redirect_uri=https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"
    };

    const response = await token(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("invalid_grant");
  });

  it("returns error for client_id mismatch", async () => {
    get.mockResolvedValueOnce({
      Item: {
        client: "different-client",
        redirect: "https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/idpresponse",
        ch: "test-challenge",
        sub: "test-user",
        nonce: "test-nonce",
        scope: "openid"
      }
    });

    const event = {
      requestContext: { http: { method: "POST" } },
      body: "grant_type=authorization_code&code=test-code&code_verifier=test-verifier&client_id=cognito-web&redirect_uri=https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"
    };

    const response = await token(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("invalid_grant");
  });

  it("returns error for redirect_uri mismatch", async () => {
    get.mockResolvedValueOnce({
      Item: {
        client: "cognito-web",
        redirect: "https://different-redirect.com/cb",
        ch: "test-challenge",
        sub: "test-user",
        nonce: "test-nonce",
        scope: "openid"
      }
    });

    const event = {
      requestContext: { http: { method: "POST" } },
      body: "grant_type=authorization_code&code=test-code&code_verifier=test-verifier&client_id=cognito-web&redirect_uri=https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"
    };

    const response = await token(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("invalid_grant");
  });
});