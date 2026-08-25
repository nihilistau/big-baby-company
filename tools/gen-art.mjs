#!/usr/bin/env node
/**
 * Manifest-driven art generation against the xAI Imagine API.
 *
 * Three things this fixes about the original asset set:
 *   1. Every image carried a visible Grok watermark in the corner. We crop the
 *      bottom strip off every generated image.
 *   2. Garbled AI lettering was baked into the art ("MICROTRANSACTIONS ONLY",
 *      unreadable phone screens). Every prompt now carries an explicit,
 *      aggressive no-text clause.
 *   3. Styles drifted between assets. A shared style preamble plus optional
 *      image-to-image chaining (`from`) keeps a group coherent.
 *
 *   node tools/gen-art.mjs --check                  verify what's on disk
 *   node tools/gen-art.mjs --estimate               print the cost, generate nothing
 *   node tools/gen-art.mjs --only logo,hq-normal    generate specific assets
 *   node tools/gen-art.mjs --group portrait         generate a whole group
 *   node tools/gen-art.mjs --missing                only what isn't on disk
 *   node tools/gen-art.mjs --all --yes              the lot
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

let spent = 0;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "tools", "art-manifest.json");
const ENDPOINT = "https://api.x.ai/v1/images/generations";
const VIDEO_ENDPOINT = "https://api.x.ai/v1/videos/generations";
const VIDEO_POLL = "https://api.x.ai/v1/videos/";

// Per-asset price so --estimate is honest before spending anything.
// The API reports `cost_in_usd_ticks`, where a tick is 1e-10 USD: a medium 2k
// image bills 600,000,000 ticks = $0.06, and an 8s video 4,000,000,000 = $0.40.
const TICK_USD = 1e-10;
const PRICE = { low: 0.04, medium: 0.06, high: 0.08 };
const VIDEO_PRICE = 0.4;
// Blank line between prompt sections.
const PROMPT_SEP = String.fromCharCode(10, 10);

// --- Key ------------------------------------------------------------------

function readKey() {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY.trim();
  const candidates = [
    path.join(ROOT, ".env"),
    "C:/Projects/Narration/.env",
    path.join(ROOT, "..", "Narration", ".env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^XAI_API_KEY\s*=\s*(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("No XAI_API_KEY found. Set the env var or add it to .env.");
}

// --- Image post-processing -------------------------------------------------

/**
 * Strip the watermark band off the bottom of a JPEG by re-encoding a crop.
 *
 * Doing this without an image library means decoding the JPEG ourselves, which
 * is not reasonable — so we shell out to whatever is available. If nothing is,
 * we fall back to leaving the image alone and say so loudly, because a silent
 * watermark is exactly the failure we are trying to fix.
 */
async function cropWatermark(buffer, { fraction = 0.055 } = {}) {
  const sharp = await import("sharp").catch(() => null);
  if (!sharp) return { buffer, cropped: false };

  const img = sharp.default(buffer);
  const meta = await img.metadata();
  const cut = Math.max(1, Math.round(meta.height * fraction));
  const out = await sharp
    .default(buffer)
    .extract({ left: 0, top: 0, width: meta.width, height: meta.height - cut })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  return { buffer: out, cropped: true, width: meta.width, height: meta.height - cut };
}

