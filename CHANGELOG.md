# Changelog

All notable changes to Big Baby Company. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/nihilistau/big-baby-company/releases/tag/v1.0.0

<!-- 0.1.0 predates this repository; it exists only as the starting point the
     1.0.0 notes describe. -->
