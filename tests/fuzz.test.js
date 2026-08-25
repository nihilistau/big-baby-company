import { describe, expect, it } from "vitest";
import { createState, currentTitle } from "../src/sim/state.js";
import * as Q from "../src/sim/quarter.js";
import * as Actions from "../src/sim/actions.js";
import { projectLaunch } from "../src/sim/economy.js";
import { mulberry32, hashSeed, pick } from "../src/sim/rng.js";
import { content } from "./helpers.js";

/**
 * Randomised play. The point is not to win — it is to hammer every action in
 * every legal and illegal order and assert the invariants that must hold no
 * matter what the player does.
 */

const METERS = ["standing", "trust", "heat", "morale"];

function assertInvariants(state, where) {
  expect(Number.isFinite(state.cash), `${where}: cash is ${state.cash}`).toBe(true);

  for (const key of METERS) {
    const v = state[key];
    expect(Number.isInteger(v), `${where}: ${key} is ${v}`).toBe(true);
    expect(v, `${where}: ${key} out of range`).toBeGreaterThanOrEqual(0);
    expect(v, `${where}: ${key} out of range`).toBeLessThanOrEqual(100);
  }

  expect(["pitch", "production", "launch"]).toContain(state.phase);
  expect(["playing", "crash", "acquisition", "ending", "gameover"]).toContain(state.screen);
  expect(state.quarter, `${where}: quarter`).toBeGreaterThan(0);
  expect(state.titleIndex).toBeLessThan(state.titles.length);
  expect(state.staff.length).toBeLessThanOrEqual(state.studio.staffCap);

  const title = currentTitle(state);
  if (title) {
    expect(new Set(title.cards).size, `${where}: duplicate cards`).toBe(title.cards.length);
    expect(title.cards.length, `${where}: over slots`).toBeLessThanOrEqual(
      Math.max(title.slots, 0) + state.staff.length + 2
    );
    expect(title.jank, `${where}: negative jank`).toBeGreaterThanOrEqual(0);

    if (title.conceptId) {
      const p = projectLaunch(state, content);
      expect(Number.isFinite(p.copies), `${where}: copies ${p.copies}`).toBe(true);
      expect(Number.isFinite(p.revenue), `${where}: revenue ${p.revenue}`).toBe(true);
      expect(p.copies, `${where}: negative copies`).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
      expect(p.revShare).toBeGreaterThan(0);
    }
  }

  // Nothing anywhere in the tree should be NaN.
  const bad = findNaN(state);
  expect(bad, `${where}: NaN at ${bad}`).toBeNull();
}

