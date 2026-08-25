/**
 * Pure content builder.
 *
 * Deliberately free of import statements for the JSON itself: Vite wants bare
 * `import x from './x.json'` while Node wants an import attribute, and
 * tools/balance-sim.mjs needs to run outside the bundler. `content-data.js`
 * does the Vite-side importing; the tool reads the files with fs and calls
 * `buildContent` directly.
 */

function indexBy(list, key = "id") {
  return Object.fromEntries(list.map((row) => [row[key], row]));
}

export function buildContent(raw) {
  const conceptsList = raw.titles.flatMap((t) =>
    t.concepts.map((c) => ({ ...c, slot: t.slot, act: t.act }))
  );

  return {
    features: indexBy(raw.features),
    featuresList: raw.features,
    staff: indexBy(raw.staff),
    staffList: raw.staff,
    titleSlots: indexBy(raw.titles, "slot"),
    titleSlotsList: raw.titles,
    concepts: indexBy(conceptsList),
    conceptsList,
    events: indexBy(raw.events),
    eventsList: raw.events,
    chirps: raw.chirps,
    synergies: indexBy(raw.synergies),
    synergiesList: raw.synergies,
    upgrades: indexBy(raw.upgrades),
    upgradesList: raw.upgrades,
    deals: indexBy(raw.deals),
    dealsList: raw.deals,
    marketing: raw.marketing,
    channels: indexBy(raw.marketing.channels),
    channelsList: raw.marketing.channels,
    backlash: raw.marketing.backlash,
    ranks: raw.endings.ranks,
    endings: raw.endings.endings,
    achievements: indexBy(raw.achievements),
    achievementsList: raw.achievements,
    TOTAL_TITLES: raw.titles.length,
  };
}

// --- Feature helpers ------------------------------------------------------

/** Cards legal for this act, minus anything still locked behind meta-unlocks. */
export function catalogFor(content, act, unlocked = []) {
  return content.featuresList.filter((f) => {
    if (!f.acts.includes(act)) return false;
    if (f.unlock && !unlocked.includes(f.id)) return false;
    return true;
  });
}

export function axesOf(feature) {
  return {
    pc: feature.pc || 0,
    fun: feature.fun || 0,
    gore: feature.gore || 0,
    ordinary: feature.ordinary || 0,
  };
}

export function tagCount(content, cardIds, tag) {
  let n = 0;
  for (const id of cardIds) {
    if (content.features[id]?.tags?.includes(tag)) n++;
  }
  return n;
}

// --- Title / concept helpers ---------------------------------------------

export function conceptsForSlot(content, slot) {
  return content.titleSlots[slot]?.concepts ?? [];
}

export function actForSlot(content, slot) {
  return content.titleSlots[slot]?.act ?? 1;
}

export const TOTAL_TITLES = 8;
export const QUARTERS_PER_TITLE = 3;
export const CAMPAIGN_QUARTERS = TOTAL_TITLES * QUARTERS_PER_TITLE;
