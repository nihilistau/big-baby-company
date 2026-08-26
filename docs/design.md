# Design Notes

Why it's shaped like this. The decisions, the ones that were wrong first, and
what the balance harness caught.

For *how to play* see the [Gameplay Manual](gameplay.md). For *what the numbers
are* see the [Systems Reference](systems.md). For *how it's built* see
[Architecture](architecture.md).

---

## 1. The premise, as a mechanic

The central joke has to be a system, not a punchline, or it lands once and the
game is over. So:

- **PC** raises industry score and destroys copies.
- **FUN / GORE / ORDINARY** raise copies and destroy industry score.
- **Industry score** is what investors pay for. **Copies** are what customers pay for.
- In **Act I** there is investor money, so the industry score is the number that
  matters and the trap is invisible.
- The **crash** removes investor money permanently. Now only copies count, and
  every point of Audience Trust you burned in Act I is a debt you carry.

That last clause is what turns the joke into a strategy. Without a persistent
audience stat, PC-maxing costs you nothing except a one-off scripted event, and
the "trap" is a cutscene rather than a decision.

**The balance harness enforces this.** `tools/balance-sim.mjs` runs a `pcmax`
bot that never pivots and a `pcthenfun` bot that pivots at the crash. The first
is the worst-performing archetype in the game; the second is the best. If that
ever inverts, the premise has broken and the tool says so.

---

## 2. Why three phases per title

The previous build alternated design and ship quarters, which gave one verb
("place cards") and one binary ("hire or don't"). Three phases give three
distinct decision sets that cannot be collapsed into each other:

| Phase | The decision |
|---|---|
| **Pitch** | What are we making, and whose money is it? Scope, price, revenue share, and a score quota you may not hit. |
| **Production** | What goes in the box, and what does filling it cost in jank, money and morale? |
| **Launch** | How loudly do we say it exists, and what does that cost in trust and heat? |

Each phase has its own failure mode, so a bad run can go wrong in three
different ways rather than one.

---

## 3. The four meters

Four is the ceiling for what a player can hold in their head at once, so each
one has to earn its place by making a different decision hard.

| Meter | The tension it creates |
|---|---|
| **Standing** | Decays every quarter, so you must keep paying the industry rent or lose access to investor money entirely. |
| **Trust** | Slow to earn, fast to lose, multiplies everything. Makes short-term revenue extraction genuinely expensive later. |
| **Heat** | The only push-your-luck axis. High heat is *the most profitable state in the game* right up until the backlash roll. |
| **Morale** | The only meter that can act on its own — quitting, leaking, sabotaging. Makes crunch a decision rather than a purchase. |

Gains resist near the ceiling (`FEEDBACK.resistance`) so no meter can be parked
at 100 and forgotten. Without that, every long run converged on all-four-maxed
by Act III and the second half stopped having decisions in it.

---

## 4. Jank, and why crunch is a gamble

Crunch buys a dev point. If that were the whole transaction it would be a
strictly correct purchase whenever you have the cash. So crunch also adds
**jank**, which:

- multiplies copies down (refunds),
- subtracts from industry score,
- subtracts from trust at launch,
- and feeds **heat**, because a broken launch is a story.

`Polish` is the inverse: spend a dev point to remove jank. That makes the
production phase a real allocation problem — points into features versus points
into the features already there working properly.

**Empty slots are priced, not forbidden.** The original build hard-blocked End
Quarter until the box was full, which produced an unwinnable state whenever the
slot count exceeded available dev points. Shipping unfinished is now legal and
costs jank, score, copies and trust. It is both truer to the subject and better
to play than a disabled button.

---

## 5. Cards

79 cards, each with a stat block, a dev-point cost, jank, hype, tags, and — for
monetisation cards — a per-player revenue rate that is independent of box price.
That last one is why a free-to-enter live-service title can out-earn a $70 one.

**Synergies and conflicts** (36 rules) are what stop the catalog collapsing into
"pick the highest number". A card is worth what it is worth *next to the other
cards*, which is the difference between a list and a deck.

Rules match either an exact card set or a tag count. Tag-count rules
(`{ combat: 3 }`) let broad strategies fire without enumerating every
combination.

A handful of cards are locked behind cross-run achievements, so the catalog
grows as you play.

---

## 6. Staff

Two kinds, and the difference is the whole point:

- **Injectors** raise standing and push their pet feature into your box whether
  you asked or not. They are the Act I trap made of people.
