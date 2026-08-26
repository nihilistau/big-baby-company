# Systems Reference

The mechanics, with the actual numbers. Every constant here lives in
[`src/sim/balance.js`](../src/sim/balance.js) — nothing else in the simulation
contains a magic number, which is what lets
[`tools/balance-sim.mjs`](../tools/balance-sim.mjs) sweep them without touching
logic.

---

## 1. The launch pipeline

Everything a title does resolves through `projectLaunch()` in
[`src/sim/economy.js`](../src/sim/economy.js). It is deterministic: the same
box always produces the same projection. The only dice are the backlash roll,
which is deliberately kept outside so previews stay honest.

```
  axis sums (cards + auras + headcount)
        ↓
  synergy detection  →  axis multipliers, score/copies modifiers
        ↓
  industry score  ←  weights · standing tilt · jank penalty · marketing
        ↓
  demand  ←  act base + axis coefficients · concept skew
        ↓
  copies  =  demand × trust × heat × hype × jank × franchise × synergies
        ↓
  revenue  =  (copies × price + in-game) × revenue share
        ↓
  wire     =  score × rate × deal multiplier × headcount × standing
        ↓
  backlash roll  →  re-project if it lands
```

---

## 2. Industry score

```
score = 20
      + pc × W.pc + fun × W.fun + gore × W.gore + ordinary × W.ordinary
      + (standing − 50) × 0.25
      + synergyScoreAdd
      − jank × 0.35
      + shipModifiers + marketingScoreAdd
      − emptySlots × 3
```
Clamped 0–100.

**Axis weights by act:**

| Act | PC | FUN | GORE | ORDINARY |
|---|---|---|---|---|
| I | **+7.0** | −2.5 | −6.0 | −1.0 |
| II | +5.0 | −1.5 | −4.0 | −0.5 |
| III | +4.0 | −1.0 | −3.0 | 0.0 |

PC's grip loosens as the acts progress — the industry's appetite for it never
disappears, it just stops being the only thing on the menu.

---

## 3. Copies

```
demand = actBase
       + fun × F + gore × G + ordinary × O + pc × P      (each × concept skew)
       + headcount × staffDrag

copies = max(0, demand)
       × trustMul × heatMul × hypeMul × jankMul
       × franchiseMul × synergyCopiesMul
       × shipModifiers × marketingMul
       × unfinishedPenalty
```

**Coefficients by act:**

| Act | Base | FUN | GORE | ORDINARY | PC | Headcount |
|---|---|---|---|---|---|---|
| I | 450 | +240 | +80 | +115 | **−580** | −170 |
| II | 1,300 | +430 | +330 | +300 | −580 | 0 |
| III | 3,700 | +800 | +560 | +570 | −400 | −55 |

Every head in Act I is worth −170 copies and +1 PC. A big Act I studio costs
you twice.

**Multiplier curves:**

| | Formula | Range |
|---|---|---|
| Trust | `0.6 + trust/85` | ×0.60 – ×1.78 |
| Heat | `1 + (heat/100)² × 0.5` | ×1.00 – ×1.50 |
| Hype | `0.75 + hype/160` | ×0.75 – ×1.375 |
| Jank | `max(0.2, 1 − jank/130)` | ×1.00 – ×0.23 |
| Franchise | `1 + depth × 0.18` | +18% per prior title in the line |

They stack multiplicatively, so the ranges are deliberately narrower than they
look. A perfect run tops out around ×2.5, not ×5.

---

## 4. Money

```
grossUnits = copies × price × priceModifiers
inGame     = copies × monetisationRate × 58 × synergyMoneyMul
revenue    = (grossUnits + inGame) × revenueShare
```

**Revenue share** starts at the deal's rate, minus any profit-share upgrade,
minus any permanent creditor share from a Chapter 11 filing. Floored at 15%.

**Monetisation cards** carry a per-player rate independent of box price — which
is why a free-to-enter live-service title can out-earn a $70 one. `Live Service
Pivot` alone is 0.9. The $58 a head is what keeps that route viable now that
trust is a real multiplier: a monetisation studio settles at trust 22 against an
audience studio's 73, so it sells far fewer copies and has to earn more from
each one. That is the trade, stated in arithmetic.

