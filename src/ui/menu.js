import { escapeHtml } from "./render.js";
import { asset } from "./assets.js";
import { money } from "./format.js";
import { DIFFICULTIES } from "../sim/balance.js";
import { loadMeta } from "../sim/meta.js";
import { savePreview } from "../sim/save.js";
import { VERSION } from "../version.js";

export function menuView(ctx) {
  const { content, ui } = ctx;
  const meta = loadMeta();
  const save = savePreview();
  const tab = ui.menuTab || "start";

  return `
    <div class="menu" data-key="menu">
      <div class="menu-hero">
        <img class="menu-logo" src="${asset("/assets/logo.png")}" alt="Big Baby Company"
             onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'logo-fallback big',textContent:'BB'}))" />
        <h1>BIG BABY COMPANY</h1>
        <p class="tagline">
          Own a politically fashionable games studio. Stuff the box. Cash the wires.
          Survive the crash. It's the money, baby.
        </p>
      </div>

      <nav class="menu-tabs" role="tablist">
        <button class="tab ${tab === "start" ? "on" : ""}" data-act="menu-tab" data-id="start" role="tab">Start</button>
        <button class="tab ${tab === "trophies" ? "on" : ""}" data-act="menu-tab" data-id="trophies" role="tab">Trophy case</button>
        <button class="tab ${tab === "how" ? "on" : ""}" data-act="menu-tab" data-id="how" role="tab">How it works</button>
      </nav>

      <div class="menu-panel">
        ${tab === "start" ? startTab(ctx, meta, save) : ""}
        ${tab === "trophies" ? trophyTab(content, meta) : ""}
        ${tab === "how" ? howTab() : ""}
      </div>
    </div>`;
}

function startTab(ctx, meta, save) {
  const { ui } = ctx;
  const diff = ui.difficulty || "standard";
  const mode = ui.mode || "campaign";

  return `
    ${
      save
        ? `<button class="resume" data-act="continue">
            <span class="resume-label">Continue</span>
            <span class="resume-detail">${escapeHtml(save.titleName)} · Q${save.quarter} · ${money(save.cash)}</span>
            <span class="resume-seed">seed ${escapeHtml(save.seed)}</span>
          </button>`
        : ""
    }

    <section class="opt-group">
      <h3 class="section-h">Difficulty</h3>
      <div class="opt-row">
        ${Object.values(DIFFICULTIES)
          .map(
            (d) => `
          <button class="opt ${diff === d.id ? "on" : ""}" data-act="set-difficulty" data-id="${d.id}">
            <span class="opt-name">${escapeHtml(d.name)}</span>
            <span class="opt-detail">${money(d.startCash)} start · ${Math.round(d.interest * 100)}% interest</span>
            <span class="opt-blurb">${escapeHtml(d.blurb)}</span>
          </button>`
          )
          .join("")}
      </div>
    </section>

    <section class="opt-group">
      <h3 class="section-h">Mode</h3>
      <div class="opt-row">
        <button class="opt ${mode === "campaign" ? "on" : ""}" data-act="set-mode" data-id="campaign">
          <span class="opt-name">Campaign</span>
          <span class="opt-detail">24 quarters · 8 titles · 3 acts</span>
          <span class="opt-blurb">The full six years, the crash, the offer, and an ending that depends on what you did.</span>
        </button>
        <button class="opt ${mode === "endless" ? "on" : ""} ${meta.endlessUnlocked ? "" : "locked"}"
                data-act="set-mode" data-id="endless" ${meta.endlessUnlocked ? "" : "aria-disabled=\"true\""}>
          <span class="opt-name">Endless${meta.endlessUnlocked ? "" : " 🔒"}</span>
          <span class="opt-detail">${meta.endlessUnlocked ? `Best: ${meta.endlessBest || 0} quarters` : "Finish a campaign to unlock"}</span>
          <span class="opt-blurb">Escalating quotas, rising interest, no ending. It stops when you do.</span>
        </button>
      </div>
    </section>

    <section class="opt-group">
      <h3 class="section-h">Seed</h3>
      <div class="seed-row">
        <input class="seed-input" type="text" id="run-seed" name="run-seed"
               data-act="set-seed" value="${escapeHtml(ui.seed || "")}"
               placeholder="leave blank for random" aria-label="Run seed" />
        <button class="btn ghost small" data-act="reroll-seed">Reroll</button>
      </div>
      <p class="hint">Same seed, same difficulty, same events and dice. Share it and compare runs.</p>
    </section>

    <button class="btn primary big" data-act="new-game">
      ${save ? "New run" : "Start the studio"}
    </button>
    ${save ? `<p class="hint">Starting a new run overwrites the save.</p>` : ""}`;
}