- **Talent** inject nothing. They add dev points, cut jank, or add FUN/GORE at
  lock. They are what you can afford once you stop optimising for the board.

Injection walks a preference list (pet, then backups) and falls through to
overwriting a FUN card, then to ambient PC aura. The original build's version
silently did nothing when the pet card was already on the board, which let the
"can I ship?" gate pass while leaving a visible hole in the game.

---

## 7. Randomness and determinism

Every random draw comes from a **named stream** derived from the run seed:

```js
stream(state, "launch", quarter)   // launch rolls
stream(state, "deck", quarter)     // event draw
stream(state, "lock", quarter)     // morale consequences
```

Adding a die roll to events therefore cannot shift the numbers the launch
pipeline draws. Same seed, same difficulty, same run — which is what makes seeds
shareable and the determinism test meaningful.

The **event deck** filters ~70 events by act, phase and a predicate vocabulary
(`minHeat`, `maxMorale`, `dealType`, `minTitlesShipped`…), then draws by weight
without repeats. Scripted beats — the values pass, the embargo, the empty fridge
— override the draw at fixed quarters so the story spine always lands.

---

## 8. Failure

- **Chapter 11** fires once, at a difficulty-dependent debt threshold. It
  discharges the debt but takes every upgrade, the whole team, a permanent dev
  point, a permanent staff slot, and hands creditors a permanent 14% of revenue.
  Without that last clause, filing at the threshold was *strictly profitable* and
  the balance bots farmed it.
- **The second filing ends the run.**
- **Liquidation** below a hard floor ends it immediately.

Three difficulties tune starting cash, interest, quota escalation and both
thresholds.

---

## 9. Cash flow

A title's budget is drawn down across its three quarters rather than taken as
a lump at signing, and a deal's advance pays that burn down before any surplus
reaches your pocket.

The lump-sum version put the entire outlay three quarters ahead of any revenue.
`tools/ch11-probe.mjs` showed the result plainly: a frugal, competent player
went bankrupt in 75% of runs, spiking hard on the Act III pitch quarters. Under
the drawn-down model the same player files in ~32%, spread evenly across Acts
II and III. Nothing else about the economy changed.

The other half of that fix matters just as much: the advance funds the burn, it
does not stack on top of it. When advances were pure profit the PC archetype
became viable again — free money with no revenue exposure — and the whole
premise inverted. Making advances recoup against the budget put the trap back.

---

## 10. Disclosure

**If the simulation knows it and it would change a decision, the game says it.**

This became a rule after three separate bugs in a row turned out to be a
working mechanic the player could not see: marketing that never reached the
projection it fed, a launch report painted over by the screen behind it, and a
debt curve with no countdown. In each case the arithmetic was fine and the
feedback was missing, which is indistinguishable from a broken game.

A deliberate pass over "what does the sim know that it never tells you" found
the following already disclosed and left them alone:

| Already visible | Where |
|---|---|
| Backlash probability at current heat | Store page |
| Which card an injector will force in, and their lock bonuses | People |
| Deal quota, revenue share, burn, mandate | Pitch |
| Every launch multiplier and its source value | Store page → *How that number was reached* |
| Empty-slot penalty, itemised | Production |
| Which synergies will fire | Playtest Lab upgrade — hidden by design until bought |

And these were not, and now are:

| Was hidden | Why it mattered |
|---|---|
| **Where jank comes from** | The harshest multiplier in the game (×1.00 → ×0.23) surfaced as one opaque integer. Since morale started feeding it, a studio could carry ten points purely because the team was miserable and never know. |
| **The morale thresholds** | Crunch's real cost is the threshold it walks you toward, not the −13. The numbers — 30, 22, 15 — lived in `balance.js` and appeared nowhere a player could read them. |
| **Genre skew on a concept** | 22 of 24 concepts amplify or dampen an axis by up to 30%. The single most consequential decision in the cycle was made blind to half its terms. |
| **The debt curve** | Rate, next quarter's charge, and quarters of runway. See [systems](systems.md). |

Two rules came out of it:

**A breakdown must reconcile with its headline.** The first version of the jank
itemisation showed rows summing to 28 under a total of 72, because the
empty-slot penalty lived in `projectLaunch` and the itemisation lived in
`titleJank`. That is worse than showing nothing. `launchJankBreakdown()` is now
the list `projectLaunch` sums, so the figure and its explanation are the same
arithmetic by construction, and a test asserts it.

