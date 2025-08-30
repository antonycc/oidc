import { test, expect } from "@playwright/test";

// use dotenv variables for sensitive info
import * as dotenv from "dotenv";
dotenv.config();

const DOMAIN_NAME = process.env.DOMAIN_NAME || "oidc.antonycc.com";
const BASE_URL = process.env.BASE_URL || `https://${DOMAIN_NAME}`;
const TEST_USERNAME = process.env.TEST_USERNAME || "test-user";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";

// @ts-ignore
test("Home renders", async ({ page }) => {
    await page.goto(new URL("/", BASE_URL).toString());
    await expect(page.getByRole("heading", { name: "OIDC - Home" })).toBeVisible();
});

// @ts-ignore
test("Direct login form: failed login shows error", async ({ page }) => {
  await page.goto(new URL("./login.html", BASE_URL).toString());
  await page.getByRole("heading", { name: "OIDC - Login" }).waitFor();
  await page.getByLabel("Username").fill(TEST_USERNAME);
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

// @ts-ignore
test("Direct login form: successful login returns tokens and claims", async ({ page }) => {
  await page.goto(new URL("./login.html", BASE_URL).toString());
  await page.getByRole("heading", { name: "OIDC - Login" }).waitFor();
  await page.getByLabel("Username").fill("test-user");
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/post-auth\.html\?code=/, { timeout: 20000 });
  await expect(page.locator("#status")).toContainText("Token exchange");
  await expect(page.locator("#result")).toContainText("id_token");
  await expect(page.locator("#claims")).toContainText("sub");
});

