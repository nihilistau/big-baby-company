# itch.io store page — copy deck

Everything below is written to be pasted into the matching field on
`itch.io/game/edit`. Field names match itch's own labels. Nothing here needs
rewriting to fit; the character counts are already inside itch's limits.

Facts are current as of **v1.1.1**. If you bump the version, the only number
that changes on the page is in *What's in it* — the rest is version-agnostic on
purpose, so the page doesn't rot every release.

---

## Title

```
Big Baby Company
```

## Short description or tagline

*Shown under the title, in search results, and in embeds. itch truncates around
120 characters in some placements, so the first clause has to carry it.*

```
Two numbers on your dashboard. One is what you're paid for. The other is how many people bought it.
```

**Alternates**, if you want to A/B it later:

```
A studio-management roguelite about getting paid for the wrong number.
```

```
Ship the game the industry wants. Watch nobody buy it. Cash the cheque anyway.
```

---

## Classification

**Games** — *A game you can play*

## Kind of project

**HTML** — playable in the browser.

Upload settings:

| Field | Value |
|---|---|
| Viewport dimensions | `1280` × `800` |
| Fullscreen button | ✅ enabled |
| Mobile friendly | ✅ enabled — *orientation: default* |
| Automatically start on page load | ⬜ off (it has a title screen, let it be a title screen) |
| Enable scrollbars | ⬜ off |
| SharedArrayBuffer support | ⬜ off |

## Release status

**Released**

## Pricing

**No payments** — with *Donations enabled* if you want the option open.

It's MIT-licensed and already free on GitHub Pages; putting a price on the itch
build would be strange and would read as worse than free.

---

## Description

*This is the body of the page. itch renders it as rich text — the headings,
bold and lists below all work in its editor.*

---

You own a games studio.

There are two numbers on your dashboard. **Industry score** is what the press
writes about and what investors wire money against. **Copies** is how many human
beings bought the thing. In Act I these two numbers move in opposite directions,
and only one of them is paying your rent.

You will work out the trick within about ten minutes. Stuff the box with the
fashionable stuff, watch the score climb, watch the sales die, cash the wire
anyway. It works beautifully.

It works right up until the quarter it doesn't.

### What you actually do

Every title takes three quarters, and you ship eight of them over six years.

**Pitch it.** Three concepts on the table — pick a scope, a price, an audience.
Then decide whose money builds it: an investor who wants a score and raises
their quota every time you sign, a publisher who wants a slot and 30%, or your
own bank account, which wants nothing and offers nothing.

**Build it.** Spend dev points on feature cards. Hire people who are good, or
people who are cheap, or people who will put their own pet feature in your game
whether you asked or not. **Crunch** to buy a dev point with everyone's weekend.
**Polish** to spend one making what's already there actually work.

**Ship it.** Pick a marketing channel and decide how much cash to set on fire.
Then watch the report: the score, the copies, which card combinations fired, and
whether the controversy you've been accumulating picked today to come due.

### Four meters, each making a different decision hard

- **Standing** buys investor money — and decays every quarter in proportion to
  how much of it you have. The industry's memory is short and its rent scales.
- **Trust** multiplies every copy you will ever sell. Slow to earn. Fast to lose.
- **Heat** is free reach with a dice roll attached. High heat is the most
  profitable state in the game, right up until it isn't.
- **Morale** is whether anyone is still there in a year. Tired people ship broken
  games, and it lands as bugs the moment the box closes.

Gains resist near the ceiling and losses never do, so nothing gets maxed once and
forgotten.

### What's in it

87 feature cards · 41 synergies and conflicts · 16 staff · 72 events ·
20 studio upgrades · 11 endings · 47 achievements · three difficulties ·
seeded, shareable runs · an in-game social feed with recurring characters who
have arcs

A run is 24 quarters and takes about **60–90 minutes**. It saves to your own
browser after every title, and the game tells you when it's a clean place to stop.

### Who this is actually about

The target is the industry, and specifically you — the person in the chair
signing off on all of it. Publishers who mandate content they'll disown,
investors who pay for a number nobody buys, executives who discover a moral
position exactly as profitable as the last one, and a studio head who works out
within ten minutes that the humane thing and the paid thing are different things
and keeps taking the money anyway.

The people making games and the people playing them are not the joke. The
machine between them is.

### No

No install. No account. No launcher. No telemetry. No season pass. It runs in
your browser and saves to your own machine, and nobody — including us — ever
sees your run.

The irony was not lost on us.

---

