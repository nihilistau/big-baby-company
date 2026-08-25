import { SAVE_VERSION } from "./state.js";

const KEY = "bbc-save";

/**
 * Migrations from older schemas. The original build wrote an unversioned blob
 * straight from `JSON.parse` into the game, so a save from any earlier version
 * crashed on load. Anything we cannot confidently bring forward is rejected
 * and the player is offered a new game instead of a broken one.
 */
const MIGRATIONS = {
  // v1/v2 were the 8-quarter demo: a fundamentally different campaign shape
  // (design/ship parity, four fixed titles, no phases). There is no honest
  // mapping onto the 24-quarter run, so those saves are retired.
  1: () => null,
  2: () => null,
};

function migrate(raw) {
  let state = raw;
  let version = state.version ?? 1;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return null;
    state = step(state);
    if (!state) return null;
    version = state.version;
  }
  return state;
}

/** Shape guard. Cheap, and it catches hand-edited or truncated saves. */
function valid(state) {
  if (!state || typeof state !== "object") return false;
  if (typeof state.quarter !== "number" || state.quarter < 1) return false;
  if (typeof state.cash !== "number" || !Number.isFinite(state.cash)) return false;
  if (!Array.isArray(state.titles) || state.titles.length === 0) return false;
  if (!Array.isArray(state.staff)) return false;
  if (!state.studio || !Array.isArray(state.studio.upgrades)) return false;
  if (!["pitch", "production", "launch"].includes(state.phase)) return false;
  if (typeof state.seed !== "string") return false;
  return true;
}

export function saveState(state) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadState() {
  if (typeof localStorage === "undefined") return { ok: false, reason: "no-storage" };
  const raw = localStorage.getItem(KEY);
  if (!raw) return { ok: false, reason: "empty" };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }

  if ((parsed.version ?? 1) !== SAVE_VERSION) {
    const migrated = migrate(parsed);
    if (!migrated) return { ok: false, reason: "outdated" };
    parsed = migrated;
  }

  if (!valid(parsed)) return { ok: false, reason: "invalid" };
  return { ok: true, state: parsed };
}

export function clearSave() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}

export function hasSave() {
  if (typeof localStorage === "undefined") return false;
  return !!localStorage.getItem(KEY);
}

/** Summary for the Continue button without deserialising the whole run. */
export function savePreview() {
  const result = loadState();
  if (!result.ok) return null;
  const s = result.state;
  return {
    quarter: s.quarter,
    act: s.act,
    cash: s.cash,
    seed: s.seed,
    titleName: s.titles[s.titleIndex]?.name || "Untitled",
    mode: s.mode,
  };
}
