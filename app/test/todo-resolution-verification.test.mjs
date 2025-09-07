/**
 * Verification test to demonstrate TODO resolution
 * This test confirms that the GET method TODO has been successfully resolved
 */
import { describe, it, expect } from "vitest";
import { handler as authorize } from "../functions/authorize.mjs";

describe("TODO Resolution Verification", () => {
  it("confirms GET support has been removed from authorize endpoint", async () => {
    const getEvent = {
      rawPath: "/authorize",
      rawQueryString: "client_id=test&redirect_uri=https://example.com/cb&response_type=code&scope=openid&state=st",
      requestContext: { http: { method: "GET" } },
    };

    const response = await authorize(getEvent);

    // Should return 405 Method Not Allowed instead of 200 login form
    expect(response.statusCode).toBe(405);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("method_not_allowed");
  });

  it("confirms POST method validation works correctly", async () => {
    // Test that POST method passes basic validation and reaches deeper logic
    // (even if it fails later due to AWS setup - we care about method validation)
    const postEvent = {
      rawPath: "/authorize",
      rawQueryString: "",
      requestContext: { http: { method: "POST" } },
      body: "client_id=invalid-client&redirect_uri=https://example.com/cb&response_type=code&scope=openid&state=st&nonce=n&username=test&password=test",
    };

    const response = await authorize(postEvent);

    // Should not return 405 (method not allowed) but rather 400 (invalid client)
    // This proves POST is accepted and processed
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("invalid_client");
  });

  it("confirms security improvement: no credentials in URLs", async () => {
    // GET requests with credentials in query string are now rejected
    const getWithCredsEvent = {
      rawPath: "/authorize",
      rawQueryString: "client_id=test&username=user&password=secret&redirect_uri=https://example.com",
      requestContext: { http: { method: "GET" } },
    };

    const response = await authorize(getWithCredsEvent);

    // Credentials in URL are rejected, preventing exposure in logs
    expect(response.statusCode).toBe(405);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("method_not_allowed");
  });
});
