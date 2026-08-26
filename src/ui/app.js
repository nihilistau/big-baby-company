import { loadContent } from "../sim/content-data.js";
import { createState, currentTitle } from "../sim/state.js";
import { projectLaunch } from "../sim/economy.js";
import * as Actions from "../sim/actions.js";
import * as Q from "../sim/quarter.js";
import { clearSave, loadState, saveState } from "../sim/save.js";
import { loadMeta, resetMeta, unlockedCardIds } from "../sim/meta.js";
import { normalizeSeed, randomSeedPhrase } from "../sim/rng.js";

import { delegate, escapeHtml, rememberScroll, render, restoreScroll } from "./render.js";
import { chromeView } from "./chrome.js";
import { availableHotspots, dockView, fitHubFrame, hubView, watchHubFrame } from "./hub.js";
import { menuView, helpPanel } from "./menu.js";
import { projectPanel } from "./panels/project.js";
import {
  boardPanel,
  booksPanel,
  hrPanel,
  poolPanel,
  storePanel,
  streamPanel,
  studioPanel,
} from "./panels/rooms.js";
import {
  chirperPanel,
  markFeedSeen,
  resetFeed,
  startFeed,
  stopFeed,
} from "./panels/chirper.js";
import { actCard, eventModal, stageModal } from "./sequences.js";
import { deltaFor, projectWithCard, projectWithoutCard } from "./preview.js";
import { initAudio, isMuted, setMusicBed, sfx, stopMusic, toggleMute } from "../audio/kit.js";
import { burst, flash, floatText, rollNumber } from "./fx.js";
import {
  STEP_COUNT,
  dismiss as dismissTutorial,
  inversionPrompt,
  noteGhost,
  placeCoach,
  shouldPromptInversion,
  shouldShow,
  tutorialView,
} from "./tutorial.js";

const content = loadContent();
const ACT_CARD_MS = 6200;
let meterTimer = null;
let feedRunning = false;
let reattachHubWatcher = null;
const root = document.getElementById("app");

let state = null;
let ui = {
  screen: "menu",
  panel: null,
  menuTab: "start",
  cardFilter: "all",
  difficulty: "standard",
  mode: "campaign",
  seed: "",
  visited: new Set(),
  hoverCard: null,
  report: null,
  actCard: null,
  showEvent: true,
  dragging: null,
  tutorialStep: 0,
  tutorialOn: false,
  revealHotspots: false,
  meterDeltas: null,
};

const PANELS = {
  project: projectPanel,
  hr: hrPanel,
  store: storePanel,
  board: boardPanel,
  chirper: chirperPanel,
  studio: studioPanel,
  books: booksPanel,
  pool: poolPanel,
  stream: streamPanel,
  help: helpPanel,
};

const PANEL_TITLES = {
  project: "Project",
  hr: "People",
  store: "Store page",
  board: "Boardroom",
  chirper: "Chirper",
  studio: "Studio ops",
  books: "Books",
  pool: "Pool",
  stream: "Livestream",
  help: "Glossary",
};

// --- Lifecycle ------------------------------------------------------------

/**
 * True on devices with no hover — phones and tablets.
 *
 * Read live rather than cached, because a laptop with a touchscreen can
 * legitimately change its mind, and because `matchMedia` is not present in
 * the jsdom the UI tests run under.
 */
function coarsePointer() {
  return typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
}

function persist() {
  if (state) saveState(state);
}

function ctx() {
  const projection = state ? projectLaunch(state, content) : null;
  let ghost = null;
  if (state && ui.hoverCard && projection) {
    const title = currentTitle(state);
    const has = title?.cards.includes(ui.hoverCard);
    const other = has
      ? projectWithoutCard(state, content, ui.hoverCard)
      : projectWithCard(state, content, ui.hoverCard);
    ghost = deltaFor(projection, other);
    // The hover ghost is the tutorial; note it the first time it actually
    // shows the two numbers moving apart, so the prompt can stand down.
    noteGhost(ghost);
  }
  return {
    state,
    content,
    ui,
    projection,
    ghost,
    muted: isMuted(),
    report: ui.report,
    meterDeltas: ui.meterDeltas,
  };
}

