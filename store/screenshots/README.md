# Screenshots — exact capture spec

Every shot below is reproducible. Follow the spec line-for-line so the
five images feel like a coherent set instead of "whatever I grabbed".

---

## Global setup (do this once before any capture)

| Setting | Value | Why |
|---|---|---|
| Browser | **Chrome stable**, version 130+ | Same Chromium baseline Edge ships from. Pixel-identical to what 95% of installers will see. |
| OS | Windows 11 | Matches your daily driver; native scrollbars + window chrome stay consistent across shots. |
| DPI scaling | **100%** (Settings → System → Display → Scale = 100%) | Anything else upscales your screenshot and Chrome Web Store rejects pixel-doubled images. |
| Browser zoom | **100%** (Ctrl+0 in every tab before capturing) | Off-by-default zoom in your active profile would warp text sizes. |
| Window size | **1280 × 800 viewport** (NOT outer window). Use F12 → Toggle Device Toolbar → Responsive → enter 1280 × 800 → Close DevTools to fall back to the docked viewport, then resize the OS window so the rendered page is exactly 1280 × 800 by inspection. Easier alternative: install the "Window Resizer" extension or run this in DevTools console: `window.resizeTo(1280 + (window.outerWidth - window.innerWidth), 800 + (window.outerHeight - window.innerHeight))`. | Both Chrome Web Store and AMO accept 1280 × 800; capturing at the exact target dimension means zero cropping later. |
| Profile | **Fresh / clean profile**. Either a brand-new Chrome profile or your normal one with all unrelated extensions disabled. | Other extensions add toolbar icons that visually compete with AllyProof in shot #1. |
| Theme | **Dark mode** for all shots. Chrome → Settings → Appearance → Theme = Dark, AND set the OS theme dark too so chrome chrome (window frame) matches. | Your existing UI screenshot from earlier in this session uses dark mode; the listing should match. If you prefer light, do all five shots in light — pick one and stay consistent. |
| Extension state | Loaded from `dist/` after `npm run build` on the latest `main`. **Reload the extension** before the first capture. | Stale builds will show old badges/copy. |
| Sign-in state | **Signed in** to AllyProof for shot #4 (AI fix needs auth). Signed out is fine for shots #1, #2, #3, #5 — but the footer copy switches based on auth, so pick one state per shot and be intentional. | Reviewers may notice the footer line flipping between shots. |
| Capture tool | **Snipping Tool** (Win+Shift+S → Rectangle). Save as PNG. | Built-in, lossless, strips metadata on save. |
| Crop | None needed if you sized the viewport correctly. If your shot is 1264 × 653 (Chrome chrome eats some pixels), crop with any editor to **exactly 1280 × 800** by adding a 1-pixel matte if needed — don't upscale. | Stores reject mismatched dimensions. |
| File format | PNG, 24-bit, no alpha channel. | Chrome rejects 32-bit alpha PNGs in some upload paths. Re-save with "no transparency" if your editor defaults to alpha. |

---

## Shot 1 — `01-popup-result.png`

**Filename:** `store/screenshots/01-popup-result.png`
**What it sells:** Score, severity counts, "Show all issues" CTA — the snapshot a user sees the moment a scan finishes.

| Field | Value |
|---|---|
| Surface | Action popup (toolbar click) |
| Site to scan | https://www.w3.org/WAI/demos/bad/before/home.html (the W3C "Before & After Demo — Inaccessible Home Page"). Predictable mix of critical + serious + moderate violations. Already loaded in your browser from earlier in this session. |
| Setup | 1. Hard-reload the page (Ctrl+Shift+R). 2. Wait until the page fully loads. 3. Click the AllyProof toolbar icon. 4. Click "Scan this page". 5. Wait for the result view. |
| Required UI elements visible | Score number (large, color-coded), "out of 100 · WCAG 2.2 AA" subtitle, the four severity chips (Critical / Serious / Moderate / Minor), the "Show all N issues" button, the Re-scan button, and the footer line. |
| Sign-in state | Signed out (footer reads "Local quick scan · axe-core · No data leaves this device" — strong privacy claim for the listing). |
| Dock mode in settings | Right (default). Doesn't matter visually for this shot since we're capturing the popup, not the panel. |
| Capture | Snip the popup itself + ~20px of margin around it. Stores accept smaller-than-1280 if it's an inline popup shot — but to keep dimensions consistent across the set, paste the snipped popup onto a 1280×800 canvas with a neutral dark background (matches the popup's bg). |
| Caption (paste in the store) | "Score, severity breakdown, and a one-click jump into the full violation list." |

---

## Shot 2 — `02-side-panel-right.png`

**Filename:** `store/screenshots/02-side-panel-right.png`
**What it sells:** The full violation list docked next to the page being audited.

| Field | Value |
|---|---|
| Surface | Right side panel (default dock mode) |
| Site to scan | Same W3C "Before" demo (consistency across the set). |
| Setup | 1. From shot #1's result, click "Show all N issues". 2. Side panel opens on the right with the full violation list. 3. Click ONE violation row to expand its detail (pick the first "Critical" — usually `image-alt` or `link-name` on this site). 4. Make sure both the W3C page on the left AND the side panel on the right are fully visible. |
| Required UI elements visible | The page in the left ~830px, the side panel taking ~450px on the right. In the panel: header with the dock switcher (4 icons), score block, severity chips, "All issues (N)" header, the violation list with the first row expanded showing the failing HTML. |
| Sign-in state | Signed in (so reviewers see the "Save to dashboard" / "Crawl this site" CTAs in the panel). |
| Dock switcher highlight | The right-dock button is the active (filled) one. |
| Capture | Capture the entire 1280×800 viewport including both the page and the panel. |
| Caption | "The side panel keeps every violation next to the page you're fixing — dock right, left, bottom, or detach as a floating window." |

---

## Shot 3 — `03-show-on-page.png`

**Filename:** `store/screenshots/03-show-on-page.png`
**What it sells:** The "Show on page" overlay highlight on a real failing element. This is the visual proof that the extension does more than just list issues.

| Field | Value |
|---|---|
| Surface | Page with overlay + side panel docked right |
| Site | Same W3C "Before" demo. |
| Setup | 1. From shot #2's setup, find a violation whose failing element is visible in the upper portion of the viewport (the unlabeled `Quickmenu` `<select>` in the header is a great target — top-right of the page). 2. Click the "Show" button on that violation row. 3. The page should now show the AllyProof highlight ring/overlay around that element with the rule label. |
| Required UI elements visible | The highlighted element on the page with AllyProof's overlay clearly framing it; the side panel still showing the violation list with the same row visibly active. |
| Sign-in state | Same as shot #2 (signed in for visual consistency with neighboring shots in the listing carousel). |
| Capture | Full 1280×800 viewport. Make sure the highlight + label are not clipped at any edge. |
| Caption | "Click 'Show' on any violation to highlight the failing element on the page itself." |

---

## Shot 4 — `04-ai-fix.png`

**Filename:** `store/screenshots/04-ai-fix.png`
**What it sells:** The paid AI feature. Most likely conversion driver in the listing.

| Field | Value |
|---|---|
| Surface | Side panel docked right with AI fix drawer expanded |
| Site | Same W3C "Before" demo. |
| Setup | 1. From shot #2, expand a violation that has clear failing HTML (the `image-alt` rule on the "Heat wave" or "Man Gets Nine Months" thumbnails is ideal — the failing `<img>` is short and human-readable). 2. Click "Generate AI fix" inside the expanded row. 3. Wait for the markdown response to render. The drawer should show: the failing HTML (collapsed `<details>`), the AI-rewritten suggestion text, a code block with the corrected `<img alt="...">` example, the model badge (claude-haiku-4-5), and a Copy button. |
| Required UI elements visible | The full AI suggestion drawer rendered cleanly — no half-loaded streaming state, no error message. If the response is very long, scroll the panel so the suggestion + code block + Copy button are the focal point. |
| Sign-in state | Signed in (required for AI). |
| Capture | Full 1280×800. The page can stay visible on the left for context. |
| Caption | "Generate AI-rewritten fix code on every violation — copy-paste-ready, mapped to WCAG criteria." |

---

## Shot 5 — `05-dock-modes.png`

**Filename:** `store/screenshots/05-dock-modes.png`
**What it sells:** The four-dock differentiator. No competitor does this.

| Field | Value |
|---|---|
| Surface | Detached panel window (the most visually distinct of the four modes) |
| Site | AllyProof's own homepage: https://allyproof.com — clean, brand-coherent, uncluttered for the screenshot. |
| Setup | 1. Open https://allyproof.com in a tab and run a scan from the toolbar icon. 2. In the panel, click the "Detach window" icon (the rightmost icon in the dock switcher — Picture-in-Picture symbol). 3. The panel opens as a free-floating window centered on the screen. 4. Position the AllyProof.com browser window so it occupies most of the viewport with the floating panel overlapping it on the right side. |
| Required UI elements visible | The free-floating panel window with the dock switcher header showing the "Detach" icon as active. The browser window underneath is visibly intact — viewer can see this is a separate OS window, not docked Chrome chrome. |
| Sign-in state | Either; signed in shows the dashboard CTAs which is fine. |
| Capture | Capture the 1280×800 area encompassing both the main browser and the floating panel. The two windows together communicate the "detached inspector" affordance. |
| Caption | "Dock the panel right, left, bottom — or detach as a floating inspector window." |

---

## Shot order in the store

Upload in numeric order (Chrome and Edge let you reorder; AMO does
not). Carousel position #1 is what shows in search results — that's
why shot #1 is the popup with the score, the most recognizable
visual.

---

## Optional Chrome promo art

Place under `store/screenshots/promo/`:

- `promo-440x280.png` — small promo tile shown in Chrome Web Store category pages
- `promo-1400x560.png` — marquee tile, candidate for Chrome's curated "Featured" carousel

These are brand graphics, not UI screenshots. Suggested composition:
- Background: subtle dark gradient matching the AllyProof landing page
- Centered: the AllyProof shield-check wordmark + tagline "Find more violations. Fix faster."
- Optional: a corner crop of shot #2 or shot #4 as a visual anchor

If you don't have brand assets ready, omit promo art entirely — Chrome
listings rank the same with or without them; only the curated carousel
slot weighs them.

---

## Verification before upload

Run this locally to catch mistakes:

```bash
# Verify dimensions (each must report "1280 x 800")
for f in store/screenshots/*.png; do
  identify -format "%f: %wx%h\n" "$f"
done
```

If `identify` (ImageMagick) isn't installed, any image viewer's
properties dialog works.

Reject and re-capture if:
- Dimensions are off by ≥10 pixels in either direction
- The OS taskbar is visible (Win key → unpin → recapture, or crop it out)
- Any browser bookmarks toolbar is visible (Ctrl+Shift+B to hide)
- A Chrome update prompt or "translation" banner is visible at the top
- Any test/personal data is visible (account avatar showing your face, real email addresses other than AllyProof's)
- Anti-aliasing looks blurry (you upscaled — recapture at 100% DPI)

---

## After capture

Commit the PNGs to this folder. The next release reuses them; only
re-capture when the UI materially changes (new feature in the panel,
restructured popup, new dock mode, etc).
