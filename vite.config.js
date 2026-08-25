import { defineConfig } from "vite";

// GitHub Pages serves this from /<repo>/, so the bundle needs a base path.
// Local dev and `npm run preview` keep "/" — set BASE_PATH in CI.
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  publicDir: "public",
  server: { port: 5173, strictPort: false },
  build: { assetsInlineLimit: 0 },
});