function startNew() {
  const meta = loadMeta();
  state = createState({
    seed: ui.seed ? normalizeSeed(ui.seed) : randomSeedPhrase(),
    difficulty: ui.difficulty,
    mode: ui.mode,
  });
  state.unlockedCards = unlockedCardIds(meta);
  Q.beginRun(state, content);
  ui.screen = "game";
  ui.panel = "project";
  ui.showEvent = true;
  ui.visited = new Set();
  ui.report = null;
  ui.tutorialStep = 0;
  ui.tutorialOn = shouldShow(state);
  resetFeed();
  clearSave();
  persist();
  setMusicBed(state.act);
  draw();
}

/**
 * Rebuild the launch report from saved state, for a run resumed while it was
 * still on screen. `ui.report` is UI-only and does not survive a save, so the
 * sim flags `reportPending` at launch and clears it on dismiss.
 *
 * The backlash entry is not replayed here — the roll already happened and its
 * effects are in the state. Its banner is the one thing lost to a reload.
 */
function reportFromState(s) {
  if (!s?.reportPending || !s.lastLaunch) return null;
  return { result: s.lastLaunch, backlash: null, outcomes: [] };
}

function continueGame() {
  const result = loadState();
  if (!result.ok) {
    toast(
      result.reason === "outdated"
        ? "That save is from an older version of the game and can't be carried forward."
        : "That save couldn't be read."
    );
    clearSave();
    draw();
    return;
  }
  state = result.state;
  ui.screen = "game";
  ui.panel = null;
  ui.showEvent = state.eventChoice == null;
  // Rebuild the launch report if the save was taken while it was open.
  ui.report = reportFromState(state);
  resetFeed();
  setMusicBed(state.act);
  draw();
}

function toMenu() {
  stopFeed();
  feedRunning = false;
  state = null;
  ui.screen = "menu";
  ui.panel = null;
  ui.report = null;
  stopMusic();
  draw();
}

// --- Rendering ------------------------------------------------------------

function gameView(c) {
  const showEvent = c.state.screen === "playing" && c.state.pendingEvent && ui.showEvent;
  const panelId = ui.panel;
  const panelFn = panelId ? PANELS[panelId] : null;

  return `
    <div class="game act-${c.state.act}" data-key="game">
      ${chromeView(c)}
      <main class="stage">
        ${hubView(c)}
        ${
          panelFn
            ? `<aside class="panel-wrap" data-key="panel-${panelId}">
                 <section class="panel" data-scroll="panel-${panelId}" role="dialog"
                          aria-label="${escapeHtml(PANEL_TITLES[panelId] || panelId)}">
                   <button class="panel-close" data-act="close-panel" aria-label="Close">×</button>
                   ${panelFn(c)}
                 </section>
               </aside>`
            : ""
        }
        ${showEvent ? eventModal(c) : ""}
        ${stageModal(c, ui)}
        ${ui.actCard ? actCard(ui.actCard) : ""}
        ${ui.tutorialOn ? tutorialView(ui.tutorialStep) : ""}
        ${!ui.tutorialOn && shouldPromptInversion(c.state) ? inversionPrompt() : ""}
        <div class="fx-layer" data-key="fx" data-static></div>
        <div class="toast-layer" data-key="toasts" data-static></div>
      </main>
      ${c.state.screen === "playing" ? dockView(c) : ""}
      ${
        c.state.screen === "playing" && c.state.pendingEvent && !ui.showEvent && c.state.eventChoice == null
          ? `<button class="event-tab" data-act="reopen-event">Unresolved: ${escapeHtml(
              content.events[c.state.pendingEvent]?.title || "event"
            )}</button>`
          : ""
      }
    </div>`;
}

export function draw() {
  const c = ctx();
  rememberScroll(root);
  render(root, ui.screen === "menu" ? menuView(c) : gameView(c));
  restoreScroll(root);
  document.body.className = state ? `act-${state.act}` : "menu-body";

  fitHubFrame(root);
  reattachHubWatcher?.();
  // The inversion nag is a coach card too, and also needs positioning.
  placeCoach(root);
  animateReport();
  syncFeed();
}

