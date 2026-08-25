import {
  DRIFT,
  ENDLESS,
  FEEDBACK,
  MORALE,
  OPEX,
  PENTHOUSE_WIRES,
  SCOPE_MORALE,
  UNFINISHED,
} from "./balance.js";
import {
  clamp100,
  cloneState,
  currentTitle,
  difficultyOf,
  emptyTitle,
  pushChirp,
  pushLedger,
} from "./state.js";
import {
  applyInterest,
  canLockBox,
  projectLaunch,
  rollBacklash,
  titleHeat,
} from "./economy.js";
import { applyMandate, applyStaffAtLock } from "./injection.js";
import { applyEffects } from "./effects.js";
import { drawEvent, markSeen } from "./deck.js";
import * as Chirper from "./chirper.js";
import { CAMPAIGN_QUARTERS, TOTAL_TITLES, actForSlot, conceptsForSlot } from "./content.js";
import { pick, roll, shuffle, stream } from "./rng.js";
import { rankFor, endingFor } from "./endings.js";
import { checkAchievements } from "./meta.js";

const PHASE_ORDER = ["pitch", "production", "launch"];

// --- Gating ---------------------------------------------------------------

export function blockingReason(state, content) {
  if (state.screen !== "playing") return "not-playing";
  if (state.pendingEvent && state.eventChoice == null) return "event";

  const title = currentTitle(state);
  if (state.phase === "pitch") {
    if (!title.conceptId) return "concept";
    if (!title.deal) return "deal";
    return null;
  }
  if (state.phase === "production") {
    if (!canLockBox(state)) return "empty-box";
    return null;
  }
  if (state.phase === "launch") {
    if (!title.marketing.channel) return "marketing";
    return null;
  }
  return null;
}

export function canAdvance(state, content) {
  return blockingReason(state, content) == null;
}

// --- Title setup ----------------------------------------------------------

/** Draw the three concepts on offer for this title slot. */
export function openTitle(state, content) {
  const title = currentTitle(state);
  if (title.offers) return;

  const slot = Math.min(title.index + 1, TOTAL_TITLES);
  let concepts = conceptsForSlot(content, slot);

  if (state.mode === "endless" || title.index >= TOTAL_TITLES) {
    concepts = endlessConcepts(state, content);
    for (const c of concepts) state.endlessConcepts[c.id] = c;
  }

  // Sequels only appear if you actually shipped the thing they follow.
  const shipped = state.titles.filter((t) => t.result).map((t) => t.conceptId);
  const legal = concepts.filter(
    (c) => !c.sequelTo || shipped.includes(c.sequelTo) || state.titles.some((t) => t.result && t.franchise === c.sequelTo)
  );

  const rng = stream(state, "concepts", state.quarter);
  const chosen = legal.length >= 3 ? shuffle(rng, legal).slice(0, 3) : legal;
  title.offers = chosen.map((c) => c.id);
  title.act = actForSlot(content, slot) || state.act;
  if (state.mode === "endless") title.act = 3;
}

function endlessConcepts(state, content) {
  const rng = stream(state, "endless", state.quarter);
  const base = content.conceptsList.filter((c) => c.act === 3 && !c.sequelTo);
  const inflation = 1 + (state.titles.length - TOTAL_TITLES) * ENDLESS.costGrowth;
  return shuffle(rng, base)
    .slice(0, 3)
    .map((c, i) => ({
      ...c,
      id: `${c.id}-endless-${state.titles.length}-${i}`,
      name: `${c.name} ${roman(state.titles.length - TOTAL_TITLES + 2)}`,
      budget: Math.round(c.budget * inflation),
      slots: Math.min(8, c.slots + Math.floor((state.titles.length - TOTAL_TITLES) / 3)),
    }));
}

function roman(n) {
  const map = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return map[n] || `${n}`;
}

/** Concept objects for the offers currently on the table (endless-aware). */
export function offeredConcepts(state, content) {
  const title = currentTitle(state);
  if (!title.offers) return [];
  return title.offers
    .map((id) => content.concepts[id] || state.endlessConcepts?.[id])
    .filter(Boolean);
}

// --- Event drawing --------------------------------------------------------

export function drawQuarterEvent(state, content) {
  const event = drawEvent(state, content);
  state.pendingEvent = event?.id ?? null;
  state.eventChoice = null;
  state.eventOutcome = null;
  if (event) markSeen(state, event.id);
}

