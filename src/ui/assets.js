/**
 * Resolve a runtime asset path against the deployment base.
 *
 * Files in `public/` are referenced by absolute path in generated markup, which
 * breaks the moment the app is served from a subpath — GitHub Pages serves this
 * at `/big-baby-company/`. Vite rewrites bundled imports and `index.html`
 * attributes for you, but it cannot rewrite a string literal built at runtime,
 * so those have to resolve the base explicitly.
 *
 * The leading slash is kept in call sites so `gen-art.mjs --check` can still
 * scan the source for every asset the game references.
 */
const BASE = import.meta.env?.BASE_URL || "/";

export function asset(path) {
  return BASE + String(path).replace(/^\/+/, "");
}
