import { escapeHtml } from "../render.js";
import { count, money, moneyExact, signed } from "../format.js";
import { currentTitle } from "../../sim/state.js";
import { hireOffersFor, upgradeOffersFor } from "../../sim/actions.js";
import { axisChips } from "./project.js";

// --- HR -------------------------------------------------------------------

export function hrPanel(ctx) {
  const { state, content } = ctx;
  const pool = hireOffersFor(state, content);
  const payroll = state.staff.reduce((n, s) => n + s.salary, 0);
  const crashSoon = state.act === 1 && state.titleIndex === 2 && !state.flags.crashed;

  return `
    <h2>People</h2>
    <p class="lede">${
      state.act === 1
        ? "The choir raise your standing and quietly move into your box. The talent just make the game better."
        : "No lanyards down here. Only people who can actually build the thing."
    }</p>

    <div class="board-status">
      <div class="status-cell"><span class="sc-label">Headcount</span><span class="sc-value">${state.staff.length}<span class="sc-of">/${state.studio.staffCap}</span></span></div>
      <div class="status-cell ${payroll > 0 ? "warn" : ""}"><span class="sc-label">Payroll / quarter</span><span class="sc-value">${money(payroll)}</span></div>
      <div class="status-cell ${state.morale <= 35 ? "bad" : ""}"><span class="sc-label">Morale</span><span class="sc-value">${state.morale}</span></div>
    </div>

    ${
      crashSoon
        ? `<p class="warn-line">The flagship ships next. Anyone still on payroll when the board walks gets a full quarter of severance out of your pocket.</p>`
        : ""
    }
    ${
      state.morale <= 30
        ? `<p class="warn-line">Morale is critical. People will start quitting mid-production, leaking to press, or putting things back into the build you removed.</p>`
        : ""
    }

    <div class="staff-list">
      ${pool
        .map((p) => {
          const entry = state.staff.find((s) => s.id === p.id);
          const hired = !!entry;
          const per = p.perQuarter || {};
          const injector = p.traits.includes("injector");
          return `
          <div class="staff ${hired ? "hired" : ""} ${injector ? "injector" : "talent"}" data-key="staff-${p.id}">
            <img src="/assets/portraits/${p.id}.jpg" alt="" width="72" height="72"
                 onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'portrait-fallback',textContent:'${escapeHtml(p.name[0])}'}))" />
            <div class="staff-main">
              <div class="staff-head">
                <span class="staff-name">${escapeHtml(p.name)}</span>
                <span class="staff-role">${escapeHtml(p.role)}</span>
                <span class="chip ${injector ? "bad" : "good"}">${injector ? "Injector" : "Talent"}</span>
              </div>
              <div class="staff-chips">
                <span class="chip">${money(entry?.salary ?? p.salary)}/qtr</span>
                ${p.devPoints ? `<span class="chip ${p.devPoints > 0 ? "good" : "bad"}">Dev points ${signed(p.devPoints)}</span>` : ""}
                ${p.atLock?.jank ? `<span class="chip good">Jank ${signed(p.atLock.jank)} at lock</span>` : ""}
                ${p.atLock?.aura ? Object.entries(p.atLock.aura).map(([k, v]) => `<span class="chip axis-${k}">${k.toUpperCase()} ${signed(v)} at lock</span>`).join("") : ""}
                ${Object.entries(per).map(([k, v]) => `<span class="chip ${v > 0 === (k !== "heat") ? "good" : "bad"}">${k} ${signed(v)}/qtr</span>`).join("")}
                ${p.moneyMul ? `<span class="chip money">Revenue +${Math.round(p.moneyMul * 100)}%</span>` : ""}
                ${p.crunchDiscount ? `<span class="chip good">Crunch −${Math.round(p.crunchDiscount * 100)}%</span>` : ""}
                ${
                  p.petFeature
                    ? `<span class="chip bad">Injects ${escapeHtml(content.features[p.petFeature]?.name || p.petFeature)}</span>`
                    : ""
                }
              </div>
              <p class="staff-blurb">${escapeHtml(p.blurb)}</p>
              <p class="staff-body">${escapeHtml(p.body)}</p>
            </div>
            <div class="staff-actions">
              ${
                hired
                  ? `<button class="btn small ghost" data-act="raise" data-id="${p.id}" title="Half a quarter's salary now, +15% salary forever, big morale bump.">Raise</button>
                     <button class="btn small danger" data-act="fire" data-id="${p.id}">Let go</button>`
                  : `<button class="btn small" data-act="hire" data-id="${p.id}"
                       ${state.staff.length >= state.studio.staffCap ? "disabled" : ""}>Hire</button>`
              }
            </div>
          </div>`;
        })
        .join("")}
    </div>

    <button class="btn ghost" data-act="perk">Buy the team something <span class="btn-sub">−$12k · +10 morale</span></button>`;
}

