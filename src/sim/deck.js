import { currentTitle } from "./state.js";
import { sums, titleHype, titleJank } from "./economy.js";
import { stream, weightedPick } from "./rng.js";

/**
 * Predicate vocabulary for `requires` on an event. Everything is optional;
 * an event with no `requires` is always eligible for its act/phase.
 */
function eligible(event, state, content) {
  if (!event.acts.includes(state.act)) return false;
  if (!event.phases.includes(state.phase)) return false;

  const r = event.requires;
  if (!r) return true;

  const title = currentTitle(state);
  const axes = title ? sums(state, content, title) : { pc: 0, gore: 0 };

  if (r.minStanding != null && state.standing < r.minStanding) return false;
  if (r.maxStanding != null && state.standing > r.maxStanding) return false;
  if (r.minTrust != null && state.trust < r.minTrust) return false;
  if (r.maxTrust != null && state.trust > r.maxTrust) return false;
  if (r.minHeat != null && state.heat < r.minHeat) return false;
  if (r.maxHeat != null && state.heat > r.maxHeat) return false;
  if (r.minMorale != null && state.morale < r.minMorale) return false;
  if (r.maxMorale != null && state.morale > r.maxMorale) return false;
  if (r.minCash != null && state.cash < r.minCash) return false;
  if (r.maxCash != null && state.cash > r.maxCash) return false;

  if (r.hasStaff && state.staff.length === 0) return false;
  if (r.liveService && !state.flags.liveService) return false;
  if (r.dealType && title?.deal?.type !== r.dealType) return false;

  if (r.minTitlesShipped != null && state.stats.titlesShipped < r.minTitlesShipped)
    return false;
  if (r.minCrunch != null && (title?.crunchCount || 0) < r.minCrunch) return false;
  if (r.minPc != null && axes.pc < r.minPc) return false;
  if (r.minGore != null && axes.gore < r.minGore) return false;

  if (r.minJank != null && titleJank(state, content) < r.minJank) return false;
  if (r.minHype != null && titleHype(state, content) < r.minHype) return false;

  if (r.minMonetization != null) {
    const n = (title?.cards || []).filter((id) =>
      content.features[id]?.tags?.includes("monetization")
    ).length;
    if (n < r.minMonetization) return false;
  }
  return true;
}

/**
 * Pick the event for the current quarter.
 *
 * Scripted beats always win — the act openings and the two reversals have to
 * land in the same place every run so the story reads. Everything else is
 * drawn by weight from whatever is eligible and not yet seen this run.
 */
export function drawEvent(state, content) {
  // Scripted beats belong to the campaign spine. In Endless the quarter
  // counter keeps climbing past them, but Values Pass and friends have no
  // place in a run with no acts to punctuate.
  const scripted =
    state.mode === "endless"
      ? null
      : content.eventsList.find((e) => e.scripted?.quarter === state.quarter);
  if (scripted && !state.deck.seen.includes(scripted.id)) return scripted;

  const pool = content.eventsList.filter(
    (e) =>
      !e.scripted &&
      !state.deck.seen.includes(e.id) &&
      eligible(e, state, content)
  );

  if (!pool.length) {
    // Deck exhausted for this situation: allow repeats rather than stalling.
    const fallback = content.eventsList.filter(
      (e) => !e.scripted && eligible(e, state, content)
    );
    if (!fallback.length) return null;
    return weightedPick(stream(state, "deck", state.quarter), fallback);
  }

  return weightedPick(stream(state, "deck", state.quarter), pool);
}

export function markSeen(state, eventId) {
  if (!state.deck.seen.includes(eventId)) state.deck.seen.push(eventId);
}


export { eligible };
