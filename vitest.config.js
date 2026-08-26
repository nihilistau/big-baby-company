import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ["tests/**/*.test.js"],
    environmentMatchGlobs: [
      ["tests/ui/**", "jsdom"],
      ["tests/**", "node"],
    ],
  },
});
