# Screenshots checklist

> Capture from a real Chrome window with the extension installed. All
> three stores accept these dimensions, so a single set of screenshots
> covers Chrome / Edge / Firefox listings.

## Required dimensions

- **Primary set:** 1280 × 800 (Chrome and Edge prefer; AMO accepts).
  Capture at 1× DPI; do not upscale.
- **Fallback:** 640 × 400 (Chrome accepts as smaller). Use only if the
  full set isn't available.

## Files to produce

Save each screenshot here as `NN-name.png` (PNG, 24-bit, no alpha):

| # | Filename | What it shows | Caption used in store |
|---|----------|---------------|------------------------|
| 1 | `01-popup-result.png` | Action popup after a fresh scan: score badge, severity chips, "Show all issues" button | "Score, severity breakdown, and a one-click jump into the full violation list." |
| 2 | `02-side-panel-right.png` | Side panel docked right with a real page behind it; full violation list visible; one row expanded showing the failing HTML | "The side panel keeps every violation next to the page you're fixing." |
| 3 | `03-show-on-page.png` | A page with the AllyProof highlight overlay around a failing element (e.g. a button without a label) | "Click 'Show' on any violation to highlight the failing element on the page." |
| 4 | `04-ai-fix.png` | Side panel showing a generated AI fix-suggestion drawer with code snippet | "Generate AI-rewritten fix code for any violation (account required)." |
| 5 | `05-dock-modes.png` | Composite or carousel showing the 4 dock modes (right, left, bottom, detached). Or a single shot of the detached floating window | "Dock the panel on any side, or detach it as a floating inspector window." |

## Suggested capture pages

Use real, well-known sites that have a known mix of issues — reviewers
recognize them and screenshots feel authentic:

- A storybook page with deliberate violations (recommended for shot #3 —
  predictable highlight target)
- The AllyProof dashboard preview page (https://allyproof.com) for a
  clean "after sign-in" feel
- Any developer-tools doc page (good neutral background; high contrast)

Avoid: pages with personally identifiable information, paywalled
content, or anything competitive.

## Promo art (optional, recommended for Chrome)

Place under `store/screenshots/promo/`:

- `promo-440x280.png` — small promo tile (Chrome only)
- `promo-1400x560.png` — marquee (Chrome carousel-feature candidate)

These can be brand graphics rather than real-UI shots — a clean wordmark
+ tagline + the shield icon over a single screenshot works well.

## After capture

1. Verify dimensions with `file *.png` (or any image viewer).
2. Strip EXIF metadata (Chrome rejects some EXIF fields):
   ```bash
   # macOS / Linux
   for f in *.png; do exiftool -all= -overwrite_original "$f"; done
   ```
   On Windows, just re-save through any image editor — most strip EXIF
   on save.
3. Commit alongside this README so the next release can reuse them.
