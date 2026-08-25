import { escapeHtml } from "../render.js";
import { money, moneyExact, signed } from "../format.js";
import { currentTitle } from "../../sim/state.js";
import { canPlaceCard, crunchCost, projectedEmpties } from "../../sim/economy.js";
import { catalogFor } from "../../sim/content.js";
import { offeredConcepts } from "../../sim/quarter.js";
import { dealOffersFor, dealTerms, marketingChannelsFor, maxMarketingSpend } from "../../sim/actions.js";
import { pointsInfo } from "../preview.js";

const AXES = [
  { k: "pc", label: "PC" },
  { k: "fun", label: "FUN" },
  { k: "gore", label: "GORE" },
  { k: "ordinary", label: "ORD" },
];

function axisChips(f) {
  return AXES.filter((a) => f[a.k])
    .map(
      (a) =>
        `<span class="chip axis-${a.k} ${f[a.k] < 0 ? "neg" : ""}">${a.label} ${signed(f[a.k])}</span>`
    )
    .join("");
}

function metaChips(f) {
  const bits = [];
  if (f.jank) bits.push(`<span class="chip ${f.jank > 0 ? "jank" : "good"}">Jank ${signed(f.jank)}</span>`);
  if (f.hype) bits.push(`<span class="chip hype">Hype ${signed(f.hype)}</span>`);
  if (f.money) bits.push(`<span class="chip money">Revenue +${Math.round(f.money * 100)}%</span>`);
  return bits.join("");
}

// --- PITCH ----------------------------------------------------------------

function pitchPanel(ctx) {
  const { state, content } = ctx;
  const title = currentTitle(state);
  const concepts = offeredConcepts(state, content);
  const deals = dealOffersFor(state, content);

  return `
    <h2>Pitch</h2>
    <p class="lede">Three things are on the table. Pick one, then decide whose money builds it.</p>

    <section class="stack">
      <h3 class="section-h">The concept</h3>
      <div class="concept-grid">
        ${concepts
          .map((c) => {
            const chosen = title.conceptId === c.id;
            const locked = !!title.conceptId && !chosen;
            return `
            <button class="concept ${chosen ? "chosen" : ""}" data-key="concept-${c.id}"
                    data-act="choose-concept" data-id="${c.id}" ${locked ? "disabled" : ""}>
              <div class="concept-head">
                <span class="concept-name">${escapeHtml(c.name)}</span>
                <span class="concept-genre">${escapeHtml(c.genre)}</span>
              </div>
              <p class="concept-pitch">${escapeHtml(c.pitch)}</p>
              <div class="concept-stats">
                <span><b>${c.slots}</b> slots</span>
                <span><b>${c.price ? money(c.price) : "Free"}</b> ${c.price ? "each" : "to enter"}</span>
                <span>Budget <b>${money(c.budget)}</b></span>
                ${c.sequelTo ? `<span class="chip good">Sequel</span>` : ""}
              </div>
              <p class="concept-hook">${escapeHtml(c.hook)}</p>
            </button>`;
          })
          .join("")}
      </div>
    </section>

    ${
      title.conceptId
        ? `
    <section class="stack">
      <h3 class="section-h">The money</h3>
      <p class="hint">${escapeHtml(title.name)} costs <b>${moneyExact(title.budget)}</b> to build,
         drawn down over the three quarters of production. Whatever the deal advances, you get now.</p>
      <div class="deal-list">
        ${deals
          .map((d) => {
            const chosen = title.deal?.id === d.id;
            const locked = !!title.deal && !chosen;
            // The signed card shows the contract you signed, not what the same
            // deal would cost today. `quotaEscalation()` counts every investor
            // deal in the run including this one, so re-deriving terms after
            // signing ticked the quota up by a step the moment you committed —
            // the card disagreed with the boardroom and with the sim.
            const terms = chosen ? title.deal : dealTerms(state, content, d);
            const net = terms.netNow;
            return `
            <button class="deal ${chosen ? "chosen" : ""}" data-key="deal-${d.id}"
                    data-act="choose-deal" data-id="${d.id}" ${locked ? "disabled" : ""}>
              <div class="deal-head">
                <span class="deal-name">${escapeHtml(d.name)}</span>
                <span class="deal-net ${net > 0 ? "pos" : ""}">${
                  net > 0
                    ? "+" + moneyExact(net) + " now"
                    : terms.burnPerQuarter
                      ? "Funds " + Math.round((terms.advance / (title.budget || 1)) * 100) + "%"
                      : "Fully funded"
                }</span>
              </div>
              <div class="deal-terms">
                <span>You keep <b>${Math.round(terms.revShare * 100)}%</b></span>
                ${terms.burnPerQuarter
                  ? `<span class="chip warn">Your burn ${money(terms.burnPerQuarter)}/qtr</span>`
                  : `<span class="chip good">No burn</span>`}
                ${terms.quota != null ? `<span class="chip warn">Score quota ${terms.quota}</span>` : ""}
                ${terms.wireMul ? `<span class="chip money">Launch wire ×${terms.wireMul}</span>` : ""}
                ${terms.marketingBudget ? `<span class="chip good">Marketing ${money(terms.marketingBudget)}</span>` : ""}
                ${
                  terms.mandate
                    ? `<span class="chip bad">Mandates ${escapeHtml(
                        content.features[terms.mandate]?.name || terms.mandate
                      )}</span>`
                    : ""
                }
              </div>
              <p class="deal-body">${escapeHtml(d.body)}</p>
            </button>`;
          })
          .join("")}
      </div>
    </section>`
        : ""
    }`;
}

