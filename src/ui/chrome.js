import { escapeHtml } from "./render.js";
import { asset } from "./assets.js";
import {
  actRoman,
  count,
  money,
  moneyExact,
  phaseLabel,
  signed,
  yearQuarter,
} from "./format.js";
import { blockingReason } from "../sim/quarter.js";
import { currentTitle } from "../sim/state.js";
import { CAMPAIGN_QUARTERS } from "../sim/content.js";

const BLOCK_COPY = {
  event: "Resolve the event",
  concept: "Pick a concept",
  deal: "Pick your funding",
  "empty-box": "Put something in the box",
  marketing: "Choose a campaign",
  "not-playing": "—",
};

const METERS = [
  { key: "standing", label: "Standing", icon: "◆", hint: "Industry standing. Drives investor wires, awards and deal quality. Decays every quarter." },
  { key: "trust", label: "Trust", icon: "♥", hint: "Audience trust. The baseline multiplier on every copy you sell. Earned slowly, lost fast." },
  { key: "heat", label: "Heat", icon: "▲", hint: "Controversy. Free reach — until it rolls on the backlash table at launch." },
  { key: "morale", label: "Morale", icon: "☺", hint: "Studio morale. Low morale means people quit, leak, and quietly stop caring." },
];

function meter(state, def, delta) {
  const value = state[def.key];
  const danger =
    (def.key === "heat" && value >= 55) ||
    (def.key === "morale" && value <= 30) ||
    (def.key === "trust" && value <= 20);
  // Heat is the one meter where "up" is not automatically good news.
  const goodWay = def.key === "heat" ? -1 : 1;
  return `
    <div class="meter ${def.key} ${danger ? "danger" : ""}" data-key="meter-${def.key}"
         title="${escapeHtml(def.hint)}" tabindex="0" aria-label="${def.label} ${value} of 100">
      <span class="meter-icon" aria-hidden="true">${def.icon}</span>
      <span class="meter-label">${def.label}</span>
      <span class="meter-track"><span class="meter-fill" style="width:${value}%"></span></span>
      <span class="meter-value">${value}</span>
      ${
        delta
          ? `<span class="meter-delta ${delta * goodWay > 0 ? "up" : "down"}">${signed(delta)}</span>`
          : ""
      }
    </div>`;
}

function phaseDots(state) {
  const order = ["pitch", "production", "launch"];
  return order
    .map((p) => {
      const done = order.indexOf(state.phase) > order.indexOf(p);
      const now = state.phase === p;
      return `<span class="dot ${now ? "now" : ""} ${done ? "done" : ""}" title="${phaseLabel(p)}"></span>`;
    })
    .join("");
}

export function chromeView(ctx) {
  const { state, content, projection, ghost } = ctx;
  const title = currentTitle(state);
  const reason = blockingReason(state, content);
  const blocked = reason != null;
  const endless = state.mode === "endless";

  const score = projection?.score ?? 0;
  const copies = projection?.copies ?? 0;
  const dScore = ghost ? ghost.score : 0;
  const dCopies = ghost ? ghost.copies : 0;

  return `
    <header class="chrome" data-key="chrome">
      <div class="chrome-brand">
        <img src="${asset("/assets/logo.png")}" alt="" width="34" height="34"
             onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'logo-fallback',textContent:'BB'}))" />
        <div>
          <div class="brand-name">${escapeHtml(state.studio.name)}</div>
          <div class="brand-sub">Act ${actRoman(state.act)} · ${yearQuarter(state.quarter)}${
            endless ? "" : ` · Q${state.quarter}/${CAMPAIGN_QUARTERS}`
          }</div>
        </div>
      </div>

      <div class="chrome-title">
        <div class="ct-name">${escapeHtml(title?.name || "Untitled project")}</div>
        <div class="ct-phase">${phaseLabel(state.phase)} ${phaseDots(state)}</div>
      </div>

      <div class="chrome-cash ${state.cash < 0 ? "neg" : ""}" title="${moneyExact(state.cash)}">
        <span class="cash-label">Cash</span>
        <span class="cash-value">${money(state.cash)}</span>
      </div>

      <div class="chrome-meters">${METERS.map((d) => meter(state, d, ctx.meterDeltas?.[d.key])).join("")}</div>

      <div class="chrome-est" title="Projected result if you shipped this box today.">
        <div class="est-block ${dScore ? (dScore > 0 ? "up" : "down") : ""}">
          <span class="est-label">Industry</span>
          <span class="est-value">${score}${
            dScore ? `<span class="ghost">${signed(dScore)}</span>` : ""
          }</span>
        </div>
        <div class="est-block ${dCopies ? (dCopies > 0 ? "up" : "down") : ""}">
          <span class="est-label">Copies</span>
          <span class="est-value">${count(copies)}${
            dCopies ? `<span class="ghost">${signed(dCopies)}</span>` : ""
          }</span>
        </div>
      </div>

      <div class="chrome-actions">
        <button class="icon-btn" data-act="toggle-audio" title="Sound (M)" aria-label="Toggle sound">
          ${ctx.muted ? "\u{1F507}" : "\u{1F50A}"}
        </button>
        <button class="icon-btn" data-act="open-help" title="Glossary (?)" aria-label="Glossary">?</button>
        <button class="icon-btn" data-act="open-menu" title="Menu (Esc)" aria-label="Menu">≡</button>
        ${
          // Once the run is over there is no quarter left to end; showing a
          // dead button with an em-dash on it just looks like a bug.
          // When the blocker is an unresolved event the button says "Resolve
          // the event" — so it should resolve the event. It used to be the
          // disabled End Quarter control wearing that label, and the only other
          // way back to the modal was a chip that sits underneath any open
          // panel and never receives the click.
          state.screen === "playing"
            ? reason === "event"
              ? `<button class="btn primary end-quarter" data-act="reopen-event"
                         title="Reopen the event (E)">
                   ${escapeHtml(BLOCK_COPY.event)}
                 </button>`
              : `<button class="btn primary end-quarter" data-act="advance" ${blocked ? "disabled" : ""}
                         title="${blocked ? escapeHtml(BLOCK_COPY[reason] || reason) : "Advance the quarter (E)"}">
                   ${blocked ? escapeHtml(BLOCK_COPY[reason] || reason) : "End Quarter"}
                 </button>`
            : ""
        }
      </div>
    </header>`;
}

export { BLOCK_COPY };
