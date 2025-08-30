// Latest Playwright. Record screenshots, video, traces on every test.
// Artifacts are uploaded by GH Actions.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.live\.test\.(ts|js)$/,
  testIgnore: /.*load\.live\.test\.js$/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL, // e.g. https://oidc.antonycc.com
    headless: true,
    screenshot: "on",
    video: "on",
    trace: "on",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["html", { open: "never" }]],
});
