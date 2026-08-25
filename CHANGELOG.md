# Changelog

All notable changes to Big Baby Company. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.6] — 2026-08-26

### Changed

- **Heat cools in proportion to how much of it you have**, `−5 × (heat/50)` a
  quarter rather than a flat −5. The flat rate was −15 a title cycle at every
  level, which made heat a switch rather than a dial. Measured against what a
  box can actually generate: a fun studio shipping two meme cards makes **+6.4**
  a cycle and one that crunches twice **+7.8** — both swallowed whole, so they
  sat pinned at zero while a full gore box made **+41** and ran away. There was
  no middle. **25 of 79 cards are meme-tagged and 14 monetisation-tagged**, so
  half the catalogue carried heat tags that did nothing for most studios.
  Quarters pinned at zero: **27–39% → 0–7%**, and every archetype now sits
  somewhere between 16 and 70 instead of at one end or the other.
- **The backlash floor drops from 30 to 14.** Thirty was fine while nothing
  lived between 0 and 60 — you were either clean or notorious. Once the middle
  of the range opened up it left a wide band collecting copies at no risk at
  all, so the floor now sits just under where a mildly edgy studio settles.
  Controversy stays opt-in; a clean studio is still never punished at random.
  The backlash table — eight authored outcomes — now fires **1.5 times a run**
  rather than 0.6.
- **Heat pays on a curve**, `1 + (heat/100)² × 0.5`: ×1.02 at 20, ×1.13 at 50,
  ×1.50 at 100. Linear meant a studio idling at heat 25 collected most of the
  reward for none of the risk, which is the opposite of a push-your-luck axis.
  It only failed to matter while heat was a switch; it became the dominant term
  the moment the middle of the range opened up, taking `funmax`'s top-rank share
  from 9% to 38% on its own.

### Added

- Five regression tests: proportional cooling, that a deliberately edgy box can
  outrun its own decay without reaching notoriety, that the reward curve is
  convex, that the floor sits where the reward starts, and that a clean studio
  is still left alone.

### Known

- **`moneymax` standing sits pinned at zero for 52% of a run.** Selling the
  audience for cash is supposed to cost the industry's respect too. Deliberate,
  and now the only meter still parked anywhere.

---

## [1.0.5] — 2026-08-26

### Fixed

- **The balance harness never crunched, in any archetype, in any run.** The
  bots gated crunch on `!canAdvance(...)`, which is only true on a completely
  empty box — `canLockBox` passes on a single card. So the loop never ran and
  every sweep was validating a strategy space with **no crunch, no morale
  pressure and no crunch-driven jank in it at all**, which is a third of the
  production phase's decisions. Everything below was found only after fixing
  it. The bots now crunch when the slots are worth more than the damage and
  stop short of the threshold where people start quitting.

### Changed

- **Morale does something now.** It used to touch nothing in the launch
  pipeline — not score, not copies, not money — and every consequence it had was
  a threshold at 30 or below. It is now worth `(75 − morale) × 0.28` jank at
  lock: about −7 for a studio that is looked after and +21 for one that has
  been ground down, against a crunch at +12 and an empty slot at +11. Tired
  people ship broken games. Snapshotted at lock like staff jank, so cheering
  everyone up after the box closes cannot un-bug a build.
- **Morale recovery eases off as morale rises**, at `4.2 × (1 − morale/100)` a
  quiet quarter rather than a flat +2 to the ceiling. The flat rate meant morale
  repaired itself for free and parked at 100 for anyone not point-starved, which
  made every lever the game sells for it — ergonomic chairs, sabbatical policy,
  profit share, raises, perks — a pointless purchase.
- **Morale gains resist near the ceiling** like the other meters. That exemption
  was reasonable while morale did nothing but gate disasters; now that it buys a
  cleaner build there has to be a cost to the last few points. Losses are
  unresisted as ever, so the quit, leak and sabotage thresholds are exactly as
  reachable as before.
- Quarters spent pinned at 95+: **38–54% → 0–1%**. Morale now spans 21–91
  across archetypes and every one of them trends downward over a run, which is
  what a resource you spend is supposed to do.
- **Monetisation is $58 a head, up from $52.** Morale jank costs a monetisation
  studio copies on top of everything else, and without this `moneymax` dropped
  back under the King Baby threshold at the sample size CI runs.
- `DRIFT.morale` is gone; morale recovery lives in `MORALE.recovery` and
  `moraleDrift()`.

