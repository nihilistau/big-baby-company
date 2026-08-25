import { describe, expect, it } from "vitest";
import {
  applyInterest,
  canLockBox,
  crunchCost,
  devPoints,
  pointsLeft,
  predictFills,
  projectedEmpties,
  projectLaunch,
  titleHeat,
  titleJank,
} from "../src/sim/economy.js";
import { currentTitle } from "../src/sim/state.js";
import * as Actions from "../src/sim/actions.js";
import { content, inProduction, place, FUN_CARDS, GORE_CARDS, PC_CARDS } from "./helpers.js";

describe("the central inversion", () => {
  it("Act I: PC buys industry score and destroys copies", () => {
    const pc = place(inProduction({ act: 1, slots: 5 }), PC_CARDS);
    const fun = place(inProduction({ act: 1, slots: 5 }), FUN_CARDS);

    const p = projectLaunch(pc, content);
    const f = projectLaunch(fun, content);

    expect(p.score).toBeGreaterThan(f.score);
    expect(p.copies).toBeLessThan(f.copies);
    expect(p.copies).toBeLessThan(1500);
  });

  it("Act II: the same PC box is worth almost nothing, because investors are gone", () => {
    const pc = place(inProduction({ act: 2, slots: 5 }), PC_CARDS);
    const gore = place(
      inProduction({ act: 2, slots: 5 }),
      [...GORE_CARDS, "fun-gunfeel", "ord-dave"]
    );
    const p = projectLaunch(pc, content);
    const g = projectLaunch(gore, content);

    expect(p.wire).toBe(0);
    expect(g.copies).toBeGreaterThan(p.copies * 3);
  });

  it("an investor wire on a max-PC box beats what that box earns in sales", () => {
    const state = place(
      inProduction({
        act: 1,
        slots: 5,
        standing: 70,
        deal: { type: "investor", revShare: 0.72, quota: 40, wireMul: 1.45, advance: 0 },
      }),
      PC_CARDS
    );
    const p = projectLaunch(state, content);
    expect(p.wirePaid).toBeGreaterThan(p.revenue);
    expect(p.quotaMet).toBe(true);
  });

  it("missing the quota cuts the wire to a fraction and flags it", () => {
    const cards = PC_CARDS.slice(0, 3);
    const met = place(
      inProduction({
        act: 1, slots: 5, standing: 50,
        deal: { type: "investor", revShare: 1, quota: 10, wireMul: 1, advance: 0 },
      }),
      cards
    );
    const missed = place(
      inProduction({
        act: 1, slots: 5, standing: 50,
        deal: { type: "investor", revShare: 1, quota: 99, wireMul: 1, advance: 0 },
      }),
      cards
    );
    const a = projectLaunch(met, content);
    const b = projectLaunch(missed, content);

    expect(a.quotaMet).toBe(true);
    expect(b.quotaMet).toBe(false);
    expect(a.score).toBe(b.score);
    expect(b.wirePaid).toBeLessThan(a.wirePaid);
    expect(b.wirePaid).toBeGreaterThan(0);
  });
});

describe("multipliers", () => {
  it("audience trust scales copies", () => {
    const low = place(inProduction({ act: 2, trust: 5 }), FUN_CARDS);
    const high = place(inProduction({ act: 2, trust: 95 }), FUN_CARDS);
    expect(projectLaunch(high, content).copies).toBeGreaterThan(
      projectLaunch(low, content).copies * 1.5
    );
  });

  it("jank eats copies and score", () => {
    const clean = place(inProduction({ act: 2 }), FUN_CARDS);
    const janky = place(inProduction({ act: 2 }), FUN_CARDS);
    currentTitle(janky).jank = 80;

    const c = projectLaunch(clean, content);
    const j = projectLaunch(janky, content);
    expect(j.copies).toBeLessThan(c.copies);
    expect(j.score).toBeLessThan(c.score);
  });

  it("heat raises copies but also raises the backlash chance", () => {
    const cool = place(inProduction({ act: 2, heat: 0 }), GORE_CARDS);
    const hot = place(inProduction({ act: 2, heat: 90 }), GORE_CARDS);
    const c = projectLaunch(cool, content);
    const h = projectLaunch(hot, content);
    expect(h.copies).toBeGreaterThan(c.copies);
    expect(c.backlashChance).toBe(0);
    expect(h.backlashChance).toBeGreaterThan(0.5);
  });
});

