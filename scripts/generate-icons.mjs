/**
 * Render the AllyProof shield SVG at the four sizes the manifest
 * declares. Run once after a brand refresh; the generated PNGs are
 * gitignored so anyone checking out the repo regenerates them with
 *
 *   node scripts/generate-icons.mjs
 *
 * Source SVG is inlined here so we don't depend on the main repo's
 * file layout — the extension is a separate repo.
 */

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "src", "assets");

const SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#1e3a5f"/>
  <path d="M16 5L6 12v10l10 5 10-5V12L16 5z" fill="none" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
  <path d="M12 16l3 3 5-6" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`);

const SIZES = [16, 32, 48, 128];

await mkdir(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const out = path.join(OUT_DIR, `icon-${size}.png`);
  await sharp(SVG).resize(size, size).png().toFile(out);
  console.log(`wrote ${out}`);
}
