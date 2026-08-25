import { DIFFICULTIES, START } from "./balance.js";
import { hashSeed, normalizeSeed, randomSeedPhrase } from "./rng.js";

export const SAVE_VERSION = 3;
export const CHIRP_CAP = 200;

export const PHASES = ["pitch", "production", "launch"];
export const AXES = ["pc", "fun", "gore", "ordinary"];

export function emptyAxes() {
  return { pc: 0, fun: 0, gore: 0, ordinary: 0 };
}

/**
 * One title's whole three-quarter life. `concept` is filled at PITCH,
 * `cards` during PRODUCTION, `result` at LAUNCH.
 */
export function emptyTitle(index, actHint = 1) {
  return {
    index,
    act: actHint,
    conceptId: null,
    name: null,
    slots: 0,
    catalog: null,
    franchiseOf: null,
    price: 20,
    deal: null, // { type, advance, budget, burnPerQuarter, revShare, quota, mandate }
    burnPerQuarter: 0,
    burnQuartersPaid: 0,
    offers: null, // the three concepts drawn at pitch, kept for the log
    dealOffers: null,
    cards: [],
    auras: emptyAxes(),
    jank: 0,
    staffJank: 0,
    moraleJank: 0,
    hype: 0,
    crunchCount: 0,
    polishCount: 0,
    locked: false,
    injected: [],
    synergies: [],
    conflicts: [],
    shipMods: { scoreDelta: 0, copiesMul: 1 },
    marketing: { spend: 0, channel: null, resolved: false },
    result: null,
    postLaunch: null,
    dunked: false,
  };
}

export function makeStaffMember(person) {
  return {
    id: person.id,
    salary: person.salary,
    morale: 70,
    quarters: 0,
    raises: 0,
  };
}

export function createState(overrides = {}) {
  const seed = normalizeSeed(overrides.seed || randomSeedPhrase());
  const difficultyId = overrides.difficulty || "standard";
  const diff = DIFFICULTIES[difficultyId] || DIFFICULTIES.standard;

  const state = {
    version: SAVE_VERSION,
    seed,
    rngSeed: hashSeed(seed),
    difficulty: difficultyId,
    mode: overrides.mode || "campaign",

    quarter: 1,
    act: 1,
    titleIndex: 0,
    phase: "pitch",
    screen: "playing", // playing | crash | acquisition | ending | gameover

    cash: diff.startCash,
    standing: START.standing,
    trust: START.trust,
    heat: START.heat,
    morale: START.morale,

    studio: {
      name: "Big Baby Company",
      upgrades: [],
      devPointsBase: START.devPoints,
      staffCap: START.staffCap,
    },

    staff: [],
    titles: [emptyTitle(0, 1)],

    deck: { seen: [], queue: [] },
    crunchDiscount: false,
    unlockedCards: [],
    endlessConcepts: {},
    pendingEvent: null, // { id, act, phase, title, body, choices }
    eventChoice: null,
    eventOutcome: null,

    chirps: [],
    chirpSeq: 0,
    log: [],
    ledger: [],

    hub: "hq",
    flags: {
      penthouseUnlocked: false,
      dunkNextLaunch: false,
      crashed: false,
      acquisitionOffered: false,
      acquisitionTaken: false,
      liveService: false,
      chapter11: 0,
      tutorialSeen: false,
      ownsIP: true,
    },

    totalWires: 0,
    lastWire: 0,
    lastLaunch: null,
    quotaMisses: 0,

    stats: {
      copiesLifetime: 0,
      revenueLifetime: 0,
      titlesShipped: 0,
      crunches: 0,
      hires: 0,
      fires: 0,
      backlashes: 0,
      synergiesFired: 0,
      dunks: 0,
      quits: 0,
      bestScore: 0,
      bestCopies: 0,
      peakCash: diff.startCash,
      lowCash: diff.startCash,
    },

    rank: null,
    ending: null,
  };

  return { ...state, ...stripOverrides(overrides) };
}

function stripOverrides(o) {
  const { seed, difficulty, mode, ...rest } = o;
  return rest;
}

// --- Selectors ------------------------------------------------------------

export function currentTitle(state) {
  return state.titles[state.titleIndex];
}

export function difficultyOf(state) {
  return DIFFICULTIES[state.difficulty] || DIFFICULTIES.standard;
}


export function staffCount(state) {
  return state.staff.length;
}

export function hasUpgrade(state, id) {
  return state.studio.upgrades.includes(id);
}

export function cloneState(state) {
  return structuredClone(state);
}

export function clamp100(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function pushChirp(state, chirp) {
  // A stable id lets the feed tell a genuinely new post from a re-render, which
  // is what drives the arrival animation and the engagement counters.
  state.chirpSeq = (state.chirpSeq || 0) + 1;
  state.chirps.unshift({ id: state.chirpSeq, quarter: state.quarter, ...chirp });
  if (state.chirps.length > CHIRP_CAP) state.chirps.length = CHIRP_CAP;
}

export function pushLedger(state, entry) {
  state.ledger.unshift({ quarter: state.quarter, ...entry });
  if (state.ledger.length > 120) state.ledger.length = 120;
}