describe("unfinished boxes", () => {
  it("are legal to ship", () => {
    const state = place(inProduction({ act: 2, slots: 5 }), ["fun-gunfeel"]);
    expect(canLockBox(state, content)).toBe(true);
  });

  it("are not legal when completely empty", () => {
    const state = inProduction({ act: 2, slots: 5 });
    expect(canLockBox(state, content)).toBe(false);
  });

  it("cost jank, score and copies proportional to the holes", () => {
    const full = place(inProduction({ act: 2, slots: 3 }), FUN_CARDS.slice(0, 3));
    const holey = place(inProduction({ act: 2, slots: 6 }), FUN_CARDS.slice(0, 3));

    const f = projectLaunch(full, content);
    const h = projectLaunch(holey, content);
    expect(h.emptySlots).toBe(3);
    expect(h.jank).toBeGreaterThan(f.jank);
    expect(h.score).toBeLessThan(f.score);
  });
});

describe("dev points", () => {
  it("grow with the act", () => {
    const a1 = inProduction({ act: 1 });
    const a3 = inProduction({ act: 3 });
    expect(devPoints(a3, content)).toBeGreaterThan(devPoints(a1, content));
  });

  it("cannot be overspent", () => {
    const state = inProduction({ act: 3, slots: 8 });
    const budget = devPoints(state, content);
    let spent = 0;
    for (const f of content.featuresList.filter((x) => x.acts.includes(3) && !x.unlock)) {
      if (Actions.placeCard(state, f.id, content).ok) spent += f.cost || 1;
    }
    expect(spent).toBeLessThanOrEqual(budget);
    expect(pointsLeft(state, content)).toBeGreaterThanOrEqual(0);
  });

  it("crunch buys a point and gets more expensive each time", () => {
    const state = inProduction({ act: 1 });
    const first = crunchCost(state, content);
    const before = devPoints(state, content);
    Actions.crunch(state, content);
    expect(devPoints(state, content)).toBe(before + 1);
    expect(crunchCost(state, content)).toBeGreaterThan(first);
  });

  it("polish spends a point to remove jank", () => {
    const state = place(inProduction({ act: 2, slots: 6 }), ["fun-gunfeel"]);
    currentTitle(state).jank = 40;
    const before = titleJank(state, content);
    Actions.polish(state, content);
    expect(titleJank(state, content)).toBeLessThan(before);
  });
});

describe("staff injection prediction", () => {
  it("counts a staffer who can fill an empty slot", () => {
    const state = inProduction({ act: 1, slots: 5, staff: ["brie"] });
    expect(predictFills(state, content)).toBe(1);
  });

  it("falls through to a backup when the pet card is already on the box", () => {
    // The original build's gate assumed every staffer fills a slot; a staffer
    // whose pet was already present silently filled nothing.
    const state = inProduction({ act: 1, slots: 5, staff: ["brie"], cards: ["pc-pronouns"] });
    expect(predictFills(state, content)).toBe(1);
  });

  it("reports zero when every preference is already on the box", () => {
    const state = inProduction({
      act: 1,
      slots: 6,
      staff: ["brie"],
      cards: ["pc-pronouns", "pc-lecture", "pc-glossary", "pc-content-warning"],
    });
    expect(predictFills(state, content)).toBe(0);
    expect(projectedEmpties(state, content)).toBe(2);
  });
});

describe("heat sources", () => {
  it("gore and monetisation both generate controversy", () => {
    const gore = place(inProduction({ act: 2, slots: 4 }), GORE_CARDS);
    const quiet = place(inProduction({ act: 2, slots: 4 }), ["ord-dad", "ord-nurse"]);
    expect(titleHeat(gore, content)).toBeGreaterThan(titleHeat(quiet, content));
  });
});

describe("interest", () => {
  it("only applies to debt, and compounds it", () => {
    expect(applyInterest(1000, 0.1)).toBe(1000);
    expect(applyInterest(-100000, 0.1)).toBe(-110000);
  });
});
