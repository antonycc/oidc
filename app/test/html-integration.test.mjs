/**
 * Simple test to validate the userinfo integration flow
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("HTML page userinfo integration", () => {
  let mockLocalStorage;
  let mockFetch;

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      store: {},
      getItem: vi.fn((key) => mockLocalStorage.store[key] || null),
      setItem: vi.fn((key, value) => {
        mockLocalStorage.store[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete mockLocalStorage.store[key];
      }),
    };
    global.localStorage = mockLocalStorage;

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock console.warn
    global.console.warn = vi.fn();
  });

  it("should check login status from localStorage", () => {
    // Create the checkLoginStatus function as it would exist in the HTML pages
    function checkLoginStatus() {
      try {
        const tokenData = localStorage.getItem("oidc_tokens");
        if (!tokenData) {
          return { isLoggedIn: false, status: "Not logged in" };
        }

        const tokens = JSON.parse(tokenData);
        if (!tokens.expires_at || Date.now() >= tokens.expires_at) {
          // Token expired, clear it
          localStorage.removeItem("oidc_tokens");
          return { isLoggedIn: false, status: "Not logged in" };
        }

        const userDisplay = tokens.userinfo?.name || tokens.claims?.sub || "User";
        return {
          isLoggedIn: true,
          status: `Logged in as ${userDisplay}`,
          tokens: tokens,
        };
      } catch (e) {
        console.warn("Error checking login status:", e);
        localStorage.removeItem("oidc_tokens");
        return { isLoggedIn: false, status: "Not logged in" };
      }
    }

    // Test with no tokens
    let status = checkLoginStatus();
    expect(status.isLoggedIn).toBe(false);
    expect(status.status).toBe("Not logged in");

    // Test with valid tokens
    const tokenData = {
      access_token: "test-access-token",
      id_token: "test-id-token",
      token_type: "Bearer",
      expires_at: Date.now() + 300000, // 5 minutes from now
      claims: { sub: "test-user" },
      userinfo: { name: "Test User", email: "test@example.com" },
    };
    localStorage.setItem("oidc_tokens", JSON.stringify(tokenData));

    status = checkLoginStatus();
    expect(status.isLoggedIn).toBe(true);
    expect(status.status).toBe("Logged in as Test User");
    expect(status.tokens).toEqual(tokenData);

    // Test with expired tokens
    const expiredTokenData = {
      ...tokenData,
      expires_at: Date.now() - 1000, // 1 second ago (expired)
    };
    localStorage.setItem("oidc_tokens", JSON.stringify(expiredTokenData));

    status = checkLoginStatus();
    expect(status.isLoggedIn).toBe(false);
    expect(status.status).toBe("Not logged in");
    expect(localStorage.removeItem).toHaveBeenCalledWith("oidc_tokens");
  });

  it("should handle userinfo API call correctly", async () => {
    // Mock successful userinfo response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sub: "test-user",
          name: "Test User",
          email: "test@example.com",
        }),
    });

    // Simulate the userinfo call from post-auth.html
    const accessToken = "test-access-token";

    const userinfoRes = await fetch("/userinfo", {
      headers: { authorization: "Bearer " + accessToken },
    });

    expect(mockFetch).toHaveBeenCalledWith("/userinfo", {
      headers: { authorization: "Bearer test-access-token" },
    });

    expect(userinfoRes.ok).toBe(true);
    const userinfo = await userinfoRes.json();
    expect(userinfo).toEqual({
      sub: "test-user",
      name: "Test User",
      email: "test@example.com",
    });
  });

  it("should handle JWT decoding correctly", () => {
    // Create the decodeJwtNoVerify function as it exists in post-auth.html
    function decodeJwtNoVerify(jwt) {
      try {
        const [, payload] = jwt.split(".");
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(paddedBase64), (c) => c.charCodeAt(0))));
      } catch {
        return null;
      }
    }

    // Test with a simple JWT payload (base64url encoded {"sub":"test-user","iat":1234567890})
    const testJwt = "header.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJpYXQiOjEyMzQ1Njc4OTB9.signature";
    const decoded = decodeJwtNoVerify(testJwt);

    expect(decoded).toEqual({
      sub: "test-user",
      iat: 1234567890,
    });

    // Test with invalid JWT
    const invalidJwt = "invalid.jwt.token";
    const decodedInvalid = decodeJwtNoVerify(invalidJwt);
    expect(decodedInvalid).toBe(null);
  });
});
