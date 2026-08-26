import {
  ACT_DEV_POINTS,
  COPIES,
  CRUNCH,
  HEAT,
  JANK,
  HEAT_SOURCES,
  MARKETING,
  MONETIZATION_PER_PLAYER,
  moraleJank,
  MONEY,
  POLISH,
  SCORE,
  UNFINISHED,
} from "./balance.js";
import { axesOf } from "./content.js";
import { currentTitle, staffCount } from "./state.js";
import * as Synergy from "./synergy.js";
import { weightedPick } from "./rng.js";

export function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function clamp100(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function applyInterest(cash, rate) {
  if (cash >= 0) return cash;
  return cash - Math.abs(cash) * rate;
}

// --- Dev points -----------------------------------------------------------

/**
 * The real point budget, which can go to zero or below once polish has eaten
 * into it. Placement uses the floored `devPoints()` so a 1-cost card is always
 * placeable; anything that *spends* points has to measure against this one.
 */
export function devPointsRaw(state, content) {
  let n = state.studio.devPointsBase + (ACT_DEV_POINTS[state.act] || 0);
  for (const id of state.studio.upgrades) {
    n += content.upgrades[id]?.devPoints || 0;
  }
  for (const s of state.staff) {
    n += content.staff[s.id]?.devPoints || 0;
  }
  const title = currentTitle(state);
  n += title?.crunchCount || 0;
  n -= title?.polishCount || 0;
  n += title?.bonusPoints || 0;
  return n;
}

/**
 * Points available to spend on cards this production quarter.
 *
 * Floored at 1 so the board is never completely unplayable. That floor must not
 * leak into polish: gating polish on it meant an empty box reported a spare
 * point forever, and each extra click was another -2 morale and +2 trust for
 * nothing. See `devPointsRaw`.
 */
export function devPoints(state, content) {
  return Math.max(1, devPointsRaw(state, content));
}

export function pointsSpent(state, content) {
  const title = currentTitle(state);
  if (!title) return 0;
  return title.cards.reduce((n, id) => n + (content.features[id]?.cost || 1), 0);
}

export function pointsLeft(state, content) {
  return devPoints(state, content) - pointsSpent(state, content);
}

/** Spendable points, unfloored. What polish has to answer to. */
export function pointsLeftRaw(state, content) {
  return devPointsRaw(state, content) - pointsSpent(state, content);
}

export function crunchCost(state, content) {
  const title = currentTitle(state);
  let cost = CRUNCH.baseCost * Math.pow(CRUNCH.costGrowth, title?.crunchCount || 0);
  if (state.crunchDiscount) return 0;
  let mul = 1;
  for (const id of state.studio.upgrades) {
    const d = content.upgrades[id]?.crunchDiscount;
    if (d) mul *= 1 - d;
  }
  for (const s of state.staff) {
    const d = content.staff[s.id]?.crunchDiscount;
    if (d) mul *= 1 - d;
  }
  return Math.round(cost * mul);
}

// --- Axis sums ------------------------------------------------------------

export function sums(state, content, titleOverride = null) {
  const title = titleOverride || currentTitle(state);
  const out = { pc: 0, fun: 0, gore: 0, ordinary: 0 };
  if (!title) return { ...out, staffCount: 0 };

  for (const id of title.cards) {
    const f = content.features[id];
    if (!f) continue;
    const a = axesOf(f);
    out.pc += a.pc;
    out.fun += a.fun;
    out.gore += a.gore;
    out.ordinary += a.ordinary;
  }
  for (const k of ["pc", "fun", "gore", "ordinary"]) {
    out[k] += title.auras[k] || 0;
  }

  // Talent contributions are a *projection* until the box locks, at which
  // point applyStaffAtLock writes them into the box for real. Counting them in
  // both places would double them; counting them in neither would hide them
  // from the store page and the HUD estimate.
  if (!title.locked) {
    for (const entry of state.staff) {
      const aura = content.staff[entry.id]?.atLock?.aura;
      if (!aura) continue;
      for (const [k, v] of Object.entries(aura)) out[k] = (out[k] || 0) + v;
    }
  }

  // Headcount is itself PC pressure in Act I: every lanyard in the building
  // is another opinion in the box. Snapshotted at lock, so the roster that
  // shipped the game is the roster that counts — see applyStaffAtLock.
  const heads = title.locked ? title.staffHeads ?? staffCount(state) : staffCount(state);
  if (title.act === 1) out.pc += heads;

  return { ...out, staffCount: heads };
}

// --- Jank -----------------------------------------------------------------

export function titleJank(state, content, titleOverride = null) {
  const title = titleOverride || currentTitle(state);
  if (!title) return 0;

  let jank = title.jank || 0;
  for (const id of title.cards) {
    jank += content.features[id]?.jank || 0;
  }

  // Scope overrun: slots you promised beyond the points you can actually spend.
  const over = Math.max(0, title.slots - devPoints(state, content));
  jank += over * JANK.scopeOverrunPerSlot;

  for (const id of state.studio.upgrades) {
    jank += content.upgrades[id]?.perTitle?.jank || 0;
  }
  // Before the box locks this is a live projection from the current roster;
  // after it locks it is the snapshot taken at lock, so firing someone the
  // week before launch cannot retroactively re-bug the build.
  if (title.locked) {
    jank += title.staffJank || 0;
    jank += title.moraleJank || 0;
  } else {
    for (const s of state.staff) {
      jank += content.staff[s.id]?.atLock?.jank || 0;
    }
    // Live projection of how the team is doing, so the hover preview and the
    // production panel show what crunching another point will actually cost.
    jank += moraleJank(state.morale);
  }
  return Math.max(0, Math.round(jank));
}

export function effectiveJank(state, content, rawJank) {
  let jank = rawJank;
  for (const id of state.studio.upgrades) {
    const mul = content.upgrades[id]?.jankMul;
    if (mul) jank *= mul;
  }
  return Math.max(0, Math.round(jank));
}

// --- Hype -----------------------------------------------------------------

export function titleHype(state, content, titleOverride = null) {
  const title = titleOverride || currentTitle(state);
  if (!title) return 0;
  let hype = title.hype || 0;
  for (const id of title.cards) {
    hype += content.features[id]?.hype || 0;
  }
  for (const id of state.studio.upgrades) {
    hype += content.upgrades[id]?.perTitle?.hype || 0;
  }
  hype += state.heat * 0.15;
  return clamp100(hype);
}

/**
 * Controversy the box itself generates. Applied when the title locks so heat
 * has three quarters to compound rather than one launch to outrun its decay.
 */
export function titleHeat(state, content, titleOverride = null) {
  const title = titleOverride || currentTitle(state);
  if (!title) return 0;
  let heat = 0;
  for (const id of title.cards) {
    const f = content.features[id];
    if (!f) continue;
    heat += (f.gore || 0) * HEAT_SOURCES.perGore;
    if (f.tags?.includes("meme")) heat += HEAT_SOURCES.perMemeTag;
    if (f.tags?.includes("monetization")) heat += HEAT_SOURCES.perMonetizationTag;
  }
  heat += (title.crunchCount || 0) * HEAT_SOURCES.perCrunch;
  heat += titleJank(state, content, title) * HEAT_SOURCES.perJank;
  return Math.round(heat);
}

// --- The launch pipeline --------------------------------------------------

/**
 * Deterministic launch projection. No dice. Used by the store page, the HUD
 * estimate, and the hover-preview, so what you see before you ship is exactly
 * what the sim will compute — minus the backlash roll, which is flagged
 * separately as a risk rather than folded into the number.
 */
/**
 * What a chosen-but-not-yet-resolved campaign will do to the launch.
 *
 * `applyMarketing()` only writes its numbers into the title at End Quarter, so
 * until then the HUD, the store page and the hover preview all projected the
 * launch as if no campaign had been picked. The comment on `projectLaunch`
 * promises the sim minus the backlash roll; that was true for cards and the
 * dunk and false for every paid channel, and the spend slider moved a number
 * nothing on screen reflected.
 */
export function pendingMarketing(state, content, title) {
  const none = { scoreAdd: 0, copiesMul: 1, hype: 0 };
  const m = title?.marketing;
  if (!m || m.resolved || !m.channel) return none;
  const channel = content.channels[m.channel];
  if (!channel) return none;

  let mul = 1;
  for (const id of state.studio.upgrades) {
    mul *= content.upgrades[id]?.marketingMul ?? 1;
  }
  return {
    scoreAdd: channel.scoreAdd ?? 0,
    copiesMul: channel.copiesMul ?? 1,
    hype: MARKETING.hypeFor(m.spend || 0) * (channel.hypeMul ?? 1) * mul,
  };
}

export function projectLaunch(state, content, opts = {}) {
  const title = opts.title || currentTitle(state);
  if (!title) return null;
  const act = title.act;

  const raw = sums(state, content, title);
  const rules = Synergy.detect(content, title.cards);
  const bundle = Synergy.combine(rules);
  const { synergies, conflicts } = Synergy.split(rules);

  // Synergies can scale an axis before it hits the formulas.
  const pc = Math.max(0, raw.pc * bundle.pcMul);
  const fun = Math.max(0, raw.fun * bundle.funMul);
  const gore = Math.max(0, raw.gore * bundle.goreMul);
  const ordinary = Math.max(0, raw.ordinary);

  // Slots you promised and never filled.
  const emptySlots = Math.max(0, title.slots - title.cards.length);

  // Synergy jank and hype are part of the bundle and have to land here.
  // `Synergy.combine()` accumulated both and nothing ever read them, so every
  // rule whose payoff was "the box is cleaner" or "the box is louder" did
  // nothing at all — `it-just-works` (-12 jank), `engine-of-theseus` (-20),
  // `live-service-tax` (+18) and the hype on a dozen others. The score, copies
  // and money multipliers from the same bundle did apply, so the system looked
  // alive while half of it was inert.
  const rawJank =
    titleJank(state, content, title) + emptySlots * UNFINISHED.jankPerSlot + bundle.jank;
  const jank = effectiveJank(state, content, rawJank);
  const mkt = pendingMarketing(state, content, title);
  const hype = clamp100(titleHype(state, content, title) + bundle.hype + mkt.hype);

  // Endless concepts are generated into state, not the content catalogue, so
  // looking only in `content` left every generated title running at a flat
  // 1.0 skew — the genre lever silently switched off for the entire mode.
  const concept =
    content.concepts[title.conceptId] || state.endlessConcepts?.[title.conceptId];
  const skew = concept?.skew || {};
  const w = SCORE.weights[act];

  let score =
    SCORE.base +
    pc * w.pc +
    fun * w.fun +
    gore * w.gore +
    ordinary * w.ordinary +
    (state.standing - 50) * SCORE.standingTilt +
    bundle.scoreAdd -
    jank * SCORE.jankPenalty +
    (title.shipMods.scoreDelta || 0) +
    (title.marketing.scoreAdd || 0) + mkt.scoreAdd +
    emptySlots * UNFINISHED.scorePerSlot;
  score = clampScore(score);

  let demand =
    COPIES.base[act] +
    fun * COPIES.fun[act] * (skew.fun ?? 1) +
    gore * COPIES.gore[act] * (skew.gore ?? 1) +
    ordinary * COPIES.ordinary[act] * (skew.ordinary ?? 1) +
    pc * COPIES.pc[act] * (skew.pc ?? 1) +
    raw.staffCount * COPIES.staffDrag[act];
  demand = Math.max(0, demand);

  const trustMul = COPIES.trustMul(state.trust);
  const heatMul = COPIES.heatMul(state.heat);
  const hypeMul = COPIES.hypeMul(hype);
  const jankMul = COPIES.jankMul(jank);
  const franchiseMul = 1 + (title.franchiseDepth || 0) * MONEY.franchiseMul;

  let copies =
    demand *
    trustMul *
    heatMul *
    hypeMul *
    jankMul *
    franchiseMul *
    bundle.copiesMul *
    (title.shipMods.copiesMul ?? 1) *
    (title.marketing.copiesMul ?? 1) * mkt.copiesMul *
    Math.max(0.25, 1 + emptySlots * UNFINISHED.copiesPerSlot);
  copies = Math.max(0, Math.round(copies));

  // --- Money ---
  const price = Math.max(0, Math.round(title.price * (title.priceMul ?? 1)));
  const deal = title.deal || { revShare: 1, type: "self" };
  const grossUnits = copies * price;

  // Monetisation cards earn per-player regardless of box price, which is why
  // a free-to-enter title can still out-earn a $70 one.
  let moneyRate = 0;
  for (const id of title.cards) {
    moneyRate += content.features[id]?.money || 0;
  }
  // Also from the locked roster, for the same reason as headcount.
  if (title.locked) {
    moneyRate += title.staffMoneyMul || 0;
  } else {
    for (const s of state.staff) {
      moneyRate += content.staff[s.id]?.moneyMul || 0;
    }
  }
  const inGame = Math.round(
    copies * moneyRate * MONETIZATION_PER_PLAYER * bundle.moneyMul * (title.moneyMul ?? 1)
  );

  const grossRevenue = grossUnits + inGame;
  let revShare = deal.revShare ?? 1;
  for (const id of state.studio.upgrades) {
    revShare -= content.upgrades[id]?.revShareCost || 0;
  }
  revShare -= state.flags.creditorShare || 0;
  revShare = Math.max(0.15, revShare);
  const revenue = Math.round(grossRevenue * revShare);

  // --- Investor wire ---
  let wire = 0;
  let quotaMet = true;
  if (deal.type === "investor") {
    wire = Math.round(
      score *
        MONEY.wirePerScorePoint *
        (deal.wireMul ?? 1) *
        (1 + MONEY.wireStaffBonus * raw.staffCount) *
        Math.max(0.4, state.standing / MONEY.wireStandingPivot)
    );
    if (deal.quota != null && score < deal.quota) {
      quotaMet = false;
      wire = Math.round(wire * MONEY.quotaMissMul);
    }
  }
  const wirePaid = title.wireVoided ? 0 : wire;

  const backlashChance = HEAT.chance(state.heat);

  return {
    act,
    titleIndex: title.index,
    name: title.name,
    score,
    copies,
    price,
    revenue,
    grossRevenue,
    revShare,
    unitsRevenue: grossUnits,
    inGameRevenue: inGame,
    wire,
    wirePaid,
    quotaMet,
    quota: deal.quota ?? null,
    pc: round1(pc),
    fun: round1(fun),
    gore: round1(gore),
    ordinary: round1(ordinary),
    rawPc: raw.pc,
    rawFun: raw.fun,
    rawGore: raw.gore,
    rawOrdinary: raw.ordinary,
    staffCount: raw.staffCount,
    jank,
    rawJank,
    hype,
    synergies,
    conflicts,
    bundle,
    multipliers: { trustMul, heatMul, hypeMul, jankMul, franchiseMul },
    backlashChance,
    emptySlots,
    dunked: !!title.dunked,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Roll the backlash table. Separated from projectLaunch so previews stay
 * deterministic and the gamble is explicit.
 */
export function rollBacklash(state, content, projection, rng) {
  if (state.heat < HEAT.backlashFloor) return null;
  if (rng() >= projection.backlashChance) return null;

  const absorbed = state.studio.upgrades.some(
    (id) => content.upgrades[id]?.absorbsBacklash && !state.flags.legalUsed
  );
  const entry = weightedPick(rng, content.backlash);
  return { ...entry, absorbed };
}

// --- Gating ---------------------------------------------------------------

export function canPlaceCard(state, content, featureId) {
  const title = currentTitle(state);
  if (!title || title.locked) return { ok: false, reason: "locked" };
  if (state.phase !== "production") return { ok: false, reason: "phase" };
  if (title.cards.includes(featureId)) return { ok: false, reason: "duplicate" };
  if (title.cards.length >= title.slots) return { ok: false, reason: "slots" };

  const f = content.features[featureId];
  if (!f) return { ok: false, reason: "unknown" };
  if (!f.acts.includes(title.act)) return { ok: false, reason: "catalog" };
  if ((f.cost || 1) > pointsLeft(state, content)) return { ok: false, reason: "points" };
  return { ok: true };
}

/**
 * You may always ship, provided there is *something* in the box. Empty slots
 * are priced (jank, score, copies, trust) rather than forbidden — a studio
 * shipping an unfinished game is the most realistic move in this entire
 * simulation and it should be available to the player.
 */
export function canLockBox(state) {
  const title = currentTitle(state);
  if (!title) return false;
  return title.cards.length > 0;
}

/** Empty slots left after staff have done their worst. */
export function projectedEmpties(state, content) {
  const title = currentTitle(state);
  if (!title) return 0;
  return Math.max(0, title.slots - title.cards.length - predictFills(state, content));
}

/**
 * How many empty slots staff will actually fill at lock.
 *
 * The old build gated on `staff.length >= empties`, which shipped boxes with
 * visible holes whenever a staffer's pet card was already on the board. This
 * walks the real injection order instead, including backup preferences.
 */
export function predictFills(state, content) {
  const title = currentTitle(state);
  if (!title) return 0;
  const onBox = [...title.cards];
  let fills = 0;
  let empties = title.slots - onBox.length;

  for (const s of state.staff) {
    if (empties <= 0) break;
    const person = content.staff[s.id];
    if (!person?.petFeature) continue;
    const wanted = [person.petFeature, ...(person.petBackups || [])];
    const pick = wanted.find(
      (id) => !onBox.includes(id) && content.features[id]?.acts.includes(title.act)
    );
    if (pick) {
      onBox.push(pick);
      fills++;
      empties--;
    }
  }
  return fills;
}