// --- The main tick --------------------------------------------------------

export function advance(state, content) {
  const reason = blockingReason(state, content);
  if (reason) return { ok: false, reason, state };

  const next = cloneState(state);
  const events = [];
  const diff = difficultyOf(next);

  // 1. Interest on debt, before anything else can rescue you.
  if (next.cash < 0) {
    const before = next.cash;
    next.cash = Math.round(applyInterest(next.cash, diff.interest));
    pushLedger(next, { label: "Interest on debt", amount: next.cash - before });
    events.push({ type: "interest", amount: next.cash - before });
  }

  // 2. Payroll.
  let salary = 0;
  for (const s of next.staff) salary += s.salary;
  if (salary) {
    next.cash -= salary;
    pushLedger(next, { label: "Payroll", amount: -salary });
    events.push({ type: "salary", amount: salary });
  }

  // 3. This title's share of its production budget.
  const title = currentTitle(next);
  if (title?.burnPerQuarter && (title.burnQuartersPaid || 0) < 3) {
    next.cash -= title.burnPerQuarter;
    title.burnQuartersPaid = (title.burnQuartersPaid || 0) + 1;
    pushLedger(next, {
      label: `${title.name || "Production"} — development`,
      amount: -title.burnPerQuarter,
    });
    events.push({ type: "burn", amount: title.burnPerQuarter });
  }

  // 4. Operating costs. Growth is never free.
  const opex = operatingCost(next);
  if (opex) {
    next.cash -= opex;
    pushLedger(next, { label: "Operating costs", amount: -opex });
    events.push({ type: "opex", amount: opex });
  }

  // 5. Standing upkeep from upgrades and staff.
  applyUpkeep(next, content, events);

  // 6. Ambient drift. Reputation is a thing you have to keep paying for.
  next.standing = clamp100(next.standing + DRIFT.standing);
  next.trust = clamp100(next.trust + DRIFT.trust);
  next.heat = clamp100(next.heat + DRIFT.heat);
  const crunchedThisQuarter = (currentTitle(next)?.crunchCount || 0) > 0;
  next.morale = clamp100(
    next.morale + (crunchedThisQuarter ? -diff.moraleDecay : DRIFT.morale)
  );

  // 7. Phase work.
  if (next.phase === "production") {
    lockBox(next, content, events);
  } else if (next.phase === "launch") {
    resolveLaunch(next, content, events);
  }

  // 8. Advance the clock.
  if (next.screen === "playing") {
    stepPhase(next, content, events);
  }

  // 9. Solvency.
  checkSolvency(next, content, events);

  // 10. Colour, then a fresh event for the new quarter.
  if (next.screen === "playing") {
    Chirper.quarterFeed(next, content);
    drawQuarterEvent(next, content);
    next.crunchDiscount = false;
  }

  next.stats.peakCash = Math.max(next.stats.peakCash, next.cash);
  next.stats.lowCash = Math.min(next.stats.lowCash, next.cash);
  checkAchievements(next, content);

  return { ok: true, state: next, events };
}

function operatingCost(state) {
  const scale = OPEX.perAct[state.act] ?? 1;
  return Math.round(
    (OPEX.base +
      state.studio.upgrades.length * OPEX.perUpgrade +
      state.staff.length * OPEX.perStaff) *
      scale
  );
}

function applyUpkeep(state, content, events) {
  const add = { standing: 0, trust: 0, heat: 0, morale: 0, cash: 0, jank: 0 };
  const collect = (per) => {
    if (!per) return;
    for (const k of Object.keys(add)) add[k] += per[k] || 0;
  };
  for (const id of state.studio.upgrades) collect(content.upgrades[id]?.perQuarter);
  for (const s of state.staff) collect(content.staff[s.id]?.perQuarter);

  state.standing = clamp100(state.standing + add.standing);
  state.trust = clamp100(state.trust + add.trust);
  state.heat = clamp100(state.heat + add.heat);
  state.morale = clamp100(state.morale + add.morale);
  if (add.cash) {
    state.cash += add.cash;
    pushLedger(state, { label: "Studio income", amount: add.cash });
    events.push({ type: "upkeep", amount: add.cash });
  }
  const title = currentTitle(state);
  if (title && add.jank) title.jank = Math.max(0, (title.jank || 0) + add.jank);

  for (const s of state.staff) s.quarters++;
}

