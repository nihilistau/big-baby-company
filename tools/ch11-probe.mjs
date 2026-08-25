#!/usr/bin/env node
/**
 * Where does Chapter 11 actually fire for a competent, frugal player?
 *
 * The archetype bots in balance-sim.mjs are deliberately greedy, so their
 * bankruptcy rate says more about them than the game. This one plays it safe —
 * cheapest concept, no upgrades, no marketing spend, best cheap cards — and
 * reports which quarter the wheels come off. Act II clustering is the intended
 * beat; Act III clustering is a balance bug.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContent } from "../src/sim/content.js";
import { createState, currentTitle } from "../src/sim/state.js";
import * as Q from "../src/sim/quarter.js";
import * as Actions from "../src/sim/actions.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
const content = buildContent({
  features: read("features.json"), staff: read("staff.json"), titles: read("titles.json"),
  events: read("events.json"), chirps: read("chirps.json"), synergies: read("synergies.json"),
  upgrades: read("upgrades.json"), deals: read("deals.json"), marketing: read("marketing.json"),
  endings: read("endings.json"), achievements: read("achievements.json"),
});

function frugalTurn(state) {
  if (state.pendingEvent && state.eventChoice == null) {
    Actions.chooseEventOption(state, 0, content);
  }
  if (state.phase === "pitch") {
    const offers = Q.offeredConcepts(state, content);
    if (offers.length && !currentTitle(state).conceptId) {
      Actions.chooseConcept(state, [...offers].sort((a, b) => a.budget - b.budget)[0].id, content);
    }
    if (!currentTitle(state).deal) {
      const deals = Actions.dealOffersFor(state, content);
      const want =
        deals.find((d) => d.id === "publisher-boutique") ||
        deals.find((d) => d.id === "self-fund") ||
        deals[0];
      Actions.chooseDeal(state, want.id, content);
    }
  }
  if (state.phase === "production") {
    const title = currentTitle(state);
    const pool = content.featuresList
      .filter((f) => f.acts.includes(title.act) && !f.unlock && (f.cost || 1) === 1)
      .sort(
        (a, b) =>
          (b.fun || 0) + (b.gore || 0) + (b.ordinary || 0) -
          ((a.fun || 0) + (a.gore || 0) + (a.ordinary || 0))
      );
    for (const f of pool) {
      if (title.cards.length >= title.slots) break;
      Actions.placeCard(state, f.id, content);
    }
  }
  if (state.phase === "launch" && !currentTitle(state).marketing.channel) {
    Actions.setMarketing(state, "none", 0, content);
  }
}

const runs = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 200;
const byQuarter = {};
const byAct = { 1: 0, 2: 0, 3: 0 };
let filed = 0;
let ended = 0;
const finals = [];

for (let r = 0; r < runs; r++) {
  let state = createState({ seed: `probe-${r}` });
  Q.beginRun(state, content);
  let fired = null;

  for (let i = 0; i < 200; i++) {
    if (state.screen === "crash") { state = Q.leaveCrash(state, content); continue; }
    if (state.screen === "acquisition") { state = Q.resolveAcquisition(state, content, false); continue; }
    if (state.screen !== "playing") break;
    frugalTurn(state);
    const before = state.flags.chapter11;
    const result = Q.advance(state, content);
    if (!result.ok) break;
    state = result.state;
    if (!fired && state.flags.chapter11 > before) fired = { q: state.quarter, act: state.act };
  }
  if (fired) {
    filed++;
    byQuarter[fired.q] = (byQuarter[fired.q] || 0) + 1;
    byAct[fired.act]++;
  }
  if (state.screen === "ending") ended++;
  finals.push(state.cash);
}

const median = [...finals].sort((a, b) => a - b)[Math.floor(finals.length / 2)];
console.log(`\nfrugal player, ${runs} runs`);
console.log(`  chapter 11 : ${((filed / runs) * 100).toFixed(1)}%`);
console.log(`  by act     : I ${byAct[1]} · II ${byAct[2]} · III ${byAct[3]}`);
console.log(`  reached an ending : ${((ended / runs) * 100).toFixed(1)}%`);
console.log(`  median final cash : $${Math.round(median).toLocaleString()}`);
console.log(
  "  quarter    : " +
    Object.entries(byQuarter)
      .sort((a, b) => a[0] - b[0])
      .map(([q, n]) => `Q${q}:${n}`)
      .join(" ") +
    "\n"
);
