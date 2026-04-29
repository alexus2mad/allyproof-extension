# AllyProof Browser Extension

The agency-friendly accessibility extension. Crawl any client site from the current tab, get AI-rewritten fix code on every WCAG violation, and export DRAFT VPAT — all synced to your AllyProof dashboard.

Manifest V3. Chrome / Edge / Firefox. MIT-licensed.

## Status

Phase 1 MVP scaffold. Working surface: local single-page quick-scan via axe-core, popup UI with score + severity breakdown + top 5 violations, toolbar badge.

In flight:
- Magic-link sign-in flow + token storage
- Save-to-dashboard sync against the AllyProof platform
- Site crawl via the hosted backend
- AI fix drawer
- DRAFT VPAT export

See `../workspace/007-extension-plan.md` for the full strategic + implementation plan.

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

Output in `dist/`. For Chrome Web Store / Edge Add-ons submission, zip `dist/` and upload.

## Permissions

Minimal by design:

- `activeTab` — read the active tab on user click. NOT `<all_urls>`.
- `storage` — local + session buckets for tokens and scan history. Never `sync` (would push tokens cross-device).
- `scripting` — programmatic content-script injection on user click.

## License

MIT. See [LICENSE](./LICENSE).
