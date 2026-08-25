import {
  CRUNCH,
  DIFFICULTIES,
  DUNK,
  MARKETING,
  MORALE,
  POLISH,
} from "./balance.js";
import {
  clamp100,
  currentTitle,
  makeStaffMember,
  pushChirp,
  pushLedger,
} from "./state.js";
import { canPlaceCard, crunchCost, pointsLeft } from "./economy.js";
import { applyEffects } from "./effects.js";
import * as Chirper from "./chirper.js";
import { markSeen } from "./deck.js";
import { stream } from "./rng.js";

const fail = (reason) => ({ ok: false, reason });
const done = (extra = {}) => ({ ok: true, ...extra });

// --- PITCH ----------------------------------------------------------------

export function chooseConcept(state, conceptId, content) {
  if (state.phase !== "pitch") return fail("phase");
  const title = currentTitle(state);
  if (title.conceptId) return fail("already");

  const concept = content.concepts[conceptId] || state.endlessConcepts?.[conceptId];
  if (!concept) return fail("unknown");
  if (!title.offers?.includes(conceptId)) return fail("not-offered");

  title.conceptId = concept.id;
  title.name = concept.name;
  title.slots = concept.slots;
  title.price = concept.price;
  title.budget = concept.budget;
  title.genre = concept.genre;

  if (concept.sequelTo) {
    const prior = state.titles.filter(
      (t) => t.result && (t.conceptId === concept.sequelTo || t.franchise === concept.sequelTo)
    );
    title.franchise = concept.sequelTo;
    title.franchiseDepth = state.titles.filter((t) => t.result && t.franchise === concept.sequelTo)
      .length + prior.length;
  }
  return done({ concept });
}

export function dealOffersFor(state, content) {
  return content.dealsList.filter((d) => {
    if (!d.acts.includes(state.act)) return false;
    if (d.minStanding != null && state.standing < d.minStanding) return false;
    if (d.minTrust != null && state.trust < d.minTrust) return false;
    return true;
  });
}

/**
 * How much harder the board has got. Every investor deal you sign raises the
 * score they expect from the next one — the escalating-demands treadmill is
 * the whole reason the PC spiral spirals.
 */
export function quotaEscalation(state) {
  const signed = state.titles.filter((t) => t.deal?.type === "investor").length;
  const diff = DIFFICULTIES[state.difficulty] || DIFFICULTIES.standard;
  return signed * diff.quotaStep + (state.difficultyDrift?.quota || 0);
}

export function dealTerms(state, content, deal) {
  const title = currentTitle(state);
  const budget = title?.budget ?? 0;
  const advance =
    deal.advanceFromTrust != null
      ? Math.round((state.trust / 10) * deal.advanceFromTrust)
      : Math.round(budget * (deal.advanceMul ?? 0));
  const marketingBudget =
    deal.marketingBudgetMul != null
      ? Math.round(budget * deal.marketingBudgetMul)
      : deal.marketingBudget ?? 0;
  // An advance funds production; it is not profit on top of it. Whatever it
  // does not cover you burn yourself, spread over the three quarters of the
  // title rather than taken as a lump at signing — charging the whole budget
  // up front put the entire outlay three quarters ahead of any revenue and
  // bankrupted most Act III runs on the pitch itself.
  const uncovered = Math.max(0, budget - advance);
  const surplus = Math.max(0, advance - budget);

  return {
    advance,
    budget,
    surplus,
    burnPerQuarter: Math.ceil(uncovered / 3),
    marketingBudget,
    revShare: deal.revShare ?? 1,
    quota: deal.quota == null ? null : deal.quota + quotaEscalation(state),
    wireMul: deal.wireMul ?? 0,
    mandate: deal.mandate ?? null,
    netNow: surplus,
  };
}

