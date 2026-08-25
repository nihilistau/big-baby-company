import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environmentMatchGlobs: [
      ["tests/ui/**", "jsdom"],
      ["tests/**", "node"],
    ],
  },
});
