import { chromium } from "playwright";

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const BASE_URL = "https://oidc.antonycc.com";
  const TEST_USERNAME = "test-user";
  const TEST_PASSWORD = "c810fb39-86a9-4d2f-8107-119ade9605f8";

  try {
    // 1. Home Page Screenshot
    console.log("Taking home page screenshot...");
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "./docs/screenshots/home-page.png", fullPage: true });
    console.log("✓ Home page screenshot saved");

    // 2. Login Page Screenshot
    console.log("Taking login page screenshot...");
    await page.goto(`${BASE_URL}/loginDirect.html`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "./docs/screenshots/login-page.png", fullPage: true });
    console.log("✓ Login page screenshot saved");

    // 3. Successful Login Flow and Post-Auth Screenshot
    console.log("Performing login flow...");
    await page.getByLabel("Username").fill(TEST_USERNAME);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for redirect to post-auth page
    await page.waitForURL(/post-auth\.html\?code=/, { timeout: 20000 });
    //await page.waitForSelector("#status", { timeout: 10000 });

    // Wait a bit more for the page to fully load and process tokens
    await page.waitForTimeout(2000);

    console.log("Taking post-auth screenshot...");
    await page.screenshot({ path: "./docs/screenshots/post-auth-page.png", fullPage: true });
    console.log("✓ Post-auth page screenshot saved");
  } catch (error) {
    console.error("Error during screenshot capture:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

takeScreenshots().catch(console.error);
