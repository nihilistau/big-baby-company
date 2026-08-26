#!/usr/bin/env node
/**
 * Cut the itch.io cover from the generated key art.
 *
 *   node tools/make-store-cover.mjs
 *
 * itch requires exactly 630x500 and shows it at roughly half that in browse
 * grids, so the title has to survive being 315px wide. That rules out baking
 * the lettering into the generated art — the model cannot spell, and every
 * prompt in `art-manifest.json` explicitly forbids it trying. So the art is
 * generated clean and the wordmark is composited here in the same display face
 * the game's chrome uses, which also means the title stays crisp instead of
 * being resampled twice.
 *
 * Nothing is cropped horizontally. The first version took ~20% off the width to
 * force the 1.59:1 art into a 1.26:1 frame, and whichever side it came off cost
 * a half of the joke: bias right and the rising arrow loses its head, bias left
 * and the customers walking away leave early. Giving the title bar its own
 * 104px instead leaves the art at 630x396 — 1.591:1 against the source's
 * 1.588:1, a stretch nobody can see — and the whole image survives.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "docs/store/itch-cover-art.jpg");
const TARGET = path.join(ROOT, "docs/store/itch-cover.png");

const W = 630;
const H = 500;

// Straight from src/style.css, so the store page and the game agree.
const INK = "#150720";
const GOLD = "#e6c15a";
const LILAC = "#cbb0dd";
const DISPLAY = "Bahnschrift, 'Arial Narrow', Haettenschweiler, Impact, sans-serif";

const BAND = 104; // height of the title bar
const RULE = 5; // gold hairline on top of it
const ART = H - BAND; // the art keeps the rest, at its own aspect

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing key art: ${path.relative(ROOT, SOURCE)}`);
    console.error(`Generate it first:  node tools/gen-art.mjs --only cover-itch --yes`);
    process.exit(1);
  }

  const meta = await sharp(SOURCE).metadata();
  const sourceAspect = meta.width / meta.height;
  const frameAspect = W / ART;
  const skew = Math.abs(sourceAspect / frameAspect - 1);
  if (skew > 0.02) {
    console.error(
      `Key art is ${sourceAspect.toFixed(3)}:1 but the art frame is ` +
        `${frameAspect.toFixed(3)}:1 — ${(skew * 100).toFixed(1)}% of stretch. Recrop or regenerate.`
    );
    process.exit(1);
  }

  const art = await sharp({
    create: { width: W, height: H, channels: 3, background: INK },
  })
    .composite([
      { input: await sharp(SOURCE).resize(W, ART, { fit: "fill" }).toBuffer(), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  // The band is drawn rather than blurred into place: this art direction uses
  // hard offset shadows and chunky rules, never soft gradients.
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect x="0" y="${H - BAND}" width="${W}" height="${BAND}" fill="${INK}"/>
    <rect x="0" y="${H - BAND}" width="${W}" height="${RULE}" fill="${GOLD}"/>
    <text x="${W / 2}" y="${H - BAND + 62}" text-anchor="middle"
          font-family="${DISPLAY}" font-size="47" font-weight="700"
          letter-spacing="3" fill="${GOLD}">BIG BABY COMPANY</text>
    <text x="${W / 2}" y="${H - BAND + 87}" text-anchor="middle"
          font-family="${DISPLAY}" font-size="18" font-weight="600"
          letter-spacing="3.4" fill="${LILAC}">THE SCORE GOES UP. THE SALES GO DOWN.</text>
  </svg>`);

  await sharp(art)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(TARGET);

  const out = await sharp(TARGET).metadata();
  const kb = Math.round(fs.statSync(TARGET).size / 1024);
  console.log(`\n  ${path.relative(ROOT, TARGET)}  ${out.width}x${out.height}  ${kb}kb`);
  console.log(
    `  art ${meta.width}x${meta.height} → ${W}x${ART}, ${(skew * 100).toFixed(2)}% stretch\n`
  );

  if (out.width !== W || out.height !== H) {
    console.error(`  !! expected ${W}x${H} — itch will reject this.`);
    process.exit(1);
  }
}

main();
