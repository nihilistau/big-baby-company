// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { helpPanel, runDetails } from "../../src/ui/menu.js";
import { VERSION } from "../../src/version.js";
import { inProduction } from "../helpers.js";

const root = path.resolve(import.meta.dirname, "../..");
const templateDir = path.join(root, ".github", "ISSUE_TEMPLATE");

describe("the version string", () => {
  it("matches package.json", () => {
    // A build stamp that lies is worse than no build stamp: it sends a bug
    // report to the wrong commit. Two config files inject this, so it can drift
    // silently in exactly the one that isn't exercised by `npm run dev`.
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});

describe("run details", () => {
  it("carries everything needed to reproduce a run", () => {
    const state = inProduction();
    const html = runDetails(state);
    // Seed and difficulty were previously only on the ending screens — the one
    // moment a tester is not filing a bug.
    expect(html).toContain(state.seed);
    expect(html).toContain(`Q${state.quarter}`);
    expect(html).toMatch(/v\d+\.\d+\.\d+/);
    expect(html).toContain("copy-diagnostics");
  });

  it("renders nothing at all outside a run", () => {
    expect(runDetails(null)).toBe("");
    expect(helpPanel({ state: null })).not.toContain("This run");
    expect(helpPanel()).toContain("Glossary");
  });

  it("is reachable from the glossary panel", () => {
    const state = inProduction();
    expect(helpPanel({ state })).toContain(state.seed);
  });
});

describe("issue templates", () => {
  const files = fs.readdirSync(templateDir).filter((f) => f !== "config.yml");

  it("exist for bugs, playtests, balance and content", () => {
    expect(files.length).toBe(4);
  });

  it("only claim labels that exist on the repo", () => {
    // GitHub silently drops a label a template asks for that isn't defined,
    // which means triage quietly stops working and nothing tells you.
    const known = new Set(["bug", "playtest", "balance", "content"]);
    for (const f of files) {
      const src = fs.readFileSync(path.join(templateDir, f), "utf8");
      const line = src.match(/^labels: \[(.+)\]$/m);
      expect(line, `${f} declares no labels`).toBeTruthy();
      for (const label of line[1].split(",").map((s) => s.trim().replace(/"/g, ""))) {
        expect(known.has(label), `${f} wants unknown label "${label}"`).toBe(true);
      }
    }
  });

  it("ask for the run details the game can actually produce", () => {
    // The bug and playtest forms both point at "? → Copy run details". If that
    // button ever goes away the forms are asking for something unobtainable.
    for (const f of ["01-bug.yml", "02-playtest.yml"]) {
      const src = fs.readFileSync(path.join(templateDir, f), "utf8");
      expect(src).toContain("Copy run details");
      expect(src).toMatch(/id: run\b/);
    }
  });
});
