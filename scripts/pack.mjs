/**
 * Build a store-ready zip from a fresh production build.
 *
 *   node scripts/pack.mjs           # Chromium target  → release/allyproof-chrome-vX.Y.Z.zip
 *   node scripts/pack.mjs firefox   # Firefox target   → release/allyproof-firefox-vX.Y.Z.zip
 *
 * What this script does, in order:
 *   1. Reads package.json + src/manifest.ts version (cross-checked).
 *   2. Removes the existing dist/, runs the matching production build.
 *   3. Verifies the four required PNG icons are present + non-empty.
 *   4. Strips .map files from dist/ (debug-only, never ship).
 *   5. Zips dist/ → release/allyproof-{target}-v{version}.zip.
 *   6. Prints the zip path + byte size.
 *
 * Exits non-zero on any pre-flight failure. Designed to be CI-friendly.
 */

import archiver from "archiver";
import { spawnSync } from "node:child_process";
import { createWriteStream, statSync, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const RELEASE = path.join(ROOT, "release");

const TARGET = (process.argv[2] ?? "chrome").toLowerCase();
if (!["chrome", "firefox"].includes(TARGET)) {
  fail(`Unknown target "${TARGET}". Use "chrome" or "firefox".`);
}

const REQUIRED_ICONS = [16, 32, 48, 128];

await main();

async function main() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const version = pkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`package.json version "${version}" is not semver. Bump it before packing.`);
  }

  log(`▸ Packing ${TARGET} build of @allyproof/extension v${version}`);

  // 1. Pre-flight: icons exist in source (build-time copy reads from here).
  for (const size of REQUIRED_ICONS) {
    const p = path.join(ROOT, "src", "assets", `icon-${size}.png`);
    if (!existsSync(p)) {
      fail(
        `Missing icon ${p}. Run \`node scripts/generate-icons.mjs\` first.`
      );
    }
    const s = statSync(p);
    if (s.size === 0) fail(`Icon ${p} is empty.`);
  }

  // 2. Clean + build. Always rebuild — packing a stale dist has bitten
  //    many a release.
  await rm(DIST, { recursive: true, force: true });
  log("▸ Building…");
  const buildScript = TARGET === "firefox" ? "build:firefox" : "build";
  const buildResult = spawnSync("npm", ["run", buildScript], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (buildResult.status !== 0) {
    fail(`npm run ${buildScript} failed (exit ${buildResult.status}).`);
  }

  // 3. Verify the produced manifest has the version we expect — guards
  //    against package.json/manifest.ts drift.
  const manifestPath = path.join(DIST, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== version) {
    fail(
      `dist/manifest.json version "${manifest.version}" != package.json "${version}". Manifest reads pkg.version — investigate.`
    );
  }
  if (manifest.manifest_version !== 3) {
    fail(`Expected MV3 manifest, got manifest_version=${manifest.manifest_version}.`);
  }
  if (TARGET === "firefox" && !manifest.browser_specific_settings?.gecko?.id) {
    fail(`Firefox build is missing browser_specific_settings.gecko.id.`);
  }

  // 4. Strip source maps. They're useful locally, never useful in the
  //    shipped bundle, and reviewers flag fat zips.
  const stripped = await stripSourceMaps(DIST);
  log(`▸ Stripped ${stripped.count} source map(s) (${formatBytes(stripped.bytes)} freed)`);

  // 5. Zip the cleaned dist/.
  await mkdir(RELEASE, { recursive: true });
  const zipName = `allyproof-${TARGET}-v${version}.zip`;
  const zipPath = path.join(RELEASE, zipName);
  if (existsSync(zipPath)) await unlink(zipPath);

  await zipDir(DIST, zipPath);
  const zipSize = (await stat(zipPath)).size;
  log(`✓ Wrote ${path.relative(ROOT, zipPath)} (${formatBytes(zipSize)})`);

  log("");
  log(`Next steps:`);
  if (TARGET === "chrome") {
    log(`  • Chrome Web Store → upload ${zipName}`);
    log(`  • Microsoft Edge Add-ons → upload the same ${zipName}`);
  } else {
    log(`  • Firefox AMO → upload ${zipName}`);
    log(`  • Then run \`npm run release:source\` and upload the source zip too`);
    log(`    (Mozilla requires it whenever bundlers minify code).`);
  }
}

async function stripSourceMaps(dir) {
  let count = 0;
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await stripSourceMaps(full);
      count += sub.count;
      bytes += sub.bytes;
    } else if (entry.name.endsWith(".map")) {
      bytes += (await stat(full)).size;
      await unlink(full);
      count += 1;
    }
  }
  return { count, bytes };
}

function zipDir(srcDir, outPath) {
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
    // false = don't nest under dist/, store paths relative to srcDir.
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
