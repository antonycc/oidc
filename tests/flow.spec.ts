import { test, expect } from "@playwright/test";

// @ts-ignore
test("Cognito Hosted UI -> OP login -> redirect back with code", async ({ page }) => {
  // @ts-ignore
  const cognitoDomain = process.env.COGNITO_DOMAIN!;
  // @ts-ignore
  const clientId = process.env.COGNITO_CLIENT_ID!;
  // @ts-ignore
  const redirect = new URL("/post-auth.html", process.env.BASE_URL!).toString();
  const url = `https://${cognitoDomain}/oauth2/authorize?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(redirect)}`;
  await page.goto(url);
  // OP login page should render after Cognito redirects to our OP /authorize
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  await page.getByLabel("Username").fill("test-user");
  await page.getByLabel("Password").fill("Passw0rd!");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL(/post-auth\.html\?code=/, { timeout: 20000 });
  await expect(page).toHaveURL(/code=/);
  await expect(page.locator("#status")).toContainText("Received code=");
});

// @ts-ignore
test("Direct login form: failed login shows error", async ({ page }) => {
  await page.goto("/login.html");
  await page.getByRole("heading", { name: "Direct OP Login" }).waitFor();
  await page.getByLabel("Username").fill("test-user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#error")).toContainText("Invalid username or password");
});

// @ts-ignore
test("Direct login form: successful login returns tokens and claims", async ({ page }) => {
  await page.goto("/login.html");
  await page.getByRole("heading", { name: "Direct OP Login" }).waitFor();
  await page.getByLabel("Username").fill("test-user");
  await page.getByLabel("Password").fill("Passw0rd!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/post-auth\.html\?code=/, { timeout: 20000 });
  await expect(page.locator("#status")).toContainText("Token exchange");
  await expect(page.locator("#result")).toContainText("id_token");
  await expect(page.locator("#claims")).toContainText("sub");
});

// @ts-ignore
test("Home renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "OIDC Provider" })).toBeVisible();
});