// --- PRODUCTION -----------------------------------------------------------

function productionPanel(ctx) {
  const { state, content, projection } = ctx;
  const title = currentTitle(state);
  const pts = pointsInfo(state, content);
  const catalog = catalogFor(content, title.act, state.unlockedCards || []);
  const cost = crunchCost(state, content);
  const empties = projectedEmpties(state, content);
  const slots = Array.from({ length: title.slots }, (_, i) => title.cards[i] || null);

  const filter = ctx.ui.cardFilter || "all";
  const tags = ["all", ...new Set(catalog.flatMap((f) => f.tags))];
  const shown = catalog
    .filter((f) => filter === "all" || f.tags.includes(filter))
    .sort((a, b) => (a.cost || 1) - (b.cost || 1) || a.name.localeCompare(b.name));

  return `
    <h2>${escapeHtml(title.name)}</h2>
    <p class="lede">${escapeHtml(content.concepts[title.conceptId]?.pitch || "")}</p>

    <div class="board-status">
      <div class="status-cell ${pts.left < 0 ? "bad" : ""}">
        <span class="sc-label">Dev points</span>
        <span class="sc-value">${pts.spent}<span class="sc-of">/${pts.total}</span></span>
      </div>
      <div class="status-cell ${empties > 0 ? "warn" : ""}">
        <span class="sc-label">Slots filled</span>
        <span class="sc-value">${title.cards.length}<span class="sc-of">/${title.slots}</span></span>
      </div>
      <div class="status-cell ${projection?.jank >= 40 ? "bad" : ""}">
        <span class="sc-label">Jank</span>
        <span class="sc-value">${projection?.jank ?? 0}</span>
      </div>
      <div class="status-cell">
        <span class="sc-label">Hype</span>
        <span class="sc-value">${projection?.hype ?? 0}</span>
      </div>
    </div>

    ${
      empties > 0
        ? `<p class="warn-line">${empties} slot${empties > 1 ? "s" : ""} will ship empty
           — that's +${empties * 11} jank, ${empties * 3} industry score and a chunk of trust.
           You can ship it anyway. People do.</p>`
        : ""
    }

    <div class="slots" data-key="slots">
      ${slots
        .map((id, i) => {
          if (!id) {
            return `<div class="slot empty" data-key="slot-${i}"><span class="slot-num">${i + 1}</span><span class="slot-hint">empty</span></div>`;
          }
          const f = content.features[id];
          const injected = title.injected?.some((x) => x.featureId === id);
          return `
          <div class="slot filled ${injected ? "injected" : ""}" data-key="slot-${i}"
               draggable="true" data-act="drag-slot" data-id="${id}">
            <span class="slot-num">${i + 1}</span>
            <span class="slot-name">${escapeHtml(f?.name || id)}</span>
            <span class="slot-axes">${axisChips(f || {})}</span>
            <button class="slot-x" data-act="remove-card" data-id="${id}" aria-label="Remove ${escapeHtml(f?.name || id)}">×</button>
          </div>`;
        })
        .join("")}
    </div>

    <div class="board-actions">
      <button class="btn" data-act="crunch" title="Buy a dev point with everybody's weekend.">
        Crunch <span class="btn-sub">+1 point · ${cost === 0 ? "free" : money(cost)} · +12 jank · −13 morale</span>
      </button>
      <button class="btn ghost" data-act="polish" ${pts.left < 1 ? "disabled" : ""}
              title="Spend a dev point removing bugs instead of adding features.">
        Polish <span class="btn-sub">−1 point · −18 jank</span>
      </button>
    </div>

    ${synergyPreview(ctx)}

    <section class="stack">
      <div class="catalog-head">
        <h3 class="section-h">Feature catalog</h3>
        <div class="filters" data-key="filters">
          ${tags
            .map(
              (t) =>
                `<button class="filter ${filter === t ? "on" : ""}" data-act="filter-cards" data-id="${t}">${escapeHtml(t)}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="cards" data-scroll="catalog">
        ${shown
          .map((f) => {
            const on = title.cards.includes(f.id);
            const check = canPlaceCard(state, content, f.id);
            const why = {
              slots: "No slots left",
              points: "Not enough dev points",
              duplicate: "Already in the box",
              catalog: "Not available this act",
              locked: "Box is locked",
              phase: "Not in production",
            }[check.reason];
            return `
            <button class="card ${on ? "on" : ""} ${!check.ok && !on ? "unavailable" : ""}"
                    data-key="card-${f.id}"
                    data-act="${on ? "remove-card" : "place-card"}" data-id="${f.id}"
                    data-hover="${f.id}"
                    ${!check.ok && !on ? "aria-disabled=\"true\"" : ""}
                    title="${escapeHtml(!check.ok && !on ? why || "" : f.blurb)}">
              <div class="card-top">
                <span class="card-name">${escapeHtml(f.name)}</span>
                <span class="card-cost" title="Dev point cost">${f.cost || 1}</span>
              </div>
              <div class="card-chips">${axisChips(f)}${metaChips(f)}</div>
              <p class="card-blurb">${escapeHtml(f.blurb)}</p>
              <p class="card-body">${escapeHtml(f.body)}</p>
              <div class="card-tags">${f.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
              ${on ? `<span class="card-state">In the box</span>` : ""}
              ${!check.ok && !on && why ? `<span class="card-state bad">${why}</span>` : ""}
            </button>`;
          })
          .join("")}
      </div>
    </section>`;
}

function synergyPreview(ctx) {
  const { projection, state, content } = ctx;
  if (!projection) return "";
  const revealed = state.studio.upgrades.some((id) => content.upgrades[id]?.revealsSynergies);
  const all = [...projection.synergies, ...projection.conflicts];
  if (!all.length) {
    return `<p class="hint synergy-hint">${
      revealed
        ? "Playtest lab: no combinations firing in this box yet."
        : "Some cards combine. Build a Playtest Lab and you'll see which ones before you ship."
    }</p>`;
  }
  return `
    <div class="synergy-list" data-key="synergies">
      ${all
        .map(
          (r) => `
        <div class="synergy ${r.kind}" data-key="syn-${r.id}">
          <span class="syn-kind">${r.kind === "synergy" ? "SYNERGY" : "CONFLICT"}</span>
          <span class="syn-name">${escapeHtml(r.name)}</span>
          <p class="syn-line">${escapeHtml(r.line)}</p>
        </div>`
        )
        .join("")}
    </div>`;
}

// --- LAUNCH ---------------------------------------------------------------

function launchPanel(ctx) {
  const { state, content } = ctx;
  const title = currentTitle(state);
  const channels = marketingChannelsFor(state, content);
  const maxSpend = maxMarketingSpend(state);
  const budget = title.marketing.budget || 0;
  const spend = title.marketing.spend ?? Math.min(budget, maxSpend);
  const chosen = title.marketing.channel;
  const hasDept = state.studio.upgrades.some((id) => content.upgrades[id]?.unlocksMarketing);

  return `
    <h2>Launch — ${escapeHtml(title.name)}</h2>
    <p class="lede">The box is locked. What's left is how loudly you say it exists.</p>

    ${
      budget
        ? `<p class="hint">Your publisher put <b>${moneyExact(budget)}</b> behind this. Spending beyond that comes out of cash.</p>`
        : ""
    }
    ${
      !hasDept
        ? `<p class="hint">Only word of mouth is available until you buy a <b>Marketing Department</b> in Studio Ops.</p>`
        : ""
    }

    <section class="stack">
      <h3 class="section-h">Campaign</h3>
      <div class="channel-list">
        ${channels
          .map((c) => {
            const on = chosen === c.id;
            return `
            <button class="channel ${on ? "chosen" : ""}" data-key="ch-${c.id}"
                    data-act="choose-channel" data-id="${c.id}">
              <div class="channel-head">
                <span class="channel-name">${escapeHtml(c.name)}</span>
                ${c.free ? `<span class="chip good">Free</span>` : ""}
              </div>
              <div class="channel-chips">
                ${c.hypeMul ? `<span class="chip hype">Hype ×${c.hypeMul}</span>` : ""}
                ${c.standing ? `<span class="chip ${c.standing > 0 ? "good" : "bad"}">Standing ${signed(c.standing)}</span>` : ""}
                ${c.trust ? `<span class="chip ${c.trust > 0 ? "good" : "bad"}">Trust ${signed(c.trust)}</span>` : ""}
                ${c.heat ? `<span class="chip ${c.heat > 0 ? "bad" : "good"}">Heat ${signed(c.heat)}</span>` : ""}
                ${c.scoreAdd ? `<span class="chip good">Score ${signed(c.scoreAdd)}</span>` : ""}
                ${c.risk ? `<span class="chip warn">${Math.round(c.risk.chance * 100)}% risk</span>` : ""}
              </div>
              <p class="channel-body">${escapeHtml(c.body)}</p>
              ${c.risk ? `<p class="channel-risk"><b>${escapeHtml(c.risk.name)}:</b> ${escapeHtml(c.risk.line)}</p>` : ""}
            </button>`;
          })
          .join("")}
      </div>
    </section>

    ${
      chosen && !content.channels[chosen]?.free
        ? `
    <section class="stack">
      <h3 class="section-h">Spend</h3>
      <div class="spend-row">
        <input type="range" data-act="set-spend" min="0" max="${maxSpend}" step="5000"
               value="${spend}" aria-label="Marketing spend" />
        <output class="spend-value">${moneyExact(spend)}</output>
      </div>
      <p class="hint">
        ${spend > budget
          ? `${moneyExact(spend - budget)} of this comes out of your own cash.`
          : "Covered by the publisher's budget."}
      </p>
    </section>`
        : ""
    }

    ${
      state.flags.penthouseUnlocked && !title.dunked
        ? `<button class="btn ghost" data-act="dunk">Dunk on the haters <span class="btn-sub">+5 score · −10% copies · +18 heat</span></button>`
        : ""
    }`;
}

export function projectPanel(ctx) {
  const { state } = ctx;
  if (state.phase === "pitch") return pitchPanel(ctx);
  if (state.phase === "production") return productionPanel(ctx);
  return launchPanel(ctx);
}

export { axisChips, metaChips };