### Marketing spend

Hype bought by a campaign is a **square root** of the money, before the channel
multiplier:

```
hype = sqrt(spend / 10000) × 5.5 × channelHypeMul
```

| Spend | Hype | Copies multiplier |
|---|---|---|
| — | 0 | ×0.81 |
| $50k | 12 | ×0.89 |
| $220k | 26 | ×0.97 |
| $500k | 39 | ×1.06 |
| $1M | 55 | ×1.16 |

> **Design note.** This was linear at 3.5 per $10k, which made "spend the
> maximum you can afford" strictly optimal and turned marketing into a
> near-straight cash-to-copies conversion — a $220k campaign bought 77 hype and
> moved the multiplier from 0.81 to 1.23 in one purchase, a range the trust
> meter takes a whole campaign to cross. Worse, the constant was read by
> nothing: `applyMarketing` hardcoded its own 3.5, so the only knob on the
> strongest lever in the game was inert, and once the HUD began projecting the
> campaign the projection used the constant while the resolution used the
> literal. On a curve, small campaigns are efficient and enormous ones are not,
> so how much to spend is a decision.

### The investor wire

```
wire = score × 2600 × dealWireMul × (1 + 0.1 × headcount) × max(0.4, standing/50)
```

Miss the deal's score quota and the wire drops to **40%** and standing takes
−10.

**The quota escalates.** Every investor deal you have ever signed adds
`difficulty.quotaStep` to the next one's bar — 3, 5 or 8 depending on
difficulty. This is the central trap expressed as arithmetic.

### Budget and burn

A title's budget is **drawn down across its three quarters**:

```
uncovered      = max(0, budget − advance)
burnPerQuarter = ceil(uncovered / 3)
surplus        = max(0, advance − budget)      → paid at signing
```

An advance funds the burn; it does not stack on top of it. When advances were
pure profit, the PC archetype became viable again and the premise inverted.

### Operating costs

```
opex = (34,000 + 12,000 × upgrades + 8,000 × staff) × actScale
```

Act scale is **1.0 / 0.35 / 1.2**. The garage is cheap; the empire is not.

A new act's scale **phases in over the three quarters of its first title**
rather than landing whole on the pitch quarter:

| Quarters into Act III | 0 | 1 | 2+ |
|---|---|---|---|
| Scale | 0.63 | 0.92 | 1.20 |

> **Design note.** Moving up used to triple the rent on a single tick, on the
> same quarter the largest budget in the game started drawing down — three
> quarters before that title could pay for any of it. Act III is not
> unprofitable (demand base goes 1,300 to 3,700); it was a cash-flow cliff.
> Ramping keeps the empire expensive without charging for it before it opens.

---

## 5. Jank

Jank is accumulated brokenness. It comes from:

| Source | Amount |
|---|---|
| Crunch | +12 each |
| Jank-tagged cards | card's own value (−20 to +16) |
| Scope overrun | +4 per slot beyond your dev points |
| Empty slots | **+11 each** |
| Events | varies |
| Polish | −18 per dev point spent |
| Morale at lock | `(75 − morale) × 0.28` — −7 to +21 |
| Talent at lock | Rusty −12, Sal −18 |
| Upgrades | Engine License −10, Engine Team −18, QA Lab ×0.55 |

At launch it costs copies (`jankMul`), score (`−0.35` each) and trust
(`−0.14` each), and feeds heat.

> **Design note.** Staff jank is snapshotted separately from the accumulated
> reservoir. Mixing them meant either a hidden negative buffer that silently
> absorbed future crunch, or a reduction clamped away to nothing.

### Shipping unfinished

Empty slots are **priced, not forbidden**:

| Per empty slot | |
|---|---|
| Jank | +11 |
| Industry score | −3 |
| Copies | ×0.93 |
| Trust | −2 |

The only hard requirement is that the box contains at least one card. The old
build hard-blocked End Quarter until the box was full, which produced
unwinnable states whenever slot count exceeded available dev points.

---

## 6. Heat and backlash