// --- Store page -----------------------------------------------------------

export function storePanel(ctx) {
  const { state, content, projection } = ctx;
  const title = currentTitle(state);
  if (!title?.conceptId) {
    return `<h2>Store page</h2><p class="lede">Nothing to sell yet. Pitch something first.</p>`;
  }
  const p = projection;
  const blurb = title.cards.map((id) => content.features[id]?.blurb).filter(Boolean).join(" ");
  const kind = p && p.pc >= p.fun + p.gore + p.ordinary ? "pc" : "fun";
  const slot = Math.min(title.index + 1, 8);

  return `
    <h2>Store page</h2>
    <div class="store">
      <div class="store-cover">
        <img src="/assets/covers/${slot}-${kind}.jpg" alt="" width="200" height="267"
             onerror="this.closest('.store-cover').classList.add('no-art');this.remove()" />
        <div class="cover-fallback"><span>${escapeHtml(title.name)}</span></div>
      </div>
      <div class="store-body">
        <h3>${escapeHtml(title.name)}</h3>
        <p class="store-genre">${escapeHtml(title.genre || "")} · ${
          title.price ? moneyExact(title.price) : "Free to play"
        }</p>
        <p class="store-blurb">${escapeHtml(blurb || content.concepts[title.conceptId]?.pitch || "")}</p>

        <div class="store-stats">
          <div class="ss"><span class="ss-label">Industry score</span><span class="ss-value big">${p.score}</span></div>
          <div class="ss"><span class="ss-label">Est. copies</span><span class="ss-value big">${count(p.copies)}</span></div>
          <div class="ss"><span class="ss-label">Unit revenue</span><span class="ss-value">${money(p.unitsRevenue)}</span></div>
          ${p.inGameRevenue ? `<div class="ss"><span class="ss-label">In-game revenue</span><span class="ss-value">${money(p.inGameRevenue)}</span></div>` : ""}
          <div class="ss"><span class="ss-label">Your share</span><span class="ss-value">${Math.round(p.revShare * 100)}%</span></div>
          <div class="ss"><span class="ss-label">You receive</span><span class="ss-value big pos">${money(p.revenue)}</span></div>
          ${
            p.wire
              ? `<div class="ss"><span class="ss-label">Investor wire</span><span class="ss-value big ${p.quotaMet ? "pos" : "neg"}">${money(p.wirePaid)}</span>${
                  !p.quotaMet ? `<span class="ss-note">Quota ${p.quota} missed — reduced</span>` : ""
                }</div>`
              : ""
          }
        </div>

        <details class="breakdown" data-key="breakdown">
          <summary>How that number was reached</summary>
          <table class="calc">
            <tr><td>PC</td><td>${p.pc}</td><td class="calc-note">score up, copies down</td></tr>
            <tr><td>FUN</td><td>${p.fun}</td><td class="calc-note">copies up, score down</td></tr>
            <tr><td>GORE</td><td>${p.gore}</td><td class="calc-note">copies up, score down, heat up</td></tr>
            <tr><td>ORDINARY</td><td>${p.ordinary}</td><td class="calc-note">copies up, quietly</td></tr>
            <tr class="rule"><td>Audience trust</td><td>×${p.multipliers.trustMul.toFixed(2)}</td><td class="calc-note">trust ${state.trust}</td></tr>
            <tr><td>Heat</td><td>×${p.multipliers.heatMul.toFixed(2)}</td><td class="calc-note">heat ${state.heat}</td></tr>
            <tr><td>Hype</td><td>×${p.multipliers.hypeMul.toFixed(2)}</td><td class="calc-note">hype ${p.hype}</td></tr>
            <tr><td>Jank</td><td>×${p.multipliers.jankMul.toFixed(2)}</td><td class="calc-note">jank ${p.jank}</td></tr>
            ${p.multipliers.franchiseMul > 1 ? `<tr><td>Franchise</td><td>×${p.multipliers.franchiseMul.toFixed(2)}</td><td class="calc-note">people know the name</td></tr>` : ""}
            ${p.emptySlots ? `<tr><td>Unfinished</td><td>${p.emptySlots} empty</td><td class="calc-note">it shows</td></tr>` : ""}
          </table>
        </details>

        ${
          p.backlashChance > 0
            ? `<p class="warn-line">Heat is at ${state.heat}. Roughly a ${Math.round(p.backlashChance * 100)}% chance this launch triggers a backlash.</p>`
            : ""
        }

        <div class="reviews">
          ${(title.cards || [])
            .slice(0, 4)
            .map((id) => {
              const f = content.features[id];
              if (!f) return "";
              return `<div class="review" data-key="rev-${id}"><span class="review-tag">${escapeHtml(f.name)}</span> ${axisChips(f)}</div>`;
            })
            .join("")}
        </div>
      </div>
    </div>`;
}

