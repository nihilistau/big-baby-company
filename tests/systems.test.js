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