export function chooseDeal(state, dealId, content) {
  if (state.phase !== "pitch") return fail("phase");
  const title = currentTitle(state);
  if (!title.conceptId) return fail("no-concept");
  if (title.deal) return fail("already");

  const deal = content.deals[dealId];
  if (!deal) return fail("unknown");
  if (!dealOffersFor(state, content).some((d) => d.id === dealId)) return fail("locked");

  const terms = dealTerms(state, content, deal);
  title.deal = { type: deal.type, id: deal.id, name: deal.name, ...terms };
  title.burnPerQuarter = terms.burnPerQuarter;
  title.burnQuartersPaid = 0;

  if (terms.surplus) {
    state.cash += terms.surplus;
    pushLedger(state, { label: `${deal.name} — advance surplus`, amount: terms.surplus });
  }

  if (terms.marketingBudget) {
    title.marketing.budget = terms.marketingBudget;
  }
  if (deal.trustCost) {
    state.trust = clamp100(state.trust - deal.trustCost);
  }
  return done({ terms });
}

// --- PRODUCTION -----------------------------------------------------------

export function placeCard(state, featureId, content) {
  const check = canPlaceCard(state, content, featureId);
  if (!check.ok) return check;
  currentTitle(state).cards.push(featureId);
  return done();
}

export function removeCard(state, featureId) {
  const title = currentTitle(state);
  if (!title || title.locked) return fail("locked");
  if (state.phase !== "production") return fail("phase");
  if (!title.cards.includes(featureId)) return fail("missing");
  title.cards = title.cards.filter((id) => id !== featureId);
  return done();
}

export function crunch(state, content) {
  if (state.phase !== "production") return fail("phase");
  const title = currentTitle(state);
  if (!title || title.locked) return fail("locked");

  const cost = crunchCost(state, content);
  state.cash -= cost;
  title.crunchCount = (title.crunchCount || 0) + 1;
  title.jank = (title.jank || 0) + CRUNCH.jank;
  state.morale = clamp100(state.morale + CRUNCH.morale);
  state.heat = clamp100(state.heat + CRUNCH.heat);
  state.stats.crunches++;
  state.crunchDiscount = false;

  pushLedger(state, { label: "Crunch", amount: -cost });
  Chirper.post(state, content, title.crunchCount >= 3 ? "crunch-heavy" : "crunch");
  return done({ cost });
}

export function polish(state, content) {
  if (state.phase !== "production") return fail("phase");
  const title = currentTitle(state);
  if (!title || title.locked) return fail("locked");
  if (pointsLeft(state, content) < 1) return fail("points");

  title.polishCount = (title.polishCount || 0) + 1;
  title.jank = Math.max(0, (title.jank || 0) + POLISH.jank);
  state.morale = clamp100(state.morale + POLISH.morale);
  state.trust = clamp100(state.trust + POLISH.trust);
  return done();
}

// --- Staff ----------------------------------------------------------------

export function hireOffersFor(state, content) {
  return content.staffList.filter((p) => p.acts.includes(state.act));
}

export function hire(state, staffId, content) {
  const person = content.staff[staffId];
  if (!person) return fail("unknown");
  if (!person.acts.includes(state.act)) return fail("act");
  if (state.staff.some((s) => s.id === staffId)) return fail("already");
  if (state.staff.length >= state.studio.staffCap) return fail("cap");

  state.staff.push(makeStaffMember(person));
  state.stats.hires++;
  Chirper.postAs(
    state,
    content,
    person.traits.includes("talent") ? "hire-talent" : "hire",
    person.name,
    state.stats.hires
  );
  return done();
}

export function fire(state, staffId, content) {
  if (!state.staff.some((s) => s.id === staffId)) return fail("missing");
  state.staff = state.staff.filter((s) => s.id !== staffId);
  state.stats.fires++;
  state.morale = clamp100(state.morale - 4);
  Chirper.postAs(state, content, "fire", content.staff[staffId]?.name, state.stats.fires);
  return done();
}

export function giveRaise(state, staffId, content) {
  const entry = state.staff.find((s) => s.id === staffId);
  if (!entry) return fail("missing");
  const cost = Math.round(entry.salary * MORALE.raiseCost);
  state.cash -= cost;
  entry.salary = Math.round(entry.salary * 1.15);
  entry.raises++;
  entry.morale = clamp100(entry.morale + MORALE.raiseMorale);
  state.morale = clamp100(state.morale + 6);
  pushLedger(state, { label: `Raise — ${content.staff[staffId]?.name}`, amount: -cost });
  return done({ cost });
}

export function buyPerk(state) {
  state.cash -= MORALE.perkCost;
  state.morale = clamp100(state.morale + MORALE.perkMorale);
  pushLedger(state, { label: "Team perk", amount: -MORALE.perkCost });
  return done({ cost: MORALE.perkCost });
}

