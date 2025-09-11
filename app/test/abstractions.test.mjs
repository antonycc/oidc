import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment variables
vi.stubEnv("USERS_TABLE", "test-users");
vi.stubEnv("CODES_TABLE", "test-codes");
vi.stubEnv("ISSUER", "https://test.issuer");

describe("New abstractions usage examples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Configuration management", () => {
    it("provides centralized configuration with validation", async () => {
      const { config, getConfig } = await import("../lib/config.mjs");

      expect(config.issuer).toBe("https://test.issuer");
      expect(config.tables.users).toBe("test-users");
      expect(config.tokens.accessTokenTtlSeconds).toBe(300);
      expect(getConfig("tokens.accessTokenTtlSeconds")).toBe(300);
      expect(getConfig("missing.key", "default")).toBe("default");
    });
  });

  describe("Schema validation with Zod", () => {
    it("validates OIDC parameters with detailed errors", async () => {
      const { authorizeRequestSchema, safeValidateParams } = await import("../lib/validation.mjs");

      const validParams = {
        client_id: "test-client",
        redirect_uri: "https://example.com/callback",
        response_type: "code",
        scope: "openid",
        state: "state123",
      };

      const result = safeValidateParams(validParams, authorizeRequestSchema);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validParams);
    });

    it("provides detailed validation errors", async () => {
      const { authorizeRequestSchema, safeValidateParams } = await import("../lib/validation.mjs");

      const invalidParams = {
        client_id: "", // Empty string
        response_type: "invalid", // Wrong value
      };

      const result = safeValidateParams(invalidParams, authorizeRequestSchema);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0); // Should have multiple validation errors
      expect(result.errors.some((error) => error.includes("client_id"))).toBe(true);
      expect(result.errors.some((error) => error.includes("response_type"))).toBe(true);
    });
  });

  describe("Time and TTL utilities", () => {
    it("provides consistent time handling", async () => {
      const { time, ttl, jwt } = await import("../lib/time.mjs");

      const now = time.nowSeconds();
      const authCodeTtl = ttl.authCode();
      const accessTokenExp = jwt.expiresIn(300);

      expect(now).toBeGreaterThan(0);
      expect(authCodeTtl).toBeGreaterThan(now);
      expect(accessTokenExp).toBeGreaterThan(now);

      // Test TTL validation
      expect(ttl.isExpired(now - 100)).toBe(true); // Past timestamp
      expect(ttl.isExpired(now + 100)).toBe(false); // Future timestamp
    });

    it("provides JWT time utilities", async () => {
      const { jwt } = await import("../lib/time.mjs");

      const claims = {
        iat: jwt.issuedAt(),
        exp: jwt.expiresIn(300),
        nbf: jwt.notBefore(),
      };

      expect(jwt.isValid(claims)).toBe(true);

      // Test expired token
      const expiredClaims = {
        iat: jwt.issuedAt() - 600,
        exp: jwt.issuedAt() - 300,
      };
      expect(jwt.isValid(expiredClaims)).toBe(false);
    });
  });

  describe("Enhanced logging", () => {
    it("provides structured logging with correlation IDs", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { log, logRequestStart, logRequestEnd, generateCorrelationId, getCorrelationId } = await import(
        "../lib/utils.mjs"
      );

      // Test correlation ID generation
      const correlationId = logRequestStart("POST", "/test");
      expect(correlationId).toBeDefined();
      expect(getCorrelationId()).toBe(correlationId);

      // Test structured logging
      log("test_event", "test message");

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[1][0]; // Skip the request_start call
      const logData = JSON.parse(logCall);

      expect(logData.level).toBe("info");
      expect(logData.event).toBe("test_event");
      expect(logData.correlationId).toBe(correlationId);
      expect(logData.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      logRequestEnd(200, { success: true });

      consoleSpy.mockRestore();
    });

    it("handles error logging with metadata", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { logError } = await import("../lib/utils.mjs");

      const error = new Error("Test error");
      logError("test_error", error, { context: "test" });

      expect(consoleSpy).toHaveBeenCalled();
      const errorCall = consoleSpy.mock.calls[0][0];
      const errorData = JSON.parse(errorCall);

      expect(errorData.level).toBe("error");
      expect(errorData.event).toBe("test_error");
      expect(errorData.error.name).toBe("Error");
      expect(errorData.error.message).toBe("Test error");
      expect(errorData.context).toBe("test");

      consoleSpy.mockRestore();
    });
  });

  describe("Test data builders", () => {
    it("provides fluent test data construction", async () => {
      const { testData } = await import("../lib/test-builders.mjs");

      const user = testData.user().withUsername("john").withEmail("john@example.com").verified().build();

      expect(user.username).toBe("john");
      expect(user.email).toBe("john@example.com");
      expect(user.emailVerified).toBe(true);
      expect(user.passwordHash).toBeDefined(); // Generated automatically
      expect(user.password).toBeUndefined(); // Removed for security
    });

    it("creates complete authorization flow test data", async () => {
      const { testData } = await import("../lib/test-builders.mjs");

      const flowData = testData.authFlow({
        user: { username: "testuser", email: "test@example.com" },
        client: { clientId: "test-app" },
        authRequest: { scope: "openid profile" },
      });

      expect(flowData.user.username).toBe("testuser");
      expect(flowData.client.clientId).toBe("test-app");
      expect(flowData.authRequest.client_id).toBe("test-app");
      expect(flowData.authRequest.scope).toBe("openid profile");
      expect(flowData.authCode.client).toBe("test-app");
      expect(flowData.tokenRequest.client_id).toBe("test-app");

      // Verify PKCE integration
      expect(flowData.authRequest.code_challenge).toBeDefined();
      expect(flowData.tokenRequest.code_verifier).toBeDefined();
    });

    it("allows customization with overrides", async () => {
      const { UserBuilder, ClientBuilder } = await import("../lib/test-builders.mjs");

      const publicClient = new ClientBuilder()
        .withClientId("public-app")
        .withScopes("openid", "profile")
        .public()
        .build();

      const confidentialClient = new ClientBuilder().withClientId("confidential-app").confidential().build();

      expect(publicClient.clientId).toBe("public-app");
      expect(publicClient.clientSecret).toBeNull();
      expect(publicClient.scopes).toEqual(["openid", "profile"]);

      expect(confidentialClient.clientId).toBe("confidential-app");
      expect(confidentialClient.clientSecret).toBeDefined();
    });
  });

  describe("Error handling improvements", () => {
    it("provides consistent error responses", async () => {
      const { createJsonResponse } = await import("../lib/utils.mjs");

      const response = createJsonResponse(400, { error: "invalid_request" }, { "custom-header": "value" });

      expect(response.statusCode).toBe(400);
      expect(response.headers["content-type"]).toBe("application/json");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["custom-header"]).toBe("value");

      const body = JSON.parse(response.body);
      expect(body.error).toBe("invalid_request");
    });
  });
});
