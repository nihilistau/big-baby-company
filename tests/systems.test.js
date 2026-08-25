import { describe, expect, it, beforeEach } from "vitest";
import * as Synergy from "../src/sim/synergy.js";
import { applyMandate, applyStaffAtLock } from "../src/sim/injection.js";
import { drawEvent, eligible } from "../src/sim/deck.js";
import { applyEffects } from "../src/sim/effects.js";
import { endingFor, rankFor } from "../src/sim/endings.js";
import { createState, currentTitle, emptyTitle } from "../src/sim/state.js";
import { mulberry32 } from "../src/sim/rng.js";
import * as Actions from "../src/sim/actions.js";
import { projectLaunch } from "../src/sim/economy.js";
import { COPIES, DRIFT, FEEDBACK, standingDrift } from "../src/sim/balance.js";
import { content, inProduction, place, FUN_CARDS } from "./helpers.js";

describe("synergies", () => {
  it("fires a named synergy when its exact cards are present", () => {
    const rules = Synergy.detect(content, ["fun-gunfeel", "gore-headshot"]);
    expect(rules.map((r) => r.id)).toContain("the-gun-works");
  });

  it("fires tag-count synergies", () => {
    const rules = Synergy.detect(content, ["fun-gunfeel", "fun-boss", "gore-headshot"]);
    expect(rules.map((r) => r.id)).toContain("actual-video-game");
  });

  it("fires conflicts, kept separate from synergies", () => {
    const rules = Synergy.detect(content, ["pc-purple", "gore-spray"]);
    const { synergies, conflicts } = Synergy.split(rules);
    expect(conflicts.map((r) => r.id)).toContain("grape-soda-massacre");
    expect(synergies.map((r) => r.id)).not.toContain("grape-soda-massacre");
  });

  it("combines multiplicatively and additively as declared", () => {
    const bundle = Synergy.combine([
      { effects: { copiesMul: 1.5, scoreAdd: 10, heat: 5 } },
      { effects: { copiesMul: 2, scoreAdd: -4 } },
    ]);
    expect(bundle.copiesMul).toBe(3);
    expect(bundle.scoreAdd).toBe(6);
    expect(bundle.heat).toBe(5);
  });

  it("an empty box fires nothing", () => {
    expect(Synergy.detect(content, [])).toEqual([]);
  });
});

describe("staff influence at lock", () => {
  const title = (over = {}) => ({ ...emptyTitle(0, 1), slots: 4, act: 1, ...over });

  it("puts the pet feature into an empty slot", () => {
    const out = applyStaffAtLock(title(), [{ id: "brie" }], content);
    expect(out.cards).toContain("pc-pronouns");
    expect(out.injected[0].action).toBe("fill");
  });

  it("falls back to a backup preference when the pet is already there", () => {
    const out = applyStaffAtLock(title({ cards: ["pc-pronouns"] }), [{ id: "brie" }], content);
    expect(out.cards).toContain("pc-lecture");
    expect(out.injected[0].action).toBe("fill");
  });

  it("overwrites the first FUN card when the box is full", () => {
    const out = applyStaffAtLock(
      title({ slots: 2, cards: ["fun-gunfeel", "pc-body"] }),
      [{ id: "brie" }],
      content
    );
    expect(out.cards).toContain("pc-pronouns");
    expect(out.cards).not.toContain("fun-gunfeel");
    expect(out.injected[0].action).toBe("overwrite");
  });

  it("adds ambient PC when there is nothing left to take", () => {
    const full = title({ slots: 2, cards: ["pc-pronouns", "pc-lecture"] });
    const out = applyStaffAtLock(full, [{ id: "brie" }], content);
    expect(out.auras.pc).toBe(1);
    expect(out.injected[0].action).toBe("aura");
  });

  it("talent hires contribute instead of injecting", () => {
    const out = applyStaffAtLock(title(), [{ id: "rusty" }, { id: "mei" }], content);
    expect(out.cards).toHaveLength(0);
    expect(out.staffJank).toBeLessThan(0);
    expect(out.jank).toBeGreaterThanOrEqual(0);
    expect(out.auras.fun).toBe(2);
    expect(out.injected.every((i) => i.action === "contribute")).toBe(true);
  });

  it("sabotage makes an injector strike twice", () => {
    const out = applyStaffAtLock(title(), [{ id: "brie" }], content, { sabotage: ["brie"] });
    expect(out.injected.filter((i) => i.sabotage).length).toBe(1);
    expect(out.cards.length).toBe(2);
  });

  it("a publisher mandate claims a slot", () => {
    const t = title({ deal: { mandate: "pc-apology-credits" }, cards: ["fun-gunfeel"] });
    const out = applyMandate(t, content);
    expect(out.cards).toContain("pc-apology-credits");
    expect(out.mandateApplied).toBe("pc-apology-credits");
  });
});

