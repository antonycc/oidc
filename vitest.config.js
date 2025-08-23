import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['app/oidc/test/**/*.test.mjs']
  }
});