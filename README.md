# AllyProof Browser Extension

[![CI](https://github.com/alexus2mad/allyproof-extension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alexus2mad/allyproof-extension/actions/workflows/ci.yml)

The agency-friendly accessibility extension. Crawl any client site from the current tab, get AI-rewritten fix code on every WCAG violation, and export DRAFT VPAT — all synced to your AllyProof dashboard.

Manifest V3. Chrome / Edge / Firefox. MIT-licensed.

## Local development

```bash
npm install
npm run dev
```

Then in Chrome / Edge: open `chrome://extensions`, enable Developer mode, click "Load unpacked", and select `./dist`.

## Permissions

Minimal by design — no `<all_urls>` host permission. See [`store/permissions-justifications.md`](./store/permissions-justifications.md) for the per-permission rationale.

## CI/CD

Two workflows live in `.github/workflows/`:

- **`ci.yml`** — typecheck + Chrome/Firefox build + manifest validation on every push to `main` and every PR.
- **`release.yml`** — on tag push (`v*`), builds all three release ZIPs and creates a draft GitHub Release with them attached.

Both depend on the private sibling repo `alexus2mad/allyproof` (for `@allyproof/scan-core`). The one-time PAT setup and the release-cutting recipe live in [`docs/CI_SETUP.md`](./docs/CI_SETUP.md).

## License

MIT. See [LICENSE](./LICENSE).