describe("the event deck", () => {
  it("respects act and phase", () => {
    const state = inProduction({ act: 2 });
    const act1Only = content.eventsList.find((e) => e.acts.length === 1 && e.acts[0] === 1);
    expect(eligible(act1Only, state, content)).toBe(false);
  });

  it("respects state predicates", () => {
    const calm = inProduction({ act: 2, heat: 0 });
    const spicy = inProduction({ act: 2, heat: 90 });
    const heatEvent = content.events["the-heat-spike"];
    expect(eligible(heatEvent, calm, content)).toBe(false);
    expect(eligible(heatEvent, spicy, content)).toBe(true);
  });

  it("never repeats an event within a run while others remain", () => {
    const state = inProduction({ act: 2 });
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      state.quarter = i + 1;
      const e = drawEvent(state, content);
      if (!e) break;
      expect(seen.has(e.id)).toBe(false);
      seen.add(e.id);
      state.deck.seen.push(e.id);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it("scripted beats override the draw at their quarter", () => {
    const state = createState({ seed: "scripted" });
    state.quarter = 2;
    state.phase = "production";
    expect(drawEvent(state, content).id).toBe("values-pass");
  });
});

describe("effects", () => {
  let state;
  beforeEach(() => {
    state = inProduction({ act: 2, cash: 100000, trust: 50, heat: 20, morale: 50 });
  });

  it("moves cash and clamps the 0-100 stats", () => {
    applyEffects(state, { cash: -30000, trust: 400, heat: -900 }, content, mulberry32(1));
    expect(state.cash).toBe(70000);
    expect(state.trust).toBe(100);
    expect(state.heat).toBe(0);
  });

  it("stacks ship modifiers on the current title", () => {
    applyEffects(state, { scoreDelta: 5, copiesMul: 0.5 }, content, mulberry32(1));
    applyEffects(state, { scoreDelta: 3, copiesMul: 0.5 }, content, mulberry32(1));
    const t = currentTitle(state);
    expect(t.shipMods.scoreDelta).toBe(8);
    expect(t.shipMods.copiesMul).toBe(0.25);
  });

  it("resolves a gated roll into exactly one branch", () => {
    const always = applyEffects(
      state,
      { roll: { chance: 1, success: { cash: 1000 }, fail: { cash: -1000 } } },
      content,
      mulberry32(7)
    );
    expect(always.find((o) => o.kind === "roll").won).toBe(true);
    expect(state.cash).toBe(101000);

    const never = applyEffects(
      state,
      { roll: { chance: 0, success: { cash: 1000 }, fail: { cash: -1000 } } },
      content,
      mulberry32(7)
    );
    expect(never.find((o) => o.kind === "roll").won).toBe(false);
    expect(state.cash).toBe(100000);
  });

  it("can cut a card out of the box", () => {
    place(state, FUN_CARDS.slice(0, 3));
    const before = currentTitle(state).cards.length;
    applyEffects(state, { removeRandomCard: true }, content, mulberry32(3));
    expect(currentTitle(state).cards.length).toBe(before - 1);
  });
});

describe("ranks and endings", () => {
  it("maps cash onto the rank ladder without gaps", () => {
    const probes = [-2000000, -1, 0, 200000, 800000, 1500000, 3000000, 20000000];
    for (const cash of probes) expect(rankFor(cash, content)).toBeTruthy();
    expect(rankFor(-2000000, content).id).toBe("liquidated");
    expect(rankFor(-1, content).id).toBe("wendys");
    expect(rankFor(20000000, content).id).toBe("dynasty");
  });

  it("picks the highest-priority ending the run qualifies for", () => {
    const sold = createState({ seed: "e1" });
    sold.flags.acquisitionTaken = true;
    expect(endingFor(sold, content).id).toBe("sold-out");

    const believer = createState({ seed: "e2" });
    believer.cash = 900000;
    believer.trust = 85;
    believer.morale = 60;
    expect(endingFor(believer, content).id).toBe("true-believer");
  });

  it("always returns something", () => {
    expect(endingFor(createState({ seed: "e3" }), content)).toBeTruthy();
  });
});

describe("actions refuse illegal moves", () => {
  it("will not hire past the cap, twice, or out of act", () => {
    const state = inProduction({ act: 1 });
    state.studio.staffCap = 1;
    expect(Actions.hire(state, "brie", content).ok).toBe(true);
    expect(Actions.hire(state, "brie", content).reason).toBe("already");
    expect(Actions.hire(state, "ash", content).reason).toBe("cap");
    expect(Actions.hire(state, "dutch", content).reason).toBe("act");
  });

  it("will not place an out-of-act card or a duplicate", () => {
    const state = inProduction({ act: 2, slots: 6 });
    expect(Actions.placeCard(state, "pc-pronouns", content).reason).toBe("catalog");
    expect(Actions.placeCard(state, "fun-gunfeel", content).ok).toBe(true);
    expect(Actions.placeCard(state, "fun-gunfeel", content).reason).toBe("duplicate");
  });

  it("will not buy an upgrade you cannot afford or already own", () => {
    const state = inProduction({ act: 2, cash: 1000 });
    expect(Actions.buyUpgrade(state, "extra-desk", content).reason).toBe("cash");
    state.cash = 500000;
    expect(Actions.buyUpgrade(state, "extra-desk", content).ok).toBe(true);
    expect(Actions.buyUpgrade(state, "extra-desk", content).reason).toBe("already");
    expect(Actions.buyUpgrade(state, "third-desk", content).ok).toBe(true);
  });

  it("will not dunk without the penthouse, or twice in a cycle", () => {
    const state = inProduction({ act: 1 });
    expect(Actions.dunk(state, content).reason).toBe("penthouse");
    state.flags.penthouseUnlocked = true;
    expect(Actions.dunk(state, content).ok).toBe(true);
    expect(Actions.dunk(state, content).reason).toBe("already");
  });

  it("escalates the investor quota with every deal signed", () => {
    const state = inProduction({ act: 1 });
    state.phase = "pitch";
    const base = Actions.dealTerms(state, content, content.deals["investor-seed"]).quota;
    state.titles[0].deal = { type: "investor" };
    state.titles.push({ ...currentTitle(state), deal: { type: "investor" } });
    const later = Actions.dealTerms(state, content, content.deals["investor-seed"]).quota;
    expect(later).toBeGreaterThan(base);
  });
});

describe("talent contributions are counted exactly once", () => {
  it("projects a talent aura before lock and does not double it after", () => {
    const before = inProduction({ act: 2, slots: 5, staff: ["mei"] });
    place(before, ["fun-gunfeel"]);
    const projected = projectLaunch(before, content);

    const locked = applyStaffAtLock(currentTitle(before), before.staff, content);
    before.titles[before.titleIndex] = { ...locked, locked: true };
    const after = projectLaunch(before, content);

    expect(projected.fun).toBe(after.fun);
  });

  it("projects a talent jank reduction before lock and does not double it after", () => {
    const state = inProduction({ act: 2, slots: 5, staff: ["sal"] });
    place(state, ["fun-physics", "gore-ragdoll"]);
    const projected = projectLaunch(state, content).jank;

    const locked = applyStaffAtLock(currentTitle(state), state.staff, content);
    state.titles[state.titleIndex] = { ...locked, locked: true };
    expect(projectLaunch(state, content).jank).toBe(projected);
  });

  it("never lets the accumulated jank reservoir go negative", () => {
    const title = { ...emptyTitle(0, 2), slots: 4, act: 2, jank: 2 };
    const out = applyStaffAtLock(title, [{ id: "sal" }, { id: "rusty" }], content);
    expect(out.jank).toBeGreaterThanOrEqual(0);
    expect(out.staffJank).toBe(-30);
  });
});

describe("standing stays a live meter", () => {
  // Standing used to decay at a flat -3 a quarter — -9 a title cycle at every
  // level. That was fatal at the bottom and toothless at the top: any studio
  // not feeding the industry PC content sat pinned at 0 for roughly three
  // quarters of the campaign, where the wire multiplier is already clamped and
  // deal quality stops responding, while a darling near 100 paid the same -3
  // and coasted. Measured by tools/meter-probe.mjs.

  it("decays in proportion to how much standing is held", () => {
    expect(Math.abs(standingDrift(0))).toBe(0);
    expect(standingDrift(DRIFT.standingPivot)).toBe(DRIFT.standing);
    expect(standingDrift(100)).toBeCloseTo(DRIFT.standing * 2, 5);
    // Strictly monotonic, so there is no band where holding standing is free.
    for (let v = 1; v <= 100; v++) {
      expect(standingDrift(v)).toBeLessThan(standingDrift(v - 1));
    }
  });

  it("cannot grind a studio that is already at the floor", () => {
    // The specific regression: at standing 0 the old rate still charged -9 a
    // cycle against a clamp, so every gain was eaten before it could show.
    expect(Math.abs(standingDrift(0)) * 3).toBe(0);
    expect(Math.abs(DRIFT.standing) * 3).toBeGreaterThan(0);
  });

  it("prices commercial success against what the act expects to sell", () => {
    const { standingPerCopies, standingPerCopiesCap } = FEEDBACK;

    for (const act of [1, 2, 3]) expect(standingPerCopies(0, act)).toBe(0);

    // The same multiple of the act's baseline is worth the same respect. The
    // old flat divisor made an Act I hit worth nothing and needed 91,000
    // copies in one launch to reach its own cap.
    const atBaseline = [1, 2, 3].map((act) => standingPerCopies(COPIES.base[act], act));
    expect(new Set(atBaseline).size).toBe(1);
    expect(atBaseline[0]).toBeGreaterThan(0);

    // A studio the press scores at zero eats this much standing every launch.
    const scoreFloorPenalty = Math.abs(
      (0 - FEEDBACK.standingPivot) * FEEDBACK.standingGain
    );
    // Selling what the act expects does not buy the industry back...
    expect(standingPerCopies(COPIES.base[3], 3)).toBeLessThan(scoreFloorPenalty);
    // ...but a genuine hit does. That is the "grudging respect" the term is for.
    expect(standingPerCopies(COPIES.base[3] * 6, 3)).toBeGreaterThan(scoreFloorPenalty);

    // Bounded, so a runaway seller cannot simply buy the whole meter.
    expect(standingPerCopies(COPIES.base[3] * 1000, 3)).toBe(standingPerCopiesCap);
  });

  it("leaves a route off the floor for a studio the industry has written off", () => {
    // Zero standing and no PC in the box: the studio that used to be stuck.
    // Note the trap this has to escape — standing feeds the industry score
    // through SCORE.standingTilt, and the score feeds standing straight back,
    // so at the floor the loop pushes down on itself.
    const state = place(
      inProduction({ act: 3, slots: 5, standing: 0, trust: 90, cash: 400000 }),
      FUN_CARDS
    );
    const result = projectLaunch(state, content);
    const swingFor = (copies) =>
      (result.score - FEEDBACK.standingPivot) * FEEDBACK.standingGain +
      FEEDBACK.standingPerCopies(copies, 3);

    expect(result.copies).toBeGreaterThan(0);
    // Selling roughly what the act expects still loses the industry round...
    expect(swingFor(COPIES.base[3])).toBeLessThan(0);
    // ...and a hit wins it back. Those two together are the design statement:
    // the industry can be won round, but only by outselling it.
    expect(swingFor(COPIES.base[3] * 6)).toBeGreaterThan(0);

    // Nothing drags a studio back down while it climbs off the floor, and the
    // levers the game sells stack on top of a real launch.
    expect(Math.abs(standingDrift(0))).toBe(0);
    const awards = content.channelsList.find((c) => c.id === "awards");
    const prFirmPerCycle = content.upgrades["pr-firm"].perQuarter.standing * 3;
    expect(awards.standing + prFirmPerCycle).toBeGreaterThan(0);
  });
});

describe("trust settles instead of ramping to the ceiling", () => {
  // Trust used to climb from 30 to the cap over about twenty quarters and stay
  // there: Act III p10 was 90, so even the worst late quarter was saturated.
  // Two things caused it. The resistance ceiling was 130 while the meter caps
  // at 100, so the curve had no equilibrium in the legal range; and three of
  // the four ways trust changes bypassed the curve entirely, leaving it to
  // govern about a tenth of the actual flow. Measured by tools/meter-probe.mjs.

  it("resists gains all the way to the ceiling, and not beyond it", () => {
    const ceiling = FEEDBACK.resistanceCeiling.trust;
    expect(ceiling).toBe(100); // the meter's own cap, so the curve can bite

    expect(FEEDBACK.resist("trust", 0, 10)).toBeCloseTo(10, 5);
    expect(FEEDBACK.resist("trust", 50, 10)).toBeCloseTo(5, 5);
    expect(FEEDBACK.resist("trust", ceiling, 10)).toBe(0);
    // Never negative, however far past the ceiling a scripted beat pushes.
    expect(FEEDBACK.resist("trust", 120, 10)).toBe(0);
  });

  it("never resists a loss, so trust is earned slowly and lost fast", () => {
    for (const meter of ["standing", "trust", "heat"]) {
      for (const value of [0, 40, 90, 100]) {
        expect(FEEDBACK.resist(meter, value, -12)).toBe(-12);
      }
    }
  });

  it("has an equilibrium below the cap for a studio the audience loves", () => {
    // Solve the curve against the drift rather than trusting a single run:
    // gain(T) = raw * (1 - T/ceiling), loss = 3 quarters of flat drift.
    const ceiling = FEEDBACK.resistanceCeiling.trust;
    const driftPerCycle = Math.abs(DRIFT.trust) * 3;
    const rawPerCycle = 50; // measured for a late-game audience studio
    const equilibrium = ceiling * (1 - driftPerCycle / rawPerCycle);

    expect(equilibrium).toBeLessThan(100);
    expect(equilibrium).toBeGreaterThan(50); // still a reward, just not a cap
    // At the old ceiling of 130 the same income had no equilibrium at all.
    expect(130 * (1 - driftPerCycle / rawPerCycle)).toBeGreaterThan(100);
  });

  it("routes every source of reputation through the same curve", () => {
    // The regression: upkeep, marketing channels and event effects each used
    // to apply raw, which let a flat bonus override the curve completely.
    const state = createState({ seed: "trust-sources" });
    state.trust = 99;
    const before = state.trust;
    applyEffects(state, { trust: 20 }, content, mulberry32(1));
    expect(state.trust - before).toBeLessThan(2);

    // And a loss of the same size still lands in full.
    const dropping = createState({ seed: "trust-sources" });
    dropping.trust = 99;
    applyEffects(dropping, { trust: -20 }, content, mulberry32(1));
    expect(dropping.trust).toBe(79);
  });

  it("keeps morale out of the reputation curve", () => {
    // Morale is a resource you spend by crunching, not a reputation. Its
    // recovery to full is deliberate and threshold-based consequences depend
    // on it actually getting there.
    const state = createState({ seed: "morale-untouched" });
    state.morale = 95;
    applyEffects(state, { morale: 10 }, content, mulberry32(1));
    expect(state.morale).toBe(100);
  });
});
