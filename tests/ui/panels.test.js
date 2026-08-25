// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render } from "../../src/ui/render.js";
import { projectLaunch } from "../../src/sim/economy.js";
import { clearSave, hasSave, loadState, saveState, savePreview } from "../../src/sim/save.js";
import { loadMeta, resetMeta, saveMeta } from "../../src/sim/meta.js";
import { createState } from "../../src/sim/state.js";
import { projectPanel } from "../../src/ui/panels/project.js";
import {
  boardPanel,
  booksPanel,
  hrPanel,
  poolPanel,
  storePanel,
  streamPanel,
  studioPanel,
} from "../../src/ui/panels/rooms.js";
import { chirperPanel, markFeedSeen, resetFeed } from "../../src/ui/panels/chirper.js";
import { chromeView } from "../../src/ui/chrome.js";
import { dockView, hubView } from "../../src/ui/hub.js";
import { helpPanel, menuView } from "../../src/ui/menu.js";
import {
  acquisitionModal,
  crashModal,
  endingModal,
  eventModal,
  gameOverModal,
  launchReport,
  stageModal,
} from "../../src/ui/sequences.js";
import { content, inProduction, place, FUN_CARDS } from "../helpers.js";

let root;
function ctxFor(state, over = {}) {
  return {
    state,
    content,
    ui: { visited: new Set(), panel: null, cardFilter: "all", menuTab: "start" },
    projection: projectLaunch(state, content),
    ghost: null,
    muted: false,
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById("root");
  localStorage.clear();
});