### Added

- Six regression tests: the jank curve both ways and its magnitude against a
  crunch, the easing recovery, that a ground-down team measurably ships worse
  and sells fewer copies, that morale is snapshotted at lock, that gains resist
  at the ceiling, and that losses still reach the disaster thresholds.

### Changed

- Both README captures recut under the rebalanced meters. The Act III run now
  has all four meters visibly doing something — standing 40, trust 94, heat 17,
  morale 81 — rather than two of them parked at their extremes, and it ends on
  a run summary where a title scored **100** and sold **nothing**. The Act I
  capture ends on the launch report that explains the whole premise: customers
  paid **$11k**, the investor wired **$34k**.

### Known

- **`moneymax` standing sits pinned at zero for 50% of a run.** Selling the
  audience for cash is supposed to cost the industry's respect too. Deliberate.
- **Heat sits at zero for 27–39% of a non-gore run.** Unlike the others this is
  a choice rather than a dead system — heat is something you go and get by
  shipping gore, memes or monetisation, and a studio that ships none of those
  should have none of it.

---

## [1.0.4] — 2026-08-26

### Changed

- **Audience trust settles instead of ramping to the ceiling.** It climbed from
  30 to the cap over about twenty quarters and stayed: in Act III its 10th
  percentile was **90**, so even the worst late quarter was saturated and the
  meter had stopped being a decision for the last third of the campaign. Two
  causes, both fixed.

  The resistance ceiling was **130 while every meter caps at 100**, so the curve
  had no equilibrium anywhere in the legal range — solving `gain = drift` put it
  at trust 107. At 97 a gain still landed at 25% strength, more than the drift
  took away, so nothing but the clamp ever stopped the climb. The ceiling is now
  per-meter and matches the cap.

  And most trust bypassed the curve regardless. Only launch results were
  resisted; staff and upgrade upkeep, marketing channels and event effects all
  applied raw. Measured for a late-game audience studio, that left the curve
  governing **11%** of the actual flow — a community team and one beloved
  designer paid a flat +11 a quarter while a genuinely good launch swung +8 and
  was resisted down to +2. Trust was a reward for hiring, not for shipping.
  Every source now resists.

  Quarters spent saturated: **39% → 4%**. Act III trust now spans 54–94 for an
  audience studio rather than sitting at 97, and the launch phase is the
  dominant term.
- **Standing has no gain resistance at all now**, because it does not need two
  ceilings. Its proportional decay already holds it down, and stacking a second
  damping term on top collapsed it to zero for every archetype. Each meter is
  held by exactly one mechanism: standing by proportional decay, trust by gain
  resistance, heat by both plus its own hard −5 a quarter.
- **The trust multiplier on copies is `0.6 + trust/85`** (was `/125`). It was
  calibrated for a meter parked at 97; now that trust actually varies, the curve
  maps the range it varies over. In normal play the multiplier now swings across
  roughly ×1.07–×1.68 instead of ×1.32–×1.40.
- **Commercial success pays more standing** — `copies/actBase × 4.6`, capped at
  22, up from ×3.0 capped at 18 — restoring the parity the trust change took
  away, since a smaller trust multiplier means fewer copies means less respect.
- **Monetisation is $52 a head, up from $26.** A monetisation studio settles at
  trust 22 against an audience studio's 73, so it sells far fewer copies and has
  to earn more from each. Without this, `moneymax` could no longer reach King
  Baby at all and the balance harness failed its viability assertion.

### Added

- `tools/meter-probe.mjs`, generalised from `standing-probe.mjs`: attributes
  every delta on all four meters to the phase that produced it, and reports
  what share of a campaign each spends **pinned** — parked where its own
  multiplier is saturated or clamped and play can no longer move it. That
  number is the one worth watching; a low meter is fine, a stuck one is a
  system that has switched itself off.
- Five regression tests covering the resistance curve, the equilibrium, the
  losses-never-resist rule, and morale's exemption from it.

### Known

- **`moneymax` standing sits pinned at zero for 49% of a run.** Selling the
  audience for cash is supposed to cost the industry's respect too. Deliberate.
- **Morale is pinned at 95+ for 38–54% of every run.** Every morale consequence
  is threshold-based and the lowest threshold is 30, so a studio that never
  crunches never touches the system. Not addressed here.

---

## [1.0.3] — 2026-08-26