async function toPngWithAlpha(buffer, { chroma = { r: 60, g: 160, b: 70 }, tolerance = 92 } = {}) {
  const sharp = await import("sharp").catch(() => null);
  if (!sharp) return { buffer, keyed: false };

  const img = sharp.default(buffer);
  const meta = await img.metadata();
  const cut = Math.max(1, Math.round(meta.height * 0.055));
  const { data, info } = await sharp
    .default(buffer)
    .extract({ left: 0, top: 0, width: meta.width, height: meta.height - cut })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Sample the corners to learn the actual background rather than trusting the
  // prompt to have produced the exact green we asked for.
  const px = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const corners = [px(2, 2), px(info.width - 3, 2), px(2, info.height - 3), px(info.width - 3, info.height - 3)];
  const avg = corners.reduce(
    (a, c) => ({ r: a.r + c.r / 4, g: a.g + c.g / 4, b: a.b + c.b / 4 }),
    { r: 0, g: 0, b: 0 }
  );
  const key = avg.g > avg.r + 25 && avg.g > avg.b + 25 ? avg : chroma;

  for (let i = 0; i < data.length; i += info.channels) {
    const d =
      Math.abs(data[i] - key.r) + Math.abs(data[i + 1] - key.g) + Math.abs(data[i + 2] - key.b);
    if (d < tolerance) data[i + 3] = 0;
    else if (d < tolerance * 1.8) data[i + 3] = Math.round(((d - tolerance) / (tolerance * 0.8)) * 255);

    // Spill suppression. Without this the subject keeps a green rim wherever
    // the background bled into the edge pixels, which is glaring once the logo
    // sits on a dark purple chrome bar.
    if (data[i + 3] > 0) {
      const cap = Math.max(data[i], data[i + 2]);
      if (data[i + 1] > cap) data[i + 1] = Math.round(cap + (data[i + 1] - cap) * 0.25);
    }
  }

  const out = await sharp
    .default(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { buffer: out, keyed: true };
}

// --- Generation -----------------------------------------------------------

function buildPrompt(manifest, asset) {
  const aspect = manifest.aspects[asset.aspect]?.hint || "";
  return [manifest.style, asset.prompt, aspect, manifest.negative]
    .filter(Boolean)
    .join("\n\n");
}

async function generate(key, manifest, asset, opts) {
  const body = {
    model: asset.model || manifest.defaults.model,
    prompt: buildPrompt(manifest, asset),
    n: 1,
    response_format: "b64_json",
    quality: asset.quality || (asset.hero ? "medium" : manifest.defaults.quality),
    resolution: asset.resolution || (asset.hero ? "2k" : "1k"),
  };

  // Style chaining: feed a previously generated sibling back in so a group of
  // variants (the three HQ states) stays visually identical.
  // Style chaining sends the parent image back as an input. Large 2k parents
  // can blow the request size, so it degrades to prompt-only rather than
  // failing the asset outright.
  if (asset.from && !opts.noChain) {
    const parent = manifest.assets.find((a) => a.id === asset.from);
    const parentPath = parent && path.join(ROOT, parent.path);
    if (parentPath && fs.existsSync(parentPath)) {
      const bytes = fs.statSync(parentPath).size;
      if (bytes < 700000) {
        body.image = `data:image/jpeg;base64,${fs.readFileSync(parentPath).toString("base64")}`;
      }
    }
  }

  // The image endpoint is genuinely flaky under load — 503s and dropped
  // sockets are routine. Retry with backoff rather than losing the asset.
  const attempts = opts.attempts ?? 4;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240000),
      });

      if (!response.ok) {
        const text = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        const err = new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
        if (!retryable) throw err;
        lastError = err;
      } else {
        const json = await response.json();
        const b64 = json?.data?.[0]?.b64_json;
        if (!b64) throw new Error("No image in response: " + JSON.stringify(json).slice(0, 160));
        spent += (json?.usage?.cost_in_usd_ticks || 0) * TICK_USD;
        return Buffer.from(b64, "base64");
      }
    } catch (err) {
      if (err.message?.startsWith("HTTP 4") && !err.message.startsWith("HTTP 429")) throw err;
      lastError = err;
    }
    if (attempt < attempts) {
      const wait = 4000 * attempt + Math.floor(Math.random() * 2000);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError || new Error("generation failed");
}

/**
 * Video generation is an async job: POST returns a request id, then you poll
 * until it hands back a URL. Roughly $4 per eight-second clip, so these are
 * generated deliberately and rarely.
 */
