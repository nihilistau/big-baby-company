// Vite-side content loading. Keeps the bare JSON imports in one file so the
// pure builder in content.js stays runnable outside the bundler.
import features from "../../data/features.json";
import staff from "../../data/staff.json";
import titles from "../../data/titles.json";
import events from "../../data/events.json";
import chirps from "../../data/chirps.json";
import synergies from "../../data/synergies.json";
import upgrades from "../../data/upgrades.json";
import deals from "../../data/deals.json";
import marketing from "../../data/marketing.json";
import endings from "../../data/endings.json";
import achievements from "../../data/achievements.json";
import { buildContent } from "./content.js";

let cached = null;

export function loadContent() {
  if (!cached) {
    cached = buildContent({
      features, staff, titles, events, chirps, synergies,
      upgrades, deals, marketing, endings, achievements,
    });
  }
  return cached;
}
