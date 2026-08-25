# Art Pipeline

51 stills and 3 video stingers, generated through
[`tools/gen-art.mjs`](../tools/gen-art.mjs) against the xAI Imagine API and
committed to the repo. A full regeneration costs about **$3** and takes around
forty minutes.

---

## Art direction

**Bold-ink MAD-magazine caricature over VGA adventure-game backgrounds.**

Heavy black outlines of varying weight. Flat cel-shaded fills with hard-edged
shadow shapes. Punchy saturated colour. Comic cross-hatching for texture.
Wonky exaggerated perspective. Oversized heads, big noses, rubbery faces.

The first pass was painterly oil. It looked handsome and it killed the comedy —
the joke lives in the linework. If you change nothing else about this project,
don't change that back.

The style preamble and per-asset prompts live in
[`tools/art-manifest.json`](../tools/art-manifest.json). Edit it there and
regenerate; nothing is hand-retouched.

---

## Running it

Needs `XAI_API_KEY` in `.env` (or the environment). The tool also looks in a
couple of sibling paths.

```bash
node tools/gen-art.mjs --check                  # verify what's on disk
node tools/gen-art.mjs --estimate               # cost, generate nothing
node tools/gen-art.mjs --missing --yes          # fill in what's absent
node tools/gen-art.mjs --only logo,hq-normal    # specific assets
node tools/gen-art.mjs --group portrait         # a whole group
node tools/gen-art.mjs --videos --yes           # the three stingers
node tools/gen-art.mjs --optimise               # resize and re-encode
```

`--check` is part of `npm run verify` and fails the build on missing assets,
assets the code references but the manifest doesn't declare, or **hub scenes at
inconsistent aspect ratios**.

### Costs

The API reports `cost_in_usd_ticks`, where a tick is **1e-10 USD**. A medium 2k
image bills 600,000,000 ticks — six cents. An eight-second video bills
4,000,000,000 — forty cents.

The tool tracks actual spend from the API response and reports it, rather than
trusting the estimate. Failed generations and content-moderation rejections
still bill.

---

## What the tool does

**Crops the watermark.** The provider stamps the bottom of every image. Every
asset is cropped by 5.5% of its height before it is written.

**Kills baked-in lettering.** Generated art loves to invent unreadable signage.
The negative prompt is aggressive and specific about it — no letters, no words,
no numbers, no signage, no readable writing on any screen, poster, book or
whiteboard, blank surfaces instead. The original asset set had
`MICROTRANSACTIONS ONLY` and gibberish phone screens baked into the office
wall.

**Keys the logo to transparency.** The mascot is generated on a flat green
field, then chroma-keyed with corner sampling (so it learns the *actual*
background rather than trusting the prompt) plus **spill suppression** — edge
pixels have their green channel pulled back toward `max(r, b)`, which kills the
fringe you'd otherwise see against the dark purple chrome.

**Retries.** The image endpoint returns 503s and drops sockets routinely. Four
attempts with backoff for images, three plus a separate download retry for
video.

**Optimises.** `--optimise` resizes to sane web dimensions and re-encodes.
Scenes cap at 1920px, covers at 700, portraits at 560. The full set goes from
about 18MB to 8.7MB.

---

## The aspect-ratio invariant

**All hub scenes must share one aspect ratio.**

Hotspot rectangles are percentages of the scene frame. If one scene ships at a
different ratio it gets cropped by `object-fit` and every clickable region on
it moves.

This is not hypothetical — it's exactly what happened. The art is 1.88:1 and
the CSS frame was hard-coded 16:9, quietly cropping 5.5% off the width of every
scene. `--check` now measures every file in `public/assets/hubs/` and fails if
they disagree:

```
51 assets in the manifest
  present : 51
  missing : 0

  scene aspect: 1.88 (consistent)
```

---

## The manifest

```json
{
  "style": "Bold-ink cartoon illustration in the style of 1990s MAD magazine…",
  "negative": "NOT painterly. No oil paint… ABSOLUTELY NO TEXT of any kind…",
  "defaults": { "model": "grok-imagine-image-2.0", "quality": "medium", "resolution": "2k" },
  "assets": [
    {
      "id": "hq-normal",
      "path": "public/assets/hubs/hq-normal.jpg",
      "aspect": "wide",
      "hero": true,
      "prompt": "Wide interior of a trendy open-plan video game studio at dusk…"
    }
  ],
  "videos": [ { "id": "sting-crash", "path": "public/assets/video/sting-crash.mp4", "prompt": "…" } ]
}
```

The final prompt is `style + prompt + aspectHint + negative`. `hero: true`
generates at 2k/medium; everything else at 1k.

`from: "<assetId>"` chains a variant off a previously generated sibling for
style consistency. It degrades to prompt-only if the parent file is too large
to send, and retries without chaining if the request fails — a missing image is
worse than a slightly off-style one.

| Group | Count | Aspect |
|---|---|---|
| Hub scenes | 7 | wide (1.88:1) |
| Staff portraits | 16 | portrait |
| Title covers | 16 | cover (3:4) |
| Ending stills | 11 | wide |
| Logo | 1 | square, transparent PNG |
| Video stingers | 3 | — |

---

## Video

Generation is asynchronous: `POST /v1/videos/generations` returns a request id,
then you poll `GET /v1/videos/{id}` until it hands back a URL.

Two things that cost time to discover:

- The video endpoint **rejects an `image` seed** in every form tried — both a
  data URI and raw base64 return a 422. Video is prompt-only, which the shared
  style preamble handles well enough.
- Content moderation is stricter here than for stills. A prompt describing a
  figure on a poolside lounger was rejected twice; describing the same scene
  with nobody in it passed and reads better anyway.

The three stingers play behind the act-transition cards and the ending screen,
each dimmed and blurred so the type stays legible.

---

## Writing a prompt

**Describe the composition, not the mood.** Hotspots go on top, so where things
sit in frame matters more than atmosphere. "Beanbags and a listening-circle of
chairs on the left, a glass-walled meeting room on the right, an elevator far
right, a huge gilt-framed portrait dominating the back wall."

**Name what is absent.** "Blank whiteboard", "no lettering", "empty deck
chairs".

**Keep the joke in the objects.** The garage has a corkboard of storyboards
flecked with red paint and a mini-fridge with a ketchup packet in it. The loft
has a shelf of trophies next to a shelf of mascot plushes.

**Expect to retune hotspots.** Regenerating a scene will move things. The
coordinate table is in
[`src/ui/hub.js`](../src/ui/hub.js), and the fastest way to check alignment is
a temporary debug outline in the browser:

```js
document.head.insertAdjacentHTML('beforeend',
  `<style>.hotspot{outline:3px solid #ff0!important;background:rgba(255,255,0,.13)!important}
   .hotspot::after{content:attr(aria-label);position:absolute;background:#000;color:#ff0;font:10px monospace}</style>`);
```
