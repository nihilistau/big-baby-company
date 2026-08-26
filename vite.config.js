import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// GitHub Pages serves this from /<repo>/, so the bundle needs a base path.
// Local dev and `npm run preview` keep "/" — set BASE_PATH in CI.
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  publicDir: "public",
  server: { port: 5173, strictPort: false },
  build: { assetsInlineLimit: 0 },
});
