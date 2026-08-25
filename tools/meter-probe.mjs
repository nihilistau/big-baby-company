#!/usr/bin/env node
/**
 * Meter attribution probe.
 *
 * The four persistent meters are each fed by several terms pulling in
 * different directions, so when one flatlines it is not obvious which term is
 * responsible. This walks full campaigns and attributes every delta to the
 * phase that produced it.
 *
 * A meter is "pinned" when it has stopped being a decision: parked against one
 * end of its range, where its own multiplier is saturated or clamped and play
 * can no longer move it. Standing pins at the floor, trust and morale at the
 * ceiling. That is the number to watch — a low meter is fine, a stuck one is
 * a system that has quietly switched itself off.
 *
 *   node tools/meter-probe.mjs                       # every meter
 *   node tools/meter-probe.mjs --meter trust
 *   node tools/meter-probe.mjs --meter standing --runs 200
 *   node tools/meter-probe.mjs --meter trust --verbose
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContent, catalogFor } from "../src/sim/content.js";
import { createState, currentTitle } from "../src/sim/state.js";
import * as Actions from "../src/sim/actions.js";
import * as Q from "../src/sim/quarter.js";
import { pointsLeft } from "../src/sim/economy.js";
import { mulberry32, hashSeed } from "../src/sim/rng.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));

const content = buildContent({
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

const ARCHETYPES = {
  pcmax: {
    axis: "pc",
    dealPref: ["investor-visionary", "investor-growth", "investor-seed", "publisher-standard", "self-fund"],
    channelPref: ["awards", "trailers", "none"],
    hireInjectors: true,
    upgradePref: ["pr-firm", "marketing-dept", "extra-desk", "legal-retainer"],
  },
  funmax: {
    axis: "fun",
    dealPref: ["publisher-boutique", "self-fund", "crowdfund", "publisher-standard"],
    channelPref: ["honest", "festival", "trailers", "none"],
    hireInjectors: false,
    upgradePref: ["extra-desk", "qa-lab", "engine-license", "community-team", "third-desk"],
  },
  goremax: {
    axis: "gore",
    dealPref: ["self-fund", "publisher-aggressive", "publisher-boutique"],
    channelPref: ["influencers", "astroturf", "trailers", "none"],
    hireInjectors: false,
    upgradePref: ["extra-desk", "marketing-dept", "legal-retainer", "storefront-deal"],
  },
  moneymax: {
    axis: "money",
    dealPref: ["publisher-aggressive", "publisher-standard", "investor-growth", "self-fund"],
    channelPref: ["astroturf", "influencers", "trailers", "none"],
    hireInjectors: true,
    upgradePref: ["marketing-dept", "storefront-deal", "publishing-arm", "merch-line", "extra-desk"],
  },
  pcthenfun: {
    axis: "pc",
    axisByAct: { 1: "pc", 2: "fun", 3: "mixed" },
    dealPref: ["investor-growth", "investor-seed", "publisher-boutique", "self-fund"],
    channelPref: ["awards", "trailers", "honest", "none"],
    hireInjectors: true,
    hireInjectorsByAct: { 1: true, 2: false, 3: false },
    upgradePref: ["extra-desk", "marketing-dept", "qa-lab", "pr-firm", "community-team"],
  },
  // Diagnostic: funmax that actually spends on reputation. Every channel but
  // `none` is gated behind the marketing department, so buying it first is
  // what makes `festival` (+7 standing a launch) reachable at all; `mocap-stage`
  // then adds +2 a quarter. This is the same studio choosing to care. If it can
  // hold standing where plain funmax cannot, the meter is a decision rather
  // than a countdown.
  "funmax+rep": {
    axis: "fun",
    dealPref: ["publisher-boutique", "self-fund", "crowdfund", "publisher-standard"],
    channelPref: ["festival", "trailers", "honest", "none"],
    hireInjectors: false,
    upgradePref: ["marketing-dept", "extra-desk", "mocap-stage", "qa-lab", "community-team"],
  },
  // Diagnostic: a FUN studio buying every reputation lever the game sells —
  // marketing department, PR firm, the awards circuit (+12 a launch), and the
  // standing-generating staff, who cost it box slots by injecting their own
  // features. If this cannot hold standing, no amount of paying for it works.
  "funmax+awards": {
    axis: "fun",
    dealPref: ["publisher-standard", "investor-seed", "publisher-boutique", "self-fund"],
    channelPref: ["awards", "festival", "trailers", "none"],
    hireInjectors: true,
    injectorsEveryAct: true,
    upgradePref: ["marketing-dept", "pr-firm", "extra-desk", "mocap-stage", "qa-lab"],
  },
  balanced: {
    axis: "mixed",
    dealPref: ["publisher-standard", "investor-seed", "self-fund", "publisher-boutique"],
    channelPref: ["trailers", "festival", "honest", "none"],
    hireInjectors: false,
    upgradePref: ["extra-desk", "qa-lab", "marketing-dept", "ergonomic-chairs", "engine-license"],
  },
};

function cardScore(f, axis) {
  const money = (f.money || 0) * 6;
  switch (axis) {
    case "pc": return (f.pc || 0) * 3 - (f.jank || 0) * 0.05;
    case "fun": return (f.fun || 0) * 3 + (f.ordinary || 0) - (f.jank || 0) * 0.08;
    case "gore": return (f.gore || 0) * 3 + (f.fun || 0) - (f.jank || 0) * 0.05;
    case "money": return money + (f.hype || 0) * 0.2;
    default:
      return (f.fun || 0) * 1.6 + (f.gore || 0) + (f.ordinary || 0) * 1.2 + money * 0.5 - (f.jank || 0) * 0.1;
  }
}

function playPitch(state, arch) {
  const offers = Q.offeredConcepts(state, content);
  if (!offers.length) return;
  Actions.chooseConcept(state, [...offers].sort((a, b) => b.slots - a.slots)[0].id, content);
  const available = Actions.dealOffersFor(state, content);
  let deal = null;
  for (const id of arch.dealPref) {
    deal = available.find((d) => d.id === id);
    if (deal) {
      if (state.cash + Actions.dealTerms(state, content, deal).netNow > -200000) break;
      deal = null;
    }
  }
  deal = deal || available.find((d) => d.id === "self-fund") || available[0];
  Actions.chooseDeal(state, deal.id, content);
  for (const id of arch.upgradePref) {
    const up = content.upgrades[id];
    if (up && state.cash > up.cost * 3.2 && Actions.buyUpgrade(state, id, content).ok) break;
  }
}

function playProduction(state, arch) {
  const title = currentTitle(state);
  const want = arch.hireInjectorsByAct ? arch.hireInjectorsByAct[state.act] : arch.hireInjectors;
  // The stock bots only take injectors in Act I, and the crash takes the team
  // with it — so by Act III every archetype is on talent, some of which costs
  // standing. `injectorsEveryAct` lets a diagnostic actually hold the line.
  const injectors = want && (arch.injectorsEveryAct || state.act === 1);
  const pool = Actions.hireOffersFor(state, content).filter((p) =>
    p.traits.includes(injectors ? "injector" : "talent")
  );
  for (const p of pool) {
    if (state.staff.length >= state.studio.staffCap) break;
    if (state.cash < p.salary * 5) break;
    Actions.hire(state, p.id, content);
  }
  const axis = arch.axisByAct?.[state.act] ?? arch.axis;
  const cards = catalogFor(content, title.act, state.unlockedCards || [])
    .map((f) => ({ f, v: cardScore(f, axis) / (f.cost || 1) }))
    .sort((a, b) => b.v - a.v);
  let guard = 0;
  while (title.cards.length < title.slots && guard++ < 60) {
    if (!cards.find((p) => Actions.placeCard(state, p.f.id, content).ok)) break;
  }
  guard = 0;
  while (title.cards.length < title.slots && !Q.canAdvance(state, content) && guard++ < 6) {
    if (state.cash < 40000) break;
    if (!Actions.crunch(state, content).ok) break;
    if (!cards.find((p) => Actions.placeCard(state, p.f.id, content).ok)) break;
  }
  if (pointsLeft(state, content) >= 1 && title.cards.length >= title.slots) {
    Actions.polish(state, content);
  }
}

function playLaunch(state, arch) {
  const channels = Actions.marketingChannelsFor(state, content);
  let channel = null;
  for (const id of arch.channelPref) {
    channel = channels.find((c) => c.id === id);
    if (channel) break;
  }
  channel = channel || channels[0];
  const spend = channel.free ? 0 : Math.min(Math.max(0, state.cash * 0.22), 220000);
  Actions.setMarketing(state, channel.id, Math.round(spend), content);
}

function resolveEvent(state, arch, rng) {
  if (!state.pendingEvent || state.eventChoice != null) return;
  const event = content.events[state.pendingEvent];
  if (!event) return;
  let best = 0, bestVal = -Infinity;
  const ax = arch.axisByAct?.[state.act] ?? arch.axis;
  event.choices.forEach((c, i) => {
    const e = c.effects || {};
    const flat = e.roll ? { ...(e.roll.success || {}), ...(e.roll.fail || {}) } : e;
    let v = (flat.cash || 0) / 20000;
    v += (flat.trust || 0) * (ax === "pc" ? -0.2 : 0.35);
    v += (flat.standing || 0) * (ax === "pc" ? 0.45 : 0.05);
    v += (flat.morale || 0) * 0.18 - (flat.jank || 0) * 0.22 + (flat.hype || 0) * 0.2;
    v += ((flat.copiesMul ?? 1) - 1) * (ax === "pc" ? 4 : 22) + (flat.devPoints || 0) * 2.5;
    v += rng() * 0.6;
    if (v > bestVal) { bestVal = v; best = i; }
  });
  Actions.chooseEventOption(state, best, content);
}

const METERS = {
  standing: {
    // At zero the wire multiplier is already clamped at its floor and deal
    // quality has stopped responding to anything the player does.
    pinned: (v) => v <= 0,
    pinnedAt: "0",
  },
  trust: {
    // trustMul spans 0.60 to 1.40 across 0..100. By 90 it is at 1.32, inside
    // 10% of its ceiling, so further trust buys almost nothing and losing some
    // costs almost nothing.
    pinned: (v) => v >= 90,
    pinnedAt: "90+",
  },
  heat: {
    // Below the backlash floor no roll ever fires, so heat is inert scenery.
    pinned: (v) => v <= 0,
    pinnedAt: "0",
  },
  morale: {
    // Every consequence is threshold-based and the lowest threshold is 30.
    pinned: (v) => v >= 95,
    pinnedAt: "95+",
  },
};

const METER_KEYS = Object.keys(METERS);

/**
 * Play one campaign, recording every meter at each quarter boundary plus the
 * total change contributed while each phase was resolving. Phase totals are
 * measured from the state rather than recomputed from the formulas, so they
 * stay correct if the sim changes underneath.
 */