**Source is [MIT on GitHub](https://github.com/nihilistau/big-baby-company)** —
the simulation, the balance harness, and every word of the content as JSON.
Found a bug or played a run? There's a form for that in the issue tracker; the
playtest one is the one we actually want.

---

## Genre

**Simulation**

*(itch allows one. "Simulation" beats "Strategy" here — the page's own examples
put management games under Simulation, and it's what people browse for.)*

## Custom noun

```
roguelite
```

*Renders as "A roguelite by nihilistau" instead of "A game by nihilistau".*

## Tags

*itch caps this at 10 and explicitly says not to repeat the genre or platform.
These are ordered by how likely they are to be browsed.*

```
management
tycoon
satire
business
roguelite
singleplayer
text-based
dark-humor
incremental
open-source
```

Drop `incremental` first if you want a slot for something else — it's the
loosest fit of the ten.

## Average session

**About an hour**

## Languages

**English**

## Inputs

**Mouse**, **Keyboard**

## Accessibility

Tick **Interactive tutorial** and **Configurable controls**? — no. Tick nothing
you can't defend. What is true and worth putting in the description if itch adds
a field for it: colour is never the only carrier of information, motion honours
`prefers-reduced-motion`, and every action has a keyboard route.

---

## Community

**Comments** — on.

Not a full forum. A closed comment thread is the right size for a free browser
game, and it keeps the substantive reports flowing to the GitHub issue tracker
where the templates are.

---

## Assets to upload

| Slot | Requirement | Use |
|---|---|---|
| **Cover image** | 630×500, min 315×250 | `docs/store/itch-cover.png` — ready |
| **Screenshot 1** | any | `docs/screenshots/act1.gif` — the premise, moving |
| **Screenshot 2** | any | `docs/screenshots/hero.gif` — Act III, bigger numbers |
| **Screenshot 3** | any | `docs/screenshots/04-production.webp` |
| **Screenshot 4** | any | `docs/screenshots/05-launch-report.webp` |
| **Screenshot 5** | any | `docs/screenshots/06-chirper.webp` |
| **Screenshot 6** | any | `docs/screenshots/07-crash.webp` |

**Lead with `act1.gif`.** itch autoplays the first screenshot in some
placements, and that GIF *is* the pitch — one card, +21 industry score, two
thirds of the sales gone. It argues the whole game in four seconds without a
word of copy.

### The cover image

`docs/store/itch-cover.png` — exactly 630×500, upload as-is.

The key art is generated through the same pipeline as everything else in the
game, chained off `hq-purple` so the style matches, with the manifest's usual
no-lettering clause. The wordmark is composited afterwards rather than prompted,
because the model cannot spell and the title has to stay legible at the 315px
itch shows in browse grids.

```bash
node tools/gen-art.mjs --only cover-itch --yes   # $0.06, regenerates the art
npm run store:cover                              # recuts the 630x500 with the wordmark
```

The art keeps its own 1.59:1 aspect in the top 396px and the title bar takes the
remaining 104. An earlier version cropped the width to force 1.26:1 and lost
half the joke whichever side it came off — bias right and the rising arrow loses
its head, bias left and the customers walking away leave early.

### Uploading the build

```bash
npm run pack:itch
```

Writes `dist-itch/big-baby-company-v<version>-web.zip`, about 20MB. It builds
with a relative base and puts `index.html` at the archive root, which are the
two things itch needs and a normal build gets wrong: HTML projects are served
from an unpredictable hashed path, so the `/big-baby-company/` prefix the Pages
workflow bakes in would 404 on every asset, and zipping the folder instead of
its contents uploads cleanly and then shows a blank frame.

Verified before shipping: extracted with a stock unzip, served from a nested
path, boots and plays with every request a 200 and nothing in the console.

---

## Devlog — first post

*Optional, but a page with no devlog reads abandoned on day one.*

**Title:** `Two numbers, six years, and one very expensive mistake`

**Body:**

The game started as one joke: what if the number you're paid for and the number
people are buying were different numbers, and nothing in the machine ever forced
them back together?

Everything since has been finding out what that costs over six years instead of
one quarter. The answer turned out to be four meters that each decay differently,
a bank that charges interest on your optimism, and eleven endings that are chosen
by what your run actually looked like rather than whether you won. The best
ending is not the richest one. The richest one is still pretty good.

It's free, it runs in a browser, and the source and every balance constant are
[on GitHub](https://github.com/nihilistau/big-baby-company). If you play a run,
there's a form in the issue tracker that asks which quarter you got bored. That
one's the useful one.