// --- Production close-out -------------------------------------------------

function lockBox(state, content, events) {
  const rng = stream(state, "lock", state.quarter);
  const idx = state.titleIndex;

  // Morale consequences fire before the box closes, so a quitter takes their
  // contribution with them.
  const sabotage = [];
  if (state.morale < MORALE.quitThreshold && state.staff.length) {
    if (roll(rng, MORALE.quitChance(state.morale))) {
      const gone = pick(rng, state.staff);
      state.staff = state.staff.filter((s) => s.id !== gone.id);
      state.stats.quits = (state.stats.quits || 0) + 1;
      Chirper.post(state, content, "quit");
      events.push({ type: "quit", staffId: gone.id, name: content.staff[gone.id]?.name });
    }
  }
  if (state.morale < MORALE.sabotageThreshold && state.staff.length) {
    const who = pick(rng, state.staff);
    if (who) {
      sabotage.push(who.id);
      Chirper.post(state, content, "sabotage");
      events.push({ type: "sabotage", staffId: who.id });
    }
  }
  if (state.morale < MORALE.leakThreshold) {
    state.heat = clamp100(state.heat + 10);
    Chirper.post(state, content, "leak");
    events.push({ type: "leak" });
  }

  const scopePain = Math.max(0, (state.titles[idx].slots || 0) - 4) * SCOPE_MORALE;
  if (scopePain) state.morale = clamp100(state.morale + scopePain);

  const boxHeat = titleHeat(state, content, state.titles[idx]);
  if (boxHeat) state.heat = clamp100(state.heat + FEEDBACK.resistance(state.heat, boxHeat));

  let title = applyStaffAtLock(state.titles[idx], state.staff, content, { sabotage });
  title = applyMandate(title, content);
  title.locked = true;
  state.titles[idx] = title;

  events.push({ type: "lock", injected: title.injected, mandate: title.mandateApplied });
}

// --- Launch ---------------------------------------------------------------

function resolveLaunch(state, content, events) {
  const rng = stream(state, "launch", state.quarter);
  const title = currentTitle(state);

  // Marketing resolves into the projection's inputs first.
  applyMarketing(state, content, rng, events);

  const projection = projectLaunch(state, content);

  // Backlash is rolled against Heat, after the numbers are otherwise known.
  const backlash = rollBacklash(state, content, projection, rng);
  let result = { ...projection };

  if (backlash) {
    state.stats.backlashes++;
    if (backlash.absorbed) {
      state.flags.legalUsed = true;
      events.push({ type: "backlash", entry: backlash, absorbed: true });
    } else {
      const outcomes = applyEffects(state, backlash.effects, content, rng, {
        label: backlash.name,
      });
      // Re-project so copies/score reflect the hit.
      result = { ...projectLaunch(state, content), backlash };
      Chirper.post(state, content, "backlash");
      events.push({ type: "backlash", entry: backlash, outcomes });
    }
  }

  result.hasJankCharm = title.cards.includes("meme-jank-charm");

  // Title 3 is the rug-pull: the wire is computed, shown, and never sent.
  if (title.index === 2 && state.act === 1) {
    title.wireVoided = true;
    result.wirePaid = 0;
  }

  const income = result.revenue + result.wirePaid;
  state.cash += income;
  state.totalWires += result.wirePaid;
  state.lastWire = result.wirePaid;
  pushLedger(state, { label: `${title.name} — launch`, amount: income });

  // Reputation moves with the result. Gains resist near the ceiling so no
  // stat can be parked at 100 and forgotten about.
  const standingSwing =
    (result.score - FEEDBACK.standingPivot) * FEEDBACK.standingGain +
    FEEDBACK.standingPerCopies(result.copies) +
    result.bundle.standing;
  state.standing = clamp100(
    state.standing + FEEDBACK.resistance(state.standing, standingSwing)
  );

  const trustSwing =
    (result.emptySlots || 0) * UNFINISHED.trustPerSlot +
    (result.fun + result.gore * 0.55 + result.ordinary * 0.85 - result.pc * 0.95) *
      FEEDBACK.trustCoeff +
    result.jank * FEEDBACK.trustJank +
    result.bundle.trust;
  state.trust = clamp100(state.trust + FEEDBACK.resistance(state.trust, trustSwing));

  const heatSwing = result.bundle.heat + result.gore * FEEDBACK.heatPerGore;
  state.heat = clamp100(state.heat + FEEDBACK.resistance(state.heat, heatSwing));
  if (!result.quotaMet) {
    state.standing = clamp100(state.standing - 10);
    state.quotaMisses++;
  }

  state.stats.copiesLifetime += result.copies;
  state.stats.revenueLifetime += income;
  state.stats.titlesShipped++;
  state.stats.synergiesFired += result.synergies.length;
  state.stats.bestScore = Math.max(state.stats.bestScore || 0, result.score);
  state.stats.bestCopies = Math.max(state.stats.bestCopies || 0, result.copies);

  title.result = result;
  state.lastLaunch = result;

  Chirper.launchFeed(state, content, result);
  events.push({ type: "launch", result });

  if (state.totalWires >= PENTHOUSE_WIRES && state.act === 1) {
    if (!state.flags.penthouseUnlocked) {
      state.flags.penthouseUnlocked = true;
      Chirper.post(state, content, "penthouse");
      events.push({ type: "penthouse" });
    }
  }
}