function probe(seed, archName) {
  const arch = ARCHETYPES[archName];
  const rng = mulberry32(hashSeed(seed, archName));
  let state = createState({ seed, difficulty: "standard" });
  Q.beginRun(state, content);

  const byPhase = {};
  for (const m of METER_KEYS) byPhase[m] = { pitch: 0, production: 0, launch: 0 };
  const series = [];
  let guard = 0;

  while (state.screen !== "ending" && state.screen !== "gameover" && guard++ < 200) {
    if (state.screen === "crash") { state = Q.leaveCrash(state, content); continue; }
    if (state.screen === "acquisition") {
      state = Q.resolveAcquisition(state, content, false);
      continue;
    }
    const phase = state.phase;
    const before = {};
    for (const m of METER_KEYS) before[m] = state[m];

    resolveEvent(state, arch, rng);
    if (phase === "pitch") playPitch(state, arch);
    else if (phase === "production") playProduction(state, arch);
    else if (phase === "launch") playLaunch(state, arch);

    const result = Q.advance(state, content);
    if (!result.ok) break;
    state = result.state;

    const point = { q: state.quarter, act: state.act };
    for (const m of METER_KEYS) {
      byPhase[m][phase] += state[m] - before[m];
      point[m] = state[m];
    }
    series.push(point);
  }

  return { archetype: archName, byPhase, series, quarters: series.length };
}