describe("every panel renders without throwing", () => {
  const panels = {
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

  for (const phase of ["pitch", "production", "launch"]) {
    for (const act of [1, 2, 3]) {
      it(`${phase} / act ${act}`, () => {
        const state = place(inProduction({ act, slots: 5 }), FUN_CARDS.slice(0, 2));
        state.phase = phase;
        state.titles[state.titleIndex].offers = content.titleSlotsList[0].concepts.map((c) => c.id);
        const c = ctxFor(state);
        for (const [name, fn] of Object.entries(panels)) {
          expect(() => render(root, fn(c)), `${name} @ ${phase}/${act}`).not.toThrow();
          expect(root.innerHTML.length, `${name} rendered empty`).toBeGreaterThan(20);
        }
        expect(() => render(root, chromeView(c) + hubView(c) + dockView(c))).not.toThrow();
      });
    }
  }
});

describe("sequences render", () => {
  it("event modal, both before and after a choice", () => {
    const state = inProduction({ act: 2 });
    state.pendingEvent = "the-scope-meeting";
    state.eventChoice = null;
    render(root, eventModal(ctxFor(state)));
    expect(root.querySelectorAll("[data-act=choose-event]").length).toBeGreaterThan(1);

    state.eventChoice = 0;
    state.eventOutcome = [{ kind: "cash", amount: -1000 }, { kind: "roll", won: true }];
    render(root, eventModal(ctxFor(state)));
    expect(root.querySelector("[data-act=close-event]")).toBeTruthy();
  });

  it("launch report with synergies, conflicts and a backlash", () => {
    const state = place(inProduction({ act: 2, slots: 5 }), [
      "fun-gunfeel",
      "gore-headshot",
      "pc-purple",
    ]);
    const result = projectLaunch(state, content);
    const c = ctxFor(state, {
      report: {
        result,
        backlash: { entry: content.backlash[0], absorbed: false },
        outcomes: [{ kind: "trust", delta: -14 }],
      },
    });
    render(root, launchReport(c));
    expect(root.textContent).toContain("Launch report");
    expect(root.querySelector("[data-act=dismiss-report]")).toBeTruthy();
  });

  it("crash, acquisition, ending and gameover", () => {
    const state = place(inProduction({ act: 2 }), FUN_CARDS.slice(0, 3));
    state.lastLaunch = projectLaunch(state, content);
    state.acquisitionOffer = 4200000;
    state.rank = content.ranks[4];
    state.ending = content.endings[0];
    const c = ctxFor(state);
    for (const fn of [crashModal, acquisitionModal, endingModal, gameOverModal]) {
      expect(() => render(root, fn(c))).not.toThrow();
      expect(root.innerHTML.length).toBeGreaterThan(50);
    }
  });

  describe("stageModal", () => {
    // These modals are absolutely positioned siblings sharing one z-index, so
    // two at once means the later one silently paints over the earlier. The
    // crash and the ending both land in the same tick as a launch report.
    const reportFor = (state) => ({
      result: projectLaunch(state, content),
      backlash: null,
      outcomes: [],
    });

    it("shows the launch report instead of the screen it resolves into", () => {
      for (const screen of ["crash", "ending", "gameover", "acquisition"]) {
        const state = place(inProduction({ act: 2 }), FUN_CARDS.slice(0, 3));
        state.screen = screen;
        state.acquisitionOffer = 4200000;
        state.rank = content.ranks[4];
        state.ending = content.endings[0];
        const c = ctxFor(state, { report: reportFor(state) });

        render(root, stageModal(c, { report: c.report }));
        expect(root.querySelectorAll(".modal-wrap")).toHaveLength(1);
        expect(root.querySelector(".report-wrap"), screen).toBeTruthy();
        expect(root.querySelector("[data-act=dismiss-report]")).toBeTruthy();
      }
    });

    it("shows the screen once the report is dismissed", () => {
      const state = place(inProduction({ act: 2 }), FUN_CARDS.slice(0, 3));
      state.screen = "ending";
      state.rank = content.ranks[4];
      state.ending = content.endings[0];
      const c = ctxFor(state);

      render(root, stageModal(c, { report: null }));
      expect(root.querySelectorAll(".modal-wrap")).toHaveLength(1);
      expect(root.querySelector(".report-wrap")).toBeNull();
      expect(root.querySelector(".ending-wrap")).toBeTruthy();
    });

    it("renders nothing while the run is simply being played", () => {
      const state = place(inProduction({ act: 2 }), FUN_CARDS.slice(0, 3));
      expect(stageModal(ctxFor(state), { report: null })).toBe("");
    });
  });
});

describe("menu", () => {
  it("renders all three tabs", () => {
    const c = ctxFor(createState({ seed: "menu-test" }));
    for (const tab of ["start", "trophies", "how"]) {
      c.ui.menuTab = tab;
      expect(() => render(root, menuView(c))).not.toThrow();
    }
    expect(root.querySelector(".menu-tabs")).toBeTruthy();
  });

  it("shows Continue only when a save exists", () => {
    const c = ctxFor(createState({ seed: "menu-save" }));
    render(root, menuView(c));
    expect(root.querySelector("[data-act=continue]")).toBeNull();

    saveState(createState({ seed: "menu-save" }));
    render(root, menuView(c));
    expect(root.querySelector("[data-act=continue]")).toBeTruthy();
  });
});

describe("saves", () => {
  it("round-trips a live run", () => {
    const state = place(inProduction({ act: 2, slots: 5 }), FUN_CARDS.slice(0, 3));
    state.cash = 123456;
    expect(saveState(state)).toBe(true);
    const loaded = loadState();
    expect(loaded.ok).toBe(true);
    expect(loaded.state.cash).toBe(123456);
    expect(loaded.state.titles[loaded.state.titleIndex].cards).toEqual(
      state.titles[state.titleIndex].cards
    );
  });

  it("refuses a legacy save instead of crashing on it", () => {
    // The shape the original 8-quarter demo wrote.
    localStorage.setItem(
      "bbc-save",
      JSON.stringify({ quarter: 3, cash: 1000, boxes: {}, staff: [], act: 1 })
    );
    const result = loadState();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("outdated");
  });

  it("refuses corrupt and structurally invalid saves", () => {
    localStorage.setItem("bbc-save", "{not json");
    expect(loadState().reason).toBe("corrupt");

    const state = createState({ seed: "bad" });
    delete state.studio;
    localStorage.setItem("bbc-save", JSON.stringify(state));
    expect(loadState().reason).toBe("invalid");
  });

  it("reports empty when there is nothing saved", () => {
    clearSave();
    expect(hasSave()).toBe(false);
    expect(loadState().reason).toBe("empty");
    expect(savePreview()).toBeNull();
  });

  it("summarises a save without loading the whole run", () => {
    const state = inProduction({ act: 2, name: "Parking Lot" });
    saveState(state);
    const preview = savePreview();
    expect(preview.titleName).toBe("Parking Lot");
    expect(preview.seed).toBe(state.seed);
  });
});

describe("meta progression", () => {
  it("persists achievements and unlocks across runs", () => {
    resetMeta();
    const meta = loadMeta();
    meta.achievements.push("first-ship");
    meta.unlockedCards.push("gore-ragdoll");
    saveMeta(meta);
    expect(loadMeta().achievements).toContain("first-ship");
    expect(loadMeta().unlockedCards).toContain("gore-ragdoll");
  });

  it("survives a corrupt meta blob", () => {
    localStorage.setItem("bbc-meta", "}}}");
    expect(loadMeta().achievements).toEqual([]);
  });
});
