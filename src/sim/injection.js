import { axesOf } from "./content.js";

/**
 * Staff influence applied when the box locks.
 *
 * Injectors push their pet feature into the box. Talent hires don't inject —
 * they contribute `atLock` bonuses (jank reduction, axis auras) instead.
 *
 * Fix over the original build: a staffer whose pet card was already on the
 * board used to silently fill nothing, which let `canEndDesign` pass while
 * leaving a visibly empty slot in the shipped game. Injectors now fall through
 * to a list of backup preferences before giving up and adding aura instead.
 */
export function applyStaffAtLock(title, staffList, content, opts = {}) {
  const next = structuredClone(title);
  next.injected = [];

  // Who was on the payroll when the box closed. Headcount is PC pressure in
  // Act I and drags copies in every act, and some staff carry a monetisation
  // multiplier — all of which used to be read from the *live* roster at launch,
  // three quarters later. Locking with the choir so their injections land and
  // then firing everyone before End Quarter was strictly optimal, and hiring a
  // monetisation specialist on the launch quarter bought his revenue share
  // with no injection risk at all. The box is what it was when you closed it.
  next.staffHeads = staffList.length;
  next.staffMoneyMul = staffList.reduce(
    (n, entry) => n + (content.staff[entry.id]?.moneyMul || 0),
    0
  );

  const sabotage = opts.sabotage || [];

  for (const entry of staffList) {
    const person = content.staff[entry.id];
    if (!person) continue;

    // Talent: no injection, just bonuses.
    if (person.atLock) {
      // Snapshotted separately from `jank`, which is the accumulated reservoir
      // from crunch, events and polish. Mixing them means either a hidden
      // negative buffer or a reduction that gets clamped away to nothing.
      if (person.atLock.jank) {
        next.staffJank = (next.staffJank || 0) + person.atLock.jank;
      }
      if (person.atLock.aura) {
        for (const [k, v] of Object.entries(person.atLock.aura)) {
          next.auras[k] = (next.auras[k] || 0) + v;
        }
      }
      next.injected.push({ staffId: entry.id, action: "contribute" });
      continue;
    }

    if (!person.petFeature) continue;

    const wanted = [person.petFeature, ...(person.petBackups || [])];
    const legal = (id) =>
      !next.cards.includes(id) && content.features[id]?.acts.includes(next.act);

    const doubled = sabotage.includes(entry.id) ? 2 : 1;

    for (let i = 0; i < doubled; i++) {
      const slotFree = next.cards.length < next.slots;
      const choice = wanted.find(legal);

      if (slotFree && choice) {
        next.cards.push(choice);
        next.injected.push({
          staffId: entry.id,
          action: "fill",
          featureId: choice,
          sabotage: i > 0,
        });
        continue;
      }

      // Box is full: overwrite the first FUN-bearing card instead.
      const funIndex = next.cards.findIndex(
        (cid) => (axesOf(content.features[cid] || {}).fun || 0) > 0
      );
      if (funIndex >= 0 && choice) {
        const replaced = next.cards[funIndex];
        next.cards[funIndex] = choice;
        next.injected.push({
          staffId: entry.id,
          action: "overwrite",
          featureId: choice,
          replaced,
          sabotage: i > 0,
        });
        continue;
      }

      // Nothing left to take. Their influence becomes ambient PC.
      next.auras.pc = (next.auras.pc || 0) + 1;
      next.injected.push({ staffId: entry.id, action: "aura", sabotage: i > 0 });
    }

  }

  return next;
}

/** Publisher deals reserve one slot for a mandated feature. */
export function applyMandate(title, content) {
  const mandate = title.deal?.mandate;
  if (!mandate) return title;
  if (title.cards.includes(mandate)) return title;
  // Mandates respect the act the card belongs to, the way staff pets already
  // do. `publisher-standard` runs in all three acts and mandates a card that
  // only exists in Acts I and III, so an Act II garage studio was having a
  // feature injected that is not in its catalogue and cannot be removed.
  if (!content.features[mandate]?.acts?.includes(title.act)) return title;
  const next = structuredClone(title);

  if (next.cards.length < next.slots) {
    next.cards.push(mandate);
  } else {
    const funIndex = next.cards.findIndex(
      (cid) => (axesOf(content.features[cid] || {}).fun || 0) > 0
    );
    const target = funIndex >= 0 ? funIndex : next.cards.length - 1;
    next.mandateReplaced = next.cards[target];
    next.cards[target] = mandate;
  }
  next.mandateApplied = mandate;
  return next;
}
