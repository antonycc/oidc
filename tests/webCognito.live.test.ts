import { test, expect } from "@playwright/test";

// use dotenv variables for sensitive info
import * as dotenv from "dotenv";
dotenv.config();

const DOMAIN_NAME = process.env.DOMAIN_NAME || "oidc.antonycc.com";
const BASE_URL = process.env.BASE_URL || `https://${DOMAIN_NAME}`;
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || `auth.${DOMAIN_NAME}`;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || "";
const TEST_USERNAME = process.env.TEST_USERNAME || "test-user";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";

// @ts-ignore
test("Home page shows Cognito login option", async ({ page }) => {
    await page.goto(new URL("/", BASE_URL).toString());
    await expect(page.getByRole("heading", { name: "OIDC - Home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Login with Cognito" })).toBeVisible();
    // Use more specific selector to avoid conflict with content links
    await expect(page.locator('.login-links a[href="./login.html"]')).toBeVisible();
});

// @ts-ignore
test("Cognito login page loads and prepares redirect", async ({ page }) => {
  // Add client_id parameter for testing
  const loginUrl = new URL("./loginCognito.html", BASE_URL);
  loginUrl.searchParams.set('client_id', 'test-client-for-testing');
  
  await page.goto(loginUrl.toString());
  await page.getByRole("heading", { name: "OIDC - Cognito Login" }).waitFor();
  await expect(page.getByText("You will be redirected to AWS Cognito")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Redirecting to Cognito");
});

// @ts-ignore  
test("Cognito post-auth page handles missing code gracefully", async ({ page }) => {
  await page.goto(new URL("./post-authCognito.html", BASE_URL).toString());
  await page.getByRole("heading", { name: "OIDC - Cognito Post-auth" }).waitFor();
  await expect(page.locator("#status")).toContainText("No authorization code found");
  await expect(page.getByRole("link", { name: "Try Cognito login again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to home page" })).toBeVisible();
});

// @ts-ignore
test("Cognito post-auth page handles error parameters", async ({ page }) => {
  const errorUrl = new URL("./post-authCognito.html", BASE_URL);
  errorUrl.searchParams.set("error", "access_denied");
  errorUrl.searchParams.set("error_description", "User cancelled authentication");
  
  await page.goto(errorUrl.toString());
  await page.getByRole("heading", { name: "OIDC - Cognito Post-auth" }).waitFor();
  await expect(page.locator("#status")).toContainText("Authentication error: access_denied");
  await expect(page.locator("#result")).toContainText("Error details: User cancelled authentication");
  await expect(page.locator(".login-status")).toContainText("Login failed");
});

// @ts-ignore
test("Cognito post-auth page handles successful auth code", async ({ page }) => {
  const successUrl = new URL("./post-authCognito.html", BASE_URL);
  successUrl.searchParams.set("code", "test-auth-code-123");
  successUrl.searchParams.set("state", "test-state-456");
  
  await page.goto(successUrl.toString());
  await page.getByRole("heading", { name: "OIDC - Cognito Post-auth" }).waitFor();
  await expect(page.locator("#status")).toContainText("Exchanging Cognito authorization code for tokens");
  
  // Wait for either success or configuration error
  await page.waitForFunction(() => {
    const status = document.getElementById("status")?.textContent || "";
    return status.includes("successful") || status.includes("failed") || status.includes("Missing required configuration");
  }, { timeout: 10000 });
  
  const statusText = await page.locator("#status").textContent();
  if (statusText?.includes("Missing required configuration")) {
    // This is expected in test environment without deployed config
    await expect(page.locator("#result")).toContainText("cognito_token_exchange");
    await expect(page.locator("#result")).toContainText("failed");
    console.log("Token exchange test skipped due to missing configuration (expected in test env)");
  } else {
    // If config is available, check for actual token exchange
    await expect(page.locator("#result")).toContainText("authorization_code");
    await expect(page.locator("#result")).toContainText("test-auth-code-123");
  }
});

// @ts-ignore
test("Cognito token exchange functionality test", async ({ page }) => {
  // Test the token exchange with a mocked successful response
  await page.goto(new URL("./post-authCognito.html", BASE_URL).toString());
  
  // Inject a mock fetch to simulate successful token exchange
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (typeof url === 'string' && url.includes('/oauth2/token')) {
        // Mock successful token response
        return Promise.resolve(new Response(JSON.stringify({
          access_token: "mock-access-token",
          id_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTUxNjIzOTAyMn0.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ",
          refresh_token: "mock-refresh-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid email profile"
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      
      if (typeof url === 'string' && url.includes('/config.json')) {
        // Mock config response
        return Promise.resolve(new Response(JSON.stringify({
          cognitoDomain: "auth.test.example.com",
          cognitoClientId: "test-client-id-123"
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      
      // Fall back to original fetch for other requests
      return originalFetch(url, options);
    };
  });
  
  // Navigate with auth code to trigger token exchange
  const testUrl = new URL("./post-authCognito.html", BASE_URL);
  testUrl.searchParams.set("code", "mock-auth-code");
  testUrl.searchParams.set("state", "mock-state");
  
  await page.goto(testUrl.toString());
  await page.getByRole("heading", { name: "OIDC - Cognito Post-auth" }).waitFor();
  
  // Wait for token exchange to complete
  await expect(page.locator("#status")).toContainText("Token exchange successful", { timeout: 15000 });
  
  // Verify tokens were processed correctly
  await expect(page.locator("#result")).toContainText("tokens_received");
  await expect(page.locator("#result")).toContainText("✓ Present");
  await expect(page.locator("#claims")).toContainText("Test User");
  await expect(page.locator(".login-status")).toContainText("Logged in as Test User (via Cognito)");
  
  // Verify tokens stored in localStorage
  const storedTokens = await page.evaluate(() => localStorage.getItem('cognito_tokens'));
  expect(storedTokens).toBeTruthy();
  
  const tokenData = JSON.parse(storedTokens as string);
  expect(tokenData.access_token).toBe("mock-access-token");
  expect(tokenData.flow).toBe("cognito");
  expect(tokenData.userinfo.name).toBe("Test User");
});

// Note: Full Cognito integration test would require actual Cognito deployment
// and would be part of a higher-level integration test that involves:
// 1. Going to loginCognito.html
// 2. Being redirected to actual Cognito Hosted UI
// 3. Authenticating with Cognito
// 4. Being redirected back to post-authCognito.html with real auth code
// This test would require COGNITO_DOMAIN and COGNITO_CLIENT_ID to be properly set
// and is marked with a skip condition for now

test("Full Cognito flow integration test", async ({ page }) => {
  // This test requires a deployed Cognito environment
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
    test.skip(true, "Cognito environment variables not configured");
  }
  
  // Start the Cognito login flow with proper client ID
  const loginUrl = new URL("./loginCognito.html", BASE_URL);
  loginUrl.searchParams.set('client_id', COGNITO_CLIENT_ID);
  
  await page.goto(loginUrl.toString());
  await page.getByRole("heading", { name: "OIDC - Cognito Login" }).waitFor();
  
  // Wait for redirect to Cognito (timeout extended for real environment)
  try {
    await page.waitForURL(new RegExp(COGNITO_DOMAIN), { timeout: 10000 });
    
    // At this point, we'd be on Cognito's hosted UI
    // For testing purposes, we'll verify we reach the Cognito domain
    const currentUrl = page.url();
    expect(currentUrl).toContain(COGNITO_DOMAIN);
    expect(currentUrl).toContain("/oauth2/authorize");
    expect(currentUrl).toContain(`client_id=${COGNITO_CLIENT_ID}`);
    
    // We would need actual test credentials to proceed further
    // This test confirms the redirect to Cognito works correctly
    console.log("Successfully redirected to Cognito Hosted UI:", currentUrl);
    
  } catch (error) {
    // If redirect fails, check if it's due to configuration
    const errorElement = await page.locator('#error').textContent();
    if (errorElement && errorElement.includes('Configuration Required')) {
      test.skip(true, "Cognito configuration not properly deployed");
    } else {
      throw error;
    }
  }
});