import { projectLaunch, devPoints, pointsSpent } from "../sim/economy.js";
import { currentTitle } from "../sim/state.js";

/**
 * "What would this card do?"
 *
 * Runs the real launch projection against a hypothetical box so the HUD can
 * ghost the exact consequence of a card before it is committed. This is the
 * single most important teaching surface in the game: the central joke (PC
 * buys industry score and destroys copies) is invisible unless you can see the
 * two numbers move in opposite directions as you hover.
 */
export function projectWithCard(state, content, featureId) {
  const title = currentTitle(state);
  if (!title) return null;
  if (title.cards.includes(featureId)) return null;
  const hypothetical = {
    ...structuredClone(title),
    cards: [...title.cards, featureId],
  };
  return projectLaunch(state, content, { title: hypothetical });
}

export function projectWithoutCard(state, content, featureId) {
  const title = currentTitle(state);
  if (!title) return null;
  const hypothetical = {
    ...structuredClone(title),
    cards: title.cards.filter((id) => id !== featureId),
  };
  return projectLaunch(state, content, { title: hypothetical });
}

/** Difference between the live projection and a hypothetical one. */
export function deltaFor(base, next) {
  if (!base || !next) return null;
  return {
    score: next.score - base.score,
    copies: next.copies - base.copies,
    revenue: next.revenue - base.revenue,
    wire: next.wirePaid - base.wirePaid,
    jank: next.jank - base.jank,
    hype: next.hype - base.hype,
    newSynergies: next.synergies.filter(
      (s) => !base.synergies.some((b) => b.id === s.id)
    ),
    newConflicts: next.conflicts.filter(
      (c) => !base.conflicts.some((b) => b.id === c.id)
    ),
    lostSynergies: base.synergies.filter(
      (s) => !next.synergies.some((b) => b.id === s.id)
    ),
  };
}

export function pointsInfo(state, content) {
  const total = devPoints(state, content);
  const spent = pointsSpent(state, content);
  return { total, spent, left: total - spent };
}
