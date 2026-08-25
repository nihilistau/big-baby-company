// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render } from "../../src/ui/render.js";
import { availableHotspots, fitHubFrame, hubView, sceneFor } from "../../src/ui/hub.js";
import { content, inProduction } from "../helpers.js";

const ASPECT = 1.881;
let root;

function mount(state, hubW, hubH) {
  render(root, hubView({ state, content, ui: { visited: new Set() } }));
  const hub = root.querySelector(".hub");
  const frame = root.querySelector(".hub-frame");
  const img = frame.querySelector(".hub-art");

  // jsdom has no layout, so stand in for it.
  hub.getBoundingClientRect = () => ({ width: hubW, height: hubH });
  Object.defineProperty(img, "naturalWidth", { value: 1920, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: 1021, configurable: true });
  fitHubFrame(root);
  return {
    w: parseFloat(frame.style.width),
    h: parseFloat(frame.style.height),
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById("root");
});

describe("the hub frame", () => {
  /**
   * Hotspot rectangles are percentages of this frame, so if the frame's aspect
   * ever drifts from the artwork's, every clickable region silently moves.
   */
  const shapes = [
    ["wide and short", 1534, 300],
    ["wide and tall", 1534, 900],
    ["square-ish", 800, 800],
    ["narrow", 334, 614],
    ["exactly the art aspect", 1881, 1000],
  ];

  for (const [label, w, h] of shapes) {
    it(`keeps the art's aspect when the stage is ${label}`, () => {
      const box = mount(inProduction({ act: 1 }), w, h);
      expect(box.w / box.h).toBeCloseTo(ASPECT, 1);
      expect(box.w).toBeLessThanOrEqual(w + 1);
      expect(box.h).toBeLessThanOrEqual(h + 1);
    });
  }

  it("fills whichever axis runs out first", () => {
    const wide = mount(inProduction({ act: 1 }), 4000, 500);
    expect(wide.h).toBeCloseTo(500, 0);
    const narrow = mount(inProduction({ act: 1 }), 500, 4000);
    expect(narrow.w).toBeCloseTo(500, 0);
  });

  it("does nothing rather than throwing when the stage has no size yet", () => {
    expect(() => mount(inProduction({ act: 1 }), 0, 0)).not.toThrow();
  });
});

describe("hotspots", () => {
  it("stay inside the frame on every scene", () => {
    for (const act of [1, 2, 3]) {
      const state = inProduction({ act });
      state.hub = act === 2 ? "garage" : act === 3 ? "loft" : "hq";
      for (const spot of availableHotspots(state)) {
        expect(spot.x, `${spot.label} x`).toBeGreaterThanOrEqual(0);
        expect(spot.y, `${spot.label} y`).toBeGreaterThanOrEqual(0);
        expect(spot.x + spot.w, `${spot.label} right edge`).toBeLessThanOrEqual(100);
        expect(spot.y + spot.h, `${spot.label} bottom edge`).toBeLessThanOrEqual(100);
      }
    }
  });

  it("gives every scene a project, a chirper and a short dock label", () => {
    for (const scene of ["hq", "garage", "loft"]) {
      const state = inProduction({ act: scene === "hq" ? 1 : scene === "garage" ? 2 : 3 });
      state.hub = scene;
      const spots = availableHotspots(state);
      expect(sceneFor(state).art).toBe(scene);
      expect(spots.some((s) => s.panel === "project"), `${scene} project`).toBe(true);
      expect(spots.some((s) => s.panel === "chirper"), `${scene} chirper`).toBe(true);
      for (const s of spots) expect(s.short, `${scene}/${s.label} short label`).toBeTruthy();
    }
  });

  it("draws no badge over the artwork — only a label", () => {
    render(root, hubView({ state: inProduction({ act: 1 }), content, ui: { visited: new Set() } }));
    expect(root.querySelectorAll(".pin, .hs-glow, .hs-frame")).toHaveLength(0);
    expect(root.querySelectorAll(".hotspot-label").length).toBeGreaterThan(0);
  });
});
