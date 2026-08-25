import { escapeHtml } from "./render.js";
import { asset } from "./assets.js";
import { count, money, moneyExact, signed } from "./format.js";
import { currentTitle } from "../sim/state.js";

const OUTCOME_LABEL = {
  cash: (o) => `${o.amount >= 0 ? "+" : "−"}${moneyExact(Math.abs(o.amount)).replace("−", "")}`,
  standing: (o) => `Standing ${signed(o.delta)}`,
  trust: (o) => `Trust ${signed(o.delta)}`,
  heat: (o) => `Heat ${signed(o.delta)}`,
  morale: (o) => `Morale ${signed(o.delta)}`,
  jank: (o) => `Jank ${signed(o.delta)}`,
  hype: (o) => `Hype ${signed(o.delta)}`,
  score: (o) => `Industry score ${signed(o.delta)} at launch`,
  copies: (o) => `Copies ×${o.mul}`,
  money: (o) => `Revenue ×${o.mul}`,
  price: (o) => `Price ×${o.mul}`,
  devPoints: (o) => `Dev points ${signed(o.delta)}`,
  aura: (o) =>
    Object.entries(o.aura)
      .map(([k, v]) => `${k.toUpperCase()} ${signed(v)}`)
      .join(" · "),
  cardRemoved: (o, c) => `Cut: ${c.features[o.featureId]?.name || o.featureId}`,
  cardAdded: (o, c) => `Added: ${c.features[o.featureId]?.name || o.featureId}`,
  cardUnlocked: (o) => `Unlocked: ${o.name}`,
  staffLeft: (o) => `${o.name} is gone`,
  crunchFree: () => "Crunch, on the house",
  crunchDiscount: () => "Crunch is free this quarter",
  flag: (o) =>
    ({ liveService: "You are a live service now", loseIP: "The catalogue is collateral", boardSeat: "They have a board seat", founderPaid: "You paid yourself" }[o.flag] || o.flag),
  roll: (o) => (o.won ? "It went your way." : "It did not go your way."),
};

function outcomeList(outcomes, content) {
  if (!outcomes?.length) return "";
  return `<ul class="outcomes">${outcomes
    .map((o) => {
      const fn = OUTCOME_LABEL[o.kind];
      if (!fn) return "";
      const cls = o.kind === "roll" ? (o.won ? "pos" : "neg") : "";
      return `<li class="${cls}">${escapeHtml(fn(o, content))}</li>`;
    })
    .filter(Boolean)
    .join("")}</ul>`;
}

// --- Quarter event --------------------------------------------------------

export function eventModal(ctx) {
  const { state, content } = ctx;
  const event = content.events[state.pendingEvent];
  if (!event) return "";
  const resolved = state.eventChoice != null;

  return `
    <div class="modal-wrap" data-key="event-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(event.title)}">
      <div class="modal event-modal">
        <span class="modal-kicker">Q${state.quarter} · ${escapeHtml(state.phase)}</span>
        <h2>${escapeHtml(event.title)}</h2>
        <p class="modal-body">${escapeHtml(event.body)}</p>
        ${
          resolved
            ? `<div class="event-result">
                 <p class="chosen-label">You chose: <b>${escapeHtml(event.choices[state.eventChoice].label)}</b></p>
                 ${outcomeList(state.eventOutcome, content)}
                 <button class="btn primary" data-act="close-event">Carry on</button>
               </div>`
            : `<div class="choices">
                 ${event.choices
                   .map(
                     (c, i) => `
                   <button class="choice" data-key="choice-${i}" data-act="choose-event" data-id="${i}">
                     <span class="choice-label">${escapeHtml(c.label)}</span>
                     ${c.effects.roll ? `<span class="chip warn">${Math.round(c.effects.roll.chance * 100)}% it works</span>` : ""}
                   </button>`
                   )
                   .join("")}
               </div>
               <button class="btn ghost small" data-act="defer-event">Look around first</button>`
        }
      </div>
    </div>`;
}

// --- Launch report --------------------------------------------------------

