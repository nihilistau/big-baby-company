import { clamp100, currentTitle, pushLedger } from "./state.js";
import { FEEDBACK } from "./balance.js";
import { pick, roll } from "./rng.js";

/**
 * The single effect vocabulary used by events, marketing risks, backlash
 * entries and scripted beats. Everything that can change the world goes
 * through here so there is one place to reason about (and to test).
 *
 * Returns a list of human-readable outcome lines for the UI to show.
 */
export function applyEffects(state, effects, content, rng, ctx = {}) {
  if (!effects) return [];
  const out = [];

  // A gated roll resolves first and replaces itself with one of two branches.
  if (effects.roll) {
    const won = roll(rng, effects.roll.chance);
    out.push({ kind: "roll", won, chance: effects.roll.chance });
    const branch = won ? effects.roll.success : effects.roll.fail;
    return out.concat(applyEffects(state, branch, content, rng, ctx));
  }

  const title = currentTitle(state);

  if (effects.cash) {
    state.cash += effects.cash;
    pushLedger(state, {
      label: ctx.label || "Event",
      amount: effects.cash,
    });
    out.push({ kind: "cash", amount: effects.cash });
  }

  if (effects.cashPerStaff) {
    let total = 0;
    for (const s of state.staff) total += s.salary * effects.cashPerStaff;
    total = Math.round(total);
    state.cash += total;
    pushLedger(state, { label: ctx.label || "Staff", amount: total });
    out.push({ kind: "cash", amount: total });
  }

  for (const key of ["standing", "trust", "heat", "morale"]) {
    if (effects[key]) {
      const before = state[key];
      // Resists near the ceiling wherever the change comes from. Events are
      // the largest single source of reputation in the game and used to bypass
      // the curve entirely, as did upkeep and marketing — which left launch
      // results as the only thing it governed, about a tenth of the flow.
      const delta = FEEDBACK.resist(key, state[key], effects[key]);
      state[key] = clamp100(state[key] + delta);
      if (state[key] !== before) out.push({ kind: key, delta: state[key] - before });
    }
  }

  if (title) {
    if (effects.aura) {
      for (const [k, v] of Object.entries(effects.aura)) {
        title.auras[k] = (title.auras[k] || 0) + v;
      }
      out.push({ kind: "aura", aura: effects.aura });
    }
    if (effects.jank) {
      title.jank = Math.max(0, (title.jank || 0) + effects.jank);
      out.push({ kind: "jank", delta: effects.jank });
    }
    if (effects.hype) {
      title.hype = Math.max(0, (title.hype || 0) + effects.hype);
      out.push({ kind: "hype", delta: effects.hype });
    }
    if (effects.scoreDelta) {
      title.shipMods.scoreDelta += effects.scoreDelta;
      out.push({ kind: "score", delta: effects.scoreDelta });
    }
    if (effects.copiesMul) {
      title.shipMods.copiesMul *= effects.copiesMul;
      out.push({ kind: "copies", mul: effects.copiesMul });
    }
    if (effects.moneyMul) {
      title.moneyMul = (title.moneyMul ?? 1) * effects.moneyMul;
      out.push({ kind: "money", mul: effects.moneyMul });
    }
    if (effects.priceMul) {
      title.priceMul = (title.priceMul ?? 1) * effects.priceMul;
      out.push({ kind: "price", mul: effects.priceMul });
    }
    if (effects.devPoints) {
      title.bonusPoints = (title.bonusPoints || 0) + effects.devPoints;
      out.push({ kind: "devPoints", delta: effects.devPoints });
    }
    if (effects.removeRandomCard && title.cards.length) {
      const gone = pick(rng, title.cards);
      title.cards = title.cards.filter((id) => id !== gone);
      out.push({ kind: "cardRemoved", featureId: gone });
    }
    if (effects.addCard && !title.cards.includes(effects.addCard)) {
      title.cards.push(effects.addCard);
      out.push({ kind: "cardAdded", featureId: effects.addCard });
    }
  }

  if (effects.crunchDiscount) {
    state.crunchDiscount = true;
    out.push({ kind: "crunchDiscount" });
  }
  if (effects.crunchFree && title && !title.crunchCount) {
    title.crunchCount = (title.crunchCount || 0) + 1;
    state.stats.crunches++;
    out.push({ kind: "crunchFree" });
  }

  if (effects.fireRandomStaff && state.staff.length) {
    const gone = pick(rng, state.staff);
    state.staff = state.staff.filter((s) => s.id !== gone.id);
    state.stats.fires++;
    out.push({ kind: "staffLeft", staffId: gone.id, name: content.staff[gone.id]?.name });
  }

  if (effects.unlockRandomCard) {
    const locked = content.featuresList.filter(
      (f) => f.unlock && !(state.unlockedCards || []).includes(f.id)
    );
    if (locked.length) {
      const got = pick(rng, locked);
      state.unlockedCards = [...(state.unlockedCards || []), got.id];
      out.push({ kind: "cardUnlocked", featureId: got.id, name: got.name });
    }
  }

  if (effects.liveService) {
    state.flags.liveService = true;
    out.push({ kind: "flag", flag: "liveService" });
  }
  if (effects.loseIP) {
    state.flags.ownsIP = false;
    out.push({ kind: "flag", flag: "loseIP" });
  }
  if (effects.boardSeat) {
    state.flags.boardSeat = true;
    out.push({ kind: "flag", flag: "boardSeat" });
  }
  if (effects.founderPaid) {
    state.flags.founderPaid = true;
    out.push({ kind: "flag", flag: "founderPaid" });
  }

  return out;
}