Heat accrues when the box **locks**, not at launch — so it has three quarters
to compound rather than one launch to outrun its own decay.

| Source | Heat |
|---|---|
| Per GORE point | +1.4 (lock) + 2.4 (launch) |
| Meme-tagged card | +3.0 |
| Monetisation-tagged card | +2.5 |
| Per crunch | +3.0 |
| Per jank | +0.06 |
| Dunk | +18 |
| Cooling | `−5 × (heat/50)` per quarter |

**The reward** is a copies multiplier on a curve, not a line:

```
copies × (1 + (heat/100)² × 0.5)     ×1.02 at 20 · ×1.13 at 50 · ×1.50 at 100
```

**The roll:** below **14** heat, never. Above it, `chance = (heat − 14) / 96`,
so 70 heat is a 58% chance every launch and 100 is ~90%.

| Heat | Copies | Backlash chance |
|---|---|---|
| 0 | ×1.00 | never |
| 20 | ×1.02 | 6% |
| 50 | ×1.13 | 38% |
| 70 | ×1.25 | 58% |
| 100 | ×1.50 | 90% |

> **Design note.** Cooling was a flat −5 a quarter — −15 a title cycle at every
> level — which made heat a switch rather than a dial. Against what a box can
> actually generate: a fun studio shipping two meme cards makes **+6.4** a
> cycle, one that crunches twice **+7.8**. Both swallowed whole, so they sat
> pinned at zero while a full gore box made **+41** and ran away. There was no
> middle, and **28 of 87 cards are meme-tagged and 15 monetisation-tagged** —
> half the catalogue carried heat tags that did nothing for most studios.
>
> Two knock-ons came with fixing it. The backlash floor of 30 had been fine
> while nothing lived between 0 and 60, but once the middle of the range opened
> up it left a wide band collecting copies at no risk at all; it now sits at 14,
> just under where a mildly edgy studio settles. And the copies multiplier was
> linear, which meant a studio idling at heat 25 collected most of the reward
> for none of the risk — the opposite of a push-your-luck axis. On a curve, heat
> only really pays when you push it.
>
> The backlash table now fires **1.5 times a run** rather than 0.6.

| Outcome | Weight | Effect |
|---|---|---|
| Refund Wave | 30 | copies ×0.68, trust −14 |
| Review Bomb | 22 | copies ×0.80, trust −8, score −8 |
| **It Backfired Upward** | 20 | **copies ×1.35**, heat +12, trust +4 |
| **The Clip** | 18 | **copies ×1.20**, heat +16, trust +6 |
| Advertisers Walk | 18 | −$60,000, copies ×0.90 |
| The Open Letter | 16 | standing −16 |
| Quietly Delisted | 14 | copies ×0.50, standing −8 |
| A Regulator Opens A File | 10 | −$110,000, standing −6 |

Two of the eight are good for you. A **Legal Retainer** absorbs one outright,
once.

---

## 7. Morale

Starts at 72. Recovers on a quiet quarter at `4.2 × (1 − morale/100)` — fast
when the team is wrecked, almost nothing near the top. Crunching costs
**−(2/3/5)** for the quarter by difficulty, and each crunch itself is **−13**.
Scope costs **−2.5 per slot beyond four** at lock.

**Morale becomes jank when the box closes:**

```
jank += (75 − morale) × 0.28
```

| Morale at lock | Jank |
|---|---|
| 100 | −7 |
| 75 | 0 |
| 50 | +7 |
| 25 | +14 |
| 0 | +21 |

Tired people ship broken games. That is worth about a crunch across its range,
against a crunch at +12 and an empty slot at +11 — a real term without
dominating the ones you act on directly. Like staff jank it is **snapshotted at
lock**, so cheering everyone up after the box closes cannot un-bug a build made
by exhausted people.

| Threshold | What happens at box lock |
|---|---|
| < 30 | Roll `(30 − morale)/60` — a staff member quits, taking their contribution |
| < 22 | The build leaks. +10 heat. |
| < 15 | Sabotage: a random injector strikes **twice** |

Morale is the only meter that acts on its own. It's what makes crunch a
decision rather than a purchase.

