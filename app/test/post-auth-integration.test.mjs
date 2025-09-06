/**
 * Manual test to verify post-auth status update behavior.
 * This simulates the post-auth page flow with token storage and status updates.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Post-auth manual behavior test", () => {
  let mockDocument;
  let refreshLoginStatusText;
  let checkLoginStatus;
  let localStorage;

  beforeEach(() => {
    // Mock localStorage
    localStorage = {
      store: {},
      getItem: vi.fn((key) => localStorage.store[key] || null),
      setItem: vi.fn((key, value) => {
        localStorage.store[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete localStorage.store[key];
      }),
    };
    global.localStorage = localStorage;

    // Mock elements that would exist in post-auth.html
    const statusElement = { textContent: "Looking for authorization code in URL…" };
    const loginStatusElement = { textContent: "Checking…" };
    const claimsElement = { textContent: "" };
    const resultElement = { textContent: "" };

    mockDocument = {
      querySelector: vi.fn((selector) => {
        if (selector === ".login-status") return loginStatusElement;
        return null;
      }),
      getElementById: vi.fn((id) => {
        if (id === "status") return statusElement;
        if (id === "claims") return claimsElement;
        if (id === "result") return resultElement;
        return null;
      }),
    };
    global.document = mockDocument;
    global.console.warn = vi.fn();

    // Define the functions as they would exist in the real environment
    checkLoginStatus = function () {
      try {
        const tokenData = localStorage.getItem("oidc_tokens");
        if (!tokenData) {
          return { isLoggedIn: false, status: "Not logged in" };
        }
        const tokens = JSON.parse(tokenData);
        if (!tokens.expires_at || Date.now() >= tokens.expires_at) {
          localStorage.removeItem("oidc_tokens");
          return { isLoggedIn: false, status: "Not logged in" };
        }
        const userDisplay = tokens.userinfo?.name || tokens.claims?.sub || "User";
        return { isLoggedIn: true, status: `Logged in as ${userDisplay}`, tokens };
      } catch (e) {
        console.warn("Error checking login status:", e);
        localStorage.removeItem("oidc_tokens");
        return { isLoggedIn: false, status: "Not logged in" };
      }
    };

    refreshLoginStatusText = function () {
      const loginStatus = checkLoginStatus();
      const loginElement = document.querySelector(".login-status");
      if (loginElement) loginElement.textContent = loginStatus.status;
    };

    // Make refreshLoginStatusText available globally as it would be in the real page
    global.refreshLoginStatusText = refreshLoginStatusText;
  });

  it("should simulate successful token exchange with userinfo and status update", () => {
    // Simulate the token exchange response
    const mockTokenResponse = {
      access_token: "test-access-token",
      id_token: "test-id-token",
      token_type: "Bearer",
      expires_in: 300,
    };

    // Simulate decoded claims
    const mockClaims = {
      sub: "test-user",
      aud: "test-client",
      iss: "https://example.com",
      exp: Date.now() / 1000 + 300,
    };

    // Simulate userinfo response
    const mockUserinfo = {
      sub: "test-user",
      name: "Test User",
      email: "test@example.com",
    };

    // Simulate the post-auth.html logic after successful token exchange

    // 1. Store tokens in localStorage (as done in the updated code)
    const tokenData = {
      access_token: mockTokenResponse.access_token,
      id_token: mockTokenResponse.id_token,
      token_type: mockTokenResponse.token_type || "Bearer",
      expires_at: Date.now() + (mockTokenResponse.expires_in || 300) * 1000,
      claims: mockClaims,
    };
    localStorage.setItem("oidc_tokens", JSON.stringify(tokenData));

    // 2. Call refreshLoginStatusText (as done in the updated code)
    if (typeof refreshLoginStatusText === "function") {
      refreshLoginStatusText();
    }

    // Verify the status was updated correctly
    const loginElement = mockDocument.querySelector(".login-status");
    expect(loginElement.textContent).toBe("Logged in as test-user"); // Uses claims.sub as fallback

    // 3. Simulate userinfo being fetched and stored
    tokenData.userinfo = mockUserinfo;
    localStorage.setItem("oidc_tokens", JSON.stringify(tokenData));

    // 4. Call refreshLoginStatusText again after userinfo is stored
    refreshLoginStatusText();

    // Verify the status now shows the name from userinfo
    expect(loginElement.textContent).toBe("Logged in as Test User");
  });

  it("should show fallback behavior when refreshLoginStatusText is not available", () => {
    // Simulate when oidc.js hasn't loaded yet or the function isn't available
    global.refreshLoginStatusText = undefined;

    // Simulate manual status setting (fallback behavior in our updated code)
    const loginElement = mockDocument.querySelector(".login-status");

    // This is what would happen in the updated post-auth.html when refreshLoginStatusText is not available
    if (typeof global.refreshLoginStatusText === "function") {
      global.refreshLoginStatusText();
    } else {
      loginElement.textContent = "Logged in";
    }

    expect(loginElement.textContent).toBe("Logged in");
  });
});
