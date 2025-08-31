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
    await expect(page.getByText("Login with Cognito")).toBeVisible();
    await expect(page.getByRole("link", { name: "Login with Cognito" })).toBeVisible();
});

// @ts-ignore
test("Cognito login page loads and prepares redirect", async ({ page }) => {
  await page.goto(new URL("./loginCognito.html", BASE_URL).toString());
  await page.getByRole("heading", { name: "OIDC - Cognito Login" }).waitFor();
  await expect(page.getByText("You will be redirected to AWS Cognito")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Preparing authentication");
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
  await expect(page.locator("#status")).toContainText("Authorization code received from Cognito");
  await expect(page.locator("#result")).toContainText("authorization_code");
  await expect(page.locator("#result")).toContainText("test-auth-code-123");
  await expect(page.locator(".login-status")).toContainText("Logged in (via Cognito)");
});

// Note: Full Cognito integration test would require actual Cognito deployment
// and would be part of a higher-level integration test that involves:
// 1. Going to loginCognito.html
// 2. Being redirected to actual Cognito Hosted UI
// 3. Authenticating with Cognito
// 4. Being redirected back to post-authCognito.html with real auth code
// This test would require COGNITO_DOMAIN and COGNITO_CLIENT_ID to be properly set
// and is marked with a skip condition for now

test.skip("Full Cognito flow integration test", async ({ page }) => {
  // This test requires a deployed Cognito environment
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
    test.skip(true, "Cognito environment variables not configured");
  }
  
  // Start the Cognito login flow
  await page.goto(new URL("./loginCognito.html", BASE_URL).toString());
  await page.getByRole("heading", { name: "OIDC - Cognito Login" }).waitFor();
  
  // Wait for redirect to Cognito (this would need to be implemented when Cognito is properly configured)
  await page.waitForURL(new RegExp(COGNITO_DOMAIN), { timeout: 10000 });
  
  // At this point, we'd be on Cognito's hosted UI
  // We would need to:
  // 1. Fill in credentials on Cognito's form
  // 2. Submit the form
  // 3. Wait for redirect back to our post-authCognito.html
  // 4. Verify the successful authentication
  
  // This is a placeholder for the full flow
  console.log("Full Cognito integration test would run here");
});