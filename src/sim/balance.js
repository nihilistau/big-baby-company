// Every tunable number in the game lives here so tools/balance-sim.mjs can
// sweep them without touching logic. Nothing in here reads game state.

export const DIFFICULTIES = {
  darling: {
    id: "darling",
    name: "Publisher's Darling",
    blurb: "Starting cash is generous, the bank is patient, the board is easily impressed.",
    startCash: 400000,
    interest: 0.06,
    quotaStep: 3,
    moraleDecay: 2,
    chapter11: -900000,
    liquidation: -1600000,
  },
  standard: {
    id: "standard",
    name: "Standard",
    blurb: "The industry as it actually is. Recommended for your first studio.",
    startCash: 250000,
    interest: 0.1,
    quotaStep: 5,
    moraleDecay: 3,
    chapter11: -680000,
    liquidation: -1250000,
  },
  wendys: {
    id: "wendys",
    name: "Wendy's Speedrun",
    blurb: "Thin cash, fat interest, a board that wants more every single quarter.",
    startCash: 120000,
    interest: 0.15,
    quotaStep: 8,
    moraleDecay: 5,
    chapter11: -450000,
    liquidation: -850000,
  },
};

export const START = {
  standing: 40,
  trust: 30,
  heat: 0,
  morale: 72,
  devPoints: 4,
  staffCap: 4,
};

// Per-quarter drift applied at End Quarter, before anything else.
export const DRIFT = {
  standing: -3, // the rate at `standingPivot`; see standingDrift below
  standingPivot: 50,
  trust: -3,
  heat: -5,
  morale: +2, // recovers when you are not crunching
};

/**
 * Standing decays in proportion to how much of it you hold, rather than as a
 * flat tax.
 *
 * A flat -3 was simultaneously fatal at the bottom and toothless at the top.
 * A studio the industry had written off could never climb out of zero however
 * well it sold — -9 a cycle swallowed every gain — so `funmax`, `goremax` and
 * `balanced` all spent about three quarters of the campaign pinned at 0, where
 * the wire multiplier is already clamped and deal quality stops responding.
 * Half the system was inert for anyone not feeding the industry PC content.
 * Meanwhile a darling near 100 paid the same -3 and could simply coast.
 *
 * Scaling by `standing / pivot` makes the rate -3 at 50, about -6 near the
 * ceiling and nearly nothing near the floor, which turns standing into an
 * equilibrium a studio settles at rather than a countdown every studio
 * eventually loses.
 *
 * Measured by `tools/meter-probe.mjs`.
 */
export const standingDrift = (standing) =>
  DRIFT.standing * (standing / DRIFT.standingPivot);

// Rent, tools, licences, the accountant. Scales with how big you've got, so
// growth is never free and a bloated studio bleeds between launches.
export const OPEX = {
  base: 34000,
  perUpgrade: 12000,
  perStaff: 8000,
  perAct: { 1: 1.0, 2: 0.35, 3: 1.2 },
};

export const CLAMP = { min: 0, max: 100 };

// --- Industry score -------------------------------------------------------
// score = BASE + sum(axis * weight[act]) + standing tilt + synergy - jank
export const SCORE = {
  base: 20,
  weights: {
    1: { pc: 7.0, fun: -2.5, gore: -6.0, ordinary: -1.0 },
    2: { pc: 5.0, fun: -1.5, gore: -4.0, ordinary: -0.5 },
    3: { pc: 4.0, fun: -1.0, gore: -3.0, ordinary: 0.0 },
  },
  standingTilt: 0.25, // (standing - 50) * this
  jankPenalty: 0.35, // per point of jank
};

// --- Copies ---------------------------------------------------------------
export const COPIES = {
  base: { 1: 450, 2: 1300, 3: 3700 },
  fun: { 1: 240, 2: 430, 3: 800 },
  gore: { 1: 80, 2: 330, 3: 560 },
  ordinary: { 1: 115, 2: 300, 3: 570 },
  pc: { 1: -580, 2: -580, 3: -400 },
  staffDrag: { 1: -170, 2: 0, 3: -55 },

  // Multiplier curves. Deliberately narrower than they look: they stack
  // multiplicatively, so generous individual ranges compound into nonsense.
  trustMul: (trust) => 0.6 + trust / 85, // 0.60 .. 1.78
  heatMul: (heat) => 1 + heat / 300, // 1.00 .. 1.33
  hypeMul: (hype) => 0.75 + hype / 160, // 0.75 .. 1.375
  jankMul: (jank) => Math.max(0.2, 1 - jank / 130), // 1.00 .. 0.23
};

// --- Money ----------------------------------------------------------------
export const MONEY = {
  wirePerScorePoint: 2600,
  wireStaffBonus: 0.1, // per head
  wireStandingPivot: 50, // wire scales with standing / this
  quotaMissMul: 0.4,
  quotaMissStanding: -10,
  franchiseMul: 0.18, // per prior title in the same franchise
};

// --- Production actions ---------------------------------------------------
export const CRUNCH = {
  baseCost: 15000,
  costGrowth: 1.6, // each extra crunch in the same title costs more
  points: 1,
  jank: 12,
  morale: -13,
  heat: 3,
};