> **Design note.** Morale used to touch *nothing* in the launch pipeline — not
> score, not copies, not money — and every consequence it had was a threshold at
> 30 or below. Combined with a flat **+2 a quarter** recovery it parked at 100
> for any studio that was not point-starved, which made ergonomic chairs, the
> sabbatical policy, profit share, raises and perks all pointless purchases.
> There was no reason to bank it and no cost to sitting at the top.
>
> It also went unmeasured for a long time: the balance bots gated crunch on
> `!canAdvance(...)`, which is only true on a completely empty box, so **no
> archetype ever crunched once in a sweep** and the harness was validating a
> strategy space with no crunch, no morale pressure and no crunch-driven jank
> in it. Fixing the bot came first; the numbers above are measured with it.

---

## 8. Synergies and conflicts

36 rules matching either an **exact card set** or a **tag count**.

```json
{ "requires": ["fun-gunfeel", "gore-headshot"] }
{ "requiresTags": { "combat": 3 } }
```

Effects combine into one bundle — `scoreAdd` and stat deltas sum, all
multipliers multiply:

```
scoreAdd · copiesMul · moneyMul · goreMul · funMul · pcMul
jank · hype · heat · trust · standing
```

Axis multipliers apply *before* the score and copies formulas, so
`GRAPE SODA MASSACRE` halving your gore genuinely changes both numbers.

A **Playtest Lab** upgrade reveals which will fire before you ship.

---

## 9. Reputation feedback

After every launch:

```
standing += (score − 45) × 0.34 + min(22, copies/actBase × 4.6) + synergyStanding
trust    += (fun + gore×0.55 + ordinary×0.85 − pc×0.95) × 0.62
            + jank × −0.14 + emptySlots × −2 + synergyTrust
heat     += gore × 2.4 + synergyHeat
```

All three pass through **resistance** for gains only — losing reputation is
never resisted, which is what "earned slowly, lost fast" means in arithmetic:

```
gain × (1 − value / ceiling)   ceiling: trust 100 · morale 100 · heat 110 · standing none
```

**Every source goes through it**, not just launches. Upkeep, marketing channels
and event effects each used to apply raw, which left the curve governing about
a tenth of the actual flow — see the design note below.

The ceiling is per-meter because the meters are not fed at remotely the same
rate: trust takes roughly 50 points of raw income a title cycle, standing
closer to 20. One shared pivot cannot govern both. Standing has no gain
resistance at all — it is held down by its proportional decay instead, and a
second damping term on top collapsed it to zero for every archetype.

The copies term matters more than it looks — commercial success buys grudging
respect, and it is what keeps the standing system alive for a studio the
industry despises. It is measured as a **multiple of what the act expects to
sell**, so an Act I hit is worth the same respect as an Act III one:

| Sales, as a multiple of the act's base demand | Standing |
|---|---|
| 1× | +4.6 |
| 2× | +9.2 |
| 3.3× | +15.3 |
| 4.8× and up | +22 (capped) |

A studio the press scores at zero loses `(0 − 45) × 0.34 = −15.3` standing per
launch, so roughly **three and a third times the act's baseline is break-even**
and a real hit climbs. Below that you have to buy reputation directly — the awards circuit
is +12 a launch, a festival showing +7, a PR firm +5 a quarter.

> **Design note.** This was a flat `copies / 6500`, which needed 91,000 copies
> in a single launch to reach its own cap and in practice returned 1 to 3
> against a penalty of 8 to 15. It never delivered the respect it promised.

### Why trust used to sit at 97

Trust climbed from its starting 30 to the cap over about twenty quarters and
then stayed: in Act III its 10th percentile was **90**, meaning even the worst
late quarter was saturated. Two things caused it.

**The curve had no equilibrium in the legal range.** The resistance ceiling was
130 while the meter caps at 100, so at trust 97 a gain still landed at 25%
strength — more than the flat drift took away. Solving `gain = drift` put the
equilibrium at trust **107**, above the cap, so the only thing that ever stopped
the ramp was the clamp.

**And most trust bypassed the curve anyway.** Only launch results were resisted.
Measured for a late-game audience studio:

| Source | Raw, per title cycle | Share | Resisted? |
|---|---|---|---|
| Staff and upgrade upkeep | +33.0 | 65% | no |
| Marketing channel | +12.0 | 24% | no |
| **Launch — the game you actually shipped** | **+5.5** | **11%** | yes |

Event effects bypassed it too, and they are the single largest source of
reputation in the deck. A community team and one beloved designer paid a flat
+11 a quarter while a genuinely good launch swung +8 and was resisted down to
+2. Trust was a reward for hiring, not for shipping.

Both are fixed: every source resists, and the ceiling matches the cap. Trust now
equilibrates in the 60s to 80s and an audience-facing studio spends **4%** of
its quarters saturated rather than 39%.

### Standing decay

Standing decays every quarter **in proportion to how much of it you hold**:

```
standing += -3 × (standing / 50)      per quarter
```

Nothing at the floor, −3 at 50, −6 at the ceiling.

> **Design note.** This was a flat −3 a quarter — −9 a title cycle at every
> level — which was simultaneously fatal at the bottom and toothless at the
> top. Any studio not feeding the industry PC content sat pinned at 0 for about
> three quarters of the campaign, where the wire multiplier is already clamped
> and deal quality stops responding, so half the system was inert for anyone
> playing the game's own preferred arc. A darling near 100 paid the same −3 and
> could simply coast. `tools/meter-probe.mjs` measures it.

---

## 10. Failure

| Threshold | Darling | Standard | Wendy's |
|---|---|---|---|
| Chapter 11 | −$900k | −$680k | −$450k |
| Liquidation | −$1.6M | −$1.25M | −$850k |
| Interest / quarter | 6% | 10% | 15% |
| Quota step | +3 | +5 | +8 |

### Debt

Interest compounds on negative cash every quarter at the difficulty rate, and it
is **not capped**. That is deliberate, and it was checked rather than assumed:

| Debt | Interest next quarter | Quarters to the filing threshold |
|---|---|---|
| −$100k | −$10k | 21 |
| −$200k | −$20k | 13 |
| −$350k | −$35k | 7 |
| −$500k | −$50k | 4 |
| −$600k | −$60k | 2 |

Runway assumes no further spending and no revenue, so it is a worst case. The
shape is the point: plenty of room to act on a small hole, almost none on a
large one. Across 720 campaigns **51% file for Chapter 11 at least once and only
1.7% ever reach a game over** — the spiral is real, and it is bounded, because
Chapter 11 discharges the debt to zero.

The books panel shows all three numbers the moment cash goes negative. It used
to show none of them: the ledger reported interest only after charging it, and
the threshold arrived with no countdown, which made a survivable mechanic feel
arbitrary.

**Chapter 11** fires once. It discharges the debt and takes:

- every studio upgrade
- the entire team
- a permanent dev point
- a permanent staff slot
- −30 morale, −25 standing, −15 trust
- **a permanent 14% of all future revenue**

That last clause exists because without it, filing at the threshold was
*strictly profitable* — the balance bots found it and farmed it.

**The second filing ends the run.**

---

## 11. Randomness

Every draw comes from a **named stream** derived from the run seed:

```js
stream(state, "launch",  quarter)   // backlash and marketing risk
stream(state, "deck",    quarter)   // event draw
stream(state, "lock",    quarter)   // morale consequences
stream(state, "event",   quarter, eventId, choiceIndex)
stream(state, "concepts", quarter)  // which three are offered
```

Adding a die roll to one system therefore cannot shift the numbers another
system draws. Same seed and difficulty produces a byte-identical run — which is
what makes seeds shareable and the determinism test meaningful.

### The event deck

72 events filtered by `acts`, `phases`, and a predicate vocabulary:

```
minStanding maxStanding minTrust maxTrust minHeat maxHeat
minMorale maxMorale minCash maxCash minJank minHype
minPc minGore minCrunch minTitlesShipped minMonetization
hasStaff liveService dealType
```

Drawn by weight, no repeats within a run until the eligible pool is exhausted.
Three scripted beats override the draw at fixed quarters so the spine always
lands.