function findNaN(value, path = "state", depth = 0) {
  if (depth > 8) return null;
  if (typeof value === "number") return Number.isNaN(value) ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findNaN(value[i], `${path}[${i}]`, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const hit = findNaN(v, `${path}.${k}`, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Fire a random action, legal or not. Illegal ones must fail cleanly. */
function randomAction(state, rng) {
  const cardIds = content.featuresList.map((f) => f.id);
  const staffIds = content.staffList.map((p) => p.id);
  const upgradeIds = content.upgradesList.map((u) => u.id);
  const channelIds = content.channelsList.map((c) => c.id);
  const dealIds = content.dealsList.map((d) => d.id);

  const moves = [
    () => Actions.placeCard(state, pick(rng, cardIds), content),
    () => Actions.removeCard(state, pick(rng, cardIds)),
    () => Actions.crunch(state, content),
    () => Actions.polish(state, content),
    () => Actions.hire(state, pick(rng, staffIds), content),
    () => Actions.fire(state, pick(rng, staffIds), content),
    () => Actions.giveRaise(state, pick(rng, staffIds), content),
    () => Actions.buyPerk(state),
    () => Actions.buyUpgrade(state, pick(rng, upgradeIds), content),
    () => Actions.setMarketing(state, pick(rng, channelIds), Math.floor(rng() * 900000), content),
    () => Actions.dunk(state, content),
    () => Actions.goHub(state, pick(rng, ["hq", "penthouse", "garage", "loft"])),
    () => Actions.chooseDeal(state, pick(rng, dealIds), content),
    () => Actions.chooseEventOption(state, Math.floor(rng() * 4), content),
    () => {
      const offers = Q.offeredConcepts(state, content);
      return Actions.chooseConcept(state, offers.length ? pick(rng, offers).id : "nope", content);
    },
  ];
  return pick(rng, moves)();
}

/** Whatever the fuzzer did, get the quarter legally unblocked so play continues. */
function unblock(state, rng) {
  for (let i = 0; i < 12; i++) {
    const reason = Q.blockingReason(state, content);
    if (!reason) return true;
    if (reason === "event") Actions.chooseEventOption(state, 0, content);
    else if (reason === "concept") {
      const offers = Q.offeredConcepts(state, content);
      if (!offers.length) return false;
      Actions.chooseConcept(state, offers[0].id, content);
    } else if (reason === "deal") {
      const deals = Actions.dealOffersFor(state, content);
      Actions.chooseDeal(state, deals[deals.length - 1].id, content);
    } else if (reason === "empty-box") {
      const pool = content.featuresList.filter((f) => f.acts.includes(currentTitle(state).act));
      let placed = false;
      for (const f of pool) if (Actions.placeCard(state, f.id, content).ok) { placed = true; break; }
      if (!placed) return false;
    } else if (reason === "marketing") {
      Actions.setMarketing(state, "none", 0, content);
    } else return false;
    void rng;
  }
  return false;
}

describe("fuzz", () => {
  it("survives 60 randomised runs without breaking an invariant", () => {
    for (let run = 0; run < 60; run++) {
      const rng = mulberry32(hashSeed("fuzz", run));
      let state = createState({
        seed: `fuzz-${run}`,
        difficulty: pick(rng, ["darling", "standard", "wendys"]),
        mode: rng() < 0.2 ? "endless" : "campaign",
      });
      Q.beginRun(state, content);
      assertInvariants(state, `run ${run} start`);

      for (let step = 0; step < 160; step++) {
        if (state.screen === "crash") {
          state = Q.leaveCrash(state, content);
          assertInvariants(state, `run ${run} after crash`);
          continue;
        }
        if (state.screen === "acquisition") {
          state = Q.resolveAcquisition(state, content, rng() < 0.5);
          assertInvariants(state, `run ${run} after acquisition`);
          continue;
        }
        if (state.screen === "ending" || state.screen === "gameover") break;

        // A burst of random actions, then legalise and tick.
        const bursts = 1 + Math.floor(rng() * 6);
        for (let i = 0; i < bursts; i++) {
          const result = randomAction(state, rng);
          expect(result, `run ${run} step ${step}: action returned nothing`).toBeTruthy();
          expect(typeof result.ok).toBe("boolean");
        }
        assertInvariants(state, `run ${run} step ${step} after actions`);

        if (!unblock(state, rng)) break;
        const ticked = Q.advance(state, content);
        expect(ticked.ok, `run ${run} step ${step}: advance refused (${ticked.reason})`).toBe(true);
        state = ticked.state;
        assertInvariants(state, `run ${run} step ${step} after advance`);
      }
    }
  });

  it("never lets a run stall forever with a legal player", () => {
    for (let run = 0; run < 12; run++) {
      let state = createState({ seed: `stall-${run}` });
      Q.beginRun(state, content);
      let ticks = 0;
      const rng = mulberry32(hashSeed("stall", run));

      while (state.screen !== "ending" && state.screen !== "gameover" && ticks < 200) {
        if (state.screen === "crash") { state = Q.leaveCrash(state, content); continue; }
        if (state.screen === "acquisition") { state = Q.resolveAcquisition(state, content, false); continue; }
        expect(unblock(state, rng), `run ${run}: could not legalise Q${state.quarter} ${state.phase}`).toBe(true);
        const r = Q.advance(state, content);
        expect(r.ok).toBe(true);
        state = r.state;
        ticks++;
      }
      expect(["ending", "gameover"]).toContain(state.screen);
    }
  });

  it("keeps saves round-trippable at every phase", () => {
    let state = createState({ seed: "roundtrip" });
    Q.beginRun(state, content);
    const rng = mulberry32(1);
    for (let i = 0; i < 40 && state.screen === "playing"; i++) {
      const json = JSON.stringify(state);
      expect(json).not.toContain("undefined:");
      const restored = JSON.parse(json);
      expect(restored.quarter).toBe(state.quarter);
      expect(restored.titles.length).toBe(state.titles.length);
      if (!unblock(state, rng)) break;
      const r = Q.advance(state, content);
      if (!r.ok) break;
      state = r.state;
    }
  });
});