export const POLISH = {
  points: 1, // spends a dev point
  jank: -18,
  morale: -2,
  trust: 2,
};

export const DUNK = {
  score: 5,
  copiesMul: 0.9,
  heat: 18,
  trust: -4,
  standing: 3,
};

// --- Heat & backlash ------------------------------------------------------
export const HEAT = {
  backlashFloor: 30, // below this, never rolls
  // probability of a backlash roll firing at launch
  chance: (heat) => Math.max(0, (heat - 30) / 80),
};

// --- Morale ---------------------------------------------------------------
export const MORALE = {
  quitThreshold: 30,
  quitChance: (morale) => Math.max(0, (30 - morale) / 60),
  sabotageThreshold: 15,
  leakThreshold: 22,
  raiseCost: 0.5, // half a quarter salary
  raiseMorale: 18,
  perkCost: 12000,
  perkMorale: 10,
};

// How launch results feed back into the persistent stats. Kept here so the
// feedback loop is tunable without touching quarter.js.
export const FEEDBACK = {
  standingPivot: 45,
  standingGain: 0.34,
  trustCoeff: 0.62,
  trustJank: -0.14,
  heatPerGore: 2.4,
  // Commercial success buys grudging respect. Without this, a FUN or GORE
  // studio sits at zero standing forever and half the system goes inert.
  //
  // Measured against the act's baseline demand rather than a flat divisor.
  // The flat `copies / 6500` was calibrated somewhere above what launches
  // actually sell — it needed 91,000 copies in one launch to reach its own
  // cap, so in practice it returned 1 to 3 against a score term of -8 to -15
  // and never delivered the respect the line above promises. As a multiple of
  // what the act expects to sell, a genuine hit now offsets a low industry
  // score, which is the whole point of the term.
  standingPerCopiesCap: 22,
  standingPerCopiesRate: 4.6,
  standingPerCopies: (copies, act) =>
    Math.min(
      FEEDBACK.standingPerCopiesCap,
      (copies / COPIES.base[act]) * FEEDBACK.standingPerCopiesRate
    ),
  // Reputation gets stickier the closer you are to a meter's ceiling. Gains
  // only; losing reputation is never resisted, which is what "earned slowly,
  // lost fast" means in arithmetic.
  //
  // Each meter is held below its ceiling by exactly one mechanism, not two:
  //
  //   standing  proportional decay (see standingDrift). Fame is expensive to
  //             keep, and the bill scales with how much of it you have. Its
  //             income is small and its losses are large and unresisted -- a
  //             missed quota alone is -10 -- so a second damping term on top
  //             collapsed it to zero for every archetype. No gain resistance.
  //   trust     gain resistance, ceiling 100. An audience's love saturates.
  //             This was 130 while the meter caps at 100, so it never actually
  //             bit: at trust 97 a gain still landed at 25% strength, more
  //             than the flat drift took away. There was no equilibrium in the
  //             legal range -- solving the curve put it at 107 -- so trust
  //             ramped to the cap over twenty quarters and stayed there.
  //   heat      gain resistance at 110, on top of its own hard -5 a quarter.
  //
  // A meter with no entry here takes its gains in full.
  // Verified with `node tools/meter-probe.mjs`.
  resistanceCeiling: { trust: 100, heat: 110 },
  resist: (meter, value, delta) => {
    const ceiling = FEEDBACK.resistanceCeiling[meter];
    if (!ceiling || delta <= 0) return delta;
    return delta * Math.max(0, 1 - value / ceiling);
  },
};

// Controversy generated by the box itself, accrued when it locks rather than
// only at launch — otherwise heat can never outrun its own decay.
export const HEAT_SOURCES = {
  perGore: 1.4,
  perMemeTag: 3.0,
  perMonetizationTag: 2.5,
  perCrunch: 3.0,
  perJank: 0.06,
};

// Big boxes are hard on people, independent of crunch.
export const SCOPE_MORALE = -2.5; // per slot above four

// --- Jank -----------------------------------------------------------------
// Shipping with holes in the box. Not a hard block any more — an unfinished
// game is a legal, costly choice, which is both truer and better to play than
// a disabled End Quarter button.
export const UNFINISHED = {
  jankPerSlot: 11,
  copiesPerSlot: -0.07, // multiplicative
  scorePerSlot: -3,
  trustPerSlot: -2,
};

// Revenue per player from monetisation surfaces, independent of box price.
export const MONETIZATION_PER_PLAYER = 52;

// Dev points you gain simply by being a bigger operation each act.
export const ACT_DEV_POINTS = { 1: 0, 2: 1, 3: 2 };

export const JANK = {
  scopeOverrunPerSlot: 4, // slots beyond your dev points
  refundTrustHit: -12,
  qaLabMul: 0.5,
};

// --- Marketing ------------------------------------------------------------
export const MARKETING = {
  // hype gained per $10k spent, before channel multiplier
  hypePer10k: 3.5,
  maxSpendFraction: 0.6, // of current cash
};

// --- Meta -----------------------------------------------------------------
export const ENDLESS = {
  quotaGrowth: 6,
  interestGrowth: 0.015,
  costGrowth: 0.08,
};

export const PENTHOUSE_WIRES = 100000;
