import { escapeHtml } from "./render.js";
import { asset } from "./assets.js";
import { currentTitle } from "../sim/state.js";

/**
 * Hotspots are data, not markup, so the same table drives the clickable
 * regions, the dock buttons and the keyboard shortcuts.
 *
 * The regions themselves draw nothing over the artwork. Hovering pops a label
 * chip, which is all the confirmation you need that you are in bounds, and
 * holding Space (or pressing H) pops every label at once — the classic
 * adventure-game reveal.
 */
const SCENES = {
  hq: {
    art: "hq",
    hotspots: [
      { panel: "project", label: "The desk island", short: "Desk", x: 33, y: 56, w: 26, h: 43, key: "1" },
      { panel: "hr", label: "The beanbags", short: "People", x: 0, y: 43, w: 27, h: 24, key: "2" },
      { panel: "store", label: "The store page", short: "Store", x: 60, y: 62, w: 28, h: 36, key: "3" },
      { panel: "board", label: "Glass boardroom", short: "Board", x: 62, y: 12, w: 26, h: 48, key: "4" },
      { panel: "chirper", label: "Chirper", short: "Chirper", x: 12, y: 68, w: 20, h: 30, key: "5" },
      { panel: "studio", label: "Studio ops", short: "Studio", x: 34, y: 2, w: 23, h: 50, key: "6" },
      { hub: "penthouse", label: "Elevator", short: "Penthouse", x: 88, y: 20, w: 11, h: 46, key: "7", requires: "penthouse" },
    ],
  },
  penthouse: {
    art: "penthouse",
    hotspots: [
      { panel: "pool", label: "The pool", short: "Pool", x: 0, y: 50, w: 47, h: 49, key: "1" },
      { panel: "stream", label: "Livestream rig", short: "Stream", x: 62, y: 20, w: 31, h: 78, key: "2" },
      { panel: "chirper", label: "Chirper", short: "Chirper", x: 39, y: 42, w: 22, h: 31, key: "5" },
      { hub: "hq", label: "Back to HQ", short: "HQ", x: 62, y: 2, w: 18, h: 16, key: "0" },
    ],
  },
  garage: {
    art: "garage",
    hotspots: [
      { panel: "project", label: "Workbench", short: "Bench", x: 28, y: 47, w: 42, h: 24, key: "1" },
      { panel: "hr", label: "The other chair", short: "People", x: 63, y: 50, w: 18, h: 40, key: "2" },
      { panel: "store", label: "The CRT", short: "Store", x: 38, y: 26, w: 17, h: 23, key: "3" },
      { panel: "books", label: "Mini-fridge", short: "Books", x: 3, y: 41, w: 25, h: 40, key: "4" },
      { panel: "chirper", label: "Chirper", short: "Chirper", x: 55, y: 66, w: 14, h: 19, key: "5" },
      { panel: "studio", label: "Shelf of receipts", short: "Studio", x: 72, y: 10, w: 17, h: 36, key: "6" },
    ],
  },
  loft: {
    art: "loft",
    hotspots: [
      { panel: "project", label: "Design floor", short: "Floor", x: 0, y: 47, w: 29, h: 48, key: "1" },
      { panel: "hr", label: "The team", short: "People", x: 30, y: 44, w: 13, h: 28, key: "2" },
      { panel: "store", label: "The trophy shelf", short: "Store", x: 74, y: 11, w: 24, h: 41, key: "3" },
      { panel: "board", label: "The boardroom", short: "Board", x: 43, y: 30, w: 27, h: 40, key: "4" },
      { panel: "chirper", label: "Chirper", short: "Chirper", x: 42, y: 4, w: 30, h: 24, key: "5" },
      { panel: "studio", label: "The coffee bar", short: "Studio", x: 72, y: 54, w: 27, h: 32, key: "6" },
    ],
  },
};

export function sceneFor(state) {
  if (state.hub === "penthouse" && state.flags.penthouseUnlocked) return SCENES.penthouse;
  if (state.act === 2) return SCENES.garage;
  if (state.act === 3) return SCENES.loft;
  return SCENES.hq;
}

/** Art variant reacts to the state of the company, not just the act. */
export function hubArt(state, content) {
  const scene = sceneFor(state);
  if (scene.art !== "hq") return asset(`/assets/hubs/${scene.art}.jpg`);
  if (state.flags.crashed) return asset("/assets/hubs/hq-layoff.jpg");
  // A morale crisis outranks the purple takeover: it is the more urgent thing
  // for the room to be telling you about.
  if (state.morale <= 30) return asset("/assets/hubs/hq-crunch.jpg");
  const title = currentTitle(state);
  const pcish =
    (title?.cards || []).reduce((n, id) => n + (content.features[id]?.pc || 0), 0) +
    state.staff.length;
  if (pcish >= 6 || state.standing >= 70) return asset("/assets/hubs/hq-purple.jpg");
  return asset("/assets/hubs/hq-normal.jpg");
}