---

## 12. Balance targets

`npm run balance` asserts:

- Every non-control archetype reaches **King Baby or better** sometimes.
- None reaches **Emperor or better** more than 60% of the time.
- At least **five distinct ranks** occur across a sweep.
- **No single rank** absorbs more than half of all runs.
- No run gets stuck in an unreachable `advance`.

Current standing at 3,000 runs, Standard difficulty:

```
archetype       median        top-rank   broke   ch11
pcmax             $95,529         0.0%   42.8%  30.8%   ← the trap, working
funmax         $2,737,445        25.2%    1.4%  44.0%
goremax        $2,154,729        21.4%    2.6%  44.8%   ← highest variance
moneymax         $613,359         0.0%    0.2%  94.4%   ← safe, low ceiling
pcthenfun      $2,032,721         3.2%    1.2%  82.0%   ← the designed line
balanced       $2,723,919        14.6%    0.0%   9.8%
```

The harness fails the build if any non-control archetype can never reach King
Baby, if one reaches Emperor more than 60% of the time, if fewer than five ranks
occur, if one rank absorbs more than half of all runs, if a run gets stuck — and,
since 1.0.7, **if the control archetype stops being the worst**. `pcmax` is
exempt from having to be viable, which for a long time meant the single claim
this game rests on was the only one the tool could not falsify. It now checks
that `pcmax` is out-earned by every real strategy and never reaches the top of
the ladder.

It also fails if the bots never crunch and if the backlash table never fires,
because both of those have silently happened before.

`node tools/meter-probe.mjs` attributes every meter delta to the phase that
produced it, and reports what share of a campaign each meter spends **pinned**
— parked against the end of its range where its own multiplier is saturated or
clamped and play can no longer move it. A low meter is fine. A stuck one is a
system that has quietly switched itself off.

```
             standing        trust          heat         morale
archetype  median pin    median pin    median pin    median pin
pcmax          66   0%       14   0%       25   7%       48   0%
funmax         24  15%       71   7%       25   0%       71   1%
goremax         8  19%       63   1%       70   0%       67   0%
moneymax        0  48%       22   0%       63   0%       53   0%
pcthenfun      48   0%       53   1%       19   5%       53   0%
balanced       20  23%       79  11%       17   1%       77   1%
```

Where those numbers started:

| Meter | Worst archetype, before | Now |
|---|---|---|
| Standing | 75% pinned at zero | 0–23% (moneymax aside) |
| Trust | 44% pinned at the ceiling | 0–11% |
| Morale | 54% pinned at the ceiling | 0–1% |
| Heat | 39% pinned at zero | 0–7% |

All four meters move under play. One thing is deliberately still lopsided:

- **`moneymax` standing, 48% pinned.** Selling the audience for cash is
  supposed to cost you the industry's respect as well as theirs. It is the only
  archetype/meter pair still parked, and it is parked for a reason.

`node tools/ch11-probe.mjs` separately plays a frugal, competent player. About
**38%** of those runs file for Chapter 11, and the filings split roughly 44/56
between Act II and Act III with **none at all in Act I** — the money runs out
after the investors leave, which is the intended tension.

It fails the build if Act III takes more than 65% of filings (the endgame
turning unwinnable rather than tense) or if fewer than 40% of runs reach an
ending. Both thresholds are set against that measured baseline rather than
picked.

It also prints the single biggest quarter — currently **Q21 at ~37%** of all
filings — and, more usefully, what the money went on when the filing happened:

```
cost at filing : interest 64% · opex 20% · burn 16% · payroll 0%
```

That breakdown is the answer to why the back half concentrates, and it is not
what it looks like from outside. **It is not the Act III budget.** It is
compounding interest on debt carried out of Act II. Debt grows geometrically at
10% a quarter, so a run that never climbed out arrives in Act III owing enough
that the interest alone — about $63k on a −$630k balance, against a −$680k
filing threshold — is what pushes it over. The player's own spending that
quarter is a minority of the cost.

That is Chapter 11 working as designed: it exists precisely as the floor under a
debt spiral. Worth knowing rather than worth fixing.