function applyMarketing(state, content, rng, events) {
  const title = currentTitle(state);
  const channel = content.channels[title.marketing.channel];
  if (!channel) return;

  const spend = title.marketing.spend || 0;
  const fromCash = title.marketing.fromCash || 0;
  if (fromCash) {
    state.cash -= fromCash;
    pushLedger(state, { label: `Marketing — ${channel.name}`, amount: -fromCash });
  }

  let mul = 1;
  for (const id of state.studio.upgrades) {
    mul *= content.upgrades[id]?.marketingMul ?? 1;
  }

  const hypeGain = (spend / 10000) * 3.5 * channel.hypeMul * mul;
  title.hype = (title.hype || 0) + hypeGain;
  title.marketing.copiesMul = channel.copiesMul ?? 1;
  title.marketing.scoreAdd = channel.scoreAdd ?? 0;
  title.marketing.resolved = true;

  state.standing = clamp100(state.standing + (channel.standing || 0));
  state.heat = clamp100(state.heat + (channel.heat || 0));
  state.trust = clamp100(state.trust + (channel.trust || 0));

  if (channel.risk && spend > 0 && roll(rng, channel.risk.chance)) {
    const outcomes = applyEffects(state, channel.risk.effects, content, rng, {
      label: channel.risk.name,
    });
    events.push({ type: "marketing-risk", risk: channel.risk, outcomes });
  }
  events.push({ type: "marketing", channel: channel.id, spend, hypeGain });
}

// --- Clock ----------------------------------------------------------------

function stepPhase(state, content, events) {
  const phaseIndex = PHASE_ORDER.indexOf(state.phase);

  if (phaseIndex < PHASE_ORDER.length - 1) {
    state.phase = PHASE_ORDER[phaseIndex + 1];
    state.quarter++;
    return;
  }

  // A title just launched. Scripted reversals fire here.
  const justFinished = state.titleIndex;

  if (justFinished === 2 && state.act === 1 && !state.flags.crashed) {
    runCrash(state, content, events);
    return;
  }

  if (justFinished === 6 && !state.flags.acquisitionOffered) {
    offerAcquisition(state, content, events);
    return;
  }

  if (state.mode === "campaign" && justFinished >= TOTAL_TITLES - 1) {
    finish(state, content, events);
    return;
  }

  startNextTitle(state, content, events);
}

function startNextTitle(state, content, events) {
  state.titleIndex++;
  state.quarter++;
  state.phase = "pitch";

  const slot = state.titleIndex + 1;
  const act = state.mode === "endless" ? 3 : actForSlot(content, slot) || state.act;

  if (act !== state.act) {
    state.act = act;
    state.hub = act === 2 ? "garage" : act === 3 ? "loft" : "hq";
    Chirper.post(state, content, act === 2 ? "act2-start" : "act3-start");
    events.push({ type: "act", act });
  }

  state.titles.push(emptyTitle(state.titleIndex, act));
  openTitle(state, content);

  if (state.mode === "endless") {
    const over = state.titles.length - TOTAL_TITLES;
    state.difficultyDrift = { quota: over * ENDLESS.quotaGrowth };
  }
}

