# Architecture

Vanilla ES modules, Vite, **zero runtime dependencies**. Roughly 9,200 lines of
JavaScript and 4,500 lines of content JSON.

---

## Layout

```
src/
  main.js                 mounts the app, three lines

  sim/                    pure simulation — no DOM, fully testable
    balance.js              every tunable number in the game
    state.js                run-state factory and selectors
    content.js              pure content builder + catalogue helpers
    content-data.js         Vite-side JSON imports (see below)
    economy.js              the launch pipeline: score, copies, money, jank, heat
    synergy.js              card combination detection
    injection.js            what staff do to the box when it locks
    deck.js                 conditional event draw
    effects.js              the single effect vocabulary
    quarter.js              phase machine, crash, acquisition, endings
    endings.js              rank ladder and ending selection
    meta.js                 cross-run unlocks and achievements
    save.js                 versioned saves with migration and a schema guard
    rng.js                  seeded RNG and named streams

  ui/
    render.js               ~150-line keyed DOM morphing core
    app.js                  controller: state, handlers, keyboard, lifecycle
    chrome.js               the HUD
    hub.js                  scenes, hotspots, frame fitting
    preview.js              hover-ghost projection
    sequences.js            event modal, launch report, crash, endings
    tutorial.js             first-run coach marks
    fx.js                   particles, floats, number rolls
    format.js               money, counts, labels
    panels/
      project.js              pitch · production · launch
      rooms.js                people, store, board, studio, books, penthouse
      chirper.js              the live feed

  audio/kit.js            procedural WebAudio — no audio files
  style.css               tokens, layout, components
  comic.css               the comic-panel presentation pass

data/                     all content
tools/
  balance-sim.mjs           Monte-Carlo balance harness
  ch11-probe.mjs            frugal-player bankruptcy probe
  gen-art.mjs               manifest-driven art generation
  art-manifest.json         style preamble + every asset's prompt
tests/                    sim, content integrity, fuzz, jsdom UI
```

---

## The simulation is pure

```js
const result = advance(state, content);
// → { ok: true, state: nextState, events: [...] }
```

`advance()` is synchronous, side-effect free, and returns a **new** state plus
a list of what happened. Every animation lives in the UI layer.

This is the single most load-bearing decision in the codebase. Because of it:

- everything is skippable, since nothing waits on an animation
- the whole game is testable without a DOM
- the balance harness plays ten thousand campaigns in a few seconds
- a fuzz test can hammer every action in every legal and illegal order

The UI never reaches into simulation internals. It calls actions in
`sim/actions.js`, which return `{ ok, reason }`, and renders from state.

### Content loading

`content.js` is a **pure builder** with no import statements for the JSON
itself, because Vite wants bare `import x from './x.json'` while Node wants an
import attribute — and `tools/balance-sim.mjs` has to run outside the bundler.
`content-data.js` does the Vite-side importing; the tools read the files with
`fs` and call `buildContent()` directly.

---

## Determinism

Every random draw comes from a **named stream** derived from the run seed:

```js
stream(state, "launch", quarter)     // backlash, marketing risk
stream(state, "deck",   quarter)     // event draw
stream(state, "lock",   quarter)     // morale consequences
stream(state, "event",  quarter, eventId, choiceIndex)
```

Adding a die roll to events cannot shift the numbers the launch pipeline draws.
Same seed and difficulty produces a byte-identical run, which is what makes
seeds shareable and this test meaningful:

```js
it("the same seed produces an identical run", () => {
  const a = playCampaign("identical-seed", { solvent: true });
  const b = playCampaign("identical-seed", { solvent: true });
  expect(b.state.cash).toBe(a.state.cash);
  expect(b.state.deck.seen).toEqual(a.state.deck.seen);
});
```

`Math.random()` appears nowhere in `src/sim/`.

---

## The renderer

The original build did `app.innerHTML = ...` on every interaction, which
destroyed scroll position, focus and in-flight input every time you clicked a
card in a long list.

[`src/ui/render.js`](../src/ui/render.js) is a ~150-line keyed morphing
renderer. Components return HTML strings; `render()` walks the old and new
trees in parallel and mutates only what differs.

```js
render(root, markup);          // morph, don't replace
delegate(root, "click", handlers);   // one listener, dispatched by data-act
```

**Rules it enforces:**

- A keyed node (`data-key`) only ever matches a keyed node with the same key.
  Letting a keyed incoming node match an unkeyed positional candidate is how a
  launch modal ends up cannibalising the FX layer — a real bug this codebase
  had, now covered by a regression test.
- Anything past the cursor after the walk is surplus and gets removed, which is
  what makes keyed nodes disappearing work correctly.
- `data-static` subtrees are never touched — used for the FX and toast layers,
  which own their own imperative state.
- A focused `<input>` is never clobbered mid-typing.

