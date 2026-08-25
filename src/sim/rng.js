// Seeded deterministic RNG. Same seed string => identical 24-quarter run.

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

export function pick(rng, list) {
  if (!list?.length) return null;
  return list[Math.floor(rng() * list.length)];
}

export function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function weightedPick(rng, list, weightOf = (x) => x.weight ?? 1) {
  const total = list.reduce((n, x) => n + Math.max(0, weightOf(x)), 0);
  if (total <= 0) return list[0] ?? null;
  let roll = rng() * total;
  for (const item of list) {
    roll -= Math.max(0, weightOf(item));
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

export function roll(rng, chance) {
  return rng() < chance;
}

export function intBetween(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// --- Human-readable seeds -------------------------------------------------

const SEED_ADJ = [
  "purple", "brave", "necessary", "problematic", "authentic", "grounded",
  "unflinching", "raw", "bold", "tender", "urgent", "vital", "messy",
  "lived", "radical", "quiet", "loud", "honest", "gritty", "soft",
];
const SEED_NOUN = [
  "diaper", "wire", "beanbag", "lanyard", "canape", "fern", "yogurt",
  "pronoun", "swatch", "slider", "ramen", "shotgun", "parking", "crt",
  "pizza", "gunfeel", "billboard", "embargo", "severance", "keynote",
];
const SEED_VERB = [
  "ships", "pivots", "aligns", "centers", "unpacks", "leans", "sunsets",
  "scales", "iterates", "workshops", "monetizes", "disrupts", "sunsets",
  "amplifies", "curates", "leverages", "circles", "onboards",
];

export function makeSeedPhrase(rng) {
  return [pick(rng, SEED_ADJ), pick(rng, SEED_NOUN), pick(rng, SEED_VERB)].join("-");
}

export function randomSeedPhrase() {
  const rng = mulberry32((Math.random() * 0xffffffff) >>> 0);
  return makeSeedPhrase(rng);
}

export function normalizeSeed(input) {
  const s = String(input ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  return s || randomSeedPhrase();
}

// A stream is a named, independent sequence derived from the run seed.
// Use one stream per system so adding a die roll in events never shifts
// the numbers the launch pipeline draws.
export function stream(state, name, ...salt) {
  return mulberry32(hashSeed(state.seed, name, ...salt));
}
