import fs from "node:fs";
import path from "node:path";
import { buildContent } from "../src/sim/content.js";
import { createState } from "../src/sim/state.js";
import * as Q from "../src/sim/quarter.js";
import * as Actions from "../src/sim/actions.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));

export const content = buildContent({
  features: read("features.json"),
  staff: read("staff.json"),
  titles: read("titles.json"),
  events: read("events.json"),
  chirps: read("chirps.json"),
  synergies: read("synergies.json"),
  upgrades: read("upgrades.json"),
  deals: read("deals.json"),
  marketing: read("marketing.json"),
  endings: read("endings.json"),
  achievements: read("achievements.json"),
});

export const raw = {
  features: read("features.json"),
  staff: read("staff.json"),
  titles: read("titles.json"),
  events: read("events.json"),
  synergies: read("synergies.json"),
  upgrades: read("upgrades.json"),
  deals: read("deals.json"),
  chirps: read("chirps.json"),
  endings: read("endings.json"),
  achievements: read("achievements.json"),
};

/** A run parked in production on a chosen concept, ready to have cards placed. */
export function inProduction(opts = {}) {
  const state = createState({ seed: opts.seed || "test-seed-one", difficulty: opts.difficulty });
  Q.beginRun(state, content);
  // Jump straight to the title/act we want to exercise.
  if (opts.act) {
    state.act = opts.act;
    state.titleIndex = opts.titleIndex ?? (opts.act === 1 ? 0 : opts.act === 2 ? 3 : 6);
    while (state.titles.length <= state.titleIndex) {
      state.titles.push({ ...state.titles[0], index: state.titles.length });
    }
  }
  const title = state.titles[state.titleIndex];
  title.index = state.titleIndex;
  title.act = opts.act || 1;
  title.conceptId = opts.conceptId || null;
  title.name = opts.name || "Test Title";
  title.slots = opts.slots ?? 5;
  title.price = opts.price ?? 40;
  title.budget = opts.budget ?? 50000;
  title.cards = [];
  title.deal = opts.deal || { type: "self", revShare: 1, quota: null, wireMul: 0, advance: 0 };
  state.phase = "production";
  state.pendingEvent = null;
  state.eventChoice = 0;
  state.cash = opts.cash ?? 250000;
  if (opts.standing != null) state.standing = opts.standing;
  if (opts.trust != null) state.trust = opts.trust;
  if (opts.heat != null) state.heat = opts.heat;
  if (opts.morale != null) state.morale = opts.morale;
  if (opts.staff) for (const id of opts.staff) Actions.hire(state, id, content);
  if (opts.cards) for (const id of opts.cards) title.cards.push(id);
  return state;
}

export function place(state, ids) {
  for (const id of ids) Actions.placeCard(state, id, content);
  return state;
}

/** Advance until a predicate holds or we run out of patience. */
export function runUntil(state, predicate, play, limit = 200) {
  let s = state;
  for (let i = 0; i < limit; i++) {
    if (predicate(s)) return s;
    if (s.screen === "crash") { s = Q.leaveCrash(s, content); continue; }
    if (s.screen === "acquisition") { s = Q.resolveAcquisition(s, content, false); continue; }
    if (s.screen === "ending" || s.screen === "gameover") return s;
    play?.(s);
    const r = Q.advance(s, content);
    if (!r.ok) throw new Error(`stuck at Q${s.quarter} ${s.phase}: ${r.reason}`);
    s = r.state;
  }
  return s;
}

export const PC_CARDS = ["pc-pronouns", "pc-body", "pc-they", "pc-lecture", "pc-males"];
export const FUN_CARDS = ["fun-gunfeel", "fun-npc", "fun-plot", "fun-boss", "fun-ui"];
export const GORE_CARDS = ["gore-spray", "gore-dismember", "gore-headshot"];
export const ORD_CARDS = ["ord-dad", "ord-nurse", "ord-dave"];
