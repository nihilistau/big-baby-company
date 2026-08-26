/**
 * The shipped version, injected at build time from package.json.
 *
 * It exists so a playtester can tell us which build they were on without
 * knowing what a commit is. `vite.config.js` and `vitest.config.js` both define
 * `__APP_VERSION__`, and a test asserts it still matches package.json — a
 * version string that lies is worse than no version string.
 */
export const VERSION = __APP_VERSION__;
