import { escapeHtml } from "../render.js";
import { hashSeed, mulberry32 } from "../../sim/rng.js";
import { sfx } from "../../audio/kit.js";

/**
 * Chirper, as a live feed.
 *
 * The posts themselves are authored and come from the sim. Everything else
 * here is theatre: engagement counters that climb while you watch, arrival
 * animations for genuinely new posts, a typing indicator, and ambient replies
 * that drift in from the existing chirp pools.
 *
 * Ambient posts are deliberately UI-only — they are never written back into
 * the run, because a timer should not be able to change what a save contains.
 */

const REDUCED =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const AMBIENT_CAP = 5;
const AMBIENT_MIN_MS = 6500;
const AMBIENT_MAX_MS = 15000;

// Live counters, keyed by post id, so a re-render never rewinds a number.
const metrics = new Map();
const seen = new Set();
let ambient = [];
let ambientSeq = 0;
let ticker = null;
let nextAmbientAt = 0;
let lastTickSound = 0;
let hostRoot = null;
let getContext = null;

// --- Engagement model ------------------------------------------------------

/**
 * Reach is a function of who is posting, not how good the post is — which is
 * both the joke and, unfortunately, roughly accurate.
 */
const REACH = {
  press: { views: 90000, likes: 900, reposts: 260, replies: 400 },
  money: { views: 24000, likes: 180, reposts: 60, replies: 90 },
  player: { views: 46000, likes: 2600, reposts: 520, replies: 210 },
  hater: { views: 140000, likes: 5200, reposts: 1900, replies: 3100 },
  streamer: { views: 310000, likes: 14000, reposts: 2400, replies: 1600 },
  academic: { views: 12000, likes: 340, reposts: 120, replies: 260 },
  insider: { views: 220000, likes: 7400, reposts: 3100, replies: 1200 },
  leaker: { views: 260000, likes: 8100, reposts: 4200, replies: 900 },
  brand: { views: 400000, likes: 21000, reposts: 3300, replies: 2200 },
  self: { views: 58000, likes: 1400, reposts: 300, replies: 1800 },
  staff: { views: 9000, likes: 310, reposts: 40, replies: 70 },
};

function targetsFor(chirp) {
  const base = REACH[chirp.kind] || REACH.player;
  const rng = mulberry32(hashSeed("reach", chirp.id ?? 0, chirp.text.slice(0, 24)));
  const swing = 0.35 + rng() * 1.9;
  return {
    views: Math.round(base.views * swing),
    likes: Math.round(base.likes * swing),
    reposts: Math.round(base.reposts * swing),
    replies: Math.round(base.replies * swing),
  };
}

function stateFor(chirp) {
  const key = chirp.id ?? `x-${chirp.quarter}-${chirp.text.slice(0, 12)}`;
  let entry = metrics.get(key);
  if (!entry) {
    const targets = targetsFor(chirp);
    // Older posts start most of the way to their ceiling; a brand new post
    // starts near zero so you get to watch it take off.
    const age = seen.size === 0 ? 1 : 0;
    entry = {
      targets,
      views: Math.round(targets.views * (age ? 0.82 : 0.02)),
      likes: Math.round(targets.likes * (age ? 0.8 : 0.01)),
      reposts: Math.round(targets.reposts * (age ? 0.78 : 0)),
      replies: Math.round(targets.replies * (age ? 0.75 : 0)),
    };
    metrics.set(key, entry);
  }
  return { key, entry };
}

/**
 * Ease each counter toward its ceiling — fast at first, then a long tail — and
 * drift the ceiling itself upward forever. A feed whose numbers stop moving
 * stops reading as live, and real ones never do.
 */
const CEILING_DRIFT = 0.0016;

function stepMetrics() {
  let moved = false;
  for (const entry of metrics.values()) {
    for (const field of ["views", "likes", "reposts", "replies"]) {
      entry.targets[field] = Math.round(entry.targets[field] * (1 + CEILING_DRIFT));
      const gap = entry.targets[field] - entry[field];
      if (gap <= 0) continue;
      const step = Math.max(1, Math.round(gap * 0.035));
      entry[field] += step;
      moved = true;
    }
  }
  return moved;
}

// --- Ambient chatter -------------------------------------------------------

/** Which pools make sense to overhear right now. */
function ambientPools(state) {
  const pools = ["act2-players"];
  if (state.heat >= 45) pools.push("heat-high", "backlash");
  if (state.trust >= 65) pools.push("trust-high");
  if (state.trust <= 25) pools.push("trust-low");
  if (state.morale <= 32) pools.push("morale-low");
  if (state.morale >= 80) pools.push("morale-high");
  if (state.cash < 0) pools.push("debt");
  if (state.lastLaunch?.gore >= 4) pools.push("launch-gore-high");
  if (state.lastLaunch?.fun >= 5) pools.push("launch-fun-high");
  if (state.act === 1) pools.push("launch-pc-high");
  return pools;
}

