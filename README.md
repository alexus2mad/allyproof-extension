# AllyProof Browser Extension

The agency-friendly accessibility extension. Crawl any client site from the current tab, get AI-rewritten fix code on every WCAG violation, and export DRAFT VPAT — all synced to your AllyProof dashboard.

Manifest V3. Chrome / Edge / Firefox. MIT-licensed.

## Status

1.0.0 — store-ready. Single-page quick-scan via axe-core, action-popup with score + severity breakdown, side-panel surface with the full violation list, four dock modes (right, left, bottom, detached), toolbar badge with live violation count, "Show on page" highlights. Sign-in unlocks save-to-dashboard, AI fix suggestions, multi-page crawl, and DRAFT VPAT export.

See `../workspace/007-extension-plan.md` for the broader strategic + implementation plan.

## Architecture

```
popup (React) ─── chrome.runtime ──► background service worker ─── chrome.scripting ──► content script ─── axe-core ──► page DOM
                                          │
                                          └───── chrome.storage ──► session (access token, current scan)
                                                                   local   (refresh token, scan history, settings)
```

Pure scan logic (dedup, scoring, score-band classification, WCAG criterion extraction) is shared with the platform via `@allyproof/scan-core` so the score in the extension matches the score in the dashboard exactly.

## Local development

```bash
# from this directory
npm install
npm run dev
```

Then in Chrome / Edge:

1. Open `chrome://extensions`
2. Enable Developer mode (top right)
3. Click "Load unpacked"
4. Select `./dist`

The extension reloads automatically on source changes. Service worker reloads require clicking "service worker" → "Inspect" → reload icon, or just toggling the extension.

## Build

```bash
npm run build         # Chrome / Edge
npm run build:firefox # Firefox (browser_specific_settings)
```

Output in `dist/`. Loadable directly via `chrome://extensions` → "Load unpacked".

## Release (store-ready zips)

```bash
npm run release:chrome    # → release/allyproof-chrome-v{X.Y.Z}.zip
npm run release:firefox   # → release/allyproof-firefox-v{X.Y.Z}.zip
npm run release:source    # → release/allyproof-source-v{X.Y.Z}.zip  (Mozilla AMO requirement)
npm run release:all       # all three in one shot
```

Each release script does a clean rebuild, verifies the manifest version matches `package.json`, strips `.map` files, and writes the artifact to `release/`. The Chrome zip works for both Chrome Web Store and Microsoft Edge Add-ons. The Firefox zip + source zip pair is what AMO needs.

Listing copy, permission justifications, screenshot checklist, and the per-store submission flow live under `store/`. See `store/README.md`.

## Permissions

Minimal by design — no `<all_urls>` host permission. See [`store/permissions-justifications.md`](./store/permissions-justifications.md) for the per-permission rationale used in the store listings.

## License

MIT. See [LICENSE](./LICENSE).