// --- Reporting ------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const runs = Number(arg("runs", 120));
const only = arg("archetype", null);
const meterArg = arg("meter", null);
const verbose = argv.includes("--verbose");

if (meterArg && !METERS[meterArg]) {
  console.error(`unknown meter "${meterArg}" — expected one of ${METER_KEYS.join(", ")}`);
  process.exit(1);
}
const meters = meterArg ? [meterArg] : METER_KEYS;

const WORDS = ["amber", "cobalt", "gilded", "hollow", "marrow", "nectar", "opal",
  "pewter", "quartz", "rustle", "saffron", "tumble", "umber", "velvet", "wicker"];
const seedAt = (i) => {
  const n = WORDS.length;
  return [i % n, Math.floor(i / n) % n, Math.floor(i / (n * n)) % n]
    .map((k) => WORDS[k]).join("-");
};

const names = only ? [only] : Object.keys(ARCHETYPES);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const quantile = (a, f) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * f))];
};

// One pass over the campaigns; every meter is read off the same runs.
const byArchetype = new Map();
for (const name of names) {
  const results = [];
  for (let i = 0; i < runs; i++) results.push(probe(seedAt(i), name));
  byArchetype.set(name, results);
}

console.log(`\nMeter probe — ${runs} runs per archetype, difficulty=standard`);