function trophyTab(content, meta) {
  const earned = new Set(meta.achievements);
  const list = content.achievementsList;
  const shownEndings = content.endings.filter((e) => meta.endingsSeen.includes(e.id));

  return `
    <div class="board-status">
      <div class="status-cell"><span class="sc-label">Achievements</span><span class="sc-value">${earned.size}<span class="sc-of">/${list.length}</span></span></div>
      <div class="status-cell"><span class="sc-label">Runs finished</span><span class="sc-value">${meta.runsCompleted}</span></div>
      <div class="status-cell"><span class="sc-label">Best cash</span><span class="sc-value">${money(meta.bestCash)}</span></div>
      <div class="status-cell"><span class="sc-label">Endings seen</span><span class="sc-value">${meta.endingsSeen.length}<span class="sc-of">/${content.endings.length}</span></span></div>
    </div>

    ${
      meta.unlockedCards.length
        ? `<section class="stack">
            <h3 class="section-h">Unlocked cards</h3>
            <div class="owned-list">
              ${meta.unlockedCards
                .map((id) => `<span class="chip good">${escapeHtml(content.features[id]?.name || id)}</span>`)
                .join("")}
            </div>
          </section>`
        : ""
    }

    ${
      shownEndings.length
        ? `<section class="stack">
            <h3 class="section-h">Endings reached</h3>
            <div class="owned-list">
              ${shownEndings.map((e) => `<span class="chip">${escapeHtml(e.name)}</span>`).join("")}
            </div>
          </section>`
        : ""
    }

    <section class="stack">
      <h3 class="section-h">Achievements</h3>
      <div class="ach-grid">
        ${list
          .map((a) => {
            const got = earned.has(a.id);
            const hide = a.hidden && !got;
            return `<div class="ach-card ${got ? "got" : ""}" data-key="ach-${a.id}">
              <span class="ach-icon">${hide ? "?" : a.icon}</span>
              <span class="ach-name">${hide ? "Hidden" : escapeHtml(a.name)}</span>
              <span class="ach-desc">${hide ? "Keep playing." : escapeHtml(a.desc)}</span>
            </div>`;
          })
          .join("")}
      </div>
    </section>

    <button class="btn ghost small" data-act="reset-meta">Reset all progress</button>`;
}

function howTab() {
  return `
    <div class="how">
      <h3 class="section-h">The loop</h3>
      <p>Every title takes three quarters. <b>Pitch</b> it, <b>build</b> it, <b>launch</b> it, then do it again — eight times, across six years and three acts.</p>

      <h3 class="section-h">The joke, which is also the maths</h3>
      <p><b>PC</b> features raise your <b>industry score</b>, which is what investors pay for — and destroy the number of copies you sell. <b>FUN</b>, <b>GORE</b> and <b>ORDINARY</b> do the exact opposite. In Act I there is investor money. After the crash there is not, and only copies count.</p>

      <h3 class="section-h">The four meters</h3>
      <ul class="how-list">
        <li><b>Standing</b> — what the industry thinks. Buys wires, deals and awards. Decays every quarter.</li>
        <li><b>Trust</b> — what players think. A multiplier on everything you sell. Slow to earn, fast to lose.</li>
        <li><b>Heat</b> — controversy. Free reach, and a dice roll against the backlash table at every launch.</li>
        <li><b>Morale</b> — the team. Let it fall and people quit mid-production, leak, or put things back in the build.</li>
      </ul>

      <h3 class="section-h">Things worth knowing</h3>
      <ul class="how-list">
        <li>Cards combine. Some combinations are <b>synergies</b>, some are <b>conflicts</b>, and a Playtest Lab shows you which before you ship.</li>
        <li><b>Crunch</b> buys a dev point with jank, morale and money. <b>Polish</b> spends a dev point removing jank.</li>
        <li>You can always ship an unfinished box. It just costs you, visibly.</li>
        <li>Cash is not the score. Cash is a thing you turn into capacity in Studio Ops.</li>
        <li>A title's budget burns over three quarters. Whoever's money it is, you still need the working capital.</li>
        <li>Nothing is on a timer. Read everything. It was written to be read.</li>
      </ul>

      <h3 class="section-h">Keys</h3>
      <p class="keys"><kbd>1</kbd>–<kbd>7</kbd> rooms · <kbd>E</kbd> end quarter · <kbd>B</kbd> books · <kbd>M</kbd> mute · <kbd>?</kbd> glossary · <kbd>Space</kbd> show what's clickable · <kbd>Esc</kbd> close</p>
    </div>`;
}