async function generateVideo(key, manifest, video) {
  const body = {
    model: video.model || manifest.videoDefaults.model,
    prompt: [manifest.style, video.prompt, manifest.negative].filter(Boolean).join(PROMPT_SEP),
  };

  // No image seeding here: the video endpoint rejects both a data: URI and a
  // raw base64 string for `image`, and the shared style preamble already keeps
  // the clips close enough to the stills they transition out of.

  let id = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3 && !id; attempt++) {
    try {
      const start = await fetch(VIDEO_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
      if (!start.ok) {
        const text = await start.text();
        const err = new Error(`HTTP ${start.status}: ${text.slice(0, 200)}`);
        if (start.status < 500 && start.status !== 429) throw err;
        lastError = err;
      } else {
        id = (await start.json()).request_id;
      }
    } catch (err) {
      if (err.message?.startsWith("HTTP 4") && !err.message.startsWith("HTTP 429")) throw err;
      lastError = err;
    }
    if (!id && attempt < 3) await new Promise((r) => setTimeout(r, 6000 * attempt));
  }
  if (!id) throw lastError || new Error("no request id returned");

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(VIDEO_POLL + id, { headers: { Authorization: `Bearer ${key}` } });
    const json = await poll.json().catch(() => ({}));
    if (json.status === "done" && json.video?.url) {
      // The CDN hand-off drops connections often enough to be worth retrying.
      for (let tries = 1; tries <= 4; tries++) {
        try {
          const file = await fetch(json.video.url, { signal: AbortSignal.timeout(180000) });
          if (!file.ok) throw new Error(`download HTTP ${file.status}`);
          return Buffer.from(await file.arrayBuffer());
        } catch (err) {
          if (tries === 4) throw err;
          await new Promise((r) => setTimeout(r, 5000 * tries));
        }
      }
    }
    if (json.status === "failed" || json.error) {
      const detail =
        typeof json.error === "string" ? json.error : JSON.stringify(json.error ?? json);
      throw new Error(detail.slice(0, 220));
    }
  }
  throw new Error("video job timed out");
}

async function writeAsset(manifest, asset, buffer) {
  const target = path.join(ROOT, asset.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  let final;
  let note;
  if (asset.transparent) {
    const r = await toPngWithAlpha(buffer);
    final = r.buffer;
    note = r.keyed ? "keyed + cropped" : "raw (sharp unavailable)";
  } else {
    const r = await cropWatermark(buffer);
    final = r.buffer;
    note = r.cropped ? `cropped ${r.width}x${r.height}` : "raw (sharp unavailable)";
  }
  fs.writeFileSync(target, final);
  return { bytes: final.length, note };
}

// --- Optimisation ----------------------------------------------------------

/** Sensible on-screen sizes. Generating at 2k and shipping 2k is 30MB of hubs. */
const MAX_WIDTH = { wide: 1920, cover: 700, portrait: 560, square: 1024 };

async function optimise(manifest) {
  const sharp = await import("sharp").catch(() => null);
  if (!sharp) {
    console.log("sharp is not installed; nothing to optimise.");
    return;
  }
  let before = 0;
  let after = 0;

  for (const asset of manifest.assets) {
    const file = path.join(ROOT, asset.path);
    if (!fs.existsSync(file)) continue;
    const startBytes = fs.statSync(file).size;
    before += startBytes;

    const maxWidth = MAX_WIDTH[asset.aspect] || 1600;
    // Read into memory first: sharp cannot stream from and write to the same
    // path on Windows without hitting a file lock.
    const source = fs.readFileSync(file);
    const meta = await sharp.default(source).metadata();
    if (meta.width <= maxWidth && startBytes < 400000) {
      after += startBytes;
      continue;
    }

    const pipeline = sharp.default(source).resize({
      width: Math.min(meta.width, maxWidth),
      withoutEnlargement: true,
    });
    const out = asset.transparent
      ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true }).toBuffer();

    fs.writeFileSync(file, out);
    after += out.length;
    console.log(
      `  ${asset.id.padEnd(22)} ${(startBytes / 1024).toFixed(0)}kb → ${(out.length / 1024).toFixed(0)}kb`
    );
  }
  console.log(
    `
total ${(before / 1024 / 1024).toFixed(1)}mb → ${(after / 1024 / 1024).toFixed(1)}mb`
  );
}

// --- Verification ---------------------------------------------------------

