# AllyProof Browser Extension

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

## License

MIT. See [LICENSE](./LICENSE).
