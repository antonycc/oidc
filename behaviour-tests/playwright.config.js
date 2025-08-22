// Latest Playwright. Record screenshots, video, traces on every test.
// Artifacts are uploaded by GH Actions.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL, // e.g. https://oidc.antonycc.com
    headless: true,
    screenshot: 'on',
    video: 'on',
    trace: 'on'
  },
  reporter: [['html', { open: 'never' }]]
});