Event handling is delegated from the root and dispatched by `data-act`, so it
survives morphing for free with no rebinding.

### Why the hub frame is measured, not styled

Hotspot rectangles are percentages of `.hub-frame`, so that frame must be
*exactly* the rendered image box on every window shape or every clickable
region silently moves.

CSS cannot express "fit this aspect inside both axes" dependably: `max-width`
clamps without re-deriving height, and `max-height` clamps without re-deriving
width. Whichever direction you drive it from, one window shape squashes the
box. `fitHubFrame()` computes it from the image's natural size, with a
`ResizeObserver` keeping it current — verified across five window shapes in
[`tests/ui/hub.test.js`](../tests/ui/hub.test.js).

The scenes must also all share one aspect ratio, which
`gen-art.mjs --check` enforces.

---

## Saves

`localStorage['bbc-save']` for the run, `localStorage['bbc-meta']` for
cross-run progression.

Saves are versioned with a migration chain and a schema guard:

```js
const result = loadState();
// → { ok: true, state } | { ok: false, reason: "outdated" | "corrupt" | "invalid" | "empty" }
```

Anything that cannot be honestly migrated is **rejected with an explanation**
rather than parsed into a broken game. The v1/v2 demo saves describe a
fundamentally different campaign shape, so they are retired rather than
mangled.

Meta is deliberately never load-bearing — if `localStorage` is full or blocked,
achievements silently stop persisting and the game plays fine.

---

## Audio

[`src/audio/kit.js`](../src/audio/kit.js) synthesises everything at runtime
with WebAudio. Clicks, card placement, cash, thuds, chirps, synergy fanfares,
backlash noise, and three procedural music beds — one per act.

**There is not a single audio file in this project.** The whole kit is about a
hundred lines and adds zero bytes to the bundle.

---

## Testing

```bash
npm test        # 134 tests across 9 files
```

| File | Covers |
|---|---|
| `economy.test.js` | The central inversion, multipliers, dev points, unfinished boxes, injection prediction |
| `campaign.test.js` | The 24-quarter spine, both scripted reversals, gating order, determinism, solvency, Endless |
| `systems.test.js` | Synergies, staff influence, the deck, effects, ranks and endings, illegal-move refusal |
| `content.test.js` | No dangling ids, every act playable, sequels point backwards, rank ladder has no gaps |
| `fuzz.test.js` | 60 randomised runs asserting invariants after every action |
| `ui/render.test.js` | Morphing, scroll and focus preservation, keyed reordering, escaping |
| `ui/panels.test.js` | Every panel in every phase and act, sequences, save round-trip and migration |
| `ui/feed.test.js` | Chirper counters, arrival marking, reach scaling |
| `ui/hub.test.js` | Frame fitting across five window shapes, hotspot bounds |

### The fuzz harness

`fuzz.test.js` fires random actions — legal and illegal, in any order — then
legalises the quarter and ticks, asserting after every step that cash is
finite, meters are integers in 0–100, no card is duplicated, jank is
non-negative, and nothing anywhere in the state tree is `NaN`.

It found the talent-jank double-count within seconds of being written.

### Balance as a test

```bash
npm run balance                 # 2000 runs, six archetypes
node tools/ch11-probe.mjs       # where a frugal player actually goes broke
```

`balance-sim.mjs` **fails** if any non-control strategy is unwinnable or
dominant, if fewer than five ranks are reachable, or if one rank absorbs more
than half of all runs. The constants in `balance.js` are tuned against it.

It also carries a deliberate control: a `pcmax` bot that never pivots. That bot
is *supposed* to be the worst strategy in the game, so it's exempt from the
viability assertion. If it ever starts winning, the premise has broken.

---

## Accessibility

- Full keyboard operation: number keys for rooms, `E` to advance, `Esc` to
  close, `Space` to reveal hotspots, `?` for the glossary.
- `Space` is **not** swallowed when a control is focused, so it still activates
  buttons.
- ARIA roles and labels on modals, meters and hotspots.
- Visible focus rings throughout.
- `prefers-reduced-motion` disables transitions and animations outright rather
  than shortening them — see the Changelog for why that distinction matters.
- All colour-coded information is also carried by text.

---

## Adding things

**A feature card** → `data/features.json`, then `npm test`, then
`npm run balance`.

**A new system** → put its constants in `balance.js`, its logic in a new
`sim/` module, wire it through `quarter.js` or `effects.js`, and add it to the
fuzz invariants.

**A new panel** → a pure `(ctx) => string` function in `ui/panels/`, register
it in the `PANELS` map in `app.js`, add a hotspot to the scene table in
`hub.js`. It gets picked up by the panel test sweep automatically.

**Art** → add to `tools/art-manifest.json`, run
`node tools/gen-art.mjs --missing`. See the [art pipeline](art-pipeline.md).
