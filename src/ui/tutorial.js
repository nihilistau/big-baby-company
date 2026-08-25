import { escapeHtml } from "./render.js";
import { loadMeta, saveMeta } from "../sim/meta.js";

/**
 * First-run coach marks.
 *
 * Deliberately short: four cards, skippable at any point, shown once ever and
 * remembered in meta. The full explanation lives in the menu's "How it works"
 * tab and the in-game glossary — this exists only to get a new player through
 * their first pitch without bouncing.
 */
const STEPS = [
  {
    id: "loop",
    anchor: ".chrome-title",
    title: "Three quarters per title",
    body: "Pitch it, build it, launch it. Eight titles, six years. The dots under the title name show where you are.",
  },
  {
    id: "inversion",
    anchor: ".chrome-est",
    title: "These two numbers fight each other",
    body: "PC features push industry score up and copies down. FUN, GORE and ORDINARY do the reverse. Hover any card and watch both move before you commit.",
  },
  {
    id: "meters",
    anchor: ".chrome-meters",
    title: "Four things you have to keep paying for",
    body: "Standing buys investor money. Trust multiplies every copy you sell. Heat is free reach with a backlash attached. Morale is whether anyone is still here in a year.",
  },
  {
    id: "advance",
    anchor: ".end-quarter",
    title: "Nothing is on a timer",
    body: "The quarter ends when you say so. Read the cards, wander the rooms, then press this. It tells you what's blocking it.",
  },
];

export function shouldShow(state) {
  if (!state || state.screen !== "playing") return false;
  return !loadMeta().tutorialDone;
}

export function dismiss() {
  const meta = loadMeta();
  meta.tutorialDone = true;
  saveMeta(meta);
}

export function tutorialView(step) {
  const s = STEPS[step];
  if (!s) return "";
  return `
    <div class="coach" data-key="coach" data-anchor="${s.anchor}" role="dialog" aria-label="${escapeHtml(s.title)}">
      <div class="coach-card">
        <span class="coach-count">${step + 1} of ${STEPS.length}</span>
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.body)}</p>
        <div class="coach-actions">
          <button class="btn small ghost" data-act="tutorial-skip">Skip</button>
          <button class="btn small primary" data-act="tutorial-next">
            ${step === STEPS.length - 1 ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>`;
}

/**
 * Position the card next to its anchor and cut a hole in the scrim over it.
 * Done imperatively after render because it needs real measured geometry.
 */
export function placeCoach(root) {
  const coach = root.querySelector(".coach");
  if (!coach) return;
  const anchor = root.querySelector(coach.dataset.anchor);
  const card = coach.querySelector(".coach-card");
  if (!anchor || !card) return;

  const r = anchor.getBoundingClientRect();
  coach.style.setProperty("--hx", `${r.left - 8}px`);
  coach.style.setProperty("--hy", `${r.top - 8}px`);
  coach.style.setProperty("--hw", `${r.width + 16}px`);
  coach.style.setProperty("--hh", `${r.height + 16}px`);

  const below = r.bottom + 16;
  const width = card.offsetWidth || 320;
  card.style.top = `${Math.min(below, window.innerHeight - 200)}px`;
  card.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`;
}

export const STEP_COUNT = STEPS.length;
