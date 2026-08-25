export function rankFor(cash, content) {
  for (const r of content.ranks) {
    const minOk = r.minCash == null || cash >= r.minCash;
    const maxOk = r.maxCash == null || cash <= r.maxCash;
    if (minOk && maxOk) return r;
  }
  return content.ranks[content.ranks.length - 1];
}

function meets(state, req) {
  if (!req) return true;
  if (req.minCash != null && state.cash < req.minCash) return false;
  if (req.maxCash != null && state.cash > req.maxCash) return false;
  if (req.minTrust != null && state.trust < req.minTrust) return false;
  if (req.maxTrust != null && state.trust > req.maxTrust) return false;
  if (req.minStanding != null && state.standing < req.minStanding) return false;
  if (req.maxStanding != null && state.standing > req.maxStanding) return false;
  if (req.minHeat != null && state.heat < req.minHeat) return false;
  if (req.maxMorale != null && state.morale > req.maxMorale) return false;
  if (req.minMorale != null && state.morale < req.minMorale) return false;
  if (req.liveService != null && !!state.flags.liveService !== req.liveService) return false;
  if (req.acquisitionTaken != null && !!state.flags.acquisitionTaken !== req.acquisitionTaken)
    return false;
  return true;
}

/**
 * Highest-priority ending whose conditions the run actually satisfies.
 * `default` sits at priority 0 with empty requirements so there is always one.
 */
export function endingFor(state, content) {
  const candidates = content.endings
    .filter((e) => meets(state, e.requires))
    .sort((a, b) => b.priority - a.priority);
  return candidates[0] || content.endings[content.endings.length - 1];
}

