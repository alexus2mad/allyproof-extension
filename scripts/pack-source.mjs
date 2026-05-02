/**
 * Build a source-code zip for Mozilla AMO review.
 *
 * Mozilla requires the original (un-minified) source code whenever the
 * shipped bundle is produced by a tool that transforms it — Vite + tsc
 * qualify. The reviewer rebuilds locally and diffs against the
 * submitted artifact, so we ship everything required to run
 * `npm install && npm run build:firefox` and reproduce the zip
 * uploaded to addons.mozilla.org.
 *
 * What's included:
 *   src/, scripts/, public assets, package.json, package-lock.json,
 *   tsconfig*.json, vite.config.ts, eslint config, README, LICENSE.
 *
 * What's excluded:
 *   node_modules/, dist/, release/, .git/, .vite/, build outputs,
 *   .env files, OS junk (.DS_Store, Thumbs.db).
 *
 * Usage:
 *   node scripts/pack-source.mjs
 *
 * Output: release/allyproof-source-vX.Y.Z.zip
 */

import archiver from "archiver";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RELEASE = path.join(ROOT, "release");

// Glob-ish allow list (relative to ROOT). The archiver runs against
// the repo root, filtering each entry through `entryAccept`.
const INCLUDE_DIRS = ["src", "scripts"];
const INCLUDE_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "README.md",
  "LICENSE",
];

const EXCLUDE_PATTERNS = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)release(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.vite(\/|$)/,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
  /(^|\/)\.env(\..*)?$/,
  /\.tsbuildinfo$/,
  /\.log$/,
];

await main();

async function main() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const version = pkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`✗ package.json version "${version}" is not semver.`);
    process.exit(1);
  }

  console.log(`▸ Packing source archive of @allyproof/extension v${version}`);

  await mkdir(RELEASE, { recursive: true });
  const zipName = `allyproof-source-v${version}.zip`;
  const zipPath = path.join(RELEASE, zipName);
  if (existsSync(zipPath)) await unlink(zipPath);

  await zipSources(zipPath);

  const size = (await stat(zipPath)).size;
  console.log(`✓ Wrote ${path.relative(ROOT, zipPath)} (${formatBytes(size)})`);
  console.log("");
  console.log("Upload this alongside the firefox extension zip on AMO");
  console.log("under the listing's \"Source Code\" attachment field.");
}

function zipSources(outPath) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", resolve);
    out.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code === "ENOENT") return;
      reject(err);
    });
    archive.on("error", reject);
    archive.pipe(out);

    for (const dir of INCLUDE_DIRS) {
      const full = path.join(ROOT, dir);
      if (existsSync(full)) {
        archive.directory(full, dir, (entry) =>
          excluded(entry.name) ? false : entry
        );
      }
    }
    for (const file of INCLUDE_FILES) {
      const full = path.join(ROOT, file);
      if (existsSync(full)) archive.file(full, { name: file });
    }
    archive.finalize();
  });
}

function excluded(name) {
  // Archiver's directory() walker passes paths relative to the
  // mounted directory. Treat both `/` and `\` as separators.
  const normalized = name.replace(/\\/g, "/");
  return EXCLUDE_PATTERNS.some((p) => p.test(normalized));
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
