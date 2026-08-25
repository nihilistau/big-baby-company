import { describe, expect, it } from "vitest";
import { createState, currentTitle } from "../src/sim/state.js";
import * as Q from "../src/sim/quarter.js";
import * as Actions from "../src/sim/actions.js";
import { CAMPAIGN_QUARTERS } from "../src/sim/content.js";
import { content } from "./helpers.js";

/**
 * A minimal player: pick the first legal thing at every decision.
 *
 * `solvent` tops the books up each quarter so the *spine* tests exercise the
 * structure of the campaign rather than the economy — balance is covered by
 * tests/economy.test.js and tools/balance-sim.mjs.
 */
function autoplay(state, opts = {}) {
  if (opts.solvent && state.cash < 400000) state.cash = 400000;
  if (state.pendingEvent && state.eventChoice == null) {
    Actions.chooseEventOption(state, opts.choice ?? 0, content);
  }
  if (state.phase === "pitch") {
    const offers = Q.offeredConcepts(state, content);
    if (offers.length && !currentTitle(state).conceptId) {
      Actions.chooseConcept(state, offers[0].id, content);
    }
    if (!currentTitle(state).deal) {
      const deals = Actions.dealOffersFor(state, content);
      const pick = deals.find((d) => d.id === (opts.deal || "self-fund")) || deals[0];
      Actions.chooseDeal(state, pick.id, content);
    }
  }
  if (state.phase === "production") {
    const title = currentTitle(state);
    const pool = content.featuresList.filter(
      (f) => f.acts.includes(title.act) && !f.unlock
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

function playCampaign(seed, opts = {}) {
  let state = createState({ seed, difficulty: opts.difficulty });
  Q.beginRun(state, content);
  const beats = [];

  for (let i = 0; i < 300; i++) {
    if (state.screen === "crash") {
      beats.push({ beat: "crash", quarter: state.quarter, cash: state.cash });
      state = Q.leaveCrash(state, content);
      continue;
    }
    if (state.screen === "acquisition") {
      beats.push({ beat: "acquisition", quarter: state.quarter, offer: state.acquisitionOffer });
      state = Q.resolveAcquisition(state, content, opts.acceptOffer ?? false);
      continue;
    }
    if (state.screen === "ending" || state.screen === "gameover") break;

    autoplay(state, opts);
    if (opts.solvent && state.cash < 400000) state.cash = 400000;
    const result = Q.advance(state, content);
    if (!result.ok) throw new Error(`stuck Q${state.quarter} ${state.phase}: ${result.reason}`);
    state = result.state;
  }
  return { state, beats };
}

describe("the campaign spine", () => {
  it("runs 24 quarters, 8 titles, three acts, and reaches an ending", () => {
    const { state, beats } = playCampaign("spine-test", { solvent: true });
    expect(state.screen).toBe("ending");
    expect(state.stats.titlesShipped).toBe(8);
    expect(state.quarter).toBe(CAMPAIGN_QUARTERS);
    expect(state.rank).toBeTruthy();
    expect(state.ending).toBeTruthy();
    expect(beats.map((b) => b.beat)).toEqual(["crash", "acquisition"]);
  });

  it("puts the crash after the third title and only after the third title", () => {
    const { beats } = playCampaign("crash-test", { solvent: true });
    const crash = beats.find((b) => b.beat === "crash");
    expect(crash.quarter).toBe(9);
  });

  it("voids the flagship wire — that rug-pull is the crash", () => {
    let state = createState({ seed: "wire-void" });
    Q.beginRun(state, content);
    for (let i = 0; i < 60 && state.screen === "playing"; i++) {
      autoplay(state, { deal: "investor-seed", solvent: true });
      const r = Q.advance(state, content);
      if (!r.ok) break;
      state = r.state;
      if (state.screen === "crash") break;
    }
    expect(state.screen).toBe("crash");
    const flagship = state.titles[2];
    expect(flagship.result.wire).toBeGreaterThan(0);
    expect(flagship.result.wirePaid).toBe(0);
  });

  it("empties the roster and moves you to the garage at the crash", () => {
    let state = createState({ seed: "garage-test" });
    Q.beginRun(state, content);
    for (let i = 0; i < 60 && state.screen === "playing"; i++) {
      autoplay(state, { solvent: true });
      if (state.phase === "production" && state.act === 1) {
        Actions.hire(state, "brie", content);
        Actions.hire(state, "ash", content);
      }
      const r = Q.advance(state, content);
      if (!r.ok) break;
      state = r.state;
    }
    expect(state.screen).toBe("crash");
    expect(state.staff).toEqual([]);
    expect(state.act).toBe(2);
    expect(state.hub).toBe("garage");
    state = Q.leaveCrash(state, content);
    expect(state.quarter).toBe(10);
    expect(state.phase).toBe("pitch");
  });

  it("offers the acquisition after title seven and honours a refusal", () => {
    const { state, beats } = playCampaign("acq-test", { acceptOffer: false, solvent: true });
    const acq = beats.find((b) => b.beat === "acquisition");
    expect(acq.offer).toBeGreaterThan(0);
    expect(state.flags.acquisitionRefused).toBe(true);
    expect(state.flags.acquisitionTaken).toBeFalsy();
    expect(state.stats.titlesShipped).toBe(8);
  });

  it("ends the run immediately when the acquisition is accepted", () => {
    const { state } = playCampaign("acq-take", { acceptOffer: true, solvent: true });
    expect(state.flags.acquisitionTaken).toBe(true);
    expect(state.screen).toBe("ending");
    expect(state.ending.id).toBe("sold-out");
    expect(state.stats.titlesShipped).toBe(7);
  });
});

describe("determinism", () => {
  it("the same seed produces an identical run", () => {
    const a = playCampaign("identical-seed", { solvent: true });
    const b = playCampaign("identical-seed", { solvent: true });
    expect(b.state.cash).toBe(a.state.cash);
    expect(b.state.deck.seen).toEqual(a.state.deck.seen);
    expect(b.state.chirps.length).toBe(a.state.chirps.length);
    expect(b.state.rank.id).toBe(a.state.rank.id);
  });

  it("different seeds diverge", () => {
    const a = playCampaign("seed-alpha", { solvent: true });
    const b = playCampaign("seed-beta", { solvent: true });
    expect(b.state.deck.seen).not.toEqual(a.state.deck.seen);
  });
});

describe("gating", () => {
  it("refuses to advance until the quarter event is resolved", () => {
    const state = createState({ seed: "gate-test" });
    Q.beginRun(state, content);
    expect(state.pendingEvent).toBeTruthy();
    expect(Q.blockingReason(state, content)).toBe("event");
    Actions.chooseEventOption(state, 0, content);
    expect(Q.blockingReason(state, content)).toBe("concept");
  });

  it("requires a concept, then a deal, then something in the box", () => {
    const state = createState({ seed: "gate-order" });
    Q.beginRun(state, content);
    Actions.chooseEventOption(state, 0, content);
    Actions.chooseConcept(state, Q.offeredConcepts(state, content)[0].id, content);
    expect(Q.blockingReason(state, content)).toBe("deal");
    Actions.chooseDeal(state, "self-fund", content);
    expect(Q.canAdvance(state, content)).toBe(true);

    const next = Q.advance(state, content).state;
    if (next.pendingEvent) Actions.chooseEventOption(next, 0, content);
    expect(next.phase).toBe("production");
    expect(Q.blockingReason(next, content)).toBe("empty-box");
  });

  it("requires a marketing decision before launching", () => {
    let state = createState({ seed: "gate-marketing" });
    Q.beginRun(state, content);
    for (let i = 0; i < 3 && state.phase !== "launch"; i++) {
      autoplay(state);
      state = Q.advance(state, content).state;
    }
    if (state.pendingEvent) Actions.chooseEventOption(state, 0, content);
    expect(state.phase).toBe("launch");
    expect(Q.blockingReason(state, content)).toBe("marketing");
    Actions.setMarketing(state, "none", 0, content);
    expect(Q.canAdvance(state, content)).toBe(true);
  });
});

describe("solvency", () => {
  it("files Chapter 11 once, then liquidates on the second filing", () => {
    let state = createState({ seed: "broke-test" });
    Q.beginRun(state, content);
    Actions.chooseEventOption(state, 0, content);
    Actions.chooseConcept(state, Q.offeredConcepts(state, content)[0].id, content);
    Actions.chooseDeal(state, "self-fund", content);
    state.studio.upgrades = ["extra-desk", "qa-lab"];

    state.cash = -900000;
    let r = Q.advance(state, content);
    state = r.state;
    expect(state.flags.chapter11).toBe(1);
    expect(state.cash).toBe(0);
    expect(state.studio.upgrades).toEqual([]);
    expect(state.flags.creditorShare).toBeGreaterThan(0);

    // Creditors keep a slice of everything from here.
    state.cash = -900000;
    autoplay(state);
    r = Q.advance(state, content);
    expect(r.state.screen).toBe("gameover");
  });

  it("liquidates outright below the hard floor", () => {
    let state = createState({ seed: "liquidate-test" });
    Q.beginRun(state, content);
    autoplay(state);
    state.cash = -3000000;
    const r = Q.advance(state, content);
    expect(r.state.screen).toBe("gameover");
    expect(r.state.rank.id).toBe("liquidated");
  });
});

describe("endless mode", () => {
  it("keeps generating titles past the campaign", () => {
    let state = createState({ seed: "endless-test", mode: "endless" });
    Q.beginRun(state, content);
    for (let i = 0; i < 140; i++) {
      if (state.screen === "crash") { state = Q.leaveCrash(state, content); continue; }
      if (state.screen === "acquisition") { state = Q.resolveAcquisition(state, content, false); continue; }
      if (state.screen !== "playing") break;
      autoplay(state, { solvent: true });
      const r = Q.advance(state, content);
      if (!r.ok) throw new Error(`stuck: ${r.reason}`);
      state = r.state;
    }
    expect(state.titles.length).toBeGreaterThan(8);
    expect(state.quarter).toBeGreaterThan(CAMPAIGN_QUARTERS);
  });
});