/**
 * The Chirper feed runs its own ticker while its panel is open — counters
 * climbing and ambient chatter arriving — and stops the moment it closes.
 */
function syncFeed() {
  const open = ui.panel === "chirper" && ui.screen === "game";
  if (open && !feedRunning) {
    feedRunning = true;
    startFeed(root, () => ({ state, content, rerender: draw }));
  } else if (!open && feedRunning) {
    feedRunning = false;
    stopFeed();
  }
  if (open && state) markFeedSeen(state);
}

/**
 * Roll the launch figures up rather than snapping them in. Purely cosmetic and
 * outside the sim, so a skipped or reduced-motion render just shows the final
 * number immediately.
 */
let rolledFor = null;
function animateReport() {
  if (!ui.report) {
    rolledFor = null;
    return;
  }
  const key = `${state.titleIndex}-${ui.report.result.copies}`;
  if (rolledFor === key) return;
  rolledFor = key;
  root.querySelectorAll("[data-roll]").forEach((el, i) => {
    rollNumber(el, Number(el.getAttribute("data-roll")), 700 + i * 220);
  });
}

// --- Toasts ---------------------------------------------------------------

function toast(text, kind = "info") {
  const layer = root.querySelector(".toast-layer");
  if (!layer) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  layer.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3800);
}

// --- Advancing ------------------------------------------------------------

const METER_KEYS = ["standing", "trust", "heat", "morale"];

function advance() {
  const before = state.act;
  const meterBefore = Object.fromEntries(METER_KEYS.map((k) => [k, state[k]]));
  const result = Q.advance(state, content);
  if (!result.ok) {
    sfx.deny();
    return;
  }
  state = result.state;

  // Surface what the quarter did to the four meters; they otherwise move in
  // silence and the player never learns what drives them.
  const deltas = {};
  for (const k of METER_KEYS) {
    const d = state[k] - meterBefore[k];
    if (d) deltas[k] = d;
  }
  ui.meterDeltas = Object.keys(deltas).length ? deltas : null;
  if (ui.meterDeltas) {
    clearTimeout(meterTimer);
    meterTimer = setTimeout(() => {
      ui.meterDeltas = null;
      draw();
    }, 4200);
  }

  const launch = result.events.find((e) => e.type === "launch");
  const backlash = result.events.find((e) => e.type === "backlash");
  const crash = result.events.find((e) => e.type === "crash");
  const chapter11 = result.events.find((e) => e.type === "chapter11");

  if (crash) state.crashSeverance = crash.severance;

  if (launch) {
    ui.report = {
      result: launch.result,
      backlash: backlash ? { entry: backlash.entry, absorbed: backlash.absorbed } : null,
      outcomes: backlash?.outcomes || [],
    };
    sfx.cash();
    if (launch.result.synergies.length) setTimeout(() => sfx.synergy(), 380);
    if (launch.result.conflicts.length) setTimeout(() => sfx.conflict(), 620);
    if (backlash && !backlash.absorbed) setTimeout(() => sfx.backlash(), 820);
  }

  if (chapter11) toast("Chapter 11. The debt is gone and so is everything else.", "bad");
  for (const e of result.events) {
    if (e.type === "quit") toast(`${e.name} handed in their notice.`, "bad");
    if (e.type === "sabotage") toast("Somebody put something back into the build.", "bad");
    if (e.type === "leak") toast("The build leaked.", "bad");
    if (e.type === "penthouse") toast("The elevator works now.", "good");
    if (e.type === "marketing-risk") toast(e.risk.name, "bad");
  }
  for (const id of state.newAchievements || []) {
    const a = content.achievements[id];
    if (a) toast(`${a.icon}  ${a.name}`, "good");
  }
  state.newAchievements = [];
  for (const id of state.newUnlocks || []) {
    const f = content.features[id];
    if (f) toast(`Unlocked: ${f.name}`, "good");
  }
  state.newUnlocks = [];

  if (state.act !== before) {
    ui.actCard = state.act;
    setMusicBed(state.act);
    setTimeout(() => {
      ui.actCard = null;
      draw();
    }, ACT_CARD_MS);
  }

  ui.showEvent = state.eventChoice == null;
  ui.panel = state.screen === "playing" && !ui.report ? ui.panel : null;
  ui.hoverCard = null;
  persist();
  draw();
}