export function launchReport(ctx) {
  const { report, content } = ctx;
  if (!report) return "";
  const r = report.result;
  const income = r.revenue + r.wirePaid;

  return `
    <div class="modal-wrap report-wrap" data-key="launch-report" role="dialog" aria-modal="true">
      <div class="modal report">
        <span class="modal-kicker">Launch report</span>
        <h2>${escapeHtml(r.name)}</h2>

        <div class="report-figures">
          <div class="fig">
            <span class="fig-label">Industry score</span>
            <span class="fig-value" data-roll="${r.score}">${r.score}</span>
          </div>
          <div class="fig">
            <span class="fig-label">Copies sold</span>
            <span class="fig-value" data-roll="${r.copies}">${count(r.copies)}</span>
          </div>
          <div class="fig">
            <span class="fig-label">You receive</span>
            <span class="fig-value ${income >= 0 ? "pos" : "neg"}">${money(income)}</span>
          </div>
        </div>

        ${
          r.synergies.length
            ? `<div class="banner-list">
                ${r.synergies
                  .map(
                    (s) => `<div class="banner synergy" data-key="bs-${s.id}">
                      <span class="banner-kind">SYNERGY</span>
                      <span class="banner-name">${escapeHtml(s.name)}</span>
                      <p>${escapeHtml(s.line)}</p>
                    </div>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        ${
          r.conflicts.length
            ? `<div class="banner-list">
                ${r.conflicts
                  .map(
                    (s) => `<div class="banner conflict" data-key="bc-${s.id}">
                      <span class="banner-kind">CONFLICT</span>
                      <span class="banner-name">${escapeHtml(s.name)}</span>
                      <p>${escapeHtml(s.line)}</p>
                    </div>`
                  )
                  .join("")}
              </div>`
            : ""
        }

        ${
          report.backlash
            ? `<div class="banner backlash" data-key="backlash">
                <span class="banner-kind">${report.backlash.absorbed ? "ABSORBED" : "BACKLASH"}</span>
                <span class="banner-name">${escapeHtml(report.backlash.entry.name)}</span>
                <p>${escapeHtml(
                  report.backlash.absorbed
                    ? "Legal earned their retainer. It became a paragraph nobody read."
                    : report.backlash.entry.line
                )}</p>
              </div>`
            : ""
        }

        <table class="calc report-calc">
          <tr><td>Units</td><td>${count(r.copies)} × ${moneyExact(r.price)}</td><td>${money(r.unitsRevenue)}</td></tr>
          ${r.inGameRevenue ? `<tr><td>In-game</td><td>storefront</td><td>${money(r.inGameRevenue)}</td></tr>` : ""}
          <tr><td>Your share</td><td>${Math.round(r.revShare * 100)}%</td><td>${money(r.revenue)}</td></tr>
          ${
            r.wire
              ? `<tr class="${r.wirePaid ? "" : "voided"}">
                   <td>Investor wire</td>
                   <td>${r.quotaMet ? `score ${r.score} ≥ quota ${r.quota}` : `score ${r.score} &lt; quota ${r.quota}`}</td>
                   <td>${r.wirePaid ? money(r.wirePaid) : `<s>${money(r.wire)}</s> VOIDED`}</td>
                 </tr>`
              : ""
          }
          ${r.emptySlots ? `<tr><td>Unfinished</td><td>${r.emptySlots} empty slot${r.emptySlots > 1 ? "s" : ""}</td><td class="neg">it showed</td></tr>` : ""}
          ${r.jank >= 30 ? `<tr><td>Jank</td><td>${r.jank}</td><td class="neg">refunds</td></tr>` : ""}
        </table>

        ${outcomeList(report.outcomes, content)}
        <button class="btn primary" data-act="dismiss-report">Continue</button>
      </div>
    </div>`;
}

// --- Crash ----------------------------------------------------------------

export function crashModal(ctx) {
  const { state } = ctx;
  const r = state.lastLaunch || {};
  const layoffs = state.chirps.filter((c) => c.key === "layoff");
  const severance = state.crashSeverance || 0;

  return `
    <div class="modal-wrap crash-wrap" data-key="crash" role="dialog" aria-modal="true">
      <div class="modal crash">
        <span class="modal-kicker">The board has left the building</span>
        <h2>${escapeHtml(r.name || "The flagship")}</h2>
        <div class="report-figures">
          <div class="fig"><span class="fig-label">Industry score</span><span class="fig-value">${r.score ?? "—"}</span></div>
          <div class="fig"><span class="fig-label">Copies sold</span><span class="fig-value">${count(r.copies || 0)}</span></div>
          <div class="fig voided"><span class="fig-label">Investor wire</span><span class="fig-value"><s>${money(r.wire || 0)}</s></span><span class="fig-note">VOIDED</span></div>
        </div>
        <p class="modal-body">We're pivoting our portfolio toward authentic voices at other studios.</p>
        ${severance ? `<p class="warn-line">Severance paid: ${moneyExact(severance)}.</p>` : `<p class="hint">Nobody left to pay off. You saw it coming.</p>`}
        <div class="feed compact">
          ${layoffs
            .slice(0, 8)
            .map(
              (c, i) => `<article class="chirp" data-key="lay-${i}">
                <div class="chirp-head"><span class="chirp-who">${escapeHtml(c.who)}</span></div>
                <p class="chirp-text">${escapeHtml(c.text)}</p>
              </article>`
            )
            .join("")}
        </div>
        <p class="stat-line ${state.cash < 0 ? "neg" : ""}">Cash now ${moneyExact(state.cash)}</p>
        <button class="btn primary" data-act="leave-crash">Go to the garage</button>
      </div>
    </div>`;
}

// --- Acquisition ----------------------------------------------------------

export function acquisitionModal(ctx) {
  const { state } = ctx;
  return `
    <div class="modal-wrap" data-key="acquisition" role="dialog" aria-modal="true">
      <div class="modal acquisition">
        <span class="modal-kicker">An offer</span>
        <h2>They want to buy the company</h2>
        <p class="modal-body">
          A holding company you have heard of, and one you have not, would like the studio, the
          catalogue, the mascot and the team. The number is real, the term sheet is short, and
          the person delivering it keeps calling your last game "the property."
        </p>
        <div class="offer-figure">${moneyExact(state.acquisitionOffer || 0)}</div>
        <p class="hint">
          Take it and the run ends here, richer than you will ever be otherwise.
          Refuse and you keep the building, the team, and one more title to prove a point.
        </p>
        <div class="choices">
          <button class="choice" data-act="acquisition" data-id="accept">
            <span class="choice-label">Sign it. It's the money, baby.</span>
          </button>
          <button class="choice" data-act="acquisition" data-id="refuse">
            <span class="choice-label">No. Ship one more.</span>
            <span class="chip good">+25 trust · +20 morale</span>
          </button>
        </div>
      </div>
    </div>`;
}

// --- Ending ---------------------------------------------------------------

export function endingModal(ctx) {
  const { state, content } = ctx;
  const ending = state.ending || content.endings[content.endings.length - 1];
  const rank = state.rank;
  const shipped = state.titles.filter((t) => t.result);

  return `
    <div class="modal-wrap ending-wrap" data-key="ending" role="dialog" aria-modal="true">
      <video class="ending-sting" autoplay muted loop playsinline
             src="${asset("/assets/video/sting-finale.mp4")}" onerror="this.remove()"></video>
      <div class="modal ending">
        <img class="ending-art" src="${asset(`/assets/endings/${ending.art}.jpg`)}" alt=""
             onerror="this.remove()" />
        <span class="modal-kicker">${escapeHtml(ending.name)}</span>
        <p class="ending-line">${escapeHtml(ending.line)}</p>
        <div class="punch">${escapeHtml(ending.punch)}</div>
        <p class="modal-body">${escapeHtml(ending.body)}</p>

        <div class="ending-figure">
          <span class="ef-cash">${moneyExact(state.cash)}</span>
          <span class="ef-rank">${escapeHtml(rank?.name || "")}</span>
          <span class="ef-note">${escapeHtml(rank?.note || "")}</span>
        </div>

        <table class="ledger ending-catalogue">
          <thead><tr><th>Title</th><th>Score</th><th>Copies</th></tr></thead>
          <tbody>
            ${shipped
              .map(
                (t) => `<tr data-key="end-${t.index}">
                  <td>${escapeHtml(t.name)}</td><td>${t.result.score}</td><td>${count(t.result.copies)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>

        <div class="ending-stats">
          <span>${state.stats.titlesShipped} titles</span>
          <span>${count(state.stats.copiesLifetime)} copies</span>
          <span>${state.stats.crunches} crunches</span>
          <span>${state.stats.synergiesFired} synergies</span>
          <span>${state.stats.backlashes} backlashes</span>
          <span>Seed <code>${escapeHtml(state.seed)}</code></span>
        </div>

        ${
          state.newAchievements?.length
            ? `<div class="ach-row">${state.newAchievements
                .map((id) => {
                  const a = content.achievements[id];
                  return a ? `<span class="ach" data-key="ach-${id}">${a.icon} ${escapeHtml(a.name)}</span>` : "";
                })
                .join("")}</div>`
            : ""
        }

        <div class="modal-actions">
          <button class="btn primary" data-act="to-menu">Title screen</button>
          <button class="btn ghost" data-act="share-run">Copy run summary</button>
        </div>
      </div>
    </div>`;
}

export function gameOverModal(ctx) {
  const { state } = ctx;
  const secondFiling = state.gameOverCause === "second-filing";
  return `
    <div class="modal-wrap ending-wrap" data-key="gameover" role="dialog" aria-modal="true">
      <div class="modal ending">
        <span class="modal-kicker">${secondFiling ? "Wound up" : "Liquidated"}</span>
        <h2>${secondFiling ? "They don't extend that courtesy twice" : "The chairs went at auction"}</h2>
        <p class="modal-body">
          ${
            secondFiling
              ? `The second filing was the last one. The administrators were polite and very fast, and
                 ${escapeHtml(currentTitle(state)?.name || "the current project")} is a folder on a drive
                 in a box in a building that is not yours.`
              : `The debt got past the point where anybody would take the call. Somebody bought the mascot
                 plush mould for four hundred dollars and you hope they do something kind with it.
                 ${escapeHtml(currentTitle(state)?.name || "The current project")} was never finished.`
          }
        </p>
        <div class="ending-figure">
          <span class="ef-cash neg">${moneyExact(state.cash)}</span>
          <span class="ef-rank">${escapeHtml(state.rank?.name || "")}</span>
          <span class="ef-note">${escapeHtml(state.rank?.note || "")}</span>
        </div>
        <div class="ending-stats">
          <span>Q${state.quarter}</span>
          <span>${state.stats.titlesShipped} titles shipped</span>
          <span>${count(state.stats.copiesLifetime)} copies</span>
          <span>Seed <code>${escapeHtml(state.seed)}</code></span>
        </div>
        <div class="modal-actions">
          <button class="btn primary" data-act="to-menu">Title screen</button>
          <button class="btn ghost" data-act="share-run">Copy run summary</button>
        </div>
      </div>
    </div>`;
}

// --- Act transition -------------------------------------------------------

export function actCard(act) {
  const copy = {
    2: {
      roman: "II",
      name: "The Garage",
      line: "Three years of investor money, and the fridge has a ketchup packet in it.",
      sting: "sting-crash",
    },
    3: {
      roman: "III",
      name: "The Empire",
      line: "You are the one holding the chequebook now. It suits you, which is the problem.",
      sting: "sting-rise",
    },
  }[act];
  if (!copy) return "";
  return `
    <div class="act-card" data-key="act-card" data-act="skip-act-card" role="button"
         tabindex="0" aria-label="Skip">
      <video class="act-sting" autoplay muted playsinline
             src="${asset(`/assets/video/${copy.sting}.mp4`)}"
             onerror="this.remove()"></video>
      <div class="act-copy">
        <span class="act-roman">${copy.roman}</span>
        <h2>${escapeHtml(copy.name)}</h2>
        <p>${escapeHtml(copy.line)}</p>
      </div>
      <span class="act-skip">Click to skip</span>
    </div>`;
}

export { outcomeList };