export function availableHotspots(state) {
  return sceneFor(state).hotspots.filter((h) => {
    if (h.requires === "penthouse" && !state.flags.penthouseUnlocked) return false;
    return true;
  });
}

function relevance(state, spot) {
  // The room the current phase's decisions actually live in. Every phase's
  // choices — concept, deal, cards, campaign — are all on the project board.
  return spot.panel === "project";
}

export function hubView(ctx) {
  const { state, content, ui } = ctx;
  const src = hubArt(state, content);
  const spots = availableHotspots(state);

  return `
    <div class="hub" data-key="hub">
      <div class="hub-backdrop" style="background-image:url('${src}')" aria-hidden="true"></div>
      <div class="hub-frame">
        <img class="hub-art" src="${src}" alt="" draggable="false"
             onload="this.dispatchEvent(new CustomEvent('hubart',{bubbles:true}))"
             onerror="this.closest('.hub-frame').classList.add('art-missing');this.remove()" />
        <div class="hub-fallback" aria-hidden="true">
          <span>${escapeHtml(sceneFor(state).art)}</span>
        </div>
        <div class="hub-vignette" aria-hidden="true"></div>
        <div class="hotspots ${ui.revealHotspots ? "reveal" : ""}">
          ${spots
            .map((spot, i) => {
              const id = spot.panel || `hub:${spot.hub}`;
              const visited = ui.visited.has(id);
              return `
              <button class="hotspot ${visited ? "visited" : ""} ${
                relevance(state, spot) ? "urgent" : ""
              }"
                      style="left:${spot.x}%;top:${spot.y}%;width:${spot.w}%;height:${spot.h}%;--i:${i}"
                      data-act="${spot.hub ? "go-hub" : "open-panel"}"
                      data-id="${spot.hub || spot.panel}"
                      aria-label="${escapeHtml(spot.label)}">
                <span class="hotspot-label"><kbd>${spot.key}</kbd>${escapeHtml(spot.label)}</span>
              </button>`;
            })
            .join("")}
        </div>
        <span class="hub-hint">Hold <kbd>Space</kbd> to show what's clickable</span>
      </div>
    </div>`;
}

/** Fallback if the scene image has not reported its natural size yet. */
const DEFAULT_ASPECT = 1.881;

/**
 * Fit the scene inside the stage, preserving its exact aspect ratio.
 *
 * Hotspot rectangles are percentages of this frame, so the frame has to be
 * precisely the rendered image box on every window shape. CSS cannot express
 * that dependably — `max-width` clamps without re-deriving height and
 * `max-height` clamps without re-deriving width — so one axis or the other
 * ends up squashed, and every clickable region moves with it.
 */
export function fitHubFrame(root) {
  const hub = root.querySelector(".hub");
  const frame = root.querySelector(".hub-frame");
  if (!hub || !frame) return;

  const img = frame.querySelector(".hub-art");
  const aspect =
    img?.naturalWidth && img?.naturalHeight
      ? img.naturalWidth / img.naturalHeight
      : DEFAULT_ASPECT;

  const { width, height } = hub.getBoundingClientRect();
  if (!width || !height) return;

  const w = Math.min(width, height * aspect);
  frame.style.width = `${Math.round(w)}px`;
  frame.style.height = `${Math.round(w / aspect)}px`;
}

/** Refit whenever the stage changes size, not just on re-render. */
export function watchHubFrame(root) {
  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", () => fitHubFrame(root));
    return;
  }
  const observer = new ResizeObserver(() => fitHubFrame(root));
  const attach = () => {
    const hub = root.querySelector(".hub");
    if (hub) observer.observe(hub);
  };
  attach();
  return attach;
}

export function dockView(ctx) {
  const { state, ui } = ctx;
  const spots = availableHotspots(state);
  return `
    <nav class="dock" data-key="dock" aria-label="Rooms">
      ${spots
        .map((spot) => {
          const id = spot.panel || spot.hub;
          const active = ui.panel === spot.panel;
          return `<button class="dock-btn ${active ? "active" : ""}"
                    data-act="${spot.hub ? "go-hub" : "open-panel"}" data-id="${id}">
                    <kbd>${spot.key}</kbd>${escapeHtml(spot.short || spot.label)}
                  </button>`;
        })
        .join("")}
      <span class="dock-spacer"></span>
      <button class="dock-btn" data-act="open-panel" data-id="books"><kbd>B</kbd>Books</button>
    </nav>`;
}

export { SCENES };