// --- Handlers -------------------------------------------------------------

function guard(result, okSound = sfx.click) {
  if (!result?.ok) {
    sfx.deny();
    return false;
  }
  okSound();
  return true;
}

const handlers = {
  // menu
  "menu-tab": (el) => {
    ui.menuTab = el.dataset.id;
    sfx.soft();
    draw();
  },
  "set-difficulty": (el) => {
    ui.difficulty = el.dataset.id;
    sfx.click();
    draw();
  },
  "set-mode": (el) => {
    if (el.getAttribute("aria-disabled") === "true") return sfx.deny();
    ui.mode = el.dataset.id;
    sfx.click();
    draw();
  },
  "reroll-seed": () => {
    ui.seed = randomSeedPhrase();
    sfx.click();
    draw();
  },
  "new-game": () => {
    sfx.fanfare();
    startNew();
  },
  continue: () => {
    sfx.click();
    continueGame();
  },
  "reset-meta": () => {
    resetMeta();
    toast("Progress reset.");
    draw();
  },
  "to-menu": () => {
    clearSave();
    toMenu();
  },
  "share-run": () => {
    const summary = [
      `BBC — ${state.rank?.name}`,
      `${state.stats.titlesShipped} titles · ${state.cash >= 0 ? "$" : "-$"}${Math.abs(state.cash).toLocaleString()}`,
      `seed ${state.seed} · ${state.difficulty}`,
    ].join("\n");
    navigator.clipboard?.writeText(summary);
    toast("Run summary copied.", "good");
  },

  // navigation
  "open-panel": (el) => {
    const id = el.dataset.id;
    ui.panel = ui.panel === id ? null : id;
    ui.visited.add(id);
    (ui.panel ? sfx.open : sfx.close)();
    draw();
  },
  "close-panel": () => {
    ui.panel = null;
    sfx.close();
    draw();
  },
  "go-hub": (el) => {
    if (!guard(Actions.goHub(state, el.dataset.id))) return;
    ui.visited.add(`hub:${el.dataset.id}`);
    ui.panel = null;
    persist();
    draw();
  },
  "open-help": () => {
    ui.panel = ui.panel === "help" ? null : "help";
    sfx.open();
    draw();
  },
  "open-menu": () => {
    if (confirm("Return to the title screen? Your run is saved.")) toMenu();
  },
  "toggle-audio": () => {
    toggleMute();
    draw();
  },

  // pitch
  "choose-concept": (el) => {
    if (!guard(Actions.chooseConcept(state, el.dataset.id, content))) return;
    persist();
    draw();
  },
  "choose-deal": (el) => {
    const result = Actions.chooseDeal(state, el.dataset.id, content);
    if (!guard(result, sfx.cash)) return;
    persist();
    draw();
  },

  // production
  "place-card": (el, ev) => {
    const id = el.dataset.id;
    // On touch there is no hover, and the hover ghost is the entire
    // tutorial — a phone player could otherwise commit to a card without
    // ever seeing what it does. First tap previews, second tap commits.
    if (coarsePointer() && ui.hoverCard !== id) {
      ui.hoverCard = id;
      sfx.soft();
      return draw();
    }
    const result = Actions.placeCard(state, id, content);
    if (!result.ok) {
      sfx.deny();
      const why = {
        points: "Not enough dev points. Crunch, or cut something.",
        slots: "The box is full.",
        catalog: "Not available in this act.",
      }[result.reason];
      if (why) toast(why, "bad");
      return;
    }
    sfx.place();
    burst(root, ev);
    persist();
    draw();
  },
  "remove-card": (el, ev) => {
    ev.stopPropagation();
    if (!guard(Actions.removeCard(state, el.dataset.id), sfx.remove)) return;
    persist();
    draw();
  },
  crunch: (el, ev) => {
    const result = Actions.crunch(state, content);
    if (!guard(result, sfx.thud)) return;
    floatText(root, ev, `−$${result.cost.toLocaleString()}`, "bad");
    flash(root, "crunch");
    persist();
    draw();
  },
  polish: () => {
    if (!guard(Actions.polish(state, content), sfx.soft)) return;
    persist();
    draw();
  },
  "filter-cards": (el) => {
    ui.cardFilter = el.dataset.id;
    sfx.soft();
    draw();
  },

  // people
  hire: (el) => {
    if (!guard(Actions.hire(state, el.dataset.id, content))) return;
    persist();
    draw();
  },
  fire: (el) => {
    if (!guard(Actions.fire(state, el.dataset.id, content), sfx.remove)) return;
    persist();
    draw();
  },
  raise: (el) => {
    const result = Actions.giveRaise(state, el.dataset.id, content);
    if (!guard(result, sfx.cash)) return;
    toast(`Raise given. −$${result.cost.toLocaleString()}`);
    persist();
    draw();
  },
  perk: () => {
    if (!guard(Actions.buyPerk(state), sfx.cash)) return;
    persist();
    draw();
  },

  // studio
  "buy-upgrade": (el) => {
    const result = Actions.buyUpgrade(state, el.dataset.id, content);
    if (!result.ok) {
      sfx.deny();
      if (result.reason === "cash") toast("Not enough cash.", "bad");
      return;
    }
    sfx.cash();
    persist();
    draw();
  },

  // launch
  "choose-channel": (el) => {
    const title = currentTitle(state);
    const spend = title.marketing.spend ?? title.marketing.budget ?? 0;
    if (!guard(Actions.setMarketing(state, el.dataset.id, spend, content))) return;
    persist();
    draw();
  },
  dunk: () => {
    if (!guard(Actions.dunk(state, content), sfx.fanfare)) return;
    persist();
    draw();
  },

  // events
  "choose-event": (el) => {
    const result = Actions.chooseEventOption(state, Number(el.dataset.id), content);
    if (!guard(result)) return;
    const rolled = result.outcomes?.find((o) => o.kind === "roll");
    if (rolled) (rolled.won ? sfx.fanfare : sfx.thud)();
    persist();
    draw();
  },
  "defer-event": () => {
    ui.showEvent = false;
    sfx.close();
    draw();
  },
  "reopen-event": () => {
    ui.showEvent = true;
    sfx.open();
    draw();
  },
  "close-event": () => {
    ui.showEvent = false;
    sfx.click();
    draw();
  },

  "skip-act-card": () => {
    ui.actCard = null;
    sfx.click();
    draw();
  },

  // onboarding
  "tutorial-next": () => {
    ui.tutorialStep++;
    if (ui.tutorialStep >= STEP_COUNT) {
      ui.tutorialOn = false;
      dismissTutorial();
    }
    sfx.click();
    draw();
  },
  "tutorial-skip": () => {
    ui.tutorialOn = false;
    dismissTutorial();
    sfx.close();
    draw();
  },

  // sequences
  advance: () => advance(),
  "dismiss-report": () => {
    ui.report = null;
    state.reportPending = false;
    persist();
    sfx.click();
    draw();
  },
  "leave-crash": () => {
    state = Q.leaveCrash(state, content);
    ui.showEvent = true;
    ui.panel = "project";
    sfx.crash();
    setMusicBed(state.act);
    ui.actCard = 2;
    setTimeout(() => {
      ui.actCard = null;
      draw();
    }, ACT_CARD_MS);
    persist();
    draw();
  },
  acquisition: (el) => {
    const accept = el.dataset.id === "accept";
    state = Q.resolveAcquisition(state, content, accept);
    accept ? sfx.cash() : sfx.fanfare();
    ui.showEvent = state.eventChoice == null;
    persist();
    draw();
  },
};

