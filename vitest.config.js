import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/test/**/*.test.mjs", "app/system/**/*.test.mjs"],
  },
});
