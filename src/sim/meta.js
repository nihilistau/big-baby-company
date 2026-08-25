const META_KEY = "bbc-meta";
const META_VERSION = 1;

function emptyMeta() {
  return {
    version: META_VERSION,
    achievements: [],
    unlockedCards: [],
    endingsSeen: [],
    runsCompleted: 0,
    titlesShippedTotal: 0,
    bestCash: 0,
    endlessUnlocked: false,
    endlessBest: 0,
    seedsPlayed: [],
  };
}

let memoryMeta = null; // node / test fallback

export function loadMeta() {
  if (typeof localStorage === "undefined") return memoryMeta || (memoryMeta = emptyMeta());
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return emptyMeta();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== META_VERSION) return { ...emptyMeta(), ...parsed, version: META_VERSION };
    return { ...emptyMeta(), ...parsed };
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(meta) {
  if (typeof localStorage === "undefined") {
    memoryMeta = meta;
    return;
  }
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage full or blocked; meta is a nice-to-have, never load-bearing */
  }
}

export function resetMeta() {
  memoryMeta = emptyMeta();
  if (typeof localStorage !== "undefined") localStorage.removeItem(META_KEY);
}

// --- Achievements ---------------------------------------------------------

function grant(state, meta, id) {
  if (meta.achievements.includes(id)) return false;
  meta.achievements.push(id);
  state.newAchievements = [...(state.newAchievements || []), id];
  return true;
}

/**
 * Evaluated after every tick. Cheap predicate sweep — no allocation-heavy work,
 * because this runs 10,000 times per balance-sim pass too.
 */
export function checkAchievements(state, content) {
  const meta = loadMeta();
  let dirty = false;
  const g = (id, cond) => {
    if (cond && grant(state, meta, id)) dirty = true;
  };

  const s = state.stats;
  const last = state.lastLaunch;

  g("first-ship", s.titlesShipped >= 1);
  g("chapter11", state.flags.chapter11 > 0);
  g("liquidated", state.screen === "gameover");
  g("penthouse", state.flags.penthouseUnlocked);
  g("dunk", (s.dunks || 0) > 0);
  g("crunch-ten", s.crunches >= 10);
  g("morale-100", state.morale >= 100);
  g("morale-zero", state.morale <= 0);
  g("heat-100", state.heat >= 100);
  g("trust-100", state.trust >= 100);
  g("standing-100", state.standing >= 100);
  g("backlash-survived", s.backlashes >= 1);
  g("someone-quit", (s.quits || 0) >= 1);
  g("own-ip", state.studio.upgrades.includes("own-your-ip"));
  g("all-upgrades", state.studio.upgrades.length >= 10);
  g("took-exit", state.flags.acquisitionTaken);
  g("refused-exit", state.flags.acquisitionRefused);

  const injectors = state.staff.filter((x) =>
    content.staff[x.id]?.traits.includes("injector")
  ).length;
  const talent = state.staff.filter((x) =>
    content.staff[x.id]?.traits.includes("talent")
  ).length;
  g("full-choir", injectors >= 4);
  g("full-talent", talent >= 4);

  if (last) {
    g("pure-pc", last.rawPc >= 10);
    g("pure-fun", last.rawFun >= 10);
    g("pure-gore", last.rawGore >= 10);
    g("pure-ordinary", last.rawOrdinary >= 8);
    g("hundred-score", last.score >= 100);
    g("zero-score", last.score <= 0);
    g("million-copies", last.copies >= 1000000);
    g("zero-copies", last.copies < 100 && last.copies >= 0 && s.titlesShipped > 0);
    g("synergy-3", last.synergies.length >= 3);
    g("synergy-5", last.synergies.length >= 5);
    g("conflict-3", last.conflicts.length >= 3);
    for (const rule of last.synergies) {
      g(rule.id, content.achievements[rule.id] != null);
    }
    if (last.backlash?.id === "streisand") g("streisand", true);
  }

  const franchises = {};
  for (const t of state.titles) {
    if (t.result && t.franchise) franchises[t.franchise] = (franchises[t.franchise] || 0) + 1;
  }
  g("franchise-3", Object.values(franchises).some((n) => n >= 3));

  if (state.screen === "ending" || state.screen === "gameover") {
    dirty = recordRunEnd(state, meta) || dirty;
  }

  dirty = checkCardUnlocks(state, content, meta) || dirty;
  if (dirty) saveMeta(meta);
  return meta;
}

function recordRunEnd(state, meta) {
  let dirty = false;
  if (state.screen === "ending") {
    meta.runsCompleted++;
    dirty = true;
    if (!meta.endlessUnlocked) {
      meta.endlessUnlocked = true;
      grant(state, meta, "endless-unlocked");
    }
    if (state.mode === "endless") {
      meta.endlessBest = Math.max(meta.endlessBest, state.quarter);
    }
    grant(state, meta, "first-run");
  }
  if (state.ending && !meta.endingsSeen.includes(state.ending.id)) {
    meta.endingsSeen.push(state.ending.id);
    dirty = true;
  }
  if (state.cash > meta.bestCash) {
    meta.bestCash = state.cash;
    dirty = true;
  }
  if (state.cash >= 1800000) grant(state, meta, "king-baby");
  if (state.cash >= 6000000) grant(state, meta, "dynasty");
  if (state.cash < 0) grant(state, meta, "wendys");
  if (state.stats.crunches === 0) grant(state, meta, "never-crunched");
  if (state.stats.hires === 0) grant(state, meta, "never-hired");

  meta.titlesShippedTotal += state.stats.titlesShipped;
  return true;
}

// --- Card unlocks ---------------------------------------------------------

function checkCardUnlocks(state, content, meta) {
  let dirty = false;
  const unlock = (id) => {
    if (meta.unlockedCards.includes(id)) return;
    meta.unlockedCards.push(id);
    state.newUnlocks = [...(state.newUnlocks || []), id];
    dirty = true;
  };

  for (const f of content.featuresList) {
    if (!f.unlock || meta.unlockedCards.includes(f.id)) continue;
    const u = f.unlock;
    if (u.type === "titles-shipped" && meta.titlesShippedTotal + state.stats.titlesShipped >= u.value)
      unlock(f.id);
    if (u.type === "shipped-gore" && (state.lastLaunch?.rawGore || 0) >= u.value) unlock(f.id);
    if (u.type === "high-jank" && (state.lastLaunch?.jank || 0) >= u.value) unlock(f.id);
    if (u.type === "went-broke" && state.cash < 0) unlock(f.id);
  }
  // Cards unlocked mid-run by events go into meta too.
  for (const id of state.unlockedCards || []) unlock(id);
  return dirty;
}

/** Everything the player may draft right now: base cards plus earned ones. */
export function unlockedCardIds(meta, state = null) {
  return [...(meta?.unlockedCards || []), ...(state?.unlockedCards || [])];
}