// --- Wiring ---------------------------------------------------------------

function bind() {
  delegate(root, "click", handlers);

  // Hover ghosting: the single most important teaching surface in the game.
  // On a coarse pointer it is driven by tap-to-preview instead (see
  // "place-card"), because there is no hover to ghost from.
  root.addEventListener("pointerover", (e) => {
    const card = e.target.closest?.("[data-hover]");
    const id = card?.getAttribute("data-hover") || null;
    if (id !== ui.hoverCard) {
      ui.hoverCard = id;
      draw();
    }
  });
  root.addEventListener("pointerleave", () => {
    if (ui.hoverCard) {
      ui.hoverCard = null;
      draw();
    }
  });

  // Marketing spend slider.
  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el.getAttribute?.("data-act") === "set-spend") {
      const title = currentTitle(state);
      Actions.setMarketing(state, title.marketing.channel, Number(el.value), content);
      const out = root.querySelector(".spend-value");
      if (out) out.textContent = "$" + Number(el.value).toLocaleString();
      persist();
    }
    if (el.getAttribute?.("data-act") === "set-seed") {
      ui.seed = el.value;
    }
  });

  // Drag a card from the catalog onto a slot, or out of one to remove it.
  root.addEventListener("dragstart", (e) => {
    const card = e.target.closest?.("[data-hover],[data-act='drag-slot']");
    if (!card) return;
    ui.dragging = card.getAttribute("data-hover") || card.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    root.classList.add("dragging");
  });
  root.addEventListener("dragend", () => {
    ui.dragging = null;
    root.classList.remove("dragging");
  });
  root.addEventListener("dragover", (e) => {
    if (e.target.closest?.(".slot")) e.preventDefault();
  });
  root.addEventListener("drop", (e) => {
    const slot = e.target.closest?.(".slot");
    if (!slot || !ui.dragging) return;
    e.preventDefault();
    const result = Actions.placeCard(state, ui.dragging, content);
    guard(result, sfx.place);
    ui.dragging = null;
    persist();
    draw();
  });

  window.addEventListener("resize", () => {
    if (ui.tutorialOn) placeCoach(root);
  });

  // Hold Space (or toggle with H) to light up every clickable region — the
  // adventure-game convention, and far less intrusive than pinning permanent
  // badges over the artwork.
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" && ui.revealHotspots) {
      ui.revealHotspots = false;
      draw();
    }
  });
  window.addEventListener("blur", () => {
    if (ui.revealHotspots) {
      ui.revealHotspots = false;
      draw();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (ui.screen !== "game" || !state) return;

    if (e.code === "Space") {
      // Space still has to activate a focused control — swallowing it here
      // would break keyboard operation of every button in the game.
      const focused = document.activeElement;
      if (focused && focused !== document.body && focused.closest?.("button, a, [tabindex]")) {
        return;
      }
      e.preventDefault();
      if (!ui.revealHotspots) {
        ui.revealHotspots = true;
        draw();
      }
      return;
    }

    const key = e.key.toLowerCase();
    if (key === "escape") {
      if (ui.tutorialOn) handlers["tutorial-skip"]();
      else if (ui.panel) handlers["close-panel"]();
      else if (ui.showEvent && state.eventChoice != null) handlers["close-event"]();
      return;
    }
    if (key === "e") return handlers.advance();
    if (key === "m") return handlers["toggle-audio"]();
    if (key === "b") return handlers["open-panel"]({ dataset: { id: "books" } });
    if (key === "?" || key === "/") return handlers["open-help"]();
    if (key === "h") {
      ui.revealHotspots = !ui.revealHotspots;
      sfx.soft();
      return draw();
    }

    const n = Number(e.key);
    // 1-8: the penthouse exit is 8. It was labelled 0, which this range
    // never accepted, so the key printed on the hotspot did nothing.
    if (n >= 1 && n <= 8) {
      const spot = availableHotspots(state).find((s) => s.key === e.key);
      if (spot) {
        handlers[spot.hub ? "go-hub" : "open-panel"]({
          dataset: { id: spot.hub || spot.panel },
          getAttribute: () => null,
          hasAttribute: () => false,
        });
      }
    }
  });
}

export function boot() {
  initAudio();
  bind();
  // Scene art reports its natural size asynchronously; refit when it lands.
  root.addEventListener("hubart", () => fitHubFrame(root));
  draw();
  reattachHubWatcher = watchHubFrame(root);
}
