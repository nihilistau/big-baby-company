#!/usr/bin/env node
/**
 * Monte-Carlo balance harness.
 *
 * Plays N full campaigns with scripted archetype bots and reports the rank
 * distribution, cash curves and win share per strategy. This is how the
 * constants in src/sim/balance.js get tuned — we do not eyeball them.
 *
 *   node tools/balance-sim.mjs                 # 2000 runs, all archetypes
 *   node tools/balance-sim.mjs --runs 10000
 *   node tools/balance-sim.mjs --archetype funmax --verbose
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContent, catalogFor } from "../src/sim/content.js";
import { createState, currentTitle } from "../src/sim/state.js";
import * as Actions from "../src/sim/actions.js";
import * as Q from "../src/sim/quarter.js";
import { pointsLeft } from "../src/sim/economy.js";
import { MORALE } from "../src/sim/balance.js";
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

// --- Archetypes -----------------------------------------------------------

// The rare end of the ladder. Reaching "king baby" is what a focused run
// should do; these are what an exceptional one does.
const TOP_RANKS = ["emperor", "dynasty"];
const VIABLE_RANKS = ["king-baby", ...TOP_RANKS];

// Note: every channel but `none` is gated behind the marketing department,
// so an archetype that never buys it can never use a paid channel. Two of
// these had it last or not at all, which meant the sweep that gates deploys
// exercised almost none of the marketing system.
const ARCHETYPES = {
  pcmax: {
    axis: "pc",
    dealPref: ["investor-visionary", "investor-growth", "investor-seed", "publisher-standard", "self-fund"],
    channelPref: ["awards", "trailers", "none"],
    hireInjectors: true,
    upgradePref: ["pr-firm", "marketing-dept", "extra-desk", "legal-retainer"],
    // Never pivots. Kept as a control: the spiral is supposed to be a trap,
    // so we do not assert that this one can win.
    control: true,
  },
  funmax: {
    axis: "fun",
    dealPref: ["publisher-boutique", "self-fund", "crowdfund", "publisher-standard"],
    channelPref: ["honest", "festival", "trailers", "none"],
    hireInjectors: false,
    upgradePref: ["extra-desk", "marketing-dept", "qa-lab", "community-team", "third-desk"],
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
    // The arc the game is actually built around: take the wire while it exists,
    // then pivot the moment the investors leave.
    axis: "pc",
    axisByAct: { 1: "pc", 2: "fun", 3: "mixed" },
    dealPref: ["investor-growth", "investor-seed", "publisher-boutique", "self-fund"],
    channelPref: ["awards", "trailers", "honest", "none"],
    hireInjectors: true,
    hireInjectorsByAct: { 1: true, 2: false, 3: false },
    upgradePref: ["extra-desk", "marketing-dept", "qa-lab", "pr-firm", "community-team"],
    control: false,
  },
  balanced: {
    axis: "mixed",
    dealPref: ["publisher-standard", "investor-seed", "self-fund", "publisher-boutique"],
    channelPref: ["trailers", "festival", "honest", "none"],
    hireInjectors: false,
    upgradePref: ["extra-desk", "marketing-dept", "qa-lab", "ergonomic-chairs", "engine-license"],
  },
};

// --- Bot ------------------------------------------------------------------

function cardScore(f, axis) {
  const money = (f.money || 0) * 6;
  switch (axis) {
    case "pc":
      return (f.pc || 0) * 3 - (f.jank || 0) * 0.05;
    case "fun":
      return (f.fun || 0) * 3 + (f.ordinary || 0) - (f.jank || 0) * 0.08;
    case "gore":
      return (f.gore || 0) * 3 + (f.fun || 0) - (f.jank || 0) * 0.05;
    case "money":
      return money + (f.hype || 0) * 0.2;
    default:
      return (f.fun || 0) * 1.6 + (f.gore || 0) + (f.ordinary || 0) * 1.2 + money * 0.5 - (f.jank || 0) * 0.1;
  }
}

function playPitch(state, arch) {
  const offers = Q.offeredConcepts(state, content);
  if (!offers.length) return false;
  // Prefer more slots when we have the points to fill them.
  const best = [...offers].sort((a, b) => b.slots - a.slots)[0];
  Actions.chooseConcept(state, best.id, content);

  const available = Actions.dealOffersFor(state, content);
  let deal = null;
  for (const id of arch.dealPref) {
    deal = available.find((d) => d.id === id);
    if (deal) {
      const terms = Actions.dealTerms(state, content, deal);
      if (state.cash + terms.netNow > -200000) break;
      deal = null;
    }
  }
  deal = deal || available.find((d) => d.id === "self-fund") || available[0];
  Actions.chooseDeal(state, deal.id, content);

  // Buy an upgrade if we can comfortably afford it.
  for (const id of arch.upgradePref) {
    const up = content.upgrades[id];
    if (!up) continue;
    if (state.cash > up.cost * 3.2) {
      if (Actions.buyUpgrade(state, id, content).ok) break;
    }
  }
  return true;
}

function axisFor(arch, state) {
  return arch.axisByAct?.[state.act] ?? arch.axis;
}

function playProduction(state, arch) {
  const title = currentTitle(state);
  const wantInjectors = arch.hireInjectorsByAct
    ? arch.hireInjectorsByAct[state.act]
    : arch.hireInjectors;

  // Hire.
  if (state.act === 1 && wantInjectors) {
    const pool = Actions.hireOffersFor(state, content).filter((p) =>
      p.traits.includes("injector")
    );
    for (const p of pool) {
      if (state.staff.length >= state.studio.staffCap) break;
      if (state.cash < p.salary * 4) break;
      Actions.hire(state, p.id, content);
    }
  } else {
    const pool = Actions.hireOffersFor(state, content).filter((p) =>
      p.traits.includes("talent")
    );
    for (const p of pool) {
      if (state.staff.length >= state.studio.staffCap) break;
      if (state.cash < p.salary * 5) break;
      Actions.hire(state, p.id, content);
    }
  }

  // Draft cards.
  const pool = catalogFor(content, title.act, state.unlockedCards || [])
    .map((f) => ({ f, v: cardScore(f, axisFor(arch, state)) / (f.cost || 1) }))
    .sort((a, b) => b.v - a.v);

  let guard = 0;
  while (title.cards.length < title.slots && guard++ < 60) {
    const next = pool.find((p) => Actions.placeCard(state, p.f.id, content).ok);
    if (!next) break;
  }

  // Crunch to fill the box, while cash and morale allow.
  //
  // This used to gate on `!Q.canAdvance(...)`, which is only true when the box
  // is completely empty — canLockBox passes on a single card. So the loop never
  // ran, no archetype ever crunched once in a whole sweep, and the harness was
  // silently validating a strategy space with no crunch, no morale pressure and
  // no crunch-driven jank anywhere in it.
  //
  // A real player crunches when the slots are worth more than the damage: every
  // empty slot costs +11 jank, −3 score, ×0.93 copies and −2 trust, so filling
  // one is worth a point. Stop short of the threshold where people start
  // quitting, which is what a player watching the meter would do.
  guard = 0;
  while (title.cards.length < title.slots && guard++ < 6) {
    if (pointsLeft(state, content) >= 1) break; // points left; no need to crunch
    if (state.cash < 60000) break;
    if (state.morale <= MORALE.quitThreshold + 8) break;
    if (!Actions.crunch(state, content).ok) break;
    const next = pool.find((p) => Actions.placeCard(state, p.f.id, content).ok);
    if (!next) break;
  }

  // Spare points go to polish rather than being wasted.
  if (pointsLeft(state, content) >= 1 && title.cards.length >= title.slots) {
    Actions.polish(state, content);
  }
}

function playLaunch(state, arch, rng) {
  const channels = Actions.marketingChannelsFor(state, content);
  let channel = null;
  for (const id of arch.channelPref) {
    channel = channels.find((c) => c.id === id);
    if (channel) break;
  }
  channel = channel || channels[0];

  const spend = channel.free ? 0 : Math.min(Math.max(0, state.cash * 0.22), 220000);
  Actions.setMarketing(state, channel.id, Math.round(spend), content);

  if (state.flags.penthouseUnlocked && rng() < 0.5) Actions.dunk(state, content);
}

function resolveEvent(state, arch, rng) {
  if (!state.pendingEvent || state.eventChoice != null) return;
  const event = content.events[state.pendingEvent];
  if (!event) return;

  // Score each option against the archetype's priorities.
  let best = 0;
  let bestVal = -Infinity;
  event.choices.forEach((c, i) => {
    const e = c.effects || {};
    const flat = e.roll ? { ...(e.roll.success || {}), ...(e.roll.fail || {}) } : e;
    let v = (flat.cash || 0) / 20000;
    const ax = arch.axisByAct?.[state.act] ?? arch.axis;
    v += (flat.trust || 0) * (ax === "pc" ? -0.2 : 0.35);
    v += (flat.standing || 0) * (ax === "pc" ? 0.45 : 0.05);
    v += (flat.morale || 0) * 0.18;
    v -= (flat.jank || 0) * 0.22;
    v += (flat.hype || 0) * 0.2;
    v += (flat.heat || 0) * (ax === "gore" ? 0.15 : -0.08);
    v += (flat.scoreDelta || 0) * (ax === "pc" ? 0.5 : -0.1);
    v += ((flat.copiesMul ?? 1) - 1) * (ax === "pc" ? 4 : 22);
    v += ((flat.moneyMul ?? 1) - 1) * (ax === "money" ? 20 : 6);
    v += (flat.devPoints || 0) * 2.5;
    v += rng() * 0.6;
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  });
  Actions.chooseEventOption(state, best, content);
}

function runCampaign(seed, archName, opts = {}) {
  const arch = ARCHETYPES[archName];
  const rng = mulberry32(hashSeed(seed, archName));
  let state = createState({ seed, difficulty: opts.difficulty || "standard" });
  Q.beginRun(state, content);

  const trace = [];
  let guard = 0;

  while (state.screen !== "ending" && state.screen !== "gameover" && guard++ < 200) {
    if (state.screen === "crash") {
      state = Q.leaveCrash(state, content);
      continue;
    }
    if (state.screen === "acquisition") {
      state = Q.resolveAcquisition(state, content, archName === "moneymax");
      continue;
    }

    resolveEvent(state, arch, rng);

    if (state.phase === "pitch") playPitch(state, arch);
    else if (state.phase === "production") playProduction(state, arch);
    else if (state.phase === "launch") playLaunch(state, arch, rng);

    const before = state.quarter;
    const result = Q.advance(state, content);
    if (!result.ok) {
      trace.push(`stuck @Q${state.quarter} ${state.phase}: ${result.reason}`);
      break;
    }
    state = result.state;
    if (opts.verbose) {
      const t = currentTitle(state);
      trace.push(
        `Q${before}→${state.quarter} ${state.phase} ${state.act} cash=${fmt(state.cash)} st=${state.standing} tr=${state.trust} ht=${state.heat} mo=${state.morale} ${t?.name || ""}`
      );
    }
  }

  return {
    archetype: archName,
    seed,
    cash: state.cash,
    rank: state.rank?.id || "unfinished",
    ending: state.ending?.id || null,
    screen: state.screen,
    quarters: state.quarter,
    titles: state.stats.titlesShipped,
    copies: state.stats.copiesLifetime,
    standing: state.standing,
    trust: state.trust,
    heat: state.heat,
    morale: state.morale,
    crunches: state.stats.crunches,
    backlashes: state.stats.backlashes,
    synergies: state.stats.synergiesFired,
    chapter11: state.flags.chapter11,
    stuck: state.screen === "playing",
    trace,
  };
}

// --- Reporting ------------------------------------------------------------

function fmt(n) {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) + "%" : "0%";
}

function median(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name, def) => {
    const i = argv.indexOf("--" + name);
    return i >= 0 ? argv[i + 1] : def;
  };
  const runs = Number(arg("runs", 2000));
  const only = arg("archetype", null);
  const difficulty = arg("difficulty", "standard");
  const verbose = argv.includes("--verbose");

  const names = only ? [only] : Object.keys(ARCHETYPES);
  const perArch = Math.max(1, Math.floor(runs / names.length));

  const all = [];
  for (const name of names) {
    for (let i = 0; i < perArch; i++) {
      all.push(runCampaign(`sim-${i}`, name, { difficulty, verbose: verbose && i === 0 }));
    }
  }

  const stuck = all.filter((r) => r.stuck);
  console.log(`\nBBC balance sweep — ${all.length} runs, difficulty=${difficulty}\n`);
  if (stuck.length) {
    console.log(`!! ${stuck.length} runs got stuck. First trace:`);
    console.log(stuck[0].trace.slice(-6).join("\n"));
    console.log("");
  }

  const rankIds = content.ranks.map((r) => r.id);
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);

  console.log(
    pad("archetype", 11) + padL("median", 13) + padL("best", 13) + padL("worst", 13) +
    padL("top-rank", 10) + padL("broke", 8) + padL("ch11", 7) + padL("syn", 6)
  );
  console.log("-".repeat(82));

  for (const name of names) {
    const rs = all.filter((r) => r.archetype === name);
    const cash = rs.map((r) => r.cash);
    const top = rs.filter((r) => TOP_RANKS.includes(r.rank)).length;
    const broke = rs.filter((r) => r.cash < 0).length;
    console.log(
      pad(name, 11) +
        padL(fmt(median(cash)), 13) +
        padL(fmt(Math.max(...cash)), 13) +
        padL(fmt(Math.min(...cash)), 13) +
        padL(pct(top, rs.length), 10) +
        padL(pct(broke, rs.length), 8) +
        padL(pct(rs.filter((r) => r.chapter11 > 0).length, rs.length), 7) +
        padL((rs.reduce((n, r) => n + r.synergies, 0) / rs.length).toFixed(1), 6)
    );
  }

  console.log("\nrank distribution");
  console.log("-".repeat(82));
  for (const id of rankIds) {
    const n = all.filter((r) => r.rank === id).length;
    if (!n) continue;
    const bar = "█".repeat(Math.round((n / all.length) * 50));
    console.log(pad(id, 16) + padL(pct(n, all.length), 8) + "  " + bar);
  }

  console.log("\nendings seen");
  console.log("-".repeat(82));
  const endings = {};
  for (const r of all) endings[r.ending || "none"] = (endings[r.ending || "none"] || 0) + 1;
  for (const [id, n] of Object.entries(endings).sort((a, b) => b[1] - a[1])) {
    console.log(pad(id, 22) + padL(pct(n, all.length), 8));
  }

  const avgQ = all.reduce((n, r) => n + r.quarters, 0) / all.length;
  const avgT = all.reduce((n, r) => n + r.titles, 0) / all.length;
  const bl = all.reduce((n, r) => n + r.backlashes, 0) / all.length;
  const c11 = all.filter((r) => r.chapter11 > 0).length;
  console.log(
    `\navg quarters ${avgQ.toFixed(1)} · avg titles shipped ${avgT.toFixed(1)} · avg backlashes ${bl.toFixed(2)} · chapter 11 in ${pct(c11, all.length)}\n`
  );

  if (verbose && all[0]?.trace.length) {
    console.log("sample trace:\n" + all[0].trace.join("\n") + "\n");
  }

  // Health assertions. Every real strategy must be able to succeed; none may
  // dominate; and the ladder must actually spread rather than piling up on one
  // rung.
  const problems = [];
  if (stuck.length) problems.push(`${stuck.length} stuck runs`);

  for (const name of names) {
    if (ARCHETYPES[name].control) continue;
    const rs = all.filter((r) => r.archetype === name);
    const good = rs.filter((r) => VIABLE_RANKS.includes(r.rank)).length;
    const top = rs.filter((r) => TOP_RANKS.includes(r.rank)).length;
    if (good === 0) problems.push(`${name} never reaches king baby or better`);
    if (top / rs.length > 0.6)
      problems.push(`${name} reaches ${TOP_RANKS[0]}+ ${pct(top, rs.length)} of the time`);
  }

  // The premise, as an assertion. `control: true` exempts pcmax from having to
  // be viable — but nothing checked that it stays the *worst*, so the one claim
  // this whole game rests on was the only one the harness could not fail. The
  // docs said "if it ever starts winning, the tool says so." It did not.
  for (const name of names) {
    if (!ARCHETYPES[name].control) continue;
    const rs = all.filter((r) => r.archetype === name);
    if (!rs.length) continue;
    const controlMedian = median(rs.map((r) => r.cash));
    const rivals = names.filter((n) => !ARCHETYPES[n].control);
    const beaten = rivals.filter(
      (n) => median(all.filter((r) => r.archetype === n).map((r) => r.cash)) < controlMedian
    );
    if (beaten.length) {
      problems.push(`${name} is meant to be the trap but out-earns ${beaten.join(", ")}`);
    }
    if (rs.some((r) => TOP_RANKS.includes(r.rank))) {
      problems.push(`${name} reached ${TOP_RANKS.join("/")} — the premise has broken`);
    }
  }

  // The bots have to actually exercise the systems they gate deploys on. They
  // once crunched exactly zero times across an entire sweep, which meant morale,
  // crunch jank and the whole production-pressure axis went unmeasured while the
  // harness reported healthy.
  const crunches = all.reduce((n, r) => n + (r.crunches || 0), 0);
  if (crunches === 0) problems.push("no archetype crunched once — morale and crunch jank untested");
  const backlashes = all.reduce((n, r) => n + (r.backlashes || 0), 0);
  if (backlashes === 0) problems.push("the backlash table never fired — heat untested");

  const spread = rankIds.filter((id) => all.some((r) => r.rank === id)).length;
  if (spread < 5) problems.push(`only ${spread} distinct ranks reachable`);

  const busiest = Math.max(
    ...rankIds.map((id) => all.filter((r) => r.rank === id).length)
  );
  if (busiest / all.length > 0.5) problems.push(`one rank absorbs ${pct(busiest, all.length)} of runs`);

  if (problems.length) {
    console.log("BALANCE WARNINGS:");
    for (const p of problems) console.log("  - " + p);
    process.exitCode = 1;
  } else {
    console.log("balance looks healthy.");
  }
}

if (process.argv[1] && process.argv[1].endsWith("balance-sim.mjs")) main();

export { runCampaign, ARCHETYPES, content };
