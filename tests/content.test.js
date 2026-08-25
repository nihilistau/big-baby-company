import { describe, expect, it } from "vitest";
import { catalogFor } from "../src/sim/content.js";
import { content, raw } from "./helpers.js";

const ids = (list) => new Set(list.map((x) => x.id));

describe("content integrity", () => {
  it("has no duplicate ids anywhere", () => {
    for (const [name, list] of Object.entries({
      features: raw.features,
      staff: raw.staff,
      events: raw.events,
      synergies: raw.synergies,
      upgrades: raw.upgrades,
      deals: raw.deals,
      achievements: raw.achievements,
    })) {
      const seen = new Set();
      const dupes = [];
      for (const row of list) {
        if (seen.has(row.id)) dupes.push(row.id);
        seen.add(row.id);
      }
      expect(dupes, `${name} has duplicate ids`).toEqual([]);
    }
  });

  it("every synergy references real features", () => {
    const feats = ids(raw.features);
    for (const rule of raw.synergies) {
      for (const id of rule.requires || []) {
        expect(feats.has(id), `${rule.id} requires missing feature ${id}`).toBe(true);
      }
    }
  });

  it("every staff pet feature and backup exists and is act-compatible", () => {
    for (const person of raw.staff) {
      if (!person.petFeature) continue;
      for (const id of [person.petFeature, ...(person.petBackups || [])]) {
        const f = content.features[id];
        expect(f, `${person.id} references missing feature ${id}`).toBeTruthy();
        const shared = person.acts.some((a) => f.acts.includes(a));
        expect(shared, `${person.id} can never inject ${id}`).toBe(true);
      }
    }
  });

  it("every publisher mandate references a real feature", () => {
    for (const deal of raw.deals) {
      if (!deal.mandate) continue;
      expect(content.features[deal.mandate], `${deal.id} mandates ${deal.mandate}`).toBeTruthy();
    }
  });

  it("every title slot offers at least three concepts", () => {
    for (const slot of raw.titles) {
      expect(slot.concepts.length, `slot ${slot.slot}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("every sequel points at a concept that exists earlier in the campaign", () => {
    const bySlot = {};
    for (const slot of raw.titles) for (const c of slot.concepts) bySlot[c.id] = slot.slot;
    for (const slot of raw.titles) {
      for (const c of slot.concepts) {
        if (!c.sequelTo) continue;
        expect(bySlot[c.sequelTo], `${c.id} -> ${c.sequelTo}`).toBeDefined();
        expect(bySlot[c.sequelTo]).toBeLessThan(slot.slot);
      }
    }
  });

  it("upgrade prerequisites exist and are cheaper than their dependants", () => {
    const byId = Object.fromEntries(raw.upgrades.map((u) => [u.id, u]));
    for (const u of raw.upgrades) {
      for (const req of u.requires || []) {
        expect(byId[req], `${u.id} requires missing ${req}`).toBeTruthy();
        expect(byId[req].cost).toBeLessThan(u.cost);
      }
    }
  });

  it("every chirp references a declared account", () => {
    for (const [pool, posts] of Object.entries(raw.chirps.pools)) {
      for (const post of posts) {
        expect(raw.chirps.accounts[post.who], `${pool} -> ${post.who}`).toBeTruthy();
      }
    }
  });

  it("every event has choices with effects, and declared acts and phases", () => {
    const phases = new Set(["pitch", "production", "launch"]);
    for (const e of raw.events) {
      expect(e.choices.length, `${e.id} has no choices`).toBeGreaterThanOrEqual(2);
      expect(e.acts.length).toBeGreaterThan(0);
      for (const p of e.phases) expect(phases.has(p), `${e.id} phase ${p}`).toBe(true);
      for (const c of e.choices) {
        expect(c.label, `${e.id} choice missing label`).toBeTruthy();
        expect(c.effects, `${e.id} choice missing effects`).toBeTruthy();
      }
    }
  });

  it("has enough drawable events for a full campaign in every act and phase", () => {
    for (const act of [1, 2, 3]) {
      for (const phase of ["pitch", "production", "launch"]) {
        const n = raw.events.filter(
          (e) => !e.scripted && e.acts.includes(act) && e.phases.includes(phase)
        ).length;
        expect(n, `act ${act} / ${phase} has only ${n} events`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("gives every act a playable catalog", () => {
    for (const act of [1, 2, 3]) {
      const pool = catalogFor(content, act, []);
      expect(pool.length, `act ${act} catalog`).toBeGreaterThanOrEqual(15);
      // Enough cheap cards to fill the biggest box in that act.
      const cheap = pool.filter((f) => (f.cost || 1) === 1).length;
      expect(cheap, `act ${act} cheap cards`).toBeGreaterThanOrEqual(8);
    }
  });

  it("keeps every axis represented in acts II and III", () => {
    for (const act of [2, 3]) {
      const pool = catalogFor(content, act, []);
      for (const axis of ["fun", "gore", "ordinary"]) {
        const n = pool.filter((f) => (f[axis] || 0) > 0).length;
        expect(n, `act ${act} ${axis}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("has a rank ladder with no gaps and no overlaps", () => {
    const ranks = [...content.ranks].sort(
      (a, b) => (a.minCash ?? -Infinity) - (b.minCash ?? -Infinity)
    );
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i].minCash, `${ranks[i].id} starts where ${ranks[i - 1].id} ends`).toBe(
        ranks[i - 1].maxCash + 1
      );
    }
  });

  it("has a default ending that always matches", () => {
    const fallback = content.endings.find((e) => e.priority === 0);
    expect(fallback).toBeTruthy();
    expect(Object.keys(fallback.requires || {})).toHaveLength(0);
  });

  it("gives every card a blurb and a body worth reading", () => {
    for (const f of raw.features) {
      expect(f.blurb, `${f.id} blurb`).toBeTruthy();
      expect(f.body.length, `${f.id} body too short`).toBeGreaterThan(80);
      expect(f.tags.length, `${f.id} tags`).toBeGreaterThan(0);
      expect(f.cost).toBeGreaterThanOrEqual(1);
      expect(f.acts.length).toBeGreaterThan(0);
    }
  });

  it("keeps unlockable cards genuinely locked until earned", () => {
    const locked = raw.features.filter((f) => f.unlock);
    expect(locked.length).toBeGreaterThan(0);
    for (const f of locked) {
      expect(catalogFor(content, f.acts[0], []).map((x) => x.id)).not.toContain(f.id);
      expect(catalogFor(content, f.acts[0], [f.id]).map((x) => x.id)).toContain(f.id);
      expect(f.unlock.hint, `${f.id} needs an unlock hint`).toBeTruthy();
    }
  });
});