// --- Studio upgrades ------------------------------------------------------

export function upgradeOffersFor(state, content) {
  return content.upgradesList.filter((u) => {
    if (!u.acts.includes(state.act)) return false;
    if (state.studio.upgrades.includes(u.id)) return false;
    if (u.requires && !u.requires.every((r) => state.studio.upgrades.includes(r)))
      return false;
    return true;
  });
}

export function buyUpgrade(state, upgradeId, content) {
  const up = content.upgrades[upgradeId];
  if (!up) return fail("unknown");
  if (state.studio.upgrades.includes(upgradeId)) return fail("already");
  if (!up.acts.includes(state.act)) return fail("act");
  if (up.requires && !up.requires.every((r) => state.studio.upgrades.includes(r)))
    return fail("requires");
  if (state.cash < up.cost) return fail("cash");

  state.cash -= up.cost;
  state.studio.upgrades.push(upgradeId);
  if (up.ownsIP) state.flags.ownsIP = true;
  pushLedger(state, { label: up.name, amount: -up.cost });
  return done();
}

// --- LAUNCH ---------------------------------------------------------------

export function marketingChannelsFor(state, content) {
  const unlocked = state.studio.upgrades.some(
    (id) => content.upgrades[id]?.unlocksMarketing
  );
  return content.channelsList.filter((c) => c.free || unlocked);
}

export function maxMarketingSpend(state) {
  const title = currentTitle(state);
  const budget = title?.marketing?.budget || 0;
  return Math.max(0, Math.round(state.cash * MARKETING.maxSpendFraction) + budget);
}

export function setMarketing(state, channelId, spend, content) {
  if (state.phase !== "launch") return fail("phase");
  const title = currentTitle(state);
  if (title.marketing.resolved) return fail("already");
  const channel = content.channels[channelId];
  if (!channel) return fail("unknown");
  if (!marketingChannelsFor(state, content).some((c) => c.id === channelId))
    return fail("locked");

  const capped = Math.max(0, Math.min(Math.round(spend), maxMarketingSpend(state)));
  const budget = title.marketing.budget || 0;
  const fromCash = Math.max(0, capped - budget);

  title.marketing.channel = channelId;
  title.marketing.spend = capped;
  title.marketing.fromCash = fromCash;
  return done({ spend: capped, fromCash });
}

export function dunk(state, content) {
  if (!state.flags.penthouseUnlocked) return fail("penthouse");
  const title = currentTitle(state);
  if (!title || title.dunked) return fail("already");

  title.dunked = true;
  title.shipMods.scoreDelta += DUNK.score;
  title.shipMods.copiesMul *= DUNK.copiesMul;
  state.heat = clamp100(state.heat + DUNK.heat);
  state.trust = clamp100(state.trust + DUNK.trust);
  state.standing = clamp100(state.standing + DUNK.standing);
  state.stats.dunks = (state.stats.dunks || 0) + 1;
  Chirper.post(state, content, "dunk");
  return done();
}

// --- Events ---------------------------------------------------------------

export function chooseEventOption(state, index, content) {
  if (!state.pendingEvent) return fail("none");
  if (state.eventChoice != null) return fail("already");

  const event = content.events[state.pendingEvent];
  const choice = event?.choices?.[index];
  if (!choice) return fail("unknown");

  const rng = stream(state, "event", state.quarter, event.id, index);
  const outcomes = applyEffects(state, choice.effects, content, rng, {
    label: event.title,
  });
  if (choice.chirp) {
    const account = content.chirps.accounts[choice.chirp.who] || {};
    pushChirp(state, {
      who: account.name || choice.chirp.who,
      handle: account.handle,
      kind: account.kind,
      text: choice.chirp.text,
      key: "event",
    });
  }

  state.eventChoice = index;
  state.eventOutcome = outcomes;
  markSeen(state, event.id);
  return done({ outcomes });
}

// --- Navigation -----------------------------------------------------------

export function goHub(state, hub) {
  if (hub === "penthouse" && !state.flags.penthouseUnlocked) return fail("locked");
  if (hub === "hq" && state.act === 2) return fail("act");
  state.hub = hub;
  return done();
}