**Disclosure is not balance.** Nothing in this pass changed a number. If a
mechanic is unfair, fix the mechanic; if it is fair but invisible, fix the
telling. Conflating the two is how you end up nerfing something that was working.

---

## 11. Where the numbers live

Every tunable constant is in `src/sim/balance.js`. Nothing else in the sim
contains a magic number. That is what makes `tools/balance-sim.mjs` useful: it
can sweep the constants without touching logic, and it asserts health
conditions rather than printing numbers for a human to squint at.

Current health targets:

- Every non-control archetype reaches king baby or better sometimes.
- None reaches emperor or dynasty more than 60% of the time.
- At least five distinct ranks occur across a sweep.
- No single rank absorbs more than half of all runs.
- No run gets stuck (an unreachable `advance`).

---

## 12. UI decisions worth recording

**DOM morphing over re-rendering.** The original build did
`app.innerHTML = ...` on every interaction, so scrolling the card list and
clicking a card reset the list to the top. `src/ui/render.js` walks old and new
trees in parallel and mutates only differences. Keyed nodes only ever match
keyed nodes — allowing a keyed incoming node to match an unkeyed positional
candidate is how a launch modal ends up cannibalising the FX layer, which is a
real bug this codebase had and a regression test now covers.

**Hover ghosting is the tutorial.** Hovering a card runs the real launch
projection against a hypothetical box and ghosts both deltas onto the HUD. The
central inversion is invisible until you watch the two numbers move in opposite
directions, so this does more teaching than any amount of copy.

**Hotspots draw nothing over the art.** The original hub had fully transparent
hotspots — a point-and-click game with no discoverable click targets. Two
attempts to fix that were worse than the problem: numbered gold pins vandalised
the illustration, and an idle shimmer was both invisible in practice and one
more thing competing with the artwork.

What ships is the minimum that works: the region is invisible, hovering pops a
label chip, and **hold Space** pops every label at once. The chip appearing
*is* the confirmation that you are in bounds; nothing else needs drawing.
Reveal state is carried by an inherited custom property (`--hs-reveal`) rather
than a descendant override, so it cannot be lost to a specificity argument.

**The frame is measured, not styled.** Hotspot rectangles are percentages of
`.hub-frame`, so that frame must be exactly the rendered image box on every
window shape or every region silently moves. CSS cannot express "fit this
aspect inside both axes" dependably — `max-width` clamps without re-deriving
height, `max-height` clamps without re-deriving width — so one shape or the
other always squashed the box. `fitHubFrame()` computes it directly from the
image's natural size and a `ResizeObserver` keeps it honest. Ten lines of
JavaScript in exchange for coordinates that are correct everywhere.

The scenes must also all share one aspect ratio, which
`gen-art.mjs --check` now enforces — a scene at a different ratio gets cropped
by `object-fit` and takes its hotspots with it. That was the actual cause of
the regions looking "off": the art is 1.88:1 and the frame was hard-coded 16:9,
quietly cropping 5.5% off the width of every scene.

**The reduced-motion recipe had a trap in it.** The usual
`transition-duration: 0.01ms !important` reset can leave a transition
permanently *pending* when the transitioned value comes from a custom property.
A pending transition outranks even an inline style, so every hotspot frame and
label stayed frozen at `opacity: 0` — invisible, for exactly the users who had
asked for less motion. The block now sets `transition: none !important`.

**Art direction.** Bold-ink MAD-caricature over VGA adventure-game
backgrounds: heavy black outlines, flat cel shading, hard shadow shapes, big
noses. The first pass was painterly oil, which looked handsome and killed the
comedy — the joke lives in the linework. The chrome follows the same rules:
hard offset shadows instead of soft blur, chunky rules, a halftone dot field,
and buttons that physically press.

**Chirper is theatre over authored content.** The posts come from the sim and
are hand-written. Everything around them is presentation: engagement counters
that climb while you watch (reach scaled by *who* is posting, which is the
joke), arrival animations for genuinely new posts, a typing indicator, and
ambient replies drawn from the existing pools on a timer.

Those ambient posts are deliberately UI-only and never written back into the
run. A timer must not be able to change what a save contains.

**The sim never animates.** `advance()` is synchronous and returns events; the
UI decides what to animate. That is why everything is skippable, why the game is
testable without a DOM, and why the balance harness can play 10,000 campaigns in
a few seconds.
