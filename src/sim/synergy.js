import { tagCount } from "./content.js";

const EMPTY = {
  scoreAdd: 0,
  copiesMul: 1,
  moneyMul: 1,
  goreMul: 1,
  funMul: 1,
  pcMul: 1,
  jank: 0,
  hype: 0,
  heat: 0,
  trust: 0,
  standing: 0,
};

function matches(rule, cardIds, content) {
  if (rule.requires?.length) {
    return rule.requires.every((id) => cardIds.includes(id));
  }
  if (rule.requiresTags) {
    return Object.entries(rule.requiresTags).every(
      ([tag, n]) => tagCount(content, cardIds, tag) >= n
    );
  }
  return false;
}

/**
 * Which synergy/conflict rules a given set of cards fires.
 * Pure: takes ids, returns rules. Used by the launch pipeline and by the
 * Playtest Lab upgrade to preview the box before you ship it.
 */
export function detect(content, cardIds) {
  const fired = [];
  for (const rule of content.synergiesList) {
    if (matches(rule, cardIds, content)) fired.push(rule);
  }
  return fired;
}

/** Collapse a list of fired rules into one modifier bundle. */
export function combine(rules) {
  const out = { ...EMPTY };
  for (const rule of rules) {
    const e = rule.effects || {};
    out.scoreAdd += e.scoreAdd || 0;
    out.copiesMul *= e.copiesMul ?? 1;
    out.moneyMul *= e.moneyMul ?? 1;
    out.goreMul *= e.goreMul ?? 1;
    out.funMul *= e.funMul ?? 1;
    out.pcMul *= e.pcMul ?? 1;
    out.jank += e.jank || 0;
    out.hype += e.hype || 0;
    out.heat += e.heat || 0;
    out.trust += e.trust || 0;
    out.standing += e.standing || 0;
  }
  return out;
}

export function split(rules) {
  return {
    synergies: rules.filter((r) => r.kind === "synergy"),
    conflicts: rules.filter((r) => r.kind === "conflict"),
  };
}

