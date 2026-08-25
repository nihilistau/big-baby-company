// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render } from "../../src/ui/render.js";
import { chirperPanel, markFeedSeen, resetFeed } from "../../src/ui/panels/chirper.js";
import { pushChirp } from "../../src/sim/state.js";
import { content, inProduction } from "../helpers.js";

let root;
const ctxFor = (state) => ({ state, content, ui: { visited: new Set() } });

function post(state, over = {}) {
  pushChirp(state, { who: "Grum", handle: "@grum", kind: "hater", text: "post " + Math.random(), ...over });
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById("root");
  resetFeed();
});

describe("the chirper feed", () => {
  it("shows an empty state with no posts", () => {
    render(root, chirperPanel(ctxFor(inProduction({ act: 2 }))));
    expect(root.textContent).toContain("timeline is empty");
  });

  it("renders a post with an avatar and four engagement metrics", () => {
    const state = inProduction({ act: 2 });
    post(state, { text: "the gun works" });
    render(root, chirperPanel(ctxFor(state)));

    expect(root.querySelector(".chirp-avatar").textContent).toBe("G");
    const metrics = [...root.querySelectorAll("[data-metric]")].map((el) =>
      el.getAttribute("data-metric").split(":")[1]
    );
    expect(metrics).toEqual(["replies", "reposts", "likes", "views"]);
  });

  it("gives each post a stable id so re-renders do not restart it", () => {
    const state = inProduction({ act: 2 });
    post(state);
    render(root, chirperPanel(ctxFor(state)));
    const first = root.querySelector("[data-chirp]").getAttribute("data-chirp");
    render(root, chirperPanel(ctxFor(state)));
    expect(root.querySelector("[data-chirp]").getAttribute("data-chirp")).toBe(first);
  });

  it("counters never go backwards across a re-render", () => {
    const state = inProduction({ act: 2 });
    post(state);
    render(root, chirperPanel(ctxFor(state)));
    const read = () => root.querySelector('[data-metric$=":views"]').textContent;
    const before = read();
    render(root, chirperPanel(ctxFor(state)));
    expect(read()).toBe(before);
  });

  it("marks new arrivals so only they animate in", () => {
    const state = inProduction({ act: 2 });
    post(state, { text: "first" });
    render(root, chirperPanel(ctxFor(state)));
    expect(root.querySelectorAll(".chirp.is-new")).toHaveLength(1);

    markFeedSeen(state);
    render(root, chirperPanel(ctxFor(state)));
    expect(root.querySelectorAll(".chirp.is-new")).toHaveLength(0);

    post(state, { text: "second" });
    render(root, chirperPanel(ctxFor(state)));
    const fresh = [...root.querySelectorAll(".chirp.is-new")];
    expect(fresh).toHaveLength(1);
    expect(fresh[0].textContent).toContain("second");
  });

  it("scales reach by who is posting, not by post order", () => {
    const state = inProduction({ act: 2 });
    pushChirp(state, { who: "Sheila, 71", kind: "staff", text: "a quiet one" });
    pushChirp(state, { who: "Chad Vantage", kind: "streamer", text: "CHAT" });
    render(root, chirperPanel(ctxFor(state)));

    const views = [...root.querySelectorAll('[data-metric$=":views"]')].map((e) => e.textContent);
    const toNum = (s) =>
      s.endsWith("M") ? parseFloat(s) * 1e6 : s.endsWith("K") ? parseFloat(s) * 1e3 : Number(s);
    // Streamer is first (most recent) and must out-reach the staff post.
    expect(toNum(views[0])).toBeGreaterThan(toNum(views[1]));
  });

  it("shows a live indicator once there is anything to watch", () => {
    const state = inProduction({ act: 2 });
    post(state);
    render(root, chirperPanel(ctxFor(state)));
    expect(root.querySelector(".live-dot")).toBeTruthy();
    expect(root.querySelector(".typing")).toBeTruthy();
  });
});