// --- Boardroom ------------------------------------------------------------

export function boardPanel(ctx) {
  const { state, content, projection } = ctx;
  const title = currentTitle(state);
  const deal = title?.deal;
  const investor = deal?.type === "investor";

  const mood =
    state.act === 2
      ? "The chairs are empty. They pivoted toward authentic voices at other studios."
      : projection?.score >= 65
        ? "We love the bravery. We love the headcount. Units are a western metric."
        : projection?.score >= 40
          ? "We'd like to see more conviction in the next one. More… vision."
          : "We're not seeing the authentic voices in this build. Align, or the wire gets shy.";

  return `
    <h2>The boardroom</h2>
    <p class="lede">${escapeHtml(mood)}</p>

    <div class="board-status">
      <div class="status-cell"><span class="sc-label">Lifetime wires</span><span class="sc-value">${money(state.totalWires)}</span></div>
      <div class="status-cell"><span class="sc-label">Last wire</span><span class="sc-value">${money(state.lastWire)}</span></div>
      <div class="status-cell ${state.quotaMisses ? "bad" : ""}"><span class="sc-label">Quotas missed</span><span class="sc-value">${state.quotaMisses}</span></div>
      <div class="status-cell"><span class="sc-label">Standing</span><span class="sc-value">${state.standing}</span></div>
    </div>

    ${
      deal
        ? `<section class="stack">
            <h3 class="section-h">Current deal — ${escapeHtml(deal.name)}</h3>
            <ul class="term-list">
              <li>Advance <b>${moneyExact(deal.advance)}</b> against a <b>${moneyExact(title.budget)}</b> budget</li>
              <li>You keep <b>${Math.round(deal.revShare * 100)}%</b> of revenue</li>
              ${deal.quota != null ? `<li>Wire requires industry score <b>${deal.quota}</b>${projection ? ` — projected <b class="${projection.score >= deal.quota ? "pos" : "neg"}">${projection.score}</b>` : ""}</li>` : ""}
              ${deal.mandate ? `<li>They mandate <b>${escapeHtml(content.features[deal.mandate]?.name || deal.mandate)}</b> in the box</li>` : ""}
            </ul>
            ${
              investor && projection && projection.score < (deal.quota ?? 0)
                ? `<p class="warn-line">You are under the quota. The wire drops to 40% and standing takes a hit.</p>`
                : ""
            }
          </section>`
        : `<p class="hint">No deal signed for this title yet.</p>`
    }

    ${
      state.flags.creditorShare
        ? `<p class="warn-line">Chapter 11 creditors take ${Math.round(state.flags.creditorShare * 100)}% of everything you sell. Permanently.</p>`
        : ""
    }
    ${state.flags.boardSeat ? `<p class="hint">They hold a board seat. Page nine. Boilerplate, apparently.</p>` : ""}
    ${!state.flags.ownsIP ? `<p class="warn-line">You do not own your catalogue. That will matter one day, quite suddenly.</p>` : ""}`;
}

// --- Studio ops -----------------------------------------------------------

export function studioPanel(ctx) {
  const { state, content } = ctx;
  const offers = upgradeOffersFor(state, content);
  const owned = state.studio.upgrades.map((id) => content.upgrades[id]).filter(Boolean);
  const byCat = {};
  for (const u of offers) (byCat[u.category] ||= []).push(u);

  return `
    <h2>Studio operations</h2>
    <p class="lede">Cash is not the score. Cash is a thing you turn into capacity.</p>

    ${
      owned.length
        ? `<section class="stack">
            <h3 class="section-h">Owned</h3>
            <div class="owned-list">
              ${owned.map((u) => `<span class="chip good" data-key="own-${u.id}">${escapeHtml(u.name)}</span>`).join("")}
            </div>
          </section>`
        : ""
    }

    ${Object.entries(byCat)
      .map(
        ([cat, list]) => `
      <section class="stack">
        <h3 class="section-h">${escapeHtml(cat)}</h3>
        <div class="upgrade-list">
          ${list
            .map((u) => {
              const afford = state.cash >= u.cost;
              return `
              <button class="upgrade ${afford ? "" : "unaffordable"}" data-key="up-${u.id}"
                      data-act="buy-upgrade" data-id="${u.id}" ${afford ? "" : "aria-disabled=\"true\""}>
                <div class="upgrade-head">
                  <span class="upgrade-name">${escapeHtml(u.name)}</span>
                  <span class="upgrade-cost ${afford ? "" : "neg"}">${money(u.cost)}</span>
                </div>
                <div class="upgrade-chips">
                  ${u.devPoints ? `<span class="chip good">Dev points ${signed(u.devPoints)}</span>` : ""}
                  ${u.jankMul ? `<span class="chip good">Jank ×${u.jankMul}</span>` : ""}
                  ${u.perTitle?.jank ? `<span class="chip good">Jank ${signed(u.perTitle.jank)}/title</span>` : ""}
                  ${u.perTitle?.hype ? `<span class="chip hype">Hype ${signed(u.perTitle.hype)}/title</span>` : ""}
                  ${Object.entries(u.perQuarter || {}).map(([k, v]) => `<span class="chip ${k === "cash" ? "money" : v > 0 ? "good" : "bad"}">${k === "cash" ? money(v) : `${k} ${signed(v)}`}/qtr</span>`).join("")}
                  ${u.absorbsBacklash ? `<span class="chip good">Absorbs one backlash</span>` : ""}
                  ${u.revealsSynergies ? `<span class="chip good">Reveals synergies</span>` : ""}
                  ${u.unlocksMarketing ? `<span class="chip good">Unlocks campaigns</span>` : ""}
                  ${u.revShareCost ? `<span class="chip bad">−${Math.round(u.revShareCost * 100)}% revenue</span>` : ""}
                </div>
                <p class="upgrade-blurb">${escapeHtml(u.blurb)}</p>
                <p class="upgrade-body">${escapeHtml(u.body)}</p>
              </button>`;
            })
            .join("")}
        </div>
      </section>`
      )
      .join("")}
    <p class="hint">Every upgrade adds to your quarterly operating cost. Growth is never free.</p>`;
}