### Changed

- **Standing decays in proportion to how much of it you hold**, rather than at
  a flat −3 a quarter. The flat rate was −9 a title cycle at every level, which
  was simultaneously fatal at the bottom and toothless at the top: it swamped
  every positive term below roughly standing 60, so `funmax`, `goremax` and
  `balanced` each spent about **75% of the campaign pinned at exactly zero** —
  the state where the wire multiplier is already clamped and deal quality has
  stopped responding. Half the reputation system was inert for anyone not
  feeding the industry PC content, including the game's own designed arc.
  Meanwhile a darling sitting near 100 paid the same −3 and could coast.
  The rate is now −3 at standing 50, about −6 near the ceiling and nothing at
  the floor. Floored quarters: **75% → 21–29%**.
- **Commercial success is now priced against what the act expects to sell.**
  The standing-for-copies term was a flat `copies / 6500` that needed 91,000
  copies in a single launch to reach its own cap; real launches returned 1 to 3
  against a score penalty of 8 to 15, so the "commercial success buys grudging
  respect" the code promised never actually arrived. It is now a multiple of
  the act's base demand, capped at 18 — about five times baseline breaks even
  against a zero industry score, and a genuine hit climbs.
- Knock-on: the PC spiral is slightly less punishing, because standing drives
  the investor wire and PC studios now hold more of it. It remains far and away
  the worst strategy in the game — median $25k against `funmax`'s $2.33M, a 0%
  top-rank share and 47.5% bankrupt — so the premise is intact.

### Added

- `tools/standing-probe.mjs`, which attributes every standing delta to the
  phase that produced it and reports what share of a campaign each archetype
  spends pinned at zero. This is how the above was found and tuned rather than
  guessed at.
- An animated Act I sequence in the README, replacing the static office shot.
  Act I is the more brutal illustration of the joke than Act III is: a single
  fashionable feature is worth **+21 industry score and every copy you were
  going to sell** — `360 − 360`.

### Removed

- `01-title.webp` and `02-hq-hotspots.webp`, both superseded by animated
  captures of the same content.

---

## [1.0.2] — 2026-08-26

### Fixed

- **The launch report was invisible on the two launches that matter most.**
  The report and the crash / ending / game-over screens render as absolutely
  positioned siblings filling the same box at the same `z-index`, and the
  screens are set in the same tick that produces the report — so on the launch
  that ends Act I in the crash, and on the one that ends the run, whichever
  markup came last simply painted over the other. The player never saw the
  numbers for their final title, and the report's own Continue button sat
  underneath an opaque screen, unreachable. Modal choice now goes through a
  single `stageModal()` that can only ever return one of them, with the report
  winning; dismissing it hands over to the screen underneath.

### Changed

- The README hero is now an Act III capture rather than an Act I one. Late-game
  numbers are two orders of magnitude larger — 19,290 copies against 360 — and
  the arc reads properly in the end-of-run table, where a title scoring 86 sold
  nothing and a title scoring 0 sold 59,256.

---

## [1.0.1] — 2026-08-26

### Added