function check(manifest) {
  const rows = [];
  for (const asset of manifest.assets) {
    const file = path.join(ROOT, asset.path);
    const exists = fs.existsSync(file);
    rows.push({
      id: asset.id,
      path: asset.path,
      exists,
      bytes: exists ? fs.statSync(file).size : 0,
    });
  }
  const missing = rows.filter((r) => !r.exists);
  const tiny = rows.filter((r) => r.exists && r.bytes < 8000);

  console.log(`\n${rows.length} assets in the manifest`);
  console.log(`  present : ${rows.length - missing.length}`);
  console.log(`  missing : ${missing.length}`);
  if (missing.length) for (const r of missing) console.log(`      - ${r.id}  (${r.path})`);
  if (tiny.length) {
    console.log(`  suspiciously small:`);
    for (const r of tiny) console.log(`      - ${r.id}  ${r.bytes}b`);
  }

  // Anything referenced by the game but not in the manifest is a broken link.
  const referenced = collectReferences();
  const declared = new Set(manifest.assets.map((a) => "/" + a.path.replace(/^public\//, "")));
  const orphans = [...referenced].filter((r) => !declared.has(r));
  if (orphans.length) {
    console.log(`\n  referenced by code but not in the manifest:`);
    for (const o of orphans) console.log(`      - ${o}`);
  }
  console.log("");
  return missing.length === 0 && orphans.length === 0;
}

/**
 * Every wide scene must share one aspect ratio, because hotspot coordinates are
 * percentages of a frame whose aspect is hard-coded in CSS. A scene at a
 * different ratio gets cropped by object-fit and every region on it shifts.
 */
async function checkAspects(manifest) {
  const sharp = await import("sharp").catch(() => null);
  if (!sharp) return true;
  // Only the hub scenes matter: they are the ones with hotspots laid over them.
  const wide = manifest.assets.filter((a) => a.path.includes("/hubs/"));
  const seen = new Map();
  for (const asset of wide) {
    const file = path.join(ROOT, asset.path);
    if (!fs.existsSync(file)) continue;
    const meta = await sharp.default(fs.readFileSync(file)).metadata();
    const ratio = (meta.width / meta.height).toFixed(2);
    if (!seen.has(ratio)) seen.set(ratio, []);
    seen.get(ratio).push(asset.id);
  }
  if (seen.size <= 1) {
    const [ratio] = [...seen.keys()];
    if (ratio) console.log(`  scene aspect: ${ratio} (consistent)
`);
    return true;
  }
  console.log("  !! scene art has mixed aspect ratios — hotspots will be displaced:");
  for (const [ratio, ids] of seen) console.log(`      ${ratio}: ${ids.join(", ")}`);
  console.log("");
  return false;
}

/** Scan src/ and data/ for /assets/... paths so the manifest can't drift. */
function collectReferences() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|json|html|css)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        for (const m of text.matchAll(/\/assets\/[A-Za-z0-9._/-]+\.(?:jpg|png|webp)/g)) {
          if (!m[0].includes("${")) found.add(m[0]);
        }
      }
    }
  };
  walk(path.join(ROOT, "src"));
  return found;
}

// --- CLI ------------------------------------------------------------------

function select(manifest, argv) {
  const arg = (name) => {
    const i = argv.indexOf("--" + name);
    return i >= 0 ? argv[i + 1] : null;
  };
  const only = arg("only");
  const group = arg("group");

  let list = manifest.assets;
  if (only) {
    const wanted = new Set(only.split(",").map((s) => s.trim()));
    list = list.filter((a) => wanted.has(a.id));
  }
  if (group) list = list.filter((a) => a.group === group || a.id.startsWith(group));
  if (argv.includes("--missing")) {
    list = list.filter((a) => !fs.existsSync(path.join(ROOT, a.path)));
  }
  // Chained assets must run after their parent.
  return list.sort((a, b) => (a.from ? 1 : 0) - (b.from ? 1 : 0));
}

function estimate(manifest, list) {
  let total = 0;
  for (const a of list) {
    const q = a.quality || (a.hero ? "medium" : manifest.defaults.quality);
    total += PRICE[q] ?? 0.6;
  }
  return total;
}