/**
 * The facts an outside bug report is useless without.
 *
 * Seed and difficulty were only ever shown on the ending screens, which is the
 * one moment a tester is *not* filing a bug. A run is reproducible from these
 * five values and from nothing else, so they live behind `?` — always reachable,
 * one button to copy — rather than being something we ask a stranger to
 * reconstruct from memory.
 */
export function runDetails(state) {
  if (!state) return "";
  const diff = DIFFICULTIES[state.difficulty];
  return `
    <h3 class="section-h">This run</h3>
    <dl class="run-details">
      <dt>Seed</dt><dd><code>${escapeHtml(state.seed)}</code></dd>
      <dt>Difficulty</dt><dd>${escapeHtml(diff?.name || state.difficulty)}</dd>
      <dt>Quarter</dt><dd>Q${state.quarter} · act ${state.act} · ${escapeHtml(state.phase)}</dd>
      <dt>Title</dt><dd>${state.stats.titlesShipped} shipped, ${state.titleIndex + 1} in hand</dd>
      <dt>Build</dt><dd><code>v${escapeHtml(VERSION)}</code></dd>
    </dl>
    <p class="hint">
      Found something wrong? Copy these into an issue — without the seed and the
      difficulty nobody can reproduce it.
    </p>
    <button class="btn ghost small" data-act="copy-diagnostics">Copy run details</button>`;
}

export function helpPanel(ctx) {
  return `
    <h2>Glossary</h2>
    ${runDetails(ctx?.state)}
    <dl class="glossary">
      <dt>Industry score</dt><dd>0–100. What the press and the board react to. Driven up by PC content and awards pushes, down by FUN, GORE and jank. It is not a quality measure and the game will never pretend otherwise.</dd>
      <dt>Copies</dt><dd>How many people actually bought it. Driven by FUN, GORE and ORDINARY, multiplied by trust, heat, hype and — downward — by jank.</dd>
      <dt>Dev points</dt><dd>What you can afford to build this quarter. Cards cost 1–3. You get more from acts, desks, producers and crunch.</dd>
      <dt>Slots</dt><dd>How big the box is. Empty slots ship as an unfinished game: jank, lost score, lost trust. Legal, common, and obvious to everyone who plays it.</dd>
      <dt>Jank</dt><dd>Bugs. Comes from crunch, scope, and certain features. Causes refunds and review damage. QA labs and polish reduce it.</dd>
      <dt>Hype</dt><dd>Pre-launch attention. Marketing, heat and certain features build it. It is a copies multiplier and nothing else.</dd>
      <dt>Budget &amp; burn</dt><dd>Every title costs money to build. That cost is drawn down over its three quarters, not taken at signing. A deal's advance pays that burn down first; anything left over is cash in hand immediately. Self-funding means you burn all of it yourself.</dd>
      <dt>The wire</dt><dd>Investor money at launch, paid only under an investor deal, scaled by your score and standing. Miss the quota and it drops to 40%.</dd>
      <dt>Quota</dt><dd>The industry score an investor deal requires. It goes up every time you sign another one. That is the entire trap.</dd>
      <dt>Backlash</dt><dd>A dice roll at launch against your heat. Refunds, delistings, open letters — or, occasionally, it backfires upward and sells more.</dd>
      <dt>Injectors</dt><dd>Staff who put their pet feature into your box whether you asked or not. They raise standing. They are expensive.</dd>
      <dt>Talent</dt><dd>Staff who don't inject anything. They add dev points, cut jank, or add FUN and GORE at lock.</dd>
      <dt>Chapter 11</dt><dd>Fires once if your debt gets deep enough. Wipes upgrades, staff, and a permanent dev point, discharges the debt, and hands creditors a permanent slice of your revenue. The second filing ends the run.</dd>
    </dl>`;
}
