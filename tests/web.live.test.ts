import { test, expect } from "@playwright/test";
import { v4 } from "uuid";
import { fetchDemoCredentials } from "./demo-credentials.js";

// use dotenv variables for sensitive info
import * as dotenv from "dotenv";
dotenv.config();

const DOMAIN_NAME = process.env.DOMAIN_NAME || "oidc.antonycc.com";
const BASE_URL = process.env.BASE_URL || `https://${DOMAIN_NAME}`;

// @ts-ignore
test("Home renders", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString());
  await expect(page.getByRole("heading", { name: "OIDC - Home" })).toBeVisible();
});

// @ts-ignore
test("Direct login form: failed login shows error", async ({ page }) => {
  await page.goto(new URL("./loginDirect.html", BASE_URL).toString());
  await page.getByRole("heading", { name: "OIDC - Direct Login" }).waitFor();

  // Try to use demo credentials panel, but fall back to fetching credentials if needed
  try {
    await page.waitForSelector("#demo-credentials", { state: "visible", timeout: 5000 });
    await page.click("#demo-fill-btn");
  } catch (error) {
    // Fallback: fetch credentials from website and fill manually
    const credentials = await fetchDemoCredentials(BASE_URL);
    await page.getByLabel("Username").fill(credentials.TEST_USERNAME);
    await page.getByLabel("Password").fill(credentials.TEST_PASSWORD);
  }

  // Change password to wrong value to test error
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

// @ts-ignore
test("Direct login form: successful login returns tokens and claims", async ({ page }) => {
  await page.goto(new URL("./loginDirect.html", BASE_URL).toString());
  await page.getByRole("heading", { name: "OIDC - Direct Login" }).waitFor();

  // Try to use demo credentials panel, but fall back to fetching credentials if needed
  try {
    await page.waitForSelector("#demo-credentials", { state: "visible", timeout: 5000 });
    await page.click("#demo-fill-btn");
  } catch (error) {
    // Fallback: fetch credentials from website and fill manually
    const credentials = await fetchDemoCredentials(BASE_URL);
    await page.getByLabel("Username").fill(credentials.TEST_USERNAME);
    await page.getByLabel("Password").fill(credentials.TEST_PASSWORD);
  }

  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/post-auth\.html\?code=/, { timeout: 20000 });
  await expect(page.getByText("Summary: Authorization code exchanged for tokens, user info retrieved")).toBeVisible();
  await expect(page.getByText("User is now authenticated and logged in")).toBeVisible();
});
