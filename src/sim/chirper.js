import { pushChirp } from "./state.js";
import { pick, stream } from "./rng.js";

/** Pull one post from a keyed pool. Deterministic per (seed, quarter, key, n). */
export function post(state, content, key, n = 0) {
  const pool = content.chirps.pools[key];
  if (!pool?.length) return null;
  const rng = stream(state, "chirp", state.quarter, key, n, state.chirps.length);
  const chosen = pick(rng, pool);
  if (!chosen) return null;
  const account = content.chirps.accounts[chosen.who] || { name: chosen.who };
  pushChirp(state, {
    who: account.name,
    handle: account.handle,
    kind: account.kind,
    text: chosen.text,
    key,
  });
  return chosen;
}

/** Post with a specific author name substituted in (layoffs, hires, quits). */
export function postAs(state, content, key, name, index = 0) {
  const pool = content.chirps.pools[key];
  if (!pool?.length) return null;
  const chosen = pool[index % pool.length];
  pushChirp(state, {
    who: name,
    handle: "@" + String(name).toLowerCase().replace(/[^a-z]+/g, ""),
    kind: "staff",
    text: chosen.text,
    key,
  });
  return chosen;
}

/**
 * The feed after a launch. Reads the actual result rather than a fixed script,
 * so a run that flops loudly reads differently from one that flops quietly.
 */
export function launchFeed(state, content, result) {
  let n = 0;
  const p = (key) => post(state, content, key, n++);

  if (result.pc >= 6) p("launch-pc-high");
  else if (result.act === 1) p("launch-pc-low");

  if (result.fun >= 5) p("launch-fun-high");
  if (result.gore >= 4) p("launch-gore-high");
  if (result.ordinary >= 4) p("launch-ordinary-high");

  if (result.copies >= 1000000) p("launch-megahit");
  else if (result.copies >= 150000) p("launch-hit");
  else if (result.copies < 2000) p("launch-flop");

  if (result.jank >= 45) p(result.hasJankCharm ? "jank-charm" : "jank-high");
  if (result.synergies.length >= 2) p("synergy");
  if (result.conflicts.length >= 1) p("conflict");

  if (result.wirePaid > 0) p("wire-paid");
  if (result.wire > 0 && result.wirePaid === 0) p("wire-voided");
  if (!result.quotaMet) p("quota-missed");

  const monetized = result.inGameRevenue > result.unitsRevenue * 0.5;
  if (monetized) p("monetization");

  if (state.heat >= 65) p("heat-high");
  if (state.trust >= 80) p("trust-high");
  else if (state.trust <= 20) p("trust-low");
  if (state.cash < 0) p("debt");
}

/** Quiet-quarter colour so the feed is never dead between launches. */
export function quarterFeed(state, content) {
  let n = 100;
  const p = (key) => post(state, content, key, n++);
  if (state.morale <= 28) p("morale-low");
  else if (state.morale >= 85) p("morale-high");
  if (state.heat >= 70) p("heat-high");
  if (state.cash < 0) p("debt");
}
