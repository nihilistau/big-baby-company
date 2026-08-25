# Content Bible

Everything except the art lives in `data/*.json`. Adding content is a JSON
edit; the integrity tests in
[`tests/content.test.js`](../tests/content.test.js) will tell you if you break
a reference.

```
79 cards · 36 synergy rules · 16 staff · 72 events · 24 concepts
8 deals · 20 upgrades · 7 channels · 8 backlash outcomes
11 endings · 8 ranks · 47 achievements · 169 chirps across 14 accounts
```

---

## Voice

The satire points in every direction it can reach. Consultants **and**
executives. Review-score cartels **and** battle passes. People who have never
shipped anything **and** people who have shipped nine things and learned
nothing. Crunch, layoffs announced by calendar invite, and an audience that
will pre-order anything with a number after it.

**The player is the villain.** That is the design. Every card is written from
inside a company where this decision seemed reasonable at the time.

Rules that keep it consistent:

- **Specific beats general.** Not "monetisation is bad" — *"it rotates daily,
  it has a countdown timer, and the countdown timer is the product."*
- **The joke is in the detail that's true.** The goblin rewritten as a
  misunderstood accountant, then rewritten again because accountants are a
  protected profession in one of the markets.
- **Let the good things be good.** `The Writers Were Left Alone` and
  `There Is A Dog` are sincere. A satire where nothing is worth making has
  nowhere to stand.
- **No real people.** No celebrity likenesses, no named studios. The cartoon
  adult in the nappy is nobody in particular.
- **Land it, then stop.** Two or three sentences. The third sentence is usually
  where the joke is.

---

## Feature cards — `data/features.json`

```json
{
  "id": "fun-gunfeel",
  "name": "Tight Gunfeel",
  "acts": [1, 2, 3],
  "cost": 1,
  "pc": 0, "fun": 2, "gore": 0, "ordinary": 0,
  "jank": 0, "hype": 3,
  "tags": ["combat", "tech"],
  "money": 0.35,
  "unlock": { "type": "high-jank", "value": 50, "hint": "Ship a title with 50+ jank." },
  "blurb": "The gun goes bang and the bang feels expensive.",
  "body": "Recoil, muzzle flash, and hitstop were tuned by someone who has actually been shot at in a video game…"
}
```

| Field | Notes |
|---|---|
| `acts` | Which acts it can be drafted in. Availability: **38 / 45 / 77** |
| `cost` | Dev points, 1–3 |
| axes | `pc` `fun` `gore` `ordinary`, can be negative |
| `jank` | −20 to +16. Negative cards are the invisible expensive ones. |
| `hype` | Pre-launch attention, feeds the copies multiplier |
| `money` | Optional. Per-player revenue rate, independent of box price. |
| `tags` | `art` `character` `combat` `meme` `monetization` `narrative` `process` `social` `tech` `ui` |
| `unlock` | Optional. `shipped-gore` · `titles-shipped` · `high-jank` · `went-broke` |
| `blurb` | One line. The pitch. |
| `body` | 2–3 sentences. Minimum 80 characters, enforced by test. |

### Families

| Family | Count | Role |
|---|---|---|
| PC | 20 | Industry score, at the cost of everything else |
| FUN | 16 | Copies, at the cost of industry score |
| GORE | 10 | Copies plus heat, and the industry hates you |
| ORDINARY | 8 | Quiet copies, high trust, no downside |
| TECH | 8 | Jank reduction, invisible, expensive |
| MONETIZATION | 10 | Revenue independent of price, trust destruction |
| MEME | 7 | Hype and heat, unpredictable |

### Adding one

1. Add the object to `data/features.json`.
2. `npm test` — integrity tests check the id is unique, the body is long
   enough, tags exist, and every act it claims has a playable catalogue.
3. If it should combine with something, add a rule to `data/synergies.json`.
4. `npm run balance` — confirm you haven't broken an archetype.

---

## Synergies — `data/synergies.json`

24 synergies, 12 conflicts. Matching is either an exact set or a tag count.

```json
{
  "id": "the-gun-works",
  "name": "THE GUN WORKS",
  "kind": "synergy",
  "requires": ["fun-gunfeel", "gore-headshot"],
  "effects": { "copiesMul": 1.4, "scoreAdd": -4, "trust": 6, "hype": 6 },
  "line": "Weight, recoil, and a head that respects it. Nobody needed the pitch document."
}
```

Effect vocabulary: `scoreAdd` `copiesMul` `moneyMul` `goreMul` `funMul`
`pcMul` `jank` `hype` `heat` `trust` `standing`.

**Every rule needs a `line`.** It's what appears on the launch banner and it's
doing most of the comedic work.

Selected examples:

| | |
|---|---|
| **THE GUN WORKS** | Tight Gunfeel + Headshots Count → +40% copies |
| **THE TRILOGY OF CARE** | Three PC narrative systems → +15 score, −30% copies |
| **A MAN AND HIS DOG** | Balding Dad + There Is A Dog → +30% copies, +14 trust |
| **THE CLIP FARM** | Physics Objects + Ragdolls → +45% copies, +8 jank, +10 heat |
| **GRAPE SODA MASSACRE** *(conflict)* | Purple Mandate + Arterial Spray → gore halved |
| **THE CONTRADICTION** *(conflict)* | Combat Was The Problem + Tight Gunfeel → fun ×0.3 |
| **THE DAMP BLACKSMITH** *(conflict)* | Generative NPCs + People Talk Like People → fun ×0.5 |

---

## Staff — `data/staff.json`

16 hires, 9 injectors and 7 talent.

```json
{
  "id": "gordo",
  "name": "Gordo Beans",
  "role": "Producer",
  "salary": 31000,
  "acts": [1, 2, 3],
  "petFeature": null,
  "petBackups": [],
  "traits": ["talent", "fixer"],
  "devPoints": 1,
  "crunchDiscount": 0.5,
  "atLock": { "jank": -12, "aura": { "fun": 2 } },
  "perQuarter": { "morale": 6, "jank": -2 },
  "moneyMul": 0.45,
  "blurb": "The reason anything ever ships.",
  "body": "Gordo remembers every dependency, buys the pizza with his own card…"
}
```

**Injectors** carry `petFeature` plus `petBackups`. At lock they walk that
preference list: place the first legal one in an empty slot; if the box is full,
overwrite the first FUN-bearing card; if there's nothing left, add ambient PC.

**Talent** carry `atLock` and/or `perQuarter` and inject nothing.

> Every `petFeature` and `petBackup` must be draftable in at least one act the
> staffer is available in. Enforced by test.

### The roster

| | Injectors | | Talent |
|---|---|---|---|
| **Brie Solidarity** | Head of Belonging | **Rusty Kane** | Gameplay Programmer, +1 point, −12 jank |
| **Xander They** | Narrative Lead | **Mei Okonkwo** | Combat Designer, +2 FUN at lock |
| **Karen From HR** | People Operations | **Dutch Vandal** | Gore Technologist, +2 GORE, +6 heat |
| **Ash Palette** | Art Director of one colour | **Sal Moretti** | QA Lead, −18 jank |
| **Morgan Lecture** | Consultant, **−1 dev point** | **Lin Park** | Audio Director, hype and trust |
| **Jules Casting** | Casting Director | **Gordo Beans** | Producer, +1 point, half-price crunch |
| **Tobias Runway** | CVO, **−1 point**, +8 standing | **Wren Alvarez** | Community Manager, +6 trust, −8 heat |
| **Petra Deck** | VP of Alignment | | |
| **Viktor Sloane** | Monetisation, +45% revenue | | |

---

## Events — `data/events.json`

72 events, 191 choices, 13 with dice.

```json
{
  "id": "the-scope-meeting",
  "title": "The scope meeting",
  "acts": [1, 2, 3],
  "phases": ["production"],
  "weight": 10,
  "requires": { "maxMorale": 55, "hasStaff": true },
  "scripted": { "quarter": 2 },
  "body": "Everyone in the room can see the same graph…",
  "choices": [
    { "label": "Cut a feature. Ship the rest properly.",
      "effects": { "removeRandomCard": true, "jank": -14, "morale": 8 },
      "chirp": { "who": "anon", "text": "…" } }
  ]
}
```

### Effect vocabulary

Everything routes through `applyEffects()` in
[`src/sim/effects.js`](../src/sim/effects.js):

| | |
|---|---|
| **Cash** | `cash` `cashPerStaff` |
| **Meters** | `standing` `trust` `heat` `morale` |
| **Title** | `aura` `jank` `hype` `scoreDelta` `copiesMul` `moneyMul` `priceMul` `devPoints` |
| **Cards** | `addCard` `removeRandomCard` `unlockRandomCard` |
| **Staff** | `fireRandomStaff` |
| **Production** | `crunchFree` `crunchDiscount` |
| **Flags** | `liveService` `loseIP` `boardSeat` `founderPaid` |
| **Gated** | `roll: { chance, success, fail }` — resolves to exactly one branch |

### Predicates

`minStanding` `maxStanding` `minTrust` `maxTrust` `minHeat` `maxHeat`
`minMorale` `maxMorale` `minCash` `maxCash` `minJank` `minHype` `minPc`
`minGore` `minCrunch` `minTitlesShipped` `minMonetization` `hasStaff`
`liveService` `dealType`