for (const meter of meters) {
  const spec = METERS[meter];
  console.log(`\n── ${meter.toUpperCase()}  (pinned at ${spec.pinnedAt})\n`);
  console.log(
    "archetype".padEnd(13) +
    "per-cycle contribution".padEnd(34) +
    "act III".padEnd(26) +
    "pinned"
  );
  console.log(
    "".padEnd(13) +
    "pitch    prod     launch   net".padEnd(34) +
    "p10      median   p90".padEnd(26) +
    ""
  );
  console.log("-".repeat(87));

  for (const name of names) {
    const results = byArchetype.get(name);
    const cycles = mean(results.map((r) => r.quarters)) / 3;
    const phase = (k) => (mean(results.map((r) => r.byPhase[meter][k])) / cycles).toFixed(1);
    const net = (
      mean(results.map((r) =>
        r.byPhase[meter].pitch + r.byPhase[meter].production + r.byPhase[meter].launch
      )) / cycles
    ).toFixed(1);

    const act3 = results.flatMap((r) => r.series.filter((p) => p.act === 3).map((p) => p[meter]));
    const all = results.flatMap((r) => r.series.map((p) => p[meter]));
    const pinned = all.length ? all.filter(spec.pinned).length / all.length : 0;

    console.log(
      name.padEnd(13) +
      `${phase("pitch").padStart(6)}${phase("production").padStart(9)}${phase("launch").padStart(9)}${String(net).padStart(7)}`.padEnd(34) +
      `${String(quantile(act3, 0.1)).padStart(6)}${String(quantile(act3, 0.5)).padStart(9)}${String(quantile(act3, 0.9)).padStart(8)}`.padEnd(26) +
      `${(pinned * 100).toFixed(0)}%`
    );
  }

  if (verbose) {
    const r = byArchetype.get(names[0])[0];
    console.log(`\n  ${r.archetype} · seed ${seedAt(0)}`);
    console.log("  " + r.series.map((p) => `Q${p.q}:${p[meter]}`).join("  "));
  }
}

console.log(
  "\npinned = share of all quarters parked against the end of the range where\n" +
  "the meter stops responding to play. A low meter is fine; a stuck one means\n" +
  "that system has switched itself off.\n"
);
