import { describe, it, expect, vi, beforeEach } from "vitest";
import { handler as userinfo } from "../functions/userinfo.mjs";

// Mock environment variables for config
vi.stubEnv("USERS_TABLE", "test-users-table");
vi.stubEnv("CODES_TABLE", "test-codes-table");
vi.stubEnv("ISSUER", "https://test.issuer");

// Mock the crypto module
vi.mock("../lib/crypto.mjs", () => ({
  verifyJwt: vi.fn(),
}));

// Mock the database calls
vi.mock("../lib/db.mjs", () => ({
  get: vi.fn(),
  tables: {
    users: "test-users-table",
  },
}));

// Mock config to return proper tables configuration
vi.mock("../lib/config.mjs", () => ({
  config: {
    tables: {
      users: "test-users-table",
      codes: "test-codes-table",
    },
    issuer: "https://test.issuer",
  },
}));

const { verifyJwt } = await import("../lib/crypto.mjs");
const { get } = await import("../lib/db.mjs");

describe("userinfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error for missing authorization header", async () => {
    const event = {
      headers: {},
    };

    const response = await userinfo(event);

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("invalid_request");
  });

  it("returns error for invalid access token", async () => {
    verifyJwt.mockResolvedValueOnce(null);

    const event = {
      headers: {
        authorization: "Bearer invalid-token",
      },
    };

    const response = await userinfo(event);

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("invalid_token");
  });

  it("returns basic userinfo for valid token", async () => {
    verifyJwt.mockResolvedValueOnce({
      sub: "test-user",
      scope: "openid",
    });

    const event = {
      headers: {
        authorization: "Bearer valid-token",
      },
    };

    const response = await userinfo(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sub).toBe("test-user");
    expect(body.email).toBeUndefined(); // email scope not requested
  });

  it("returns email claims for email scope", async () => {
    verifyJwt.mockResolvedValueOnce({
      sub: "test-user",
      scope: "openid email",
    });

    get.mockResolvedValueOnce({
      Item: {
        email: "test@example.com",
        emailVerified: true,
      },
    });

    const event = {
      headers: {
        authorization: "Bearer valid-token",
      },
    };

    const response = await userinfo(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sub).toBe("test-user");
    expect(body.email).toBe("test@example.com");
    expect(body.email_verified).toBe(true);
  });
});