function runCrash(state, content, events) {
  let severance = 0;
  let i = 0;
  for (const s of state.staff) {
    severance += s.salary;
    Chirper.postAs(state, content, "layoff", content.staff[s.id]?.name || "Staff", i++);
  }
  state.cash -= severance;
  if (severance) pushLedger(state, { label: "Severance", amount: -severance });

  state.staff = [];
  state.act = 2;
  state.hub = "garage";
  state.screen = "crash";
  state.flags.crashed = true;
  state.standing = clamp100(state.standing - 30);
  state.morale = clamp100(state.morale - 10);
  state.studio.staffCap = 3;

  events.push({
    type: "crash",
    severance,
    voidedWire: state.lastLaunch?.wire || 0,
  });
}

export function leaveCrash(state, content) {
  const next = cloneState(state);
  next.screen = "playing";
  startNextTitle(next, content, []);
  drawQuarterEvent(next, content);
  return next;
}

function offerAcquisition(state, content, events) {
  const value = Math.round(
    Math.max(400000, state.stats.revenueLifetime * 0.6 + state.trust * 22000 + state.standing * 14000)
  );
  state.flags.acquisitionOffered = true;
  state.acquisitionOffer = value;
  state.screen = "acquisition";
  Chirper.post(state, content, "acquisition");
  events.push({ type: "acquisition", value });
}

export function resolveAcquisition(state, content, accept) {
  const next = cloneState(state);
  if (accept) {
    next.cash += next.acquisitionOffer || 0;
    pushLedger(next, { label: "Acquisition", amount: next.acquisitionOffer || 0 });
    next.flags.acquisitionTaken = true;
    finish(next, content, []);
    return next;
  }
  next.flags.acquisitionRefused = true;
  next.trust = clamp100(next.trust + 25);
  next.standing = clamp100(next.standing - 10);
  next.morale = clamp100(next.morale + 20);
  Chirper.post(next, content, "acquisition-refused");
  next.screen = "playing";
  startNextTitle(next, content, []);
  drawQuarterEvent(next, content);
  return next;
}

function finish(state, content, events) {
  state.rank = rankFor(state.cash, content);
  state.ending = endingFor(state, content);
  state.screen = "ending";
  events.push({ type: "ending", rank: state.rank, ending: state.ending });
}

// --- Solvency -------------------------------------------------------------

function checkSolvency(state, content, events) {
  const diff = difficultyOf(state);
  if (state.screen !== "playing") return;

  if (state.cash <= diff.liquidation) {
    state.screen = "gameover";
    state.gameOverCause = "liquidation";
    state.rank = rankFor(state.cash, content);
    state.ending = content.endings.find((e) => e.id === "wendys-ending") || null;
    Chirper.post(state, content, "chapter11");
    events.push({ type: "liquidated" });
    return;
  }

  if (state.cash <= diff.chapter11) {
    // Second filing is the end. Creditors do not extend the same courtesy twice.
    if (state.flags.chapter11 >= 1) {
      state.screen = "gameover";
      state.gameOverCause = "second-filing";
      state.rank = rankFor(state.cash, content);
      state.ending = content.endings.find((e) => e.id === "wendys-ending") || null;
      events.push({ type: "liquidated", secondFiling: true });
      return;
    }

    state.flags.chapter11++;
    const lost = [...state.studio.upgrades];
    const discharged = -state.cash;

    // The debt is discharged and everything that made you a studio goes with
    // it: the upgrades, the team, and a permanent desk.
    state.studio.upgrades = [];
    state.staff = [];
    state.cash = 0;
    // The debt is written off, but the creditors keep a permanent slice of
    // everything you sell from here. Without this, filing at the threshold is
    // strictly profitable and the bots farm it.
    state.flags.creditorShare = (state.flags.creditorShare || 0) + 0.14;
    state.studio.devPointsBase = Math.max(2, state.studio.devPointsBase - 1);
    state.studio.staffCap = Math.max(2, state.studio.staffCap - 1);
    state.morale = clamp100(state.morale - 30);
    state.standing = clamp100(state.standing - 25);
    state.trust = clamp100(state.trust - 15);

    pushLedger(state, { label: "Chapter 11 — debt discharged", amount: discharged });
    Chirper.post(state, content, "chapter11");
    events.push({ type: "chapter11", lostUpgrades: lost, discharged });
  }
}

// --- Setup ----------------------------------------------------------------

export function beginRun(state, content) {
  openTitle(state, content);
  drawQuarterEvent(state, content);
  return state;
}

export { CAMPAIGN_QUARTERS, PHASE_ORDER };