- **Hosted build.** The game now plays at
  [nihilistau.github.io/big-baby-company](https://nihilistau.github.io/big-baby-company/).
  A GitHub Actions workflow runs the full suite — 134 tests, the asset check
  and a 400-run balance sweep — and only deploys if all three pass. A broken
  build cannot reach the public URL, which is more process than the studio in
  this game has ever managed.
- A CI workflow running the same checks on pull requests.
- An animated README hero showing the hover-ghost projection doing the one
  thing the whole game is about.

### Fixed

- **Assets were resolved from absolute paths**, so every image 404'd when the
  bundle was served from a subdirectory rather than a domain root — which is
  exactly how GitHub Pages serves it. Hub scenes, title covers, staff
  portraits, ending stills, the logo and the video stingers now all resolve
  through an `asset()` helper built on `import.meta.env.BASE_URL`, and
  `vite.config.js` honours a `BASE_PATH` environment variable.

---

## [1.0.0] — 2026-08-26

### The Overhaul

The previous build was a design demo with a good joke and no game inside it.
All eight PC cards were mechanically identical, all five FUN cards were
mechanically identical, every playthrough was byte-identical, cash had exactly
one sink, and nothing you did in Q1 changed anything in Q5. This release is the
game the demo was a mock-up of.

### Added

**Campaign structure**
- Expanded from 8 quarters to **24**, across **8 titles** and **three acts**.
- Replaced the design/ship parity with an explicit **three-phase title cycle** —
  Pitch, Production, Launch — roughly tripling decision density per title.
- Second scripted reversal: a **hostile acquisition offer** after title seven.
  Take it and the run ends there; refuse it and you get one more title.
- **Eleven endings**, selected by cash × trust × standing × live-service ×
  whether you took the offer. Eight-rung rank ladder.
- **Endless mode**, unlocked on first campaign completion. Procedurally
  generated titles, escalating quotas, rising interest.
- Three difficulties tuning starting cash, interest, quota escalation and both
  bankruptcy thresholds.

**Systems**
- Four persistent meters — **Industry Standing**, **Audience Trust**, **Heat**,
  **Morale** — each creating a different ongoing tension. Gains resist near the
  ceiling so nothing can be maxed once and forgotten.
- **Jank**: accumulated from crunch, scope and jank-tagged cards. Causes
  refunds, score loss and trust damage at launch. Turns crunch from a free
  purchase into a genuine gamble. **Polish** spends a dev point to remove it.
- **Heat and the backlash table**: eight outcomes rolled against accumulated
  controversy at launch, two of which are good for you.
- **Morale consequences**: staff quit mid-production, leak builds, or sabotage
  the box by re-injecting what you cut.
- **Synergies and conflicts** — 24 and 12 respectively, matching either exact
  card sets or tag counts.
- **Studio upgrades** — 20 persistent purchases giving cash a real sink, each
  adding to quarterly operating cost.
- **Funding deals** — 8 templates across investor, publisher, self-fund and
  crowdfund, with revenue shares, mandated feature slots and score quotas that
  escalate with every deal signed.
- **Marketing** — 7 channels with distinct risk profiles, three carrying a
  chance of public humiliation.
- **Chapter 11** — a soft fail that discharges debt and takes everything else,
  survivable exactly once.

**Content**
- 79 feature cards (from 19), with dev-point costs, jank, hype, tags and
  per-player monetisation rates. Four unlock through cross-run achievements.
- 16 staff (from 6), split into injectors and talent with genuinely different
  mechanical roles.
- 72 events (from 8 hardcoded), drawn from a conditional deck with 191 choices
  and 13 dice rolls.
- 24 pitchable concepts across 8 title slots, including sequel chains.
- 169 Chirper posts across 14 recurring accounts.
- 47 achievements, 11 endings, 8 ranks.

**Roguelite layer**
- Seeded runs with shareable word-triple seeds. Same seed, same everything.
- Named RNG streams per system, so adding a die roll in one place cannot shift
  the numbers another place draws.
- Cross-run meta-progression: card unlocks, achievements, endings seen, best
  cash, Endless high score. Trophy Case on the title screen.

**Presentation**
- Complete art regeneration: 51 assets in bold-ink MAD-caricature over VGA
  adventure-game backgrounds, watermark-free and free of baked-in lettering.
- Three video stingers for the act transitions and the finale.
- Comic-panel UI pass: hard offset shadows, halftone dot field, buttons that
  physically press, animated chips, live meter shine.
- **Chirper as a live feed**: engagement counters that climb, ambient chatter
  filtered by game state, arrival animations, typing indicator, procedural
  sound.
- Launch sequence with rolling number tickers and synergy banners.
- First-run coach marks; in-game glossary; keyboard shortcuts throughout.
- Procedural WebAudio kit — clicks, cash, thuds, chirps and three music beds
  with zero audio assets.

**Tooling**
- `tools/balance-sim.mjs` — Monte-Carlo harness playing full campaigns with six
  archetype bots. Asserts no strategy is unwinnable or dominant, at least five
  ranks are reachable, and no single rank absorbs more than half of all runs.
- `tools/ch11-probe.mjs` — plays a deliberately frugal, competent player and
  reports which act bankrupts them.
- `tools/gen-art.mjs` — manifest-driven art generation with watermark cropping,
  chroma keying with spill suppression, retry-with-backoff, asset optimisation,
  and a `--check` mode that fails on missing assets or inconsistent scene
  aspect ratios.
- 134 tests across simulation, content integrity, a randomised fuzz harness,
  and jsdom UI tests.

### Changed

- Investor advances now **fund the production budget** rather than stacking on
  top of it. When they were pure profit the PC archetype became viable again
  and the entire premise inverted.
- Production budgets are **drawn down across three quarters** instead of taken
  as a lump at signing. The lump-sum model put the whole outlay three quarters
  ahead of any revenue and bankrupted a careful player in 75% of runs, spiking
  hard on Act III pitches. Under the new model that is ~32%, evenly spread.
- Shipping an **unfinished box is now legal** and priced — jank, score, copies
  and trust — rather than blocked. The old hard gate produced unwinnable states
  whenever slot count exceeded available dev points.
- Rank thresholds raised so the ladder spreads rather than piling on one rung.
- Rewritten from a single 556-line UI file into a clean `sim/` and `ui/` split
  with zero runtime dependencies.

### Fixed

- **Full-DOM re-render on every interaction.** Scrolling the card list and
  clicking a card reset it to the top. Replaced with a ~150-line keyed DOM
  morphing renderer that preserves scroll, focus and in-flight input.
- **Hub frame aspect mismatch.** Scene art is 1.88:1; the frame was hard-coded
  16:9, so `object-fit` silently cropped 5.5% off the width of every scene and
  displaced every hotspot with it. The frame is now measured from the image's
  natural size, and `gen-art.mjs --check` fails if scenes ever disagree.
- **Hub frame overflowing its stage.** The bottom quarter of every scene was
  clipped, making low hotspots unreachable.
- **Reduced-motion transitions left permanently pending.** The standard
  `transition-duration: 0.01ms` reset can strand a transition on a property
  whose value comes from a custom property; a pending transition outranks even
  an inline style, so every hotspot label stayed frozen invisible — for exactly
  the users who had asked for less motion.
- **Talent-staff jank double-counted** after box lock and their auras invisible
  before it. Staff contributions are now snapshotted separately from the
  accumulated jank reservoir.
- **Chapter 11 multiplied negative cash by 0.45**, forgiving 55% of debt and
  making bankruptcy strictly profitable. The balance bots were farming it.
- **Staff injection gate hole.** `canEndDesign` assumed every hire fills a slot;
  a staffer whose pet card was already on the board filled nothing, letting the
  gate pass while leaving a visible hole in the shipped game. Injection now
  walks a real preference list with backups.
- **Keyed nodes matching unkeyed ones** in the renderer, which let an incoming
  modal cannibalise the FX layer and leave duplicates behind.
- **`Space` swallowed globally** for the hotspot reveal, breaking keyboard
  activation of every button in the game.
- Unversioned saves parsed straight into the game; now versioned with a
  migration chain and a schema guard that offers a new game rather than
  crashing.
- `logo.png` was a JPEG with the wrong extension, so it had no transparency.
- Dead `box.pc` check in the quarter machine that referenced a field which
  never existed.
- Missing-asset fallback tiles, specified in the original design and never
  built.
- Unbounded chirp array serialised into every save.
- Investors panel labelled lifetime wires as "last wire paid".
- `object-fit: fill` distorting hub art off-aspect.
- A `calc(100vh - 140px)` magic number that broke whenever the chrome wrapped.

### Removed

- The original four-title, eight-quarter campaign and its fixed per-quarter
  event script.
- `data/ranks.json`, folded into `data/endings.json`.
- Fifteen dead exports and their imports.

---

## 0.1.0 — 2026-08-25

### Added

- Initial design demo. Eight quarters, four titles, 19 feature cards, six
  staff, eight hardcoded events, four cash ranks.
- Act I / crash / Act II garage structure.
- Hub scenes with invisible hotspots, overlay panels, localStorage save.
- Vite + vanilla JS, Vitest, painterly generated art.

[1.0.6]: https://github.com/nihilistau/big-baby-company/releases/tag/v1.0.6
[1.0.5]: https://github.com/nihilistau/big-baby-company/releases/tag/v1.0.5
[1.0.4]: https://github.com/nihilistau/big-baby-company/releases/tag/v1.0.4
[1.0.3]: https://github.com/nihilistau/big-baby-company/releases/tag/v1.0.3
[1.0.2]: https://github.com/nihilistau/big-baby-company/releases/tag/v1.0.2
[1.0.1]: https://github.com/nihilistau/big-baby-company/releases/tag/v1.0.1
[1.0.0]: https://github.com/nihilistau/big-baby-company/releases/tag/v1.0.0

<!-- 0.1.0 predates this repository; it exists only as the starting point the
     1.0.0 notes describe. -->