function makeAmbient(state, content) {
  const pools = ambientPools(state).filter((p) => content.chirps.pools[p]?.length);
  if (!pools.length) return null;

  const rng = mulberry32(hashSeed("ambient", state.seed, ambientSeq++, state.quarter));
  const pool = content.chirps.pools[pools[Math.floor(rng() * pools.length)]];
  const post = pool[Math.floor(rng() * pool.length)];
  if (!post) return null;

  // Skip anything already on the real feed so the ambient layer never
  // duplicates an authored beat.
  if (state.chirps.some((c) => c.text === post.text)) return null;

  const account = content.chirps.accounts[post.who] || { name: post.who };
  return {
    id: `a${ambientSeq}`,
    who: account.name,
    handle: account.handle,
    kind: account.kind,
    text: post.text,
    quarter: state.quarter,
    ambient: true,
  };
}

// --- Rendering -------------------------------------------------------------

function compact(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function postView(chirp, isNew) {
  const { key, entry } = stateFor(chirp);
  return `
    <article class="chirp kind-${chirp.kind || "player"} ${isNew ? "is-new" : ""} ${
      chirp.ambient ? "is-ambient" : ""
    }" data-key="chirp-${key}" data-chirp="${key}">
      <div class="chirp-avatar" aria-hidden="true">${escapeHtml((chirp.who || "?")[0])}</div>
      <div class="chirp-main">
        <div class="chirp-head">
          <span class="chirp-who">${escapeHtml(chirp.who)}</span>
          ${chirp.handle ? `<span class="chirp-handle">${escapeHtml(chirp.handle)}</span>` : ""}
          <span class="chirp-q">Q${chirp.quarter}</span>
        </div>
        <p class="chirp-text">${escapeHtml(chirp.text)}</p>
        <div class="chirp-metrics">
          <span class="metric replies" title="Replies">
            <span class="metric-icon">↩</span><b data-metric="${key}:replies">${compact(entry.replies)}</b>
          </span>
          <span class="metric reposts" title="Reposts">
            <span class="metric-icon">⇄</span><b data-metric="${key}:reposts">${compact(entry.reposts)}</b>
          </span>
          <span class="metric likes" title="Likes">
            <span class="metric-icon">♥</span><b data-metric="${key}:likes">${compact(entry.likes)}</b>
          </span>
          <span class="metric views" title="Views">
            <span class="metric-icon">◔</span><b data-metric="${key}:views">${compact(entry.views)}</b>
          </span>
        </div>
      </div>
    </article>`;
}

export function chirperPanel(ctx) {
  const { state, content } = ctx;
  const real = state.chirps.slice(0, 40);
  const feed = [...ambient, ...real];
  const accounts = Object.keys(content.chirps.accounts).length;

  if (!feed.length) {
    return `
      <h2>Chirper</h2>
      <p class="lede">The timeline is empty. Hire someone, or ship something embarrassing.</p>`;
  }

  return `
    <h2>Chirper</h2>
    <div class="feed-bar">
      <span class="live-dot" aria-hidden="true"></span>
      <span class="live-label">Live</span>
      <span class="feed-count">watching ${accounts} accounts</span>
    </div>
    <div class="typing" data-key="typing"><span></span><span></span><span></span>
      <em class="typing-who">someone is drafting something</em>
    </div>
    <div class="feed" data-scroll="feed">
      ${feed.map((c) => postView(c, !seen.has(c.id))).join("")}
    </div>`;
}

// --- The ticker ------------------------------------------------------------

/**
 * Drives the counters imperatively so the numbers keep climbing without a
 * full re-render on every frame. The values live in `metrics`, so the next
 * real render reads exactly what is on screen.
 */
function paint() {
  if (!hostRoot) return;
  hostRoot.querySelectorAll("[data-metric]").forEach((el) => {
    const [key, field] = el.getAttribute("data-metric").split(":");
    const entry = metrics.get(key) || metrics.get(Number(key));
    if (!entry) return;
    const next = compact(entry[field]);
    if (el.textContent !== next) {
      el.textContent = next;
      el.classList.remove("bumped");
      // Restart the flash without waiting a frame for the class removal.
      void el.offsetWidth;
      el.classList.add("bumped");
    }
  });
}

function tick() {
  const ctx = getContext?.();
  if (!ctx || !hostRoot?.isConnected) return stopFeed();

  const moved = stepMetrics();
  paint();

  if (moved && !REDUCED) {
    const now = performance.now();
    if (now - lastTickSound > 1600) {
      lastTickSound = now;
      sfx.tick();
    }
  }

  // Ambient chatter drifts in on its own schedule.
  const now = performance.now();
  if (now >= nextAmbientAt) {
    const post = makeAmbient(ctx.state, ctx.content);
    nextAmbientAt = now + AMBIENT_MIN_MS + Math.random() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS);
    if (post) {
      ambient = [post, ...ambient].slice(0, AMBIENT_CAP);
      sfx.chirp();
      ctx.rerender?.();
    }
  }
}

export function startFeed(root, contextFn) {
  hostRoot = root;
  getContext = contextFn;
  stopTicker();
  nextAmbientAt = performance.now() + AMBIENT_MIN_MS;
  ticker = setInterval(tick, 260);
  paint();
}

export function stopFeed() {
  stopTicker();
  hostRoot = null;
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

/** Mark everything currently on the feed as seen, so arrivals animate once. */
export function markFeedSeen(state) {
  for (const c of state.chirps) seen.add(c.id);
  for (const c of ambient) seen.add(c.id);
}

export function resetFeed() {
  metrics.clear();
  seen.clear();
  ambient = [];
  ambientSeq = 0;
}
