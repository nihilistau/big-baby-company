#!/usr/bin/env node
/**
 * Pack the browser build for itch.io.
 *
 *   npm run pack:itch
 *
 * Two things about itch's HTML hosting that a normal build gets wrong:
 *
 *   1. Projects are served from a hashed path on a sandbox subdomain, not from
 *      a domain root and not from a path you can predict. The Pages workflow
 *      bakes `/big-baby-company/` into every URL, which would 404 on all of it.
 *      So this builds with `BASE_PATH=./` and every asset resolves against
 *      whatever directory `index.html` lands in.
 *
 *   2. itch expects `index.html` at the root of the archive. Zipping the `dist`
 *      folder rather than its contents produces a playable-looking upload that
 *      shows a blank frame, and the error it gives you says nothing useful.
 *
 * The zip is written to `dist-itch/`, which is gitignored — it is a build
 * artifact, and a 21MB binary does not belong in the history of a repo whose
 * whole pitch is that you can read it.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUT_DIR = path.join(ROOT, "dist-itch");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const OUT = path.join(OUT_DIR, `big-baby-company-v${pkg.version}-web.zip`);

// itch reads the archive's own timestamps; a fixed one keeps the zip
// byte-identical between runs of the same commit.
const MTIME = new Date("2020-01-01T00:00:00Z");

function build() {
  console.log("\n  building with a relative base…");
  // Vite's own entry under this node, rather than `npm run build` through a
  // shell. Going via npm on Windows means either a `.cmd` that PATH lookup
  // misses without a shell, or `shell: true`, which concatenates arguments
  // unescaped. Neither is worth it to reach a script that just calls this.
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, BASE_PATH: "./" },
  });
}

/** Every file under `dir`, as paths relative to it, sorted for a stable zip. */
function walk(dir, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

// --- Zip ------------------------------------------------------------------
// Node ships deflate but no archiver, and this project has zero runtime
// dependencies and intends to keep it that way for its tools too. A store zip
// is a well-specified format and about sixty lines; adding a dependency to a
// build script that runs twice a year is the worse trade.

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosTime(d) {
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

function zip(files, baseDir) {
  const { time, date } = dosTime(MTIME);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const name of files) {
    const raw = fs.readFileSync(path.join(baseDir, name));
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    // A file that deflates larger than it started (already-compressed jpg/png)
    // is stored, not compressed.
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    // Unix mode 0644 in the high half. `<<` alone yields a negative int32 here,
    // which writeUInt32LE rejects outright.
    dir.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // external attrs
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// --- Main -----------------------------------------------------------------

function main() {
  if (!process.argv.includes("--no-build")) build();

  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("\n  No dist/index.html — the build did not produce anything.\n");
    process.exit(1);
  }

  const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  if (absolute.length) {
    console.error("\n  index.html still has root-absolute asset URLs, which itch will 404:");
    for (const a of absolute) console.error(`      ${a}`);
    console.error("  Build with BASE_PATH=./ — see this file's header.\n");
    process.exit(1);
  }

  const files = walk(DIST);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, zip(files, DIST));

  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`\n  ${path.relative(ROOT, OUT)}`);
  console.log(`  ${files.length} files · ${mb} MB · index.html at the archive root\n`);
  console.log("  Upload it as an HTML project. Viewport 1280x800, fullscreen on.\n");
}

main();