async function confirm(question) {
  if (process.argv.includes("--yes")) return true;
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question(question, r));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const argv = process.argv.slice(2);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

  if (argv.includes("--optimise") || argv.includes("--optimize")) {
    await optimise(manifest);
    return;
  }

  if (argv.includes("--check")) {
    const filesOk = check(manifest);
    const aspectOk = await checkAspects(manifest);
    process.exitCode = filesOk && aspectOk ? 0 : 1;
    return;
  }

  if (argv.includes("--videos")) {
    const videos = manifest.videos || [];
    const wanted = argv.includes("--missing")
      ? videos.filter((v) => !fs.existsSync(path.join(ROOT, v.path)))
      : videos;
    if (!wanted.length) {
      console.log("No videos to generate.");
      return;
    }
    console.log(`
${wanted.length} video(s) — rough cost $${(wanted.length * VIDEO_PRICE).toFixed(2)}
`);
    for (const v of wanted) console.log(`  ${v.id.padEnd(22)} ${v.path}`);
    console.log("");
    if (argv.includes("--estimate")) return;
    if (!(await confirm("Generate these? [y/N] "))) return console.log("Cancelled.");

    const key = readKey();
    for (const v of wanted) {
      try {
        const buffer = await generateVideo(key, manifest, v);
        const target = path.join(ROOT, v.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buffer);
        console.log(`  ✓ ${v.id.padEnd(22)} ${(buffer.length / 1024 / 1024).toFixed(1)}mb`);
      } catch (err) {
        console.log(`  ✗ ${v.id.padEnd(22)} ${err.message}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  const list = select(manifest, argv);
  if (!list.length) {
    console.log("Nothing selected. Use --all, --missing, --group <name> or --only <ids>.");
    return;
  }

  const cost = estimate(manifest, list);
  console.log(`\n${list.length} asset(s) selected — rough cost $${cost.toFixed(2)}\n`);
  for (const a of list) console.log(`  ${a.id.padEnd(22)} ${a.path}`);
  console.log("");

  if (argv.includes("--estimate")) return;
  if (!(await confirm("Generate these? [y/N] "))) {
    console.log("Cancelled.");
    return;
  }

  const key = readKey();
  const concurrency = Number(argv[argv.indexOf("--concurrency") + 1]) || 3;
  const failures = [];
  let done = 0;

  const queue = [...list];
  const chained = queue.filter((a) => a.from);
  const independent = queue.filter((a) => !a.from);

  const noChain = argv.includes("--no-chain");
  const runOne = async (asset) => {
    const label = asset.id.padEnd(22);
    try {
      const buffer = await generate(key, manifest, asset, { noChain });
      const written = await writeAsset(manifest, asset, buffer);
      done++;
      console.log(`  ✓ ${label} ${(written.bytes / 1024).toFixed(0)}kb  ${written.note}`);
    } catch (err) {
      failures.push({ id: asset.id, error: err.message });
      console.log(`  ✗ ${label} ${err.message}`);
    }
  };

  const runPool = async (items) => {
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (items.length) await runOne(items.shift());
    });
    await Promise.all(workers);
  };

  await runPool(independent);
  // Chained variants run after their parents exist, and serially so each one
  // can read the file the previous step wrote.
  for (const asset of chained) await runOne(asset);

  // A chained asset that failed is worth one prompt-only retry: a missing
  // image is worse than a slightly off-style one.
  for (const asset of chained) {
    if (!failures.some((f) => f.id === asset.id)) continue;
    console.log(`  ↻ ${asset.id.padEnd(22)} retrying without style chaining`);
    failures.splice(failures.findIndex((f) => f.id === asset.id), 1);
    try {
      const buffer = await generate(key, manifest, asset, { noChain: true });
      const written = await writeAsset(manifest, asset, buffer);
      done++;
      console.log(`  ✓ ${asset.id.padEnd(22)} ${(written.bytes / 1024).toFixed(0)}kb  ${written.note}`);
    } catch (err) {
      failures.push({ id: asset.id, error: err.message });
      console.log(`  ✗ ${asset.id.padEnd(22)} ${err.message}`);
    }
  }

  console.log(`\n${done}/${list.length} generated.`);
  if (failures.length) {
    console.log("failures:");
    for (const f of failures) console.log(`  - ${f.id}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
