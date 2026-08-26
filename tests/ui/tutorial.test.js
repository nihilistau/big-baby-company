// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { noteGhost, sawInversion, shouldPromptInversion } from "../../src/ui/tutorial.js";
import { resetMeta } from "../../src/sim/meta.js";
import { inProduction } from "../helpers.js";

describe("the inversion gate", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMeta();
  });

  it("counts a PC card on an empty box, where copies cannot go negative", () => {
    // The obvious test — opposing signs — is wrong. At the start of Act I the
    // box is empty and copies is already zero, so the clearest demonstration in
    // the game (+20 industry, copies unmoved) has no negative to compare and
    // the prompt could never be satisfied at the moment it appears.
    expect(noteGhost({ score: 20, copies: 0 })).toBe(true);
    expect(sawInversion()).toBe(true);
  });

  it("counts a FUN card trading score for copies", () => {
    expect(noteGhost({ score: -2, copies: 240 })).toBe(true);
  });

  it("does not count a card that improves both", () => {
    // The one ghost that proves nothing about the premise.
    expect(noteGhost({ score: 6, copies: 300 })).toBe(false);
    expect(sawInversion()).toBe(false);
  });

  it("ignores a hover that moves nothing", () => {
    expect(noteGhost({ score: 0, copies: 0 })).toBe(false);
    expect(noteGhost(null)).toBe(false);
    expect(sawInversion()).toBe(false);
  });

  it("only nags on the first title, in production, until it is satisfied", () => {
    const state = inProduction({ act: 1 });
    state.titleIndex = 0;
    expect(shouldPromptInversion(state)).toBe(true);

    state.phase = "launch";
    expect(shouldPromptInversion(state)).toBe(false);

    state.phase = "production";
    state.titleIndex = 3;
    expect(shouldPromptInversion(state)).toBe(false);

    state.titleIndex = 0;
    noteGhost({ score: 20, copies: 0 });
    expect(shouldPromptInversion(state)).toBe(false);
  });

  it("records the lesson once and then stays quiet", () => {
    expect(noteGhost({ score: 20, copies: 0 })).toBe(true);
    expect(noteGhost({ score: 20, copies: 0 })).toBe(false);
  });
});