// --- Books ----------------------------------------------------------------

export function booksPanel(ctx) {
  const { state } = ctx;
  const shipped = state.titles.filter((t) => t.result);
  return `
    <h2>The books</h2>
    <div class="board-status">
      <div class="status-cell ${state.cash < 0 ? "bad" : ""}"><span class="sc-label">Cash</span><span class="sc-value">${moneyExact(state.cash)}</span></div>
      <div class="status-cell"><span class="sc-label">Lifetime revenue</span><span class="sc-value">${money(state.stats.revenueLifetime)}</span></div>
      <div class="status-cell"><span class="sc-label">Copies sold</span><span class="sc-value">${count(state.stats.copiesLifetime)}</span></div>
      <div class="status-cell"><span class="sc-label">Titles shipped</span><span class="sc-value">${state.stats.titlesShipped}</span></div>
    </div>

    ${
      shipped.length
        ? `<section class="stack">
            <h3 class="section-h">Catalogue</h3>
            <table class="ledger">
              <thead><tr><th>Title</th><th>Score</th><th>Copies</th><th>Received</th></tr></thead>
              <tbody>
                ${shipped
                  .map(
                    (t) => `<tr data-key="cat-${t.index}">
                      <td>${escapeHtml(t.name)}</td>
                      <td>${t.result.score}</td>
                      <td>${count(t.result.copies)}</td>
                      <td class="${t.result.revenue + t.result.wirePaid > 0 ? "pos" : ""}">${money(t.result.revenue + t.result.wirePaid)}</td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </section>`
        : ""
    }

    <section class="stack">
      <h3 class="section-h">Recent movements</h3>
      <table class="ledger" data-scroll="ledger">
        <tbody>
          ${state.ledger
            .slice(0, 30)
            .map(
              (l, i) => `<tr data-key="led-${i}-${l.quarter}">
                <td class="led-q">Q${l.quarter}</td>
                <td>${escapeHtml(l.label)}</td>
                <td class="${l.amount >= 0 ? "pos" : "neg"}">${l.amount >= 0 ? "+" : "−"}${moneyExact(Math.abs(l.amount)).replace("−", "")}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>
    ${state.ledger.length === 0 ? `<p class="hint">Nothing has moved yet.</p>` : ""}
`;
}

// --- Penthouse flavour ----------------------------------------------------

export function poolPanel() {
  return `
    <h2>The pool</h2>
    <p class="lede">Body Type 1 floats next to Body Type 2. You are living like the king you are.</p>
    <p class="flavour">None of this was paid for by customers. The water is heated to exactly the temperature at which you stop thinking about the build. Somebody's assistant has left a folded towel and a printout of your industry score on the lounger, face up.</p>`;
}

export function streamPanel(ctx) {
  const { state } = ctx;
  const title = currentTitle(state);
  return `
    <h2>Livestream rig</h2>
    <p class="lede">Ring light, good microphone, a view of the city that reads as credibility.</p>
    <p class="flavour">Manosphere haters are killing gaming. Say it to the ring light. The clip will do numbers, the industry will nod, and roughly ten percent of the people who were going to buy this will quietly not.</p>
    <button class="btn" data-act="dunk" ${title?.dunked ? "disabled" : ""}>
      ${title?.dunked ? "Already dunked this cycle" : "Dunk on the haters"}
      <span class="btn-sub">+5 industry · −10% copies · +18 heat · −4 trust</span>
    </button>`;
}