> Every act/phase combination needs **at least four** drawable events, enforced
> by test. That's what keeps a 24-quarter run from repeating itself.

### Scripted beats

| Quarter | Event | Why |
|---|---|---|
| 2 | The values pass | Teaches that choices have axis consequences |
| 3 | Embargo quote | Teaches score-versus-copies as a direct trade |
| 10 | The fridge is empty | Sets the tone for Act II immediately |

---

## Concepts — `data/titles.json`

24 concepts across 8 title slots, three offered per slot.

```json
{
  "id": "parking-lot-2",
  "name": "Parking Lot 2: Multistorey",
  "genre": "Survival Action",
  "slots": 4, "price": 25, "budget": 51000,
  "sequelTo": "parking-lot",
  "skew": { "gore": 1.2 },
  "pitch": "Six floors. One ramp. The same shopping trolley.",
  "hook": "They liked the first one. Give them the first one again, but up."
}
```

`sequelTo` gates the concept behind having shipped its predecessor and grants
+18% copies per prior title in the line. `skew` multiplies specific axis
coefficients. `price: 0` marks a free-to-enter title that earns entirely
through monetisation cards.

> Sequels must point at a concept in an **earlier** slot. Enforced by test.

---

## Endings and ranks — `data/endings.json`

Eleven endings, resolved by priority against the run's final state.

| Priority | Ending | Requires |
|---|---|---|
| 100 | **The Exit** | Took the acquisition |
| 90 | **The Place** | Live service, $1.8M+ |
| 80 | **The Room With The Door Closed** | Trust 75+, $750k+, refused the offer |
| 70 | **Adored, Insolvent** | Trust 70+, in debt |
| 60 | **It's The Money, Baby** | $1.8M+, trust below 45 |
| 55 | **The Long Way** | Trust 60+, $250k–$1.8M |
| 50 | **The Building Emptied** | Morale below 25 |
| 45 | **Permanently Trending** | Heat 65+ |
| 40 | **The Necessary Voice** | Standing 80+, under $250k |
| 30 | **Wendy's Is Hiring** | In debt |
| 0 | **The Quarter After** | Always matches |

The priority-0 fallback must always exist with empty requirements. Enforced by
test.

Ranks are a contiguous cash ladder — no gaps, no overlaps, also enforced.

---

## Chirper — `data/chirps.json`

169 posts, 14 accounts, 40 pools.

```json
{
  "accounts": {
    "grum": { "name": "Grum", "handle": "@grumdotexe", "kind": "hater" }
  },
  "pools": {
    "launch-fun-high": [ { "who": "haters", "text": "Wait, I had a good time? Is that allowed." } ]
  }
}
```

`kind` drives both the colour and — via the reach table in
[`chirper.js`](../src/ui/panels/chirper.js) — how much engagement the post
attracts. A streamer pulls 310k baseline views; a laid-off staffer pulls 9k.
Reach is a function of who is posting, not of what they said.

### The cast

| | |
|---|---|
| **The Vanguard** `@vanguard_games` | Earnest trade press. Uses "necessary" a lot. |
| **TrendPiece** `@trendpiece` | Will have nine hundred words on this by Friday. |
| **The Backlog** `@backlog_reviews` | Actually finishes games. Frequently right. |
| **North Star Capital** `@northstar_cap` | "Units are a western metric." |
| **Grum** `@grumdotexe` | Hater. Slowly, painfully, comes around. |
| **Chad Vantage** `@vantagelive` | Streamer. All caps. Enormous reach. |
| **Dr. Priya Nandi** `@nandi_plays` | Academic. Will be teaching this, not playing it. |
| **Anon Dev** `@throwaway4491` | Inside the building. Has a spreadsheet now. |
| **Marcus Toll** `@tollbooth` | Leaker. Always early, always right. |
| **Wendy's** `@wendys` | Hiring. |
| **Sheila, 71** `@sheila_plays` | Has never pre-ordered anything in her life. |

Pools are keyed by trigger — `launch-fun-high`, `wire-voided`, `crunch-heavy`,
`backlash`, `layoff`, `acquisition-refused` and so on. Reactive, not scripted:
the feed reads the actual launch result.

---

## Achievements — `data/achievements.json`

47, of which 8 are hidden. Stored in `localStorage['bbc-meta']`, persisting
across runs alongside card unlocks, endings seen and Endless best.

```json
{ "id": "the-gun-works", "name": "The Gun Works", "icon": "🔫",
  "desc": "Fire THE GUN WORKS.", "hidden": true }
```

An achievement whose `id` matches a synergy `id` is granted automatically when
that synergy fires — no extra wiring needed